from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlmodel import Session

from app.models import RunStatus, ServiceName, SyncMode, SyncRule, SyncRun
from app.services import matcher, notifier, spotify_client, ytmusic_client

logger = logging.getLogger(__name__)


class SyncError(Exception):
    pass


def _get_client(session: Session, service: ServiceName):
    if service == ServiceName.spotify:
        return spotify_client.get_client(session)
    return ytmusic_client.get_client(session)


def _module(service: ServiceName):
    return spotify_client if service == ServiceName.spotify else ytmusic_client


def run_sync(session: Session, rule: SyncRule) -> SyncRun:
    run = SyncRun(rule_id=rule.id, status=RunStatus.running, started_at=datetime.utcnow())
    session.add(run)
    session.commit()
    session.refresh(run)

    try:
        _do_run(session, rule, run)
        run.status = RunStatus.success if run.tracks_unmatched == 0 else RunStatus.partial
    except Exception as exc:  # noqa: BLE001
        logger.exception("Sync failed for rule %s", rule.id)
        if ServiceName.ytmusic in (rule.source_service, rule.dest_service):
            try:
                ytmusic_client.raise_if_auth_failure(session, exc)
            except ytmusic_client.YTMusicAuthExpired as auth_exc:
                exc = auth_exc
        run.status = RunStatus.failed
        run.error_message = str(exc)
    finally:
        run.finished_at = datetime.utcnow()
        session.add(run)
        session.commit()
        session.refresh(run)

    notifier.notify_run_result(session, rule, run)
    return run


def _do_run(session: Session, rule: SyncRule, run: SyncRun) -> None:
    src_mod = _module(rule.source_service)
    dst_mod = _module(rule.dest_service)

    src_client = _get_client(session, rule.source_service)
    dst_client = _get_client(session, rule.dest_service)

    if not dst_mod.playlist_exists(dst_client, rule.dest_playlist_id):
        raise SyncError(
            f"Destination playlist '{rule.dest_playlist_id}' does not exist on "
            f"{rule.dest_service.value}. Create it manually first, then re-run the sync."
        )

    source_tracks = src_mod.fetch_playlist_tracks(src_client, rule.source_playlist_id)
    dest_tracks = dst_mod.fetch_playlist_tracks(dst_client, rule.dest_playlist_id)

    same_service = rule.source_service == rule.dest_service
    dest_isrc_index = matcher.build_isrc_index(dest_tracks)

    to_add_ids: list[str] = []
    unmatched = 0

    for src_track in source_tracks:
        existing = matcher.find_match(src_track, dest_tracks, dest_isrc_index)
        if existing:
            continue

        if same_service:
            to_add_ids.append(src_track["id"])
        else:
            found = dst_mod.search_track(dst_client, src_track["title"], src_track["artist"])
            if found:
                to_add_ids.append(found["id"])
                dest_tracks.append(found)  # avoid re-adding duplicates within this run
            else:
                unmatched += 1

    if to_add_ids:
        dst_mod.add_tracks(dst_client, rule.dest_playlist_id, to_add_ids)

    removed_count = 0
    if rule.mode == SyncMode.mirror:
        source_isrc_index = matcher.build_isrc_index(source_tracks)
        to_remove_ids: list[str] = []
        for dest_track in list(dest_tracks):
            match = matcher.find_match(dest_track, source_tracks, source_isrc_index)
            if not match and dest_track["id"] not in to_add_ids:
                to_remove_ids.append(dest_track["id"])
        if to_remove_ids:
            dst_mod.remove_tracks(dst_client, rule.dest_playlist_id, to_remove_ids)
        removed_count = len(to_remove_ids)

    run.tracks_added = len(to_add_ids)
    run.tracks_removed = removed_count
    run.tracks_unmatched = unmatched
    run.detail_json = json.dumps(
        {
            "source_track_count": len(source_tracks),
            "dest_track_count_before": len(dest_tracks) - len(to_add_ids),
        }
    )
