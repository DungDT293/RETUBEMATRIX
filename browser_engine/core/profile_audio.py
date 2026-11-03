"""Windows Core Audio control scoped to one BrowserMulti profile."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from core.paths import profile_data_path
from core.window_icon_badge import ChromiumProcessInspectionError, chrome_pids_for_user_data_dir

logger = logging.getLogger(__name__)

PROFILES_DIR = profile_data_path("profiles")


def _profile_dir_is_owned(profile_dir: str | Path) -> bool:
    try:
        root = PROFILES_DIR.resolve()
        target = Path(profile_dir).expanduser().resolve()
        return target != root and root in target.parents
    except Exception:
        return False


def _profile_process_ids(profile_dir: str | Path) -> tuple[list[int], list[int]]:
    """Return exact BrowserMulti Chromium roots and their descendants."""
    roots = chrome_pids_for_user_data_dir(str(profile_dir))
    process_ids = set(roots)
    try:
        import psutil  # type: ignore[import-not-found]
    except Exception:
        return roots, sorted(process_ids)

    for root_pid in roots:
        try:
            process_ids.update(int(proc.pid) for proc in psutil.Process(root_pid).children(recursive=True))
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        except Exception:
            logger.debug("Không đọc được process con của profile audio %s", profile_dir, exc_info=True)
    return roots, sorted(process_ids)


def _unsupported(message: str) -> dict[str, Any]:
    return {
        "supported": False,
        "root_pids": [],
        "process_pids": [],
        "matched_sessions": 0,
        "changed_sessions": 0,
        "failed_sessions": 0,
        "message": message,
    }


def set_profile_muted(profile_dir: str | Path | None, muted: bool) -> dict[str, Any]:
    """Mute only Core Audio sessions owned by Chromium for one app profile."""
    if os.name != "nt":
        return _unsupported("Điều khiển âm thanh profile chỉ hỗ trợ Windows")
    if not profile_dir or not _profile_dir_is_owned(profile_dir):
        return _unsupported("Không xác định được thư mục profile BrowserMulti hợp lệ")

    try:
        roots, process_ids = _profile_process_ids(profile_dir)
    except ChromiumProcessInspectionError:
        return _unsupported("Không thể kiểm tra tiến trình Chromium của profile an toàn")
    except Exception as exc:
        logger.debug("Không lấy được PID profile audio", exc_info=True)
        return _unsupported(f"Không thể kiểm tra tiến trình profile: {exc}")

    result = {
        "supported": True,
        "root_pids": roots,
        "process_pids": process_ids,
        "matched_sessions": 0,
        "changed_sessions": 0,
        "failed_sessions": 0,
        "message": "",
    }
    if not process_ids:
        result["message"] = "Chưa tìm thấy Chromium của profile đang mở"
        return result

    try:
        from pycaw.pycaw import AudioUtilities, ISimpleAudioVolume  # type: ignore[import-not-found]
    except Exception:
        return _unsupported("Thiếu thành phần Windows Core Audio; profile vẫn được giữ nguyên")

    try:
        sessions = AudioUtilities.GetAllSessions()
    except Exception as exc:
        result["failed_sessions"] = 1
        result["message"] = f"Không đọc được phiên âm thanh Windows: {exc}"
        return result

    process_set = set(process_ids)
    for session in sessions or []:
        try:
            pid = int(getattr(session, "ProcessId", 0) or 0)
            if pid not in process_set:
                continue
            result["matched_sessions"] += 1
            volume = session.SimpleAudioVolume
            volume.SetMute(bool(muted), None)
            result["changed_sessions"] += 1
        except Exception as exc:
            result["failed_sessions"] += 1
            logger.debug("Không đổi được mute session profile %s", profile_dir, exc_info=True)

    matched = result["matched_sessions"]
    failed = result["failed_sessions"]
    changed = result["changed_sessions"]
    if matched == 0:
        result["message"] = "Chưa tìm thấy phiên âm thanh của profile; sẽ thử lại khi profile phát âm thanh"
    elif failed:
        result["message"] = f"Đã đổi {changed}/{matched} phiên âm thanh; {failed} phiên lỗi"
    else:
        result["message"] = f"Đã đổi {changed} phiên âm thanh của profile"
    return result


def profile_audio_supported() -> bool:
    if os.name != "nt":
        return False
    try:
        from pycaw.pycaw import AudioUtilities  # type: ignore[import-not-found]

        return AudioUtilities is not None
    except Exception:
        return False
