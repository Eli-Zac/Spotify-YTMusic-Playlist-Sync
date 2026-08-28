from __future__ import annotations

from sqlmodel import Session, select
from ytmusicapi import YTMusic
from ytmusicapi.exceptions import YTMusicServerError, YTMusicUserError
from ytmusicapi.setup import setup as parse_browser_headers

from app.models import Credential, ServiceName
from app.security import decrypt, encrypt
from app.services import notifier
from app.settings_store import get_setting, set_setting

_NEEDS_REAUTH_KEY = "ytmusic_needs_reauth"


class YTMusicAuthExpired(RuntimeError):
    pass


def _looks_like_auth_failure(exc: Exception) -> bool:
    if isinstance(exc, YTMusicUserError):
        return True
    message = str(exc).lower()
    return any(
        marker in message
        for marker in ("401", "unauthorized", "authenticat", "cookie", "sign in", "sign-in")
    )


def _mark_needs_reauth(session: Session) -> None:
    already_flagged = get_setting(session, _NEEDS_REAUTH_KEY, "false") == "true"
    set_setting(session, _NEEDS_REAUTH_KEY, "true")
    if not already_flagged:
        notifier.notify_message(
            session,
            title="[YT Music] Session expired",
            message="YT Music's browser session has expired. Reconnect it from Settings to resume syncing.",
        )


def needs_reauth(session: Session) -> bool:
    return get_setting(session, _NEEDS_REAUTH_KEY, "false") == "true"


def clear_needs_reauth(session: Session) -> None:
    set_setting(session, _NEEDS_REAUTH_KEY, "false")


def raise_if_auth_failure(session: Session, exc: Exception) -> None:
    """Re-raises a clean, user-facing error if exc looks like an expired YT Music
    session, marking the connection as needing reauth and notifying once per episode.
    Leaves exc untouched (returns normally) for anything else."""
    if _looks_like_auth_failure(exc):
        _mark_needs_reauth(session)
        raise YTMusicAuthExpired("YT Music session expired. Reconnect it from Settings.") from exc


def store_browser_headers(session: Session, cookie: str, authorization: str) -> None:
    cookie = cookie.strip()
    authorization = authorization.strip()
    if not cookie or not authorization:
        raise RuntimeError("Both the Cookie and Authorization values are required.")

    headers_raw = f"cookie: {cookie}\nauthorization: {authorization}\nx-goog-authuser: 0"
    try:
        headers_json = parse_browser_headers(headers_raw=headers_raw)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Couldn't parse those headers: {exc}") from exc

    yt = YTMusic(auth=headers_json)
    try:
        yt.get_library_playlists(limit=1)
    except (YTMusicServerError, YTMusicUserError) as exc:
        raise RuntimeError(f"Those headers didn't work against YT Music: {exc}") from exc

    account_label = ""
    try:
        account_label = yt.get_account_info().get("accountName", "")
    except Exception:  # noqa: BLE001
        pass  # cosmetic only - the connection above already proved the headers work

    cred = session.exec(select(Credential).where(Credential.service == ServiceName.ytmusic)).first()
    if cred is None:
        cred = Credential(service=ServiceName.ytmusic, access_token_enc="")
    cred.access_token_enc = encrypt(headers_json)
    if account_label:
        cred.account_label = account_label
    session.add(cred)
    session.commit()
    clear_needs_reauth(session)


def get_credential(session: Session) -> Credential | None:
    return session.exec(select(Credential).where(Credential.service == ServiceName.ytmusic)).first()


def get_client(session: Session) -> YTMusic:
    cred = get_credential(session)
    if cred is None:
        raise RuntimeError("YT Music is not connected. Connect it from Settings.")
    return YTMusic(auth=decrypt(cred.access_token_enc))


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


def fetch_playlist_tracks(yt: YTMusic, playlist_id: str, on_page=None) -> list[dict]:
    # ytmusicapi's get_playlist handles pagination internally with no per-page
    # hook, so there's no true incremental progress to report here - just a
    # completion signal, kept for a uniform interface with spotify_client.
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
    if on_page:
        on_page(len(tracks), len(tracks))
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
