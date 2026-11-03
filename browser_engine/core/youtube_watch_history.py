"""Persist watched YouTube video metadata by default.

This is intentionally always-on. The Dashboard/session view can use it later
without asking the user to enable a separate setting.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from core.paths import app_path

logger = logging.getLogger(__name__)
WATCH_HISTORY_FILE = app_path("logs", "youtube_watch_history.jsonl")
_MAX_RECORDS = 1000


def record_youtube_watch(
    *,
    profile_id: str = "",
    profile_name: str = "",
    title: str = "",
    url: str = "",
    source: str = "",
    planned_seconds: float = 0.0,
) -> None:
    """Append a watched-video record. Best effort; never raises."""
    try:
        WATCH_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "profile_id": str(profile_id or ""),
            "profile_name": str(profile_name or ""),
            "title": str(title or "").strip()[:300],
            "url": str(url or "").strip(),
            "source": str(source or ""),
            "planned_seconds": round(max(0.0, float(planned_seconds or 0.0)), 2),
            "watched_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(WATCH_HISTORY_FILE, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        _trim_history()
    except Exception as exc:
        logger.debug("Khong ghi duoc youtube_watch_history: %s", exc)


def _trim_history() -> None:
    try:
        if not WATCH_HISTORY_FILE.exists():
            return
        lines = WATCH_HISTORY_FILE.read_text(encoding="utf-8").splitlines()
        if len(lines) > _MAX_RECORDS:
            WATCH_HISTORY_FILE.write_text("\n".join(lines[-_MAX_RECORDS:]) + "\n", encoding="utf-8")
    except Exception:
        pass
