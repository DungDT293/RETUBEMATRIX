"""Track keywords used in recent YouTube nurture sessions per profile.

Keeps the last few sessions worth of picked keywords so the next session can
prefer keywords NOT recently used. Best-effort persistence; never raises.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from threading import Lock

from core.paths import app_path

logger = logging.getLogger(__name__)

KEYWORD_HISTORY_FILE = app_path("logs", "youtube_keyword_history.json")
_MAX_SESSIONS_KEPT = 2
_MAX_KEYWORDS_PER_SESSION = 20
_lock = Lock()


def _load() -> dict:
    if not KEYWORD_HISTORY_FILE.exists():
        return {}
    try:
        raw = KEYWORD_HISTORY_FILE.read_text(encoding="utf-8")
        data = json.loads(raw) if raw.strip() else {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save(data: dict) -> None:
    try:
        KEYWORD_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        KEYWORD_HISTORY_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.debug("Khong ghi duoc youtube_keyword_history: %s", exc)


def get_recent_keywords(profile_name: str) -> list[str]:
    """Return flattened list of keywords from the last few sessions of profile."""
    if not profile_name:
        return []
    with _lock:
        data = _load()
    entry = data.get(str(profile_name))
    if not isinstance(entry, dict):
        return []
    sessions = entry.get("sessions")
    if not isinstance(sessions, list):
        return []
    flat: list[str] = []
    for session in sessions:
        if not isinstance(session, dict):
            continue
        kws = session.get("keywords")
        if isinstance(kws, list):
            flat.extend(str(k).strip() for k in kws if str(k).strip())
    seen: set[str] = set()
    deduped: list[str] = []
    for kw in flat:
        key = kw.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(kw)
    return deduped


def save_recent_keywords(profile_name: str, keywords: list[str]) -> None:
    """Append a session record (keeps only last _MAX_SESSIONS_KEPT sessions)."""
    if not profile_name:
        return
    cleaned = [str(k).strip() for k in (keywords or []) if str(k).strip()]
    if not cleaned:
        return
    cleaned = cleaned[:_MAX_KEYWORDS_PER_SESSION]
    with _lock:
        data = _load()
        entry = data.get(str(profile_name))
        if not isinstance(entry, dict):
            entry = {"sessions": []}
        sessions = entry.get("sessions")
        if not isinstance(sessions, list):
            sessions = []
        sessions.append({
            "keywords": cleaned,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        })
        if len(sessions) > _MAX_SESSIONS_KEPT:
            sessions = sessions[-_MAX_SESSIONS_KEPT:]
        entry["sessions"] = sessions
        data[str(profile_name)] = entry
        _save(data)


def clear(profile_name: str = "") -> None:
    """Clear history for one profile, or the entire file if profile_name empty."""
    with _lock:
        if not profile_name:
            try:
                if KEYWORD_HISTORY_FILE.exists():
                    KEYWORD_HISTORY_FILE.unlink()
            except Exception:
                pass
            return
        data = _load()
        if str(profile_name) in data:
            del data[str(profile_name)]
            _save(data)
