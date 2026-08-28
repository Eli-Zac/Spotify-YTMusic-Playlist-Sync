from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

import spotipy
from spotipy.oauth2 import SpotifyOAuth
from sqlmodel import Session

from app.config import settings
from app.models import Credential, ServiceName
from app.security import decrypt, encrypt

logger = logging.getLogger(__name__)

SCOPE = "playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private"

# A cross-service sync makes one Spotify search call per unmatched track -
# on a 700+ track playlist that's 700+ back-to-back requests, which is
# enough to trip Spotify's burst rate limit even on a brand-new app.
# Space calls out a bit so we don't self-inflict a 429.
_MIN_CALL_INTERVAL = 0.1
_last_call_at = 0.0

# On a 429, spotipy's default retry sleeps the thread for the full
# Retry-After header (which can be hours). That's fine to wait out
# ourselves for a short, transient throttle, but not worth blocking a
# background job for - beyond this, surface the error instead.
_MAX_RETRY_SLEEP = 10
_MAX_ATTEMPTS = 3


def _throttle() -> None:
    global _last_call_at
    wait = _last_call_at + _MIN_CALL_INTERVAL - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_call_at = time.monotonic()


def _call(fn, *args, **kwargs):
    """Calls a spotipy method, retrying briefly on short 429s (spotipy itself
    has retries disabled - see get_client) and re-raising anything else."""
    for attempt in range(_MAX_ATTEMPTS):
        _throttle()
        try:
            return fn(*args, **kwargs)
        except spotipy.SpotifyException as exc:
            if exc.http_status != 429 or attempt == _MAX_ATTEMPTS - 1:
                raise
            retry_after = int((exc.headers or {}).get("Retry-After", 0) or 0)
            if retry_after > _MAX_RETRY_SLEEP:
                raise
            time.sleep(max(retry_after, 1))


def friendly_error(exc: Exception) -> str | None:
    """Returns a clear message for a Spotify rate limit, or None for anything else."""
    if not isinstance(exc, spotipy.SpotifyException) or exc.http_status != 429:
        return None
    retry_after = exc.headers.get("Retry-After") if exc.headers else None
    if retry_after:
        try:
            hours = int(retry_after) / 3600
            return f"Spotify rate limit reached. Try again in about {hours:.1f} hour(s)."
        except ValueError:
            pass
    return "Spotify rate limit reached. Try again later."


def build_oauth() -> SpotifyOAuth:
    return SpotifyOAuth(
        client_id=settings.spotify_client_id,
        client_secret=settings.spotify_client_secret,
        redirect_uri=settings.spotify_redirect_uri,
        scope=SCOPE,
        cache_handler=spotipy.cache_handler.MemoryCacheHandler(),
        show_dialog=False,
    )


def store_token(session: Session, token_info: dict, account_label: str = "") -> None:
    from sqlmodel import select

    expires_at = datetime.utcfromtimestamp(token_info["expires_at"])
    cred = session.exec(select(Credential).where(Credential.service == ServiceName.spotify)).first()
    if cred is None:
        cred = Credential(service=ServiceName.spotify, access_token_enc="")
    cred.access_token_enc = encrypt(token_info["access_token"])
    cred.refresh_token_enc = encrypt(token_info["refresh_token"]) if token_info.get("refresh_token") else cred.refresh_token_enc
    cred.expires_at = expires_at
    if account_label:
        cred.account_label = account_label
    cred.updated_at = datetime.utcnow()
    session.add(cred)
    session.commit()


def get_credential(session: Session) -> Credential | None:
    from sqlmodel import select

    return session.exec(select(Credential).where(Credential.service == ServiceName.spotify)).first()


