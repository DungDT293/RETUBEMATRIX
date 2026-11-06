from __future__ import annotations

import contextlib
import ctypes
import logging
import os
from ctypes import wintypes
from pathlib import Path
from typing import Any

from core.paths import app_path
from core.profile_store import load_profiles

logger = logging.getLogger(__name__)


class ChromiumProcessInspectionError(RuntimeError):
    """Raised when Chromium process state cannot be inspected safely."""


def profile_badge_number(profile_id: Any = None, profile_dir: Any = None, profile_name: Any = None) -> int | None:
    """Return 1-based profile order from the app profile list."""
    target_id = str(profile_id or "").strip()
    target_dir = str(profile_dir or "").strip()
    target_name = str(profile_name or "").strip()
    if not (target_id or target_dir or target_name):
        return None
    try:
        profiles = load_profiles()
    except Exception:
        logger.debug("Cannot load profiles for browser icon badge", exc_info=True)
        return None
    for index, profile in enumerate(profiles, start=1):
        if target_id and str(profile.get("id") or "").strip() == target_id:
            return index
        if target_dir and str(profile.get("profile_dir") or "").strip() == target_dir:
            return index
        if target_name and str(profile.get("profile_name") or "").strip() == target_name:
            return index
    return None


def apply_browser_icon_badge_for_user_data_dir(user_data_dir: Any, number: Any) -> list[int]:
    """Apply a Chrome/Chromium taskbar icon badge to the window owning the given user-data-dir."""
    if os.name != "nt":
        return []
    target_dir = str(user_data_dir or "").strip()
    if not target_dir:
        return []
    try:
        badge_number = int(number)
    except Exception:
        return []
    if badge_number <= 0:
        return []
    try:
        try:
            pids = _chrome_pids_for_user_data_dir(target_dir)
        except ChromiumProcessInspectionError:
            logger.debug("Cannot inspect Chromium processes for browser icon badge", exc_info=True)
            return []
        if not pids:
            return []
        chrome_windows: list[int] = []
        for pid in pids:
            chrome_windows.extend(_chrome_windows_for_pid(pid))
        if not chrome_windows:
            return []
        exe_path = _process_exe_path(pids[0])
        if not exe_path:
            return []
        icon_path = make_badged_icon(exe_path, badge_number)
        if icon_path is None:
            return []
        return _set_window_icons(chrome_windows, icon_path)
    except Exception:
        logger.debug("Cannot apply browser icon badge", exc_info=True)
        return []


