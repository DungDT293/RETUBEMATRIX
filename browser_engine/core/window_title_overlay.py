"""Display profile name + timezone + clock in Chrome window title.

Uses Win32 ``SetWindowTextW`` on the top-level Chrome windows that own a
specific user-data-dir. The title is OS chrome (not DOM) so Google/YouTube
cannot read or detect it. Updated every second from a background thread.

Safe to instantiate on non-Windows: ``start()`` is a no-op.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone as _utc
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from zoneinfo import ZoneInfo  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - py<3.9 fallback
    ZoneInfo = None  # type: ignore[assignment]

try:
    import ctypes
    from ctypes import wintypes

    _HAS_WIN32 = True
except Exception:  # pragma: no cover - non-Windows
    _HAS_WIN32 = False


def _short_zone_label(tz_name: str) -> str:
    if not tz_name:
        return ""
    parts = tz_name.split("/")
    return parts[-1].replace("_", " ")


def _format_offset(now_utc: datetime, tz_name: str) -> str:
    if not tz_name or ZoneInfo is None:
        return ""
    try:
        offset = now_utc.astimezone(ZoneInfo(tz_name)).utcoffset()
    except Exception:
        return ""
    if offset is None:
        return ""
    total = int(offset.total_seconds())
    sign = "+" if total >= 0 else "-"
    total = abs(total)
    return f"UTC{sign}{total // 3600:02d}:{(total % 3600) // 60:02d}"


def _format_clock(tz_name: str) -> str:
    now = datetime.now(_utc.utc)
    if tz_name and ZoneInfo is not None:
        try:
            return now.astimezone(ZoneInfo(tz_name)).strftime("%H:%M:%S")
        except Exception:
            pass
    return now.astimezone().strftime("%H:%M:%S")


class WindowTitleOverlay:
    """Background ticker that updates Chrome window title every second.

    Title format: ``<profile_name>  <Zone> UTC+HH:MM  HH:MM:SS``.
    Two leading spaces inside separators only — Chrome already prefixes the
    page title, so visually it reads as ``<page> - <profile> ...``.
    """

    def __init__(
        self,
        profile_name: str,
        user_data_dir: Path | str,
        timezone: Optional[str] = None,
    ) -> None:
        self.profile_name = (profile_name or "Profile").strip() or "Profile"
        self.user_data_dir = str(user_data_dir)
        self.timezone = (timezone or "").strip()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def update_timezone(self, tz_name: str) -> None:
        self.timezone = (tz_name or "").strip()

    def start(self) -> None:
        if not _HAS_WIN32:
            logger.debug("WindowTitleOverlay disabled (Win32 unavailable)")
            return
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run,
            name=f"WindowTitleOverlay-{self.profile_name}",
            daemon=True,
        )
        self._thread.start()
        logger.info("Window title overlay started for profile '%s'", self.profile_name)

    def stop(self) -> None:
        self._stop.set()
        thread = self._thread
        self._thread = None
        if thread is not None:
            thread.join(timeout=2.0)

    def _build_title(self) -> str:
        zone_label = _short_zone_label(self.timezone)
        offset_label = _format_offset(datetime.now(_utc.utc), self.timezone)
        if zone_label and offset_label:
            zone_part = f"{zone_label} {offset_label}"
        else:
            zone_part = zone_label or offset_label
        clock = _format_clock(self.timezone)
        parts = [f"[{self.profile_name}]"]
        if zone_part:
            parts.append(zone_part)
        parts.append(clock)
        return "  ".join(parts)

    def _run(self) -> None:  # pragma: no cover - integration only
        # Imported lazily so non-Windows machines don't import pywin32.
        from core.window_icon_badge import _chrome_pids_for_user_data_dir, _chrome_windows_for_pid

        try:
            user32 = ctypes.windll.user32
        except Exception:
            return
        SetWindowTextW = user32.SetWindowTextW
        SetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPCWSTR]
        SetWindowTextW.restype = wintypes.BOOL

        cached_windows: list[int] = []
        rescan_counter = 0
        while not self._stop.is_set():
            try:
                # Re-discover Chrome windows for this user-data-dir every 5
                # ticks so newly opened popup windows pick up the title.
                if rescan_counter <= 0 or not cached_windows:
                    pids = _chrome_pids_for_user_data_dir(self.user_data_dir)
                    windows: list[int] = []
                    for pid in pids:
                        windows.extend(_chrome_windows_for_pid(pid))
                    if windows:
                        cached_windows = windows
                        rescan_counter = 5
                else:
                    rescan_counter -= 1

                if cached_windows:
                    title = self._build_title()
                    for hwnd in cached_windows:
                        try:
                            SetWindowTextW(hwnd, title)
                        except Exception:
                            pass
            except Exception:
                logger.debug("Title overlay tick failed", exc_info=True)
            self._stop.wait(timeout=1.0)
