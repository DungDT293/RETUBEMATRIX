"""Opt-in exact-profile renderer lifecycle forensics.

This module observes processes only. It never terminates processes or changes browser state.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import ctypes
import json
import os
from pathlib import Path
import threading
import time
from typing import Any

from core.window_icon_badge import exact_profile_process_snapshot

_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
_SYNCHRONIZE = 0x00100000
_WAIT_OBJECT_0 = 0
_WAIT_TIMEOUT = 0x00000102
_STILL_ACTIVE = 259


@dataclass
class _TrackedRenderer:
    pid: int
    handle: int
    metadata: dict[str, Any]
    first_seen_monotonic: float
    first_seen_wall: float


class _JsonlWriter:
    def __init__(self, path: Path, base: dict[str, Any]) -> None:
        self.path = path
        self.base = dict(base)
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, event: str, **data: Any) -> None:
        row = {
            **self.base,
            "event": event,
            "timestamp_wall": time.time(),
            "timestamp_monotonic": time.monotonic(),
            **data,
        }
        with self._lock:
            with self.path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                stream.flush()


class RendererHandleTracker:
    """Track exact-profile renderer handles and Windows termination status."""

    def __init__(
        self,
        *,
        profile_id: str,
        profile: str,
        profile_dir: Path,
        browser_pid_getter: Any,
        log_path: Path,
        interval: float = 0.25,
    ) -> None:
        self.profile_dir = Path(profile_dir)
        self.interval = max(0.05, float(interval))
        self._browser_pid_getter = browser_pid_getter
        self._writer = _JsonlWriter(log_path, {
            "profile": profile,
            "profile_id": profile_id,
            "user_data_dir": str(self.profile_dir),
            "mode": "automation",
            "engine": "playwright",
        })
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._tracked: dict[int, _TrackedRenderer] = {}
        self._recent_exits: deque[dict[str, Any]] = deque(maxlen=128)
        self._page_crashes: list[float] = []
        self._last_snapshot: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._kernel32 = None
        self._available = False
        self._configure_windows_api()

    def _configure_windows_api(self) -> None:
        if os.name != "nt":
            return
        try:
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
            kernel32.OpenProcess.restype = ctypes.c_void_p
            kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
            kernel32.WaitForSingleObject.restype = ctypes.c_ulong
            kernel32.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
            kernel32.GetExitCodeProcess.restype = ctypes.c_int
            kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
            kernel32.CloseHandle.restype = ctypes.c_int
            self._kernel32 = kernel32
            self._available = True
        except Exception as exc:
            self._writer.write("handle_api_unavailable", error_type=type(exc).__name__, error=str(exc))

    @property
    def log_path(self) -> Path:
        return self._writer.path

    def start(self) -> None:
        if self._thread is not None:
            return
        self._writer.write("forensic_session_started")
        self._thread = threading.Thread(target=self._run, name=f"renderer-forensics-{self.profile_dir.name}", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 3.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=max(0.0, timeout))
        self._close_all()
        self._writer.write("forensic_session_stopped")

    def page_crash(self, *, url: str, browser_pid: int | None, browser_alive: bool, gpu_pids: list[int], renderer_pids: list[int], utility_pids: list[int]) -> None:
        now = time.monotonic()
        self._page_crashes.append(now)
        self._writer.write(
            "page_crash",
            url=url,
            browser_pid=browser_pid,
            browser_alive=browser_alive,
            gpu_pids=gpu_pids,
            renderer_pids=renderer_pids,
            utility_pids=utility_pids,
            crash_event_monotonic=now,
        )
        with self._lock:
            exits = list(self._recent_exits)
        for item in exits:
            delta_ms = (item["timestamp_monotonic"] - now) * 1000
            if abs(delta_ms) <= 10000:
                self._writer.write(
                    "crash_correlation",
                    page_crash_timestamp_monotonic=now,
                    candidate_renderer_pid=item["pid"],
                    renderer_exit_timestamp_monotonic=item["timestamp_monotonic"],
                    delta_ms=round(delta_ms, 1),
                    exit_code=item.get("exit_code"),
                    classification="temporal_candidate",
                )

    def _run(self) -> None:
        while not self._stop.is_set():
            self._poll()
            self._check_handles()
            self._stop.wait(self.interval)
        self._poll()
        self._check_handles(force=True)

    def _poll(self) -> None:
        try:
            rows = exact_profile_process_snapshot(str(self.profile_dir))
        except Exception as exc:
            self._writer.write("topology_error", error_type=type(exc).__name__, error=str(exc))
            return
        now_mono = time.monotonic()
        now_wall = time.time()
        current = {int(row["pid"]): row for row in rows}
        renderer_rows = [row for row in rows if row.get("role") == "renderer"]
        for row in renderer_rows:
            pid = int(row["pid"])
            with self._lock:
                known = self._tracked.get(pid)
            if known is not None:
                continue
            handle = self._open_handle(pid)
            if handle is None:
                self._writer.write("renderer_handle_unavailable", pid=pid, metadata=row)
                continue
            tracked = _TrackedRenderer(pid, handle, dict(row), now_mono, now_wall)
            with self._lock:
                self._tracked[pid] = tracked
            self._writer.write("renderer_seen", pid=pid, metadata=row)
        browser_pids = [row["pid"] for row in rows if row.get("role") == "browser"]
        gpu_pids = [row["pid"] for row in rows if row.get("role") == "gpu-process"]
        utility_pids = [row["pid"] for row in rows if row.get("role") == "utility"]
        crashpad_pids = [row["pid"] for row in rows if row.get("role") == "crashpad-handler"]
        self._writer.write(
            "process_snapshot",
            browser_pids=browser_pids,
            renderer_pids=[row["pid"] for row in renderer_rows],
            gpu_pids=gpu_pids,
            utility_pids=utility_pids,
            crashpad_pids=crashpad_pids,
            process_count=len(rows),
        )
        self._last_snapshot = rows

    def _check_handles(self, force: bool = False) -> None:
        if not self._available or self._kernel32 is None:
            return
        with self._lock:
            tracked = list(self._tracked.values())
        for item in tracked:
            wait = self._kernel32.WaitForSingleObject(ctypes.c_void_p(item.handle), 0)
            if wait != _WAIT_OBJECT_0 and not force:
                continue
            if wait == _WAIT_TIMEOUT and force:
                continue
            code: int | None = None
            status = "ok"
            raw = ctypes.c_ulong(0)
            if self._kernel32.GetExitCodeProcess(ctypes.c_void_p(item.handle), ctypes.byref(raw)):
                code = int(raw.value)
                if code == _STILL_ACTIVE and not force:
                    continue
            else:
                status = "unavailable"
            now_mono = time.monotonic()
            event = {
                "pid": item.pid,
                "parent_pid": item.metadata.get("parent_pid"),
                "first_seen": item.first_seen_wall,
                "timestamp_monotonic": now_mono,
                "lifetime_ms": round((now_mono - item.first_seen_monotonic) * 1000, 1),
                "exit_code": code,
                "exit_code_hex": f"0x{code:08X}" if code is not None else None,
                "exit_code_status": status,
                "metadata": item.metadata,
            }
            self._writer.write("renderer_exit", **event)
            with self._lock:
                self._recent_exits.append(event)
                self._tracked.pop(item.pid, None)
            self._kernel32.CloseHandle(ctypes.c_void_p(item.handle))

    def _open_handle(self, pid: int) -> int | None:
        if not self._available or self._kernel32 is None:
            return None
        handle = self._kernel32.OpenProcess(_PROCESS_QUERY_LIMITED_INFORMATION | _SYNCHRONIZE, 0, pid)
        return int(handle) if handle else None

    def _close_all(self) -> None:
        if not self._kernel32:
            return
        with self._lock:
            items = list(self._tracked.values())
            self._tracked.clear()
        for item in items:
            self._kernel32.CloseHandle(ctypes.c_void_p(item.handle))
