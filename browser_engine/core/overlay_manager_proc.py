"""Spawn/stop the single overlay manager process from the sidecar.

The overlay manager (``scripts/overlay_manager.py``) is one long-lived PyQt6
process that draws floating profile labels following each Chrome window. Only
one runs per machine (named mutex inside the manager); the sidecar also kills a
stale manager at startup and on shutdown so it never orphans.

Dev-only: skipped in frozen/packaged builds (no bundled Python/PyQt6); the
title-bar overlay covers packaged builds.
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_ROOT = Path(__file__).resolve().parents[1]
_MANAGER_SCRIPT = _ROOT / "scripts" / "overlay_manager.py"

_proc: Optional[subprocess.Popen] = None


def _pidfile() -> Path:
    from sidecar.utils.lock import first_writable_path

    return first_writable_path(".tmp", "overlay_manager.pid")


def _kill_stale_manager() -> None:
    """Terminate a leftover manager from a previous (orphaned) sidecar."""
    try:
        import psutil  # type: ignore[import-not-found]
    except Exception:
        return
    try:
        path = _pidfile()
        if not path.exists():
            return
        pid = int((path.read_text(encoding="utf-8").strip() or "0"))
        if pid <= 0 or not psutil.pid_exists(pid):
            return
        proc = psutil.Process(pid)
        cmdline = " ".join(proc.cmdline()).lower()
        # Verify identity to avoid killing an unrelated PID-reused process.
        if "overlay_manager.py" in cmdline:
            proc.terminate()
            try:
                proc.wait(timeout=2.0)
            except Exception:
                proc.kill()
    except Exception:
        logger.debug("Cannot kill stale overlay manager", exc_info=True)


def start_overlay_manager() -> bool:
    """Spawn the overlay manager once (dev builds only). Best-effort."""
    global _proc
    if os.name != "nt":
        return False
    if getattr(sys, "frozen", False):
        logger.debug("Overlay manager disabled in frozen build")
        return False
    if not _MANAGER_SCRIPT.exists():
        logger.debug("Overlay manager script missing: %s", _MANAGER_SCRIPT)
        return False
    if _proc is not None and _proc.poll() is None:
        return True

    _kill_stale_manager()

    parent_pid = os.getpid()
    parent_ct = ""
    try:
        import psutil  # type: ignore[import-not-found]

        parent_ct = str(psutil.Process(parent_pid).create_time())
    except Exception:
        parent_ct = ""

    try:
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        cmd = [
            sys.executable,
            str(_MANAGER_SCRIPT),
            "--parent-pid",
            str(parent_pid),
        ]
        if parent_ct:
            cmd += ["--parent-create-time", parent_ct]
        _proc = subprocess.Popen(
            cmd,
            creationflags=creationflags,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
        try:
            _pidfile().write_text(str(_proc.pid), encoding="utf-8")
        except Exception:
            pass
        logger.info("Started overlay manager (pid=%s)", _proc.pid)
        return True
    except Exception:
        logger.debug("Cannot start overlay manager", exc_info=True)
        _proc = None
        return False


def stop_overlay_manager(timeout: float = 2.0) -> None:
    """Terminate the overlay manager process if running."""
    global _proc
    proc = _proc
    _proc = None
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
        logger.debug("Cannot stop overlay manager", exc_info=True)
