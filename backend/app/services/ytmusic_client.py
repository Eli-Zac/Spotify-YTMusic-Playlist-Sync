from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlmodel import Session, select
from ytmusicapi import YTMusic
from ytmusicapi.auth.oauth import OAuthCredentials

from app.config import settings
from app.models import Credential, ServiceName
from app.security import decrypt, encrypt

# In-memory holder for in-flight device-code auth attempts (single-user instance).
_pending_device_codes: dict[str, dict] = {}


def build_oauth_credentials() -> OAuthCredentials:
    return OAuthCredentials(
        client_id=settings.ytmusic_oauth_client_id,
        client_secret=settings.ytmusic_oauth_client_secret,
    )


def start_device_auth() -> dict:
    creds = build_oauth_credentials()
    code = creds.get_code()
    _pending_device_codes["current"] = code
    return {
        "verification_url": code["verification_url"],
        "user_code": code["user_code"],
        "expires_in": code.get("expires_in", 1800),
        "interval": code.get("interval", 5),
    }


def complete_device_auth(session: Session) -> dict:
    code = _pending_device_codes.get("current")
    if not code:
        raise RuntimeError("No pending YT Music authorization. Start the connect flow again.")
    creds = build_oauth_credentials()
    token = creds.token_from_code(code["device_code"])
    store_token(session, token)
    _pending_device_codes.pop("current", None)
    return {"connected": True}


def store_token(session: Session, token: dict, account_label: str = "") -> None:
    cred = session.exec(select(Credential).where(Credential.service == ServiceName.ytmusic)).first()
    if cred is None:
        cred = Credential(service=ServiceName.ytmusic, access_token_enc="")
    cred.access_token_enc = encrypt(token["access_token"])
    if token.get("refresh_token"):
        cred.refresh_token_enc = encrypt(token["refresh_token"])
    expires_at = datetime.utcnow() + timedelta(seconds=token.get("expires_in", 3600))
    cred.expires_at = expires_at
    cred.extra_enc = encrypt(json.dumps(token))
    if account_label:
        cred.account_label = account_label
    cred.updated_at = datetime.utcnow()
    session.add(cred)
    session.commit()


def get_credential(session: Session) -> Credential | None:
    return session.exec(select(Credential).where(Credential.service == ServiceName.ytmusic)).first()


def get_client(session: Session) -> YTMusic:
    cred = get_credential(session)
    if cred is None:
        raise RuntimeError("YT Music is not connected. Connect it from Settings.")

    token = json.loads(decrypt(cred.extra_enc))
    creds = build_oauth_credentials()

    if cred.expires_at and cred.expires_at <= datetime.utcnow() + timedelta(seconds=30):
        refreshed = creds.refresh_token(token["refresh_token"])
        token.update(refreshed)
        store_token(session, token)

    return YTMusic(auth=token, oauth_credentials=creds)


def list_playlists(yt: YTMusic) -> list[dict]:
    """Returns the connected user's playlists: {id, name, track_count, image}."""
    playlists = []
    for p in yt.get_library_playlists(limit=None):
        if not p.get("playlistId"):
            continue
        thumbnails = p.get("thumbnails") or []
        playlists.append(
            {
                "id": p["playlistId"],
                "name": p.get("title", ""),
                "track_count": p.get("count") or 0,
                "image": thumbnails[-1]["url"] if thumbnails else None,
            }
        )
    return playlists


def fetch_playlist_tracks(yt: YTMusic, playlist_id: str) -> list[dict]:
    playlist = yt.get_playlist(playlist_id, limit=None)
    tracks = []
    for t in playlist.get("tracks", []):
        if not t.get("videoId"):
            continue
        tracks.append(
            {
                "id": t["videoId"],
                "isrc": None,  # ytmusicapi does not expose ISRC directly
                "title": t.get("title", ""),
                "artist": ", ".join(a["name"] for a in t.get("artists", []) or []),
            }
        )
    return tracks


def playlist_exists(yt: YTMusic, playlist_id: str) -> bool:
    try:
        yt.get_playlist(playlist_id, limit=1)
        return True
    except Exception:  # noqa: BLE001
        return False


def add_tracks(yt: YTMusic, playlist_id: str, video_ids: list[str]) -> None:
    if video_ids:
        yt.add_playlist_items(playlist_id, video_ids, duplicates=False)


def remove_tracks(yt: YTMusic, playlist_id: str, video_ids: list[str]) -> None:
    if not video_ids:
        return
    playlist = yt.get_playlist(playlist_id, limit=None)
    items = [t for t in playlist.get("tracks", []) if t.get("videoId") in video_ids]
    if items:
        yt.remove_playlist_items(playlist_id, items)


def search_track(yt: YTMusic, title: str, artist: str) -> dict | None:
    results = yt.search(f"{title} {artist}", filter="songs", limit=1)
    if not results:
        return None
    t = results[0]
    return {
        "id": t.get("videoId"),
        "isrc": None,
        "title": t.get("title", ""),
        "artist": ", ".join(a["name"] for a in t.get("artists", []) or []),
    }
