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


def terminate_profile_processes(user_data_dir: Path) -> list[int]:
    """Terminate every exact-profile Chromium process when session owner is stale."""
    profile_dir = str(user_data_dir)
    try:
        target_pids = chrome_pids_for_user_data_dir(profile_dir)
    except ChromiumProcessInspectionError:
        return []
    if os.name == "nt":
        for target_pid in target_pids:
            subprocess.run(
                ["taskkill.exe", "/PID", str(target_pid), "/T", "/F"],
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    return target_pids


def terminate_native_process(
    process: NativeBrowserProcess,
    user_data_dir: Path,
    actual_pid: int | None = None,
) -> None:
    """Terminate only the validated native profile process tree."""
    profile_dir = str(user_data_dir)
    if actual_pid is not None and int(actual_pid) > 0:
        target_pids = [int(actual_pid)]
        if int(process.pid) != int(actual_pid):
            target_pids.append(int(process.pid))
    else:
        try:
            target_pids = chrome_pids_for_user_data_dir(profile_dir)
        except Exception:
            target_pids = []
        if not target_pids:
            try:
                target_pids = [chromium_root_pid_for_user_data_dir(profile_dir)]
            except Exception:
                target_pids = []
        if int(process.pid) not in target_pids:
            target_pids.append(int(process.pid))
    if os.name == "nt":
        for target_pid in dict.fromkeys(target_pids):
            subprocess.run(
                ["taskkill.exe", "/PID", str(target_pid), "/T", "/F"],
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    elif process.poll() is None:
        process.process.terminate()


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
