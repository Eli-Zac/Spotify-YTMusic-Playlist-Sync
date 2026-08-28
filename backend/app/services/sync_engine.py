from __future__ import annotations

import json
import logging
import time
from datetime import datetime

from sqlmodel import Session

from app.models import RunStatus, ServiceName, SyncMode, SyncRule, SyncRun
from app.services import matcher, notifier, spotify_client, ytmusic_client

logger = logging.getLogger(__name__)

# How often (seconds) to write progress to the DB during a long run - frequent
# enough for the UI to feel live, infrequent enough not to hammer SQLite with
# a commit per track on a 700-song playlist.
_PROGRESS_WRITE_INTERVAL = 1.5

# Cap how many log lines we keep/serialize per run - a live tail, not a full
# transcript, so a 700-track sync doesn't grow detail_json without bound.
_LOG_TAIL = 300

# Run ids with a cancellation requested. In-memory only (single-process app);
# background jobs check this cooperatively at safe points in the loop, since
# an in-flight external API call can't be interrupted mid-request.
_cancel_requested: set[int] = set()


class SyncError(Exception):
    pass


class SyncCancelled(Exception):
    pass


def request_cancel(run_id: int) -> None:
    _cancel_requested.add(run_id)


class _Progress:
    def __init__(self, session: Session, run: SyncRun):
        self.session = session
        self.run = run
        self.log_lines: list[str] = []
        self.phase = "starting"
        self.current = 0
        self.total = 0
        self._last_write = 0.0

    def log(self, line: str) -> None:
        self.log_lines.append(line)
        if len(self.log_lines) > _LOG_TAIL:
            self.log_lines = self.log_lines[-_LOG_TAIL:]

    def set_phase(self, phase: str, current: int = 0, total: int = 0) -> None:
        self.phase = phase
        self.current = current
        self.total = total

    def check_cancelled(self) -> None:
        if self.run.id in _cancel_requested:
            raise SyncCancelled()

    def flush(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._last_write < _PROGRESS_WRITE_INTERVAL:
            return
        self._last_write = now
        self.run.detail_json = json.dumps(
            {
                "phase": self.phase,
                "current": self.current,
                "total": self.total,
                "log": self.log_lines,
            }
        )
        self.session.add(self.run)
        self.session.commit()


def _get_client(session: Session, service: ServiceName):
    if service == ServiceName.spotify:
        return spotify_client.get_client(session)
    return ytmusic_client.get_client(session)


def _module(service: ServiceName):
    return spotify_client if service == ServiceName.spotify else ytmusic_client


def create_run(session: Session, rule: SyncRule) -> SyncRun:
    run = SyncRun(rule_id=rule.id, status=RunStatus.running, started_at=datetime.utcnow())
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def mark_orphaned_runs(session: Session) -> int:
    """Any run still "running" when the process starts belonged to a previous
    process instance (e.g. killed by a redeploy) - nothing is left alive to ever
    finish or cancel it, so it would otherwise sit stuck forever. Call once at
    startup."""
    from sqlmodel import select

    orphaned = session.exec(select(SyncRun).where(SyncRun.status == RunStatus.running)).all()
    for run in orphaned:
        run.status = RunStatus.failed
        run.error_message = "Interrupted by a server restart before it could finish."
        run.finished_at = datetime.utcnow()
        session.add(run)
    if orphaned:
        session.commit()
    return len(orphaned)


def execute_run(session: Session, rule: SyncRule, run: SyncRun) -> SyncRun:
    progress = _Progress(session, run)
    try:
        _do_run(session, rule, run, progress)
        run.status = RunStatus.success if run.tracks_unmatched == 0 else RunStatus.partial
        progress.set_phase("done", progress.total, progress.total)
        progress.log("Done.")
    except SyncCancelled:
        progress.log("Cancelled.")
        run.status = RunStatus.cancelled
        run.error_message = "Cancelled by user."
    except Exception as exc:  # noqa: BLE001
        logger.exception("Sync failed for rule %s", rule.id)
        if ServiceName.ytmusic in (rule.source_service, rule.dest_service):
            try:
                ytmusic_client.raise_if_auth_failure(session, exc)
            except ytmusic_client.YTMusicAuthExpired as auth_exc:
                exc = auth_exc
        message = spotify_client.friendly_error(exc) or str(exc)
        progress.log(f"Error: {message}")
        run.status = RunStatus.failed
        run.error_message = message
    finally:
        _cancel_requested.discard(run.id)
        run.finished_at = datetime.utcnow()
        progress.flush(force=True)
        session.add(run)
        session.commit()
        session.refresh(run)

    notifier.notify_run_result(session, rule, run)
    return run


def run_sync(session: Session, rule: SyncRule) -> SyncRun:
    run = create_run(session, rule)
    return execute_run(session, rule, run)


def run_by_id_in_background(rule_id: int, run_id: int) -> None:
    """Entry point for a one-off background job (see routers/rules.py's /run
    endpoint) - opens its own DB session since it runs outside any request."""
    from app.database import engine

    with Session(engine) as session:
        rule = session.get(SyncRule, rule_id)
        run = session.get(SyncRun, run_id)
        if not rule or not run:
            return
        execute_run(session, rule, run)


def _do_run(session: Session, rule: SyncRule, run: SyncRun, progress: _Progress) -> None:
    src_mod = _module(rule.source_service)
    dst_mod = _module(rule.dest_service)

    src_client = _get_client(session, rule.source_service)
    dst_client = _get_client(session, rule.dest_service)

    if not dst_mod.playlist_exists(dst_client, rule.dest_playlist_id):
        raise SyncError(
            f"Destination playlist '{rule.dest_playlist_id}' does not exist on "
            f"{rule.dest_service.value}. Create it manually first, then re-run the sync."
        )

    def _on_page(fetched: int, total: int) -> None:
        progress.set_phase("fetching", fetched, total)
        progress.flush()

    progress.check_cancelled()
    progress.set_phase("fetching")
    progress.log(f"Fetching '{rule.source_playlist_name or rule.source_playlist_id}' from {rule.source_service.value}…")
    progress.flush(force=True)
    source_tracks = src_mod.fetch_playlist_tracks(src_client, rule.source_playlist_id, on_page=_on_page)
    progress.log(f"Fetched {len(source_tracks)} track(s) from {rule.source_service.value}.")
    progress.check_cancelled()
    progress.log(f"Fetching '{rule.dest_playlist_name or rule.dest_playlist_id}' from {rule.dest_service.value}…")
    progress.flush(force=True)
    dest_tracks = dst_mod.fetch_playlist_tracks(dst_client, rule.dest_playlist_id, on_page=_on_page)
    progress.log(f"Fetched {len(dest_tracks)} track(s) from {rule.dest_service.value}.")
    progress.check_cancelled()

    same_service = rule.source_service == rule.dest_service
    dest_isrc_index = matcher.build_isrc_index(dest_tracks)

    to_add_ids: list[str] = []
    unmatched = 0

    total = len(source_tracks)
    progress.log(f"Matching {total} track(s)…")
    for i, src_track in enumerate(source_tracks, start=1):
        progress.check_cancelled()
        label = f"{src_track.get('title', '?')} — {src_track.get('artist', '?')}"
        existing = matcher.find_match(src_track, dest_tracks, dest_isrc_index)
        if existing:
            pass
        elif same_service:
            to_add_ids.append(src_track["id"])
            progress.log(f"+ {label}")
        else:
            found = dst_mod.search_track(dst_client, src_track["title"], src_track["artist"])
            if found:
                to_add_ids.append(found["id"])
                dest_tracks.append(found)  # avoid re-adding duplicates within this run
                progress.log(f"+ {label}")
            else:
                unmatched += 1
                progress.log(f"? no match: {label}")

        progress.set_phase("matching", i, total)
        progress.flush(force=(i == total))

    if to_add_ids:
        progress.set_phase("adding", 0, len(to_add_ids))
        progress.log(f"Adding {len(to_add_ids)} track(s) to destination…")
        progress.flush(force=True)
        dst_mod.add_tracks(dst_client, rule.dest_playlist_id, to_add_ids)

    removed_count = 0
    if rule.mode == SyncMode.mirror:
        progress.check_cancelled()
        source_isrc_index = matcher.build_isrc_index(source_tracks)
        to_remove_ids: list[str] = []
        for dest_track in list(dest_tracks):
            match = matcher.find_match(dest_track, source_tracks, source_isrc_index)
            if not match and dest_track["id"] not in to_add_ids:
                to_remove_ids.append(dest_track["id"])
        if to_remove_ids:
            progress.set_phase("removing", 0, len(to_remove_ids))
            progress.log(f"Removing {len(to_remove_ids)} track(s) from destination…")
            progress.flush(force=True)
            dst_mod.remove_tracks(dst_client, rule.dest_playlist_id, to_remove_ids)
        removed_count = len(to_remove_ids)

    run.tracks_added = len(to_add_ids)
    run.tracks_removed = removed_count
    run.tracks_unmatched = unmatched
