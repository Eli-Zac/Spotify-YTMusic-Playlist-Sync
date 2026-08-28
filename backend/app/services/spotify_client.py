from __future__ import annotations

import time
from datetime import datetime, timedelta

import spotipy
from spotipy.oauth2 import SpotifyOAuth
from sqlmodel import Session

from app.config import settings
from app.models import Credential, ServiceName
from app.security import decrypt, encrypt

SCOPE = "playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private"


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

    return spotipy.Spotify(auth=access_token)


def list_playlists(sp: spotipy.Spotify) -> list[dict]:
    """Returns the connected user's playlists: {id, name, track_count, image}."""
    playlists = []
    results = sp.current_user_playlists(limit=50)
    while results:
        for p in results["items"]:
            images = p.get("images") or []
            track_count = (p.get("tracks") or {}).get("total") or 0
            if not track_count:
                # The list endpoint's tracks.total is unreliable (often stale/0) even
                # when the playlist has tracks; the single-playlist endpoint is accurate.
                detail = sp.playlist(p["id"], fields="tracks.total")
                track_count = (detail.get("tracks") or {}).get("total") or 0
            playlists.append(
                {
                    "id": p["id"],
                    "name": p.get("name", ""),
                    "track_count": track_count,
                    "image": images[0]["url"] if images else None,
                }
            )
        results = sp.next(results) if results.get("next") else None
    return playlists


def fetch_playlist_tracks(sp: spotipy.Spotify, playlist_id: str) -> list[dict]:
    """Returns normalized track dicts: {id, isrc, title, artist}."""
    tracks = []
    results = sp.playlist_items(playlist_id, additional_types=["track"])
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
        results = sp.next(results) if results.get("next") else None
    return tracks


def playlist_exists(sp: spotipy.Spotify, playlist_id: str) -> bool:
    try:
        sp.playlist(playlist_id, fields="id")
        return True
    except spotipy.SpotifyException:
        return False


def add_tracks(sp: spotipy.Spotify, playlist_id: str, uris: list[str]) -> None:
    for i in range(0, len(uris), 100):
        sp.playlist_add_items(playlist_id, uris[i : i + 100])


def remove_tracks(sp: spotipy.Spotify, playlist_id: str, uris: list[str]) -> None:
    for i in range(0, len(uris), 100):
        sp.playlist_remove_all_occurrences_of_items(playlist_id, uris[i : i + 100])


def search_track(sp: spotipy.Spotify, title: str, artist: str) -> dict | None:
    query = f"track:{title} artist:{artist}"
    res = sp.search(q=query, type="track", limit=1)
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
