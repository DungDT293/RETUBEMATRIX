"""Spawn a separate Python subprocess that draws the profile badge overlay.

The overlay runs on its own PyQt6 event loop in another process so it does not
block the asyncio loop that drives Playwright. Each ``CloakSession`` instance
owns one overlay subprocess, started after the browser is up and stopped when
the session closes.
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[1]
OVERLAY_SCRIPT = ROOT / "scripts" / "profile_overlay_window.py"


class NativeOverlayProcess:
    def __init__(self, profile_name: str, timezone: str = "") -> None:
        self.profile_name = profile_name or "Profile"
        self.timezone = (timezone or "").strip()
        self._proc: Optional[subprocess.Popen[bytes]] = None

    def start(self) -> bool:
        # Packaged builds run from a frozen sidecar exe where ``sys.executable``
        # is not a Python interpreter and the overlay script is not on disk; the
        # always-on title-bar overlay covers those builds instead.
        if getattr(sys, "frozen", False):
            logger.debug("Native overlay disabled in frozen build")
            return False
        if not OVERLAY_SCRIPT.exists():
            logger.debug("Overlay script missing: %s", OVERLAY_SCRIPT)
            return False
        if self._proc and self._proc.poll() is None:
            return True
        try:
            creationflags = 0
            if os.name == "nt":
                creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            self._proc = subprocess.Popen(
                [sys.executable, str(OVERLAY_SCRIPT), self.profile_name, self.timezone],
                creationflags=creationflags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
            )
            logger.info(
                "Started native overlay for profile '%s' (tz=%s, pid=%s)",
                self.profile_name,
                self.timezone or "local",
                self._proc.pid,
            )
            return True
        except Exception as exc:
            logger.debug("Cannot start native overlay: %s", exc)
            return False

    def stop(self, timeout: float = 1.5) -> None:
        proc = self._proc
        self._proc = None
        if proc is None:
            return
        if proc.poll() is not None:
            return
        try:
            proc.terminate()
            try:
                proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            pass