def _set_window_icons(chrome_windows: list[int], icon_path: Path) -> list[int]:
    if hasattr(ctypes, "windll"):
        try:
            user32 = ctypes.windll.user32
            IMAGE_ICON = 1
            LR_LOADFROMFILE = 0x0010
            LR_DEFAULTSIZE = 0x0040
            WM_SETICON = 0x0080
            ICON_SMALL = 0
            ICON_BIG = 1
            big_icon = user32.LoadImageW(0, str(icon_path), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE)
            small_icon = user32.LoadImageW(0, str(icon_path), IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
            applied: list[int] = []
            for target_hwnd in chrome_windows:
                user32.SendMessageW(target_hwnd, WM_SETICON, ICON_BIG, big_icon)
                user32.SendMessageW(target_hwnd, WM_SETICON, ICON_SMALL, small_icon)
                applied.append(int(target_hwnd))
            if applied:
                return applied
        except Exception as exc:
            logger.debug("ctypes _set_window_icons error: %s", exc)

    try:
        import win32con  # type: ignore[import-not-found]
        import win32gui  # type: ignore[import-not-found]
    except Exception:
        logger.debug("pywin32 is unavailable; skip browser icon badge", exc_info=True)
        return []
    big_icon = win32gui.LoadImage(
        0,
        str(icon_path),
        win32con.IMAGE_ICON,
        0,
        0,
        win32con.LR_LOADFROMFILE | win32con.LR_DEFAULTSIZE,
    )
    small_icon = win32gui.LoadImage(0, str(icon_path), win32con.IMAGE_ICON, 16, 16, win32con.LR_LOADFROMFILE)
    applied = []
    for target_hwnd in chrome_windows:
        win32gui.SendMessage(target_hwnd, win32con.WM_SETICON, win32con.ICON_BIG, big_icon)
        win32gui.SendMessage(target_hwnd, win32con.WM_SETICON, win32con.ICON_SMALL, small_icon)
        applied.append(int(target_hwnd))
    return applied


def make_badged_icon(exe_path: str | Path, number: int) -> Path | None:
    """Create or reuse a Chrome/Chromium icon with a red number badge."""
    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore[import-not-found]
    except Exception:
        logger.debug("Pillow is unavailable; skip browser icon badge", exc_info=True)
        return None

    try:
        badge_dir = app_path(".tmp", "window_number_icons")
        badge_dir.mkdir(parents=True, exist_ok=True)
        safe_number = max(1, min(int(number), 999))
        path = badge_dir / f"chrome_badge_{safe_number}.ico"
        if path.exists():
            return path

        base = _extract_icon_image(str(exe_path), 256).convert("RGBA")
        draw = ImageDraw.Draw(base)
        size = 256
        digits = len(str(safe_number))
        radius = int(size * (0.27 if digits <= 2 else 0.30))
        center_x = size - radius - int(size * 0.04)
        center_y = size - radius - int(size * 0.04)
        draw.ellipse(
            [center_x - radius - 4, center_y - radius - 4, center_x + radius + 4, center_y + radius + 4],
            fill=(255, 255, 255, 255),
        )
        draw.ellipse(
            [center_x - radius, center_y - radius, center_x + radius, center_y + radius],
            fill=(220, 38, 38, 255),
        )

        text = str(safe_number)
        font_size = int(radius * (1.35 if digits == 1 else 0.95 if digits == 2 else 0.70))
        font = _badge_font(font_size)
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        draw.text(
            (center_x - text_width / 2 - bbox[0], center_y - text_height / 2 - bbox[1]),
            text,
            font=font,
            fill=(255, 255, 255, 255),
        )

        sizes = [256, 128, 64, 48, 40, 32, 24, 20, 16]
        frames = [base if icon_size == 256 else base.resize((icon_size, icon_size), Image.LANCZOS) for icon_size in sizes]
        frames[0].save(path, format="ICO", sizes=[(icon_size, icon_size) for icon_size in sizes], append_images=frames[1:])
        return path
    except Exception:
        logger.debug("Cannot render browser icon badge", exc_info=True)
        return None


def _badge_font(size: int):
    from PIL import ImageFont  # type: ignore[import-not-found]

    for name in ("segoeuib.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _extract_icon_image(exe_path: str, size: int):
    try:
        import win32con  # type: ignore[import-not-found]
        import win32gui  # type: ignore[import-not-found]
        import win32ui  # type: ignore[import-not-found]
    except Exception as exc:
        raise RuntimeError("pywin32 is required to extract browser icon") from exc

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.PrivateExtractIconsW.restype = ctypes.c_uint
    user32.PrivateExtractIconsW.argtypes = [
        wintypes.LPCWSTR,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.POINTER(wintypes.HICON),
        ctypes.POINTER(wintypes.UINT),
        ctypes.c_uint,
        ctypes.c_uint,
    ]
    icons = (wintypes.HICON * 1)()
    ids = (wintypes.UINT * 1)()
    count = user32.PrivateExtractIconsW(exe_path, 0, size, size, icons, ids, 1, 0)
    if not count or not icons[0]:
        raise RuntimeError(f"No icon found in {exe_path}")
    hicon = icons[0]
    hdc_screen = win32gui.GetDC(0)
    try:
        hdc = win32ui.CreateDCFromHandle(hdc_screen)
        memdc = hdc.CreateCompatibleDC()
        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(hdc, size, size)
        memdc.SelectObject(bitmap)
        win32gui.DrawIconEx(memdc.GetSafeHdc(), 0, 0, hicon, size, size, 0, 0, win32con.DI_NORMAL)
        bits = bitmap.GetBitmapBits(True)
        from PIL import Image  # type: ignore[import-not-found]

        image = Image.frombuffer("RGBA", (size, size), bits, "raw", "BGRA", 0, 1).copy()
        win32gui.DeleteObject(bitmap.GetHandle())
        memdc.DeleteDC()
        hdc.DeleteDC()
        return image
    finally:
        win32gui.ReleaseDC(0, hdc_screen)
        win32gui.DestroyIcon(hicon)


def chrome_pids_by_user_data_dir() -> dict[str, list[int]]:
    """Return Chromium PIDs grouped by normalized user_data_dir in a single pass."""
    try:
        import psutil  # type: ignore[import-not-found]
    except Exception as exc:
        raise ChromiumProcessInspectionError("psutil is unavailable") from exc
    result: dict[str, list[int]] = {}
    try:
        processes = psutil.process_iter(["pid", "name", "cmdline", "status"])
        for proc in processes:
            try:
                name = (proc.info.get("name") or "").lower()
            except Exception:
                continue
            if "chrome" not in name and "chromium" not in name and "browsermulti" not in name:
                continue
            if proc.info.get("status") == getattr(psutil, "STATUS_ZOMBIE", "zombie"):
                continue
            try:
                cmdline = proc.info.get("cmdline") or []
                # Only root browser processes (not child renderer/gpu/crashpad processes) define whether the profile is truly running
                if any(arg.startswith("--type=") for arg in cmdline):
                    continue
                data_dir = _user_data_dir_from_cmdline(cmdline)
                if not data_dir:
                    continue
                try:
                    norm = os.path.normcase(os.path.abspath(data_dir))
                except Exception:
                    norm = os.path.normcase(data_dir)
                result.setdefault(norm, []).append(int(proc.info["pid"]))
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                continue
            except Exception:
                continue
    except Exception as exc:
        logger.debug("Cannot enumerate Chromium processes: %s", exc)
    return result


_PROCESS_CACHE: dict[str, list[int]] | None = None


@contextlib.contextmanager
def batch_chromium_process_cache():
    """Context manager to cache Chromium process scan across multiple checks."""
    global _PROCESS_CACHE
    token = _PROCESS_CACHE
    try:
        try:
            _PROCESS_CACHE = chrome_pids_by_user_data_dir()
        except Exception:
            _PROCESS_CACHE = None
        yield _PROCESS_CACHE
    finally:
        _PROCESS_CACHE = token


def chrome_pids_for_user_data_dir(user_data_dir: str) -> list[int]:
    """Return exact profile PIDs; raise when process state is unknown."""
    try:
        from core.paths import profile_data_dir
        resolved = profile_data_dir(user_data_dir)
        target = os.path.normcase(os.path.abspath(str(resolved)))
    except Exception:
        try:
            target = os.path.normcase(os.path.abspath(user_data_dir))
        except Exception:
            target = os.path.normcase(user_data_dir)

    target_base = os.path.basename(target)

    if _PROCESS_CACHE is not None:
        pids = _PROCESS_CACHE.get(target, [])
        if pids:
            return pids
        for k, v in _PROCESS_CACHE.items():
            if os.path.basename(k) == target_base:
                return v
        return []

    pids_map = chrome_pids_by_user_data_dir()
    pids = pids_map.get(target, [])
    if pids:
        return pids
    for k, v in pids_map.items():
        if os.path.basename(k) == target_base:
            return v
    return []




def exact_profile_process_snapshot(user_data_dir: str) -> list[dict[str, Any]]:
    """Capture exact-profile process topology without mutating any process."""
    target = os.path.normcase(os.path.abspath(user_data_dir))
    rows: list[dict[str, Any]] = []
    try:
        import psutil  # type: ignore[import-not-found]
        for proc in psutil.process_iter(["pid", "ppid", "name", "cmdline", "status"]):
            try:
                name = str(proc.info.get("name") or "").lower()
                if "chrome" not in name and "chromium" not in name:
                    continue
                cmdline = list(proc.info.get("cmdline") or [])
                data_dir = _user_data_dir_from_cmdline(cmdline)
                if not data_dir or os.path.normcase(os.path.abspath(data_dir)) != target:
                    continue
                try:
                    status = str(proc.status())
                except Exception:
                    status = str(proc.info.get("status") or "unknown")
                rows.append({
                    "pid": int(proc.pid),
                    "parent_pid": int(proc.info.get("ppid") or 0),
                    "name": name,
                    "role": next((arg.split("=", 1)[1] for arg in cmdline if arg.startswith("--type=")), "browser"),
                    "alive": bool(proc.is_running()) and status.lower() != "zombie",
                    "status": status,
                    "executable": str(cmdline[0] if cmdline else name),
                    "cmdline": cmdline,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
                continue
    except Exception as exc:
        raise ChromiumProcessInspectionError("Cannot snapshot exact-profile process topology") from exc
    return rows


def chromium_process_for_pid(pid: int, user_data_dir: str) -> bool:
    """Return whether PID is a live Chromium browser process for this profile."""
    try:
        import psutil  # type: ignore[import-not-found]
    except Exception as exc:
        raise ChromiumProcessInspectionError("psutil is unavailable") from exc
    try:
        process = psutil.Process(int(pid))
        if not process.is_running() or process.status() == getattr(psutil, "STATUS_ZOMBIE", "zombie"):
            return False
        name = process.name().lower()
        if "chrome" not in name and "chromium" not in name:
            return False
        cmdline = process.cmdline()
        data_dir = _user_data_dir_from_cmdline(cmdline)
        if not data_dir or os.path.normcase(os.path.abspath(data_dir)) != os.path.normcase(os.path.abspath(user_data_dir)):
            return False
        if any(arg.startswith("--type=") for arg in cmdline):
            return False
        executable = Path(str(cmdline[0] if cmdline else process.name())).name.lower()
        if "chrome" not in executable and "chromium" not in executable:
            return False
        return not any(arg.startswith("--type=") for arg in cmdline)
    except psutil.NoSuchProcess:
        return False
    except (psutil.AccessDenied, OSError) as exc:
        raise ChromiumProcessInspectionError("Cannot validate the saved Chromium PID") from exc
    except Exception as exc:
        raise ChromiumProcessInspectionError("Cannot validate the saved Chromium PID") from exc


def chromium_root_pid_for_user_data_dir(user_data_dir: str) -> int:
    """Return the exact-profile Chromium browser-process PID, failing closed if ambiguous."""
    try:
        import psutil  # type: ignore[import-not-found]
    except Exception as exc:
        raise ChromiumProcessInspectionError("psutil is unavailable") from exc
    target = os.path.normcase(os.path.abspath(user_data_dir))
    matches: list[int] = []
    try:
        for proc in psutil.process_iter(["pid", "name", "cmdline", "status"]):
            try:
                name = str(proc.info.get("name") or "").lower()
                if "chrome" not in name and "chromium" not in name:
                    continue
                if proc.info.get("status") == getattr(psutil, "STATUS_ZOMBIE", "zombie"):
                    continue
                cmdline = proc.info.get("cmdline") or []
                data_dir = _user_data_dir_from_cmdline(cmdline)
                if not data_dir or os.path.normcase(os.path.abspath(data_dir)) != target:
                    continue
                if any(arg.startswith("--type=") for arg in cmdline):
                    continue
                matches.append(int(proc.info["pid"]))
            except psutil.NoSuchProcess:
                continue
            except (psutil.AccessDenied, OSError) as exc:
                raise ChromiumProcessInspectionError("Cannot inspect a Chromium process command line") from exc
        if len(matches) != 1:
            raise ChromiumProcessInspectionError(
                f"Expected one Chromium browser process for profile, found {len(matches)}"
            )
        return matches[0]
    except ChromiumProcessInspectionError:
        raise
    except Exception as exc:
        raise ChromiumProcessInspectionError("Cannot enumerate Chromium browser processes") from exc


def _chrome_pids_for_user_data_dir(user_data_dir: str) -> list[int]:
    """Backward-compatible private alias."""
    return chrome_pids_for_user_data_dir(user_data_dir)


def _user_data_dir_from_cmdline(cmdline: list[str]) -> str | None:
    for arg in cmdline:
        if arg.startswith("--user-data-dir="):
            return arg.split("=", 1)[1].strip().strip('"')
    return None


def _chrome_windows_for_pid(pid: int) -> list[int]:
    """Find Chromium top-level windows for a PID using ctypes (works without pywin32) with fallback."""
    if hasattr(ctypes, "windll"):
        try:
            user32 = ctypes.windll.user32
            windows: list[int] = []
            seen: set[int] = set()
            enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

            def enum_proc(hwnd: int, _lparam: int) -> bool:
                if hwnd in seen:
                    return True
                if not user32.IsWindowVisible(hwnd):
                    return True
                buf = ctypes.create_unicode_buffer(256)
                user32.GetClassNameW(hwnd, buf, 256)
                if buf.value != "Chrome_WidgetWin_1":
                    return True
                proc_id = wintypes.DWORD()
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(proc_id))
                if proc_id.value == int(pid):
                    seen.add(hwnd)
                    windows.append(int(hwnd))
                return True

            cb = enum_proc_type(enum_proc)
            user32.EnumWindows(cb, 0)

            # Also check OpenInputDesktop / Default desktop
            try:
                access = 0x0040 | 0x0001  # DESKTOP_ENUMERATE | DESKTOP_READOBJECTS
                hdesk = user32.OpenInputDesktop(0, False, access)
                if not hdesk:
                    hdesk = user32.OpenDesktopW("Default", 0, False, access)
                if hdesk:
                    user32.EnumDesktopWindows(hdesk, cb, 0)
                    user32.CloseDesktop(hdesk)
            except Exception:
                pass

            return windows
        except Exception as exc:
            logger.debug("ctypes window enum failed: %s", exc)

    try:
        import win32gui  # type: ignore[import-not-found]
        import win32process  # type: ignore[import-not-found]
    except Exception:
        return []

    windows = []

    def callback(hwnd: int, _extra: Any) -> bool:
        if not win32gui.IsWindowVisible(hwnd):
            return True
        if win32gui.GetClassName(hwnd) != "Chrome_WidgetWin_1":
            return True
        _thread_id, window_pid = win32process.GetWindowThreadProcessId(hwnd)
        if int(window_pid) == int(pid):
            windows.append(int(hwnd))
        return True

    win32gui.EnumWindows(callback, None)
    return windows


def restore_browser_windows_for_user_data_dir(user_data_dir: Any) -> list[int]:
    """Restore minimized Chrome windows belonging to one exact profile."""
    if os.name != "nt":
        return []
    try:
        pids = chrome_pids_for_user_data_dir(str(user_data_dir))
    except ChromiumProcessInspectionError:
        return []

    restored: list[int] = []

    if hasattr(ctypes, "windll"):
        user32 = ctypes.windll.user32
        SW_SHOWNOACTIVATE = 4
        for pid in pids:
            for hwnd in _chrome_windows_for_pid(pid):
                try:
                    if user32.IsIconic(hwnd):
                        user32.ShowWindow(hwnd, SW_SHOWNOACTIVATE)
                        restored.append(int(hwnd))
                except Exception:
                    logger.debug("Cannot restore Chromium window %s", hwnd, exc_info=True)
        return restored

    try:
        import win32con  # type: ignore[import-not-found]
        import win32gui  # type: ignore[import-not-found]
        for pid in pids:
            for hwnd in _chrome_windows_for_pid(pid):
                try:
                    if win32gui.IsIconic(hwnd):
                        win32gui.ShowWindow(hwnd, win32con.SW_SHOWNOACTIVATE)
                        restored.append(int(hwnd))
                except Exception:
                    logger.debug("Cannot restore Chromium window %s", hwnd, exc_info=True)
    except Exception:
        pass
    return restored



def _process_exe_path(pid: int) -> str | None:

    try:
        import psutil  # type: ignore[import-not-found]

        return psutil.Process(int(pid)).exe()
    except Exception:
        logger.debug("Cannot resolve browser exe path for icon badge", exc_info=True)
        return None