def get_client(session: Session) -> spotipy.Spotify:
    cred = get_credential(session)
    if cred is None:
        raise RuntimeError("Spotify is not connected. Connect it from Settings.")

    access_token = decrypt(cred.access_token_enc)
    if cred.expires_at and cred.expires_at <= datetime.utcnow() + timedelta(seconds=30):
        oauth = build_oauth()
        refresh_token = decrypt(cred.refresh_token_enc)
        new_token = oauth.refresh_access_token(refresh_token)
        store_token(session, new_token)
        access_token = new_token["access_token"]

    # spotipy's default retry behavior actually *sleeps* the calling thread for
    # the server's Retry-After duration on a 429 (observed: ~23.5 hours), up to
    # 3 times - a background sync would look "stuck" for days rather than fail.
    # Excluding 429 from the urllib3-level retry forcelist stops that (the raw
    # response comes straight back to us instead), while leaving genuinely
    # transient 5xx errors to still self-heal via spotipy's built-in retry.
    # Setting retries=0 instead would also stop the sleep, but urllib3 raises
    # a bare RetryError before the response - and its Retry-After header -
    # ever reaches us, so we couldn't tell a 1-second throttle from an hours-
    # long one. _call() below does our own short, bounded retry on top.
    return spotipy.Spotify(auth=access_token, status_forcelist=(500, 502, 503, 504))


def list_playlists(sp: spotipy.Spotify) -> list[dict]:
    """Returns the connected user's playlists: {id, name, track_count, image}."""
    playlists = []
    results = _call(sp.current_user_playlists, limit=50)
    while results:
        for p in results["items"]:
            images = p.get("images") or []
            # The playlist-list endpoint's embedded tracks.total is unreliable
            # (often 0 even for non-empty playlists). playlist_items() - the same
            # call fetch_playlist_tracks uses for actual syncing - reports the
            # real count.
            try:
                items = _call(sp.playlist_items, p["id"], fields="total", limit=1, additional_types=("track",))
                track_count = items.get("total") or 0
            except spotipy.SpotifyException as exc:
                logger.warning(
                    "Spotify playlist_items failed for %r (id=%s): %s", p.get("name"), p["id"], exc
                )
                track_count = (p.get("tracks") or {}).get("total") or 0
            playlists.append(
                {
                    "id": p["id"],
                    "name": p.get("name", ""),
                    "track_count": track_count,
                    "image": images[0]["url"] if images else None,
                }
            )
        results = _call(sp.next, results) if results.get("next") else None
    return playlists


def fetch_playlist_tracks(sp: spotipy.Spotify, playlist_id: str, on_page=None) -> list[dict]:
    """Returns normalized track dicts: {id, isrc, title, artist}.

    on_page, if given, is called after each page with (len(tracks) so far, total)
    so a caller can surface live progress on playlists large enough that paging
    through them takes a while.
    """
    tracks = []
    results = _call(sp.playlist_items, playlist_id, additional_types=["track"])
    total = results.get("total") or 0
    while results:
        for item in results["items"]:
            t = item.get("track")
            if not t or not t.get("id"):
                continue
            tracks.append(
                {
                    "id": t["id"],
                    "uri": t["uri"],
                    "isrc": (t.get("external_ids") or {}).get("isrc"),
                    "title": t.get("name", ""),
                    "artist": ", ".join(a["name"] for a in t.get("artists", [])),
                }
            )
        if on_page:
            on_page(len(tracks), total)
        results = _call(sp.next, results) if results.get("next") else None
    return tracks


def playlist_exists(sp: spotipy.Spotify, playlist_id: str) -> bool:
    try:
        _call(sp.playlist, playlist_id, fields="id")
        return True
    except spotipy.SpotifyException:
        return False


def add_tracks(sp: spotipy.Spotify, playlist_id: str, uris: list[str]) -> None:
    for i in range(0, len(uris), 100):
        _call(sp.playlist_add_items, playlist_id, uris[i : i + 100])


def remove_tracks(sp: spotipy.Spotify, playlist_id: str, uris: list[str]) -> None:
    for i in range(0, len(uris), 100):
        _call(sp.playlist_remove_all_occurrences_of_items, playlist_id, uris[i : i + 100])


def search_track(sp: spotipy.Spotify, title: str, artist: str) -> dict | None:
    query = f"track:{title} artist:{artist}"
    res = _call(sp.search, q=query, type="track", limit=1)
    items = res.get("tracks", {}).get("items", [])
    if not items:
        return None
    t = items[0]
    return {
        "id": t["id"],
        "uri": t["uri"],
        "isrc": (t.get("external_ids") or {}).get("isrc"),
        "title": t.get("name", ""),
        "artist": ", ".join(a["name"] for a in t.get("artists", [])),
    }
