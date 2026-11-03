"""Shared runtime state for the floating profile overlay manager.

``CloakSession`` writes one entry per live Chrome profile window (keyed by the
real ``--user-data-dir``); the standalone overlay manager process reads the file
to label each Chrome window with its profile name, order and timezone.

The state lives in a single JSON file written atomically (temp + replace) so the
manager never reads a half-written file. Everything here is best-effort and must
never raise into the browser launch path.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_LOCK = threading.Lock()


def _state_path() -> Path:
    # Import lazily so importing this module never fails on odd environments.
    from sidecar.utils.lock import first_writable_path

    return first_writable_path(".tmp", "overlay_state.json")


def _normkey(user_data_dir: Any) -> str:
    try:
        return os.path.normcase(os.path.abspath(str(user_data_dir)))
    except Exception:
        return os.path.normcase(str(user_data_dir or ""))


def _load_locked(path: Path) -> dict[str, dict[str, Any]]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            return {str(k): v for k, v in raw.items() if isinstance(v, dict)}
    except Exception:
        pass
    return {}


def _atomic_write_locked(path: Path, data: dict[str, dict[str, Any]]) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".overlay_state_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except Exception:
            pass
        raise


def set_overlay_entry(user_data_dir: Any, profile_name: str, order: Any, timezone: str) -> None:
    """Record/refresh the overlay label for one Chrome profile window."""
    try:
        path = _state_path()
        key = _normkey(user_data_dir)
        with _LOCK:
            data = _load_locked(path)
            data[key] = {
                "profile_name": str(profile_name or "Profile"),
                "order": int(order) if str(order or "").strip().isdigit() else 0,
                "timezone": str(timezone or ""),
            }
            _atomic_write_locked(path, data)
    except Exception:
        logger.debug("Cannot write overlay state for %s", user_data_dir, exc_info=True)


def remove_overlay_entry(user_data_dir: Any) -> None:
    """Drop the overlay label for one Chrome profile window."""
    try:
        path = _state_path()
        key = _normkey(user_data_dir)
        with _LOCK:
            data = _load_locked(path)
            if key in data:
                data.pop(key, None)
                _atomic_write_locked(path, data)
    except Exception:
        logger.debug("Cannot remove overlay state for %s", user_data_dir, exc_info=True)


def load_overlay_entries() -> dict[str, dict[str, Any]]:
    """Read all overlay entries keyed by normalized user-data-dir. Never raises."""
    try:
        path = _state_path()
        with _LOCK:
            return _load_locked(path)
    except Exception:
        return {}
