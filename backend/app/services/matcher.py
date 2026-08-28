from __future__ import annotations

import re

from rapidfuzz import fuzz

FUZZY_THRESHOLD = 82


def _normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\(.*?\)|\[.*?\]", " ", text)  # strip "(remastered)" etc.
    text = re.sub(r"feat\.?.*", "", text)
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def build_isrc_index(tracks: list[dict]) -> dict[str, dict]:
    return {t["isrc"]: t for t in tracks if t.get("isrc")}


def find_match(track: dict, candidates: list[dict], isrc_index: dict[str, dict] | None = None) -> dict | None:
    """Find the best matching track in `candidates` for `track`.

    Tries ISRC first (exact, reliable), falls back to normalized title+artist
    fuzzy matching.
    """
    if track.get("isrc") and isrc_index:
        hit = isrc_index.get(track["isrc"])
        if hit:
            return hit

    target = f"{_normalize(track.get('title', ''))} {_normalize(track.get('artist', ''))}"
    best = None
    best_score = 0
    for c in candidates:
        candidate_str = f"{_normalize(c.get('title', ''))} {_normalize(c.get('artist', ''))}"
        score = fuzz.token_sort_ratio(target, candidate_str)
        if score > best_score:
            best_score = score
            best = c

    if best and best_score >= FUZZY_THRESHOLD:
        return best
    return None
