from __future__ import annotations

import re

from rapidfuzz import fuzz

TITLE_THRESHOLD = 78
ARTIST_THRESHOLD = 60
COMBINED_THRESHOLD = 82

# Duration is a strong secondary signal when we have it for both sides: two
# genuinely-different recordings of the same song (a live version, a remix)
# often score high on title/artist text alone, so a big duration gap is
# reason to distrust an otherwise-passing text match.
_DURATION_TOLERANCE_SECONDS = 5

# YouTube Music titles carry a lot of upload/video boilerplate that Spotify's
# canonical titles never have. Strip it before comparing so a track that's
# actually already in the destination playlist isn't treated as new just
# because of "(Official Video)" noise.
_NOISE_PATTERNS = [
    r"\(.*?\)",
    r"\[.*?\]",
    r"\bfeat\.?.*",
    r"\bft\.?.*",
    r"\bofficial\s*(music\s*)?video\b",
    r"\bofficial\s*audio\b",
    r"\bofficial\s*lyric\s*video\b",
    r"\blyric\s*video\b",
    r"\bvisuali[sz]er\b",
    r"\baudio\b",
    r"\bmv\b",
    r"\bhd\b",
    r"\bhq\b",
    r"\bremaster(ed)?\s*\d{0,4}\b",
    r"-\s*topic$",
]


def _normalize(text: str) -> str:
    text = text.lower()
    text = text.replace("’", "'")
    for pattern in _NOISE_PATTERNS:
        text = re.sub(pattern, " ", text)
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _duration_seconds(track: dict) -> int | None:
    value = track.get("duration_seconds") or track.get("duration_ms")
    if value is None:
        return None
    return int(value / 1000) if value > 1000 else int(value)


def build_isrc_index(tracks: list[dict]) -> dict[str, dict]:
    return {t["isrc"]: t for t in tracks if t.get("isrc")}


def _score(track: dict, candidate: dict) -> float | None:
    title_score = fuzz.token_sort_ratio(_normalize(track.get("title", "")), _normalize(candidate.get("title", "")))
    artist_score = fuzz.token_sort_ratio(_normalize(track.get("artist", "")), _normalize(candidate.get("artist", "")))
    if title_score < TITLE_THRESHOLD or artist_score < ARTIST_THRESHOLD:
        return None

    combined = title_score * 0.65 + artist_score * 0.35
    if combined < COMBINED_THRESHOLD:
        return None

    track_dur = _duration_seconds(track)
    cand_dur = _duration_seconds(candidate)
    if track_dur is not None and cand_dur is not None:
        if abs(track_dur - cand_dur) > _DURATION_TOLERANCE_SECONDS:
            # Text matches but the recordings are different lengths (live
            # version, remix, etc.) - don't treat it as the same track, but
            # don't let one bad duration pair rule out every candidate either.
            return None

    return combined


def find_match(track: dict, candidates: list[dict], isrc_index: dict[str, dict] | None = None) -> dict | None:
    """Find the best matching track in `candidates` for `track`.

    Tries ISRC first (exact, reliable), falls back to normalized title+artist
    fuzzy matching (scored separately, then combined) with a duration check
    to catch same-name/different-recording false positives.
    """
    if track.get("isrc") and isrc_index:
        hit = isrc_index.get(track["isrc"])
        if hit:
            return hit

    best = None
    best_score = 0.0
    for c in candidates:
        score = _score(track, c)
        if score is not None and score > best_score:
            best_score = score
            best = c

    return best
