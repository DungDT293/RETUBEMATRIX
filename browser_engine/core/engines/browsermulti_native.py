"""Native manual BrowserMulti process launcher."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import threading
import time
from typing import Callable

from core.window_icon_badge import (
    ChromiumProcessInspectionError,
    chromium_process_for_pid,
    chromium_root_pid_for_user_data_dir,
    chrome_pids_for_user_data_dir,
)

CREATE_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
DETACHED_PROCESS = getattr(subprocess, "DETACHED_PROCESS", 0)


class NativeBrowserProcess:
    def __init__(self, process: subprocess.Popen, user_data_dir: Path, on_exit: Callable[[int], None] | None = None):
        self.process = process
        self.user_data_dir = Path(user_data_dir)
        self.exit_code: int | None = None
        self.exit_time: float | None = None
        self._on_exit = on_exit
        self._watcher = threading.Thread(target=self._wait, name=f"browsermulti-watch-{process.pid}", daemon=True)
        self._watcher.start()

    @property
    def pid(self) -> int:
        return int(self.process.pid)

    def poll(self) -> int | None:
        return self.process.poll()

    def _wait(self) -> None:
        code = self.process.wait()
        self.exit_code = int(code)
        self.exit_time = time.time()
        if self._on_exit is not None:
            self._on_exit(int(code))


def actual_browser_pid(process: NativeBrowserProcess, user_data_dir: Path, timeout: float = 5.0) -> int:
    """Wait past launcher handoff and return one validated Chromium browser PID."""
    profile_dir = str(user_data_dir)
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            if chromium_process_for_pid(process.pid, profile_dir):
                return process.pid
            pid = chromium_root_pid_for_user_data_dir(profile_dir)
            if chromium_process_for_pid(pid, profile_dir):
                return pid
        except ChromiumProcessInspectionError as exc:
            last_error = exc
        except Exception as exc:
            last_error = exc
        time.sleep(0.1)
    detail = f": {last_error}" if last_error else ""
    raise RuntimeError(f"Không xác định được Browser PID thực của profile native{detail}")


def _send_wm_close_to_pids(pids: list[int]) -> bool:
    """Send WM_CLOSE to all top-level windows of specified PIDs for graceful shutdown."""
    if not pids or os.name != "nt":
        return False
    sent = False
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        WM_CLOSE = 0x0010
        pid_set = {int(p) for p in pids}
        enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def enum_proc(hwnd: int, _lparam: int) -> bool:
            try:
                proc_id = wintypes.DWORD()
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(proc_id))
                if proc_id.value in pid_set:
                    user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
                    nonlocal sent
                    sent = True
            except Exception:
                pass
            return True

        cb = enum_proc_type(enum_proc)
        user32.EnumWindows(cb, 0)
    except Exception:
        pass
    return sent


def graceful_terminate_pids(target_pids: list[int], timeout: float = 8.0) -> None:
    """Terminate PIDs with 2-phase graceful shutdown: WM_CLOSE / terminate first, wait, then kill."""
    if not target_pids:
        return
    all_pids: set[int] = {int(p) for p in target_pids if int(p) > 0}
    try:
        import psutil
        for pid in list(all_pids):
            try:
                if psutil.pid_exists(pid):
                    proc = psutil.Process(pid)
                    for child in proc.children(recursive=True):
                        all_pids.add(int(child.pid))
            except Exception:
                pass
    except Exception:
        pass

    if not all_pids:
        return

    # Phase 1: Graceful close
    if os.name == "nt":
        _send_wm_close_to_pids(list(all_pids))
        try:
            import psutil
            for pid in all_pids:
                try:
                    if psutil.pid_exists(pid):
                        psutil.Process(pid).terminate()
                except Exception:
                    pass
        except Exception:
            pass
    else:
        for pid in all_pids:
            try:
                os.kill(pid, 15)
            except OSError:
                pass

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        alive = False
        try:
            import psutil
            for pid in all_pids:
                if psutil.pid_exists(pid):
                    if psutil.Process(pid).status() != getattr(psutil, "STATUS_ZOMBIE", "zombie"):
                        alive = True
                        break
        except Exception:
            alive = False
        if not alive:
            return
        time.sleep(0.15)

    # Phase 2: Force kill remaining
    if os.name == "nt":
        for pid in all_pids:
            try:
                subprocess.run(
                    ["taskkill.exe", "/PID", str(pid), "/T", "/F"],
                    check=False,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception:
                pass
    else:
        try:
            import psutil
            for pid in all_pids:
                try:
                    if psutil.pid_exists(pid):
                        psutil.Process(pid).kill()
                except Exception:
                    pass
        except Exception:
            pass


def terminate_profile_processes(user_data_dir: Path, graceful_timeout: float = 8.0) -> list[int]:
    """Gracefully terminate every exact-profile Chromium process, escalating to kill only on timeout."""
    profile_dir = str(user_data_dir)
    try:
        target_pids = chrome_pids_for_user_data_dir(profile_dir)
    except ChromiumProcessInspectionError:
        return []
    if not target_pids:
        return []

    graceful_terminate_pids(target_pids, timeout=graceful_timeout)
    return target_pids


def terminate_native_process(
    process: NativeBrowserProcess,
    user_data_dir: Path,
    actual_pid: int | None = None,
    graceful_timeout: float = 8.0,
) -> None:
    """Terminate the validated native profile process tree gracefully, then force-kill if needed."""
    profile_dir = str(user_data_dir)
    target_pids: list[int] = []
    if actual_pid is not None and int(actual_pid) > 0:
        target_pids.append(int(actual_pid))
    try:
        live_pids = chrome_pids_for_user_data_dir(profile_dir)
        target_pids.extend(live_pids)
    except Exception:
        pass
    if not target_pids:
        try:
            root_pid = chromium_root_pid_for_user_data_dir(profile_dir)
            if root_pid:
                target_pids.append(root_pid)
        except Exception:
            pass
    if int(process.pid) not in target_pids:
        target_pids.append(int(process.pid))
    target_pids = list(dict.fromkeys(target_pids))

    graceful_terminate_pids(target_pids, timeout=graceful_timeout)


def wait_for_profile_exit(user_data_dir: Path, timeout: float = 10.0) -> list[int] | None:
    """Wait boundedly until exact-profile Chromium processes disappear; None means unknown."""
    deadline = time.monotonic() + timeout
    remaining: list[int] = []
    while time.monotonic() < deadline:
        try:
            remaining = chrome_pids_for_user_data_dir(str(user_data_dir))
        except ChromiumProcessInspectionError:
            time.sleep(0.1)
            continue
        if not remaining:
            return []
        time.sleep(0.1)
    try:
        return chrome_pids_for_user_data_dir(str(user_data_dir))
    except Exception:
        return None


def launch_native(
    binary_path: str | Path,
    user_data_dir: str | Path,
    launch_args: list[str],
    target_url: str = "https://www.google.com/",
    on_exit: Callable[[int], None] | None = None,
    proxy_args: list[str] | None = None,
) -> NativeBrowserProcess:
    """Launch manual Chromium directly; automation remains Playwright-owned."""
    profile_dir = Path(user_data_dir)
    command = [str(Path(binary_path)), *(proxy_args or []), *launch_args, f"--user-data-dir={profile_dir}", target_url]
    creationflags = CREATE_NEW_PROCESS_GROUP
    if os.name == "nt":
        creationflags |= DETACHED_PROCESS
    process = subprocess.Popen(
        command,
        creationflags=creationflags,
        close_fds=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        shell=False,
    )
    return NativeBrowserProcess(process, profile_dir, on_exit=on_exit)
