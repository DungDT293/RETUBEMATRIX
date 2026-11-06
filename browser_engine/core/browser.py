import asyncio
import ctypes
import importlib.util
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast
from urllib.parse import urlsplit, urlunsplit

import psutil

from core.engines import BrowserLaunchSpec, get_browser_engine
from cloakbrowser import launch_persistent_context_async as launch_persistent_context  # type: ignore[import-untyped]
from cloakbrowser.human.actionability import ElementNotStableError  # type: ignore[import-untyped]
from core.paths import profile_data_dir, profile_data_path
from core.profile_store import validate_display_profile_name, validate_profile_name
from core.host_capabilities import host_capabilities
from core.proxy_format import playwright_proxy_config, proxy_launch_compatibility, proxy_requires_bridge
from core.proxy_bridge import Socks5HttpBridge
from core.browser_policy import (
    CLOAKBROWSER_BROWSER_VERSION,
    configure_bundled_cache,
    normalize_profile_locale,
    normalize_profile_timezone,
)
from core.window_icon_badge import (
    ChromiumProcessInspectionError,
    apply_browser_icon_badge_for_user_data_dir,
    chromium_process_for_pid,
    chromium_root_pid_for_user_data_dir,
    chrome_pids_for_user_data_dir,
    exact_profile_process_snapshot,
    profile_badge_number,
)
from core.window_title_overlay import WindowTitleOverlay
from core.overlay_state import set_overlay_entry, remove_overlay_entry

logger = logging.getLogger(__name__)
_SESSION_PID_FILENAME = "browsermulti_session.pid"
_PROFILE_LOCK_FILENAMES = ("lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket")


def _remove_profile_runtime_markers(user_data_dir: Path) -> None:
    for filename in (_SESSION_PID_FILENAME, *_PROFILE_LOCK_FILENAMES):
        path = user_data_dir / filename
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            raise RuntimeError(
                f"Không thể xóa lock stale {filename}; không mở trình duyệt để bảo vệ dữ liệu hồ sơ."
            ) from exc


def _write_session_pid(user_data_dir: Path, pid: int) -> None:
    marker = user_data_dir / _SESSION_PID_FILENAME
    temporary = marker.with_name(f"{marker.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(f"{int(pid)}\n", encoding="ascii")
        temporary.replace(marker)
    except OSError as exc:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove temporary session PID marker", exc_info=True)
        raise RuntimeError("Không thể ghi session PID của Chromium; đóng trình duyệt để tránh phiên không được quản lý.") from exc


def _remove_owned_session_pid(user_data_dir: Path, pid: int | None) -> None:
    if pid is None:
        return
    marker = user_data_dir / _SESSION_PID_FILENAME
    try:
        if marker.read_text(encoding="ascii").strip() != str(int(pid)):
            return
        if chromium_process_for_pid(pid, str(user_data_dir)):
            logger.warning("Keeping session PID marker because Chromium PID %d is still live", pid)
            return
        marker.unlink(missing_ok=True)
    except ChromiumProcessInspectionError:
        logger.warning("Keeping session PID marker because Chromium state is unknown", exc_info=True)
    except FileNotFoundError:
        return
    except OSError:
        logger.warning("Could not remove session PID marker for profile %s", user_data_dir.name, exc_info=True)


def wait_for_profile_processes_exit(user_data_dir: Path, timeout: float = 10.0) -> list[int] | None:
    """Wait for exact-profile Chromium processes; None means inspection stayed unknown."""
    deadline = time.monotonic() + max(0.0, float(timeout))
    remaining: list[int] = []
    while True:
        try:
            remaining = chrome_pids_for_user_data_dir(str(user_data_dir))
        except ChromiumProcessInspectionError:
            if time.monotonic() >= deadline:
                return None
            time.sleep(0.1)
            continue
        if not remaining:
            return []
        if time.monotonic() >= deadline:
            return remaining
        time.sleep(0.1)


def _windows_commit_percent() -> float:
    if os.name != "nt":
        return 0.0
    class _MemoryStatusEx(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_ulong),
            ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]
    try:
        status = _MemoryStatusEx()
        status.dwLength = ctypes.sizeof(status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)) or not status.ullTotalPageFile:
            return 0.0
        return round((1 - (status.ullAvailPageFile / status.ullTotalPageFile)) * 100, 2)
    except Exception:
        return 0.0


def _log_resource_snapshot(
    phase: str,
    profile_name: str = "",
    user_data_dir: Path | None = None,
    *,
    capture_processes: bool = False,
) -> dict[str, Any]:
    """Log host memory; capture exact profile process RSS only when requested."""
    try:
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        pids = chrome_pids_for_user_data_dir(str(user_data_dir)) if capture_processes and user_data_dir else []
    except Exception:
        memory = None
        swap = None
        pids = []
    rss_bytes = 0
    for pid in pids:
        try:
            rss_bytes += int(psutil.Process(int(pid)).memory_info().rss)
        except (psutil.Error, OSError, ValueError):
            continue
    snapshot = {
        "phase": phase,
        "profile": profile_name,
        "total_ram_bytes": int(memory.total) if memory else 0,
        "available_ram_bytes": int(memory.available) if memory else 0,
        "memory_percent": float(memory.percent) if memory else 0.0,
        "committed_percent": _windows_commit_percent(),
        "swap_percent": float(swap.percent) if swap else 0.0,
        "profile_pid_count": len(pids),
        "profile_rss_bytes": rss_bytes,
        "profile_rss_mb": round(rss_bytes / (1024 * 1024), 2),
        "profile_pids": pids,
    }
    logger.info(
        "Browser resources | phase=%s | profile=%s | total_ram_gib=%.2f | available_ram_gib=%.2f | memory_percent=%.2f | committed_percent=%.2f | swap_percent=%.2f | profile_pid_count=%d | profile_rss_mb=%.2f | pids=%s",
        phase,
        profile_name,
        snapshot["total_ram_bytes"] / (1024 ** 3),
        snapshot["available_ram_bytes"] / (1024 ** 3),
        snapshot["memory_percent"],
        snapshot["committed_percent"],
        snapshot["swap_percent"],
        snapshot["profile_pid_count"],
        snapshot["profile_rss_mb"],
        pids,
    )
    return snapshot


PROFILES_DIR = profile_data_path("profiles")
GOOGLE_HOME_URL = "https://www.google.com/"
GOOGLE_SEARCH_URL = "https://www.google.com/search?q={searchTerms}"
GOOGLE_SUGGEST_URL = "https://www.google.com/complete/search?client=chrome&q={searchTerms}"
GOOGLE_NEW_TAB_EXTENSION_DIR = Path(__file__).resolve().parent / "chrome_extensions" / "google_new_tab"

# scale factor áp dụng cho tất cả browser launch trong phiên này
# 1.0 = full size, 0.5 = nội dung thu nhỏ 50% vừa cửa sổ nhỏ
WINDOW_SCALE_FACTOR: float = 1.0



def _strip_human_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in kwargs.items() if key != "human_config"}


def _is_native_viewport_error(exc: Exception) -> bool:
    return isinstance(exc, ElementNotStableError) or "Viewport size not available" in str(exc)


def _install_native_viewport_human_fallback(page: Any) -> None:
    """Keep native Chromium viewport while bypassing cloakbrowser viewport-only paths.

    cloakbrowser humanizes Locator.click()/fill()/type() by forwarding to
    page.click()/fill()/type(), then its scroll helper reads page.viewport_size.
    With launch viewport=None, Playwright correctly reports viewport_size=None,
    so those humanized paths can raise "Viewport size not available". The app
    intentionally uses viewport=None to let YouTube Studio resize with the real
    window, so only fallback the failing humanized method to the original
    Playwright method instead of restoring a fixed viewport.
    """
    if getattr(page, "_browsermulti_native_viewport_fallback", False):
        return
    originals = getattr(page, "_original", None)
    if originals is None:
        return

    async def _fallback_call(method_name: str, current_method: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return await current_method(*args, **kwargs)
        except Exception as exc:
            if not _is_native_viewport_error(exc):
                raise
            native_method = getattr(originals, method_name, None)
            if native_method is None:
                raise
            logger.debug(
                "cloakbrowser human %s needs Playwright viewport; using native fallback for viewport=None",
                method_name,
            )
            return await native_method(*args, **_strip_human_kwargs(kwargs))

    human_click = page.click
    human_dblclick = page.dblclick
    human_hover = page.hover
    human_fill = page.fill
    human_type = page.type

    async def _click(*args: Any, **kwargs: Any) -> Any:
        return await _fallback_call("click", human_click, *args, **kwargs)

    async def _dblclick(*args: Any, **kwargs: Any) -> Any:
        return await _fallback_call("dblclick", human_dblclick, *args, **kwargs)

    async def _hover(*args: Any, **kwargs: Any) -> Any:
        return await _fallback_call("hover", human_hover, *args, **kwargs)

    async def _fill(*args: Any, **kwargs: Any) -> Any:
        return await _fallback_call("fill", human_fill, *args, **kwargs)

    async def _type(*args: Any, **kwargs: Any) -> Any:
        return await _fallback_call("type", human_type, *args, **kwargs)

    page.click = _click
    page.dblclick = _dblclick
    page.hover = _hover
    page.fill = _fill
    page.type = _type
    page._browsermulti_native_viewport_fallback = True

_WINDOW_STATE_FILE = "window_state.json"
_MIN_WINDOW_WIDTH = 320
_MIN_WINDOW_HEIGHT = 300
_MAX_WINDOW_WIDTH = 3840
_MAX_WINDOW_HEIGHT = 2160


def _has_geoip_support() -> bool:
    return importlib.util.find_spec("geoip2") is not None


def _google_search_provider_preferences() -> dict[str, Any]:
    return {
        "enabled": True,
        "name": "Google",
        "keyword": "google.com",
        "search_url": GOOGLE_SEARCH_URL,
        "suggest_url": GOOGLE_SUGGEST_URL,
        "favicon_url": "https://www.google.com/favicon.ico",
        "encoding": "UTF-8",
        "alternate_urls": [
            "https://www.google.com/search?q={searchTerms}",
            "https://www.google.com/#q={searchTerms}",
        ],
    }


def _ensure_browsermulti_startup_preferences(user_data_dir: Path) -> bool:
    """Deep-merge Google startup preferences before Chromium launch."""
    default_dir = user_data_dir / "Default"
    preferences_path = default_dir / "Preferences"
    temporary_path = preferences_path.with_suffix(".tmp")
    try:
        default_dir.mkdir(parents=True, exist_ok=True)
        try:
            preferences = json.loads(preferences_path.read_text(encoding="utf-8")) if preferences_path.exists() else {}
        except (OSError, UnicodeError, json.JSONDecodeError):
            preferences = {}
        if not isinstance(preferences, dict):
            preferences = {}
        session = preferences.setdefault("session", {})
        if not isinstance(session, dict):
            session = {}
            preferences["session"] = session
        session["restore_on_startup"] = 4
        session["startup_urls"] = [GOOGLE_HOME_URL]
        preferences["homepage"] = GOOGLE_HOME_URL
        preferences["homepage_is_newtabpage"] = False
        payload = json.dumps(preferences, ensure_ascii=False, separators=(",", ":"))
        for attempt, delay in enumerate((0.05, 0.1, 0.2), start=1):
            try:
                temporary_path.write_text(payload, encoding="utf-8")
                os.replace(temporary_path, preferences_path)
                return True
            except (PermissionError, FileNotFoundError) as exc:
                if attempt == 3:
                    raise
                logger.debug("Preferences replace retry %d: %s", attempt, exc)
                time.sleep(delay)
            finally:
                try:
                    temporary_path.unlink(missing_ok=True)
                except OSError:
                    pass
    except Exception as exc:
        logger.warning("Cannot write BrowserMulti startup Preferences: %s", exc)
        return False


def ensure_google_search_provider(user_data_dir: Path) -> bool:
    """Ensure Chromium omnibox searches Google instead of treating words as URLs."""
    default_dir = user_data_dir / "Default"
    preferences_path = default_dir / "Preferences"
    try:
        default_dir.mkdir(parents=True, exist_ok=True)
        if preferences_path.exists():
            try:
                preferences = json.loads(preferences_path.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.warning("Cannot read Chrome Preferences for Google search provider: %s", exc)
                preferences = {}
        else:
            preferences = {}

        if not isinstance(preferences, dict):
            preferences = {}

        preferences["default_search_provider"] = _google_search_provider_preferences()
        preferences["homepage"] = GOOGLE_HOME_URL
        preferences["homepage_is_newtabpage"] = False
        browser_preferences = preferences.setdefault("browser", {})
        if isinstance(browser_preferences, dict):
            browser_preferences["show_home_button"] = True

        preferences_path.write_text(
            json.dumps(preferences, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        return True
    except Exception as exc:
        logger.warning("Cannot write Google search provider Preferences: %s", exc)
        return False

_STEALTH_SCRIPT = """
(function() {
    // CloakBrowser owns fingerprint values derived from --fingerprint=<seed>.
    // Do not overwrite locale, WebGL, or canvas here: fixed values break seed consistency.
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};

    Object.defineProperty(navigator, 'plugins', {
        get: () => {
            const arr = [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
            ];
            arr.item = (i) => arr[i];
            arr.namedItem = (n) => arr.find(p => p.name === n) || null;
            arr.refresh = () => {};
            return arr;
        }
    });

    const _query = window.Permissions && window.Permissions.prototype.query;
    if (_query) {
        window.Permissions.prototype.query = function(parameters) {
            if (parameters.name === 'notifications') {
                return Promise.resolve({ state: Notification.permission, onchange: null });
            }
            return _query.call(this, parameters);
        };
    }

    delete window.__playwright;
    delete window.__pwInitScripts;
    delete window.__pw_manual;
})();
"""

_CURSOR_SCRIPT = """
(function() {
    let cursor = null;

    function ensureCursor() {
        if (cursor && document.body && document.body.contains(cursor)) return;
        cursor = document.createElement('div');
        cursor.id = '__pw_cursor__';
        cursor.style.cssText = [
            'position:fixed',
            'z-index:2147483647',
            'pointer-events:none',
            'width:16px',
            'height:16px',
            'border-radius:50%',
            'background:rgba(220,30,30,0.85)',
            'border:2px solid #fff',
            'box-shadow:0 0 6px 2px rgba(220,30,30,0.5)',
            'transform:translate(-50%,-50%)',
            'transition:background 0.08s,transform 0.08s,box-shadow 0.08s',
            'left:0',
            'top:0',
        ].join(';');
        (document.body || document.documentElement).appendChild(cursor);
    }

    // phát hiện element dưới con trỏ có phải clickable/input không
    function getElementType(e) {
        let el = document.elementFromPoint(e.clientX, e.clientY);
        while (el && el !== document.body) {
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            const role = (el.getAttribute('role') || '').toLowerCase();
            const cursor_css = window.getComputedStyle(el).cursor;
            // input / textarea / contenteditable
            if (tag === 'input' || tag === 'textarea' || tag === 'select'
                || el.getAttribute('contenteditable') === 'true'
                || el.getAttribute('contenteditable') === '') {
                return 'input';
            }
            // link hoặc button hoặc cursor:pointer
            if (tag === 'a' || tag === 'button'
                || role === 'button' || role === 'link' || role === 'menuitem'
                || role === 'tab' || role === 'option'
                || cursor_css === 'pointer') {
                return 'clickable';
            }
            el = el.parentElement;
        }
        return 'normal';
    }

    window.addEventListener('mousemove', function(e) {
        ensureCursor();
        cursor.style.left = e.clientX + 'px';
        cursor.style.top  = e.clientY + 'px';

        const type = getElementType(e);
        if (type === 'input') {
            // tím — đang hover ô nhập liệu
            cursor.style.background  = 'rgba(160,80,220,0.9)';
            cursor.style.boxShadow   = '0 0 8px 3px rgba(160,80,220,0.6)';
            cursor.style.transform   = 'translate(-50%,-50%) scale(1.15)';
        } else if (type === 'clickable') {
            // cam — đang hover link/button
            cursor.style.background  = 'rgba(255,140,0,0.92)';
            cursor.style.boxShadow   = '0 0 8px 3px rgba(255,140,0,0.6)';
            cursor.style.transform   = 'translate(-50%,-50%) scale(1.1)';
        } else {
            // đỏ — di chuyển bình thường
            cursor.style.background  = 'rgba(220,30,30,0.85)';
            cursor.style.boxShadow   = '0 0 6px 2px rgba(220,30,30,0.5)';
            cursor.style.transform   = 'translate(-50%,-50%) scale(1)';
        }
    }, true);

    window.addEventListener('mousedown', function() {
        ensureCursor();
        // xanh lá — đang click
        cursor.style.background = 'rgba(30,190,30,0.95)';
        cursor.style.boxShadow  = '0 0 10px 4px rgba(30,190,30,0.7)';
        cursor.style.transform  = 'translate(-50%,-50%) scale(0.65)';
    }, true);

    window.addEventListener('mouseup', function(e) {
        ensureCursor();
        // khôi phục màu theo loại element sau khi thả chuột
        const type = getElementType(e);
        if (type === 'input') {
            cursor.style.background = 'rgba(160,80,220,0.9)';
            cursor.style.boxShadow  = '0 0 8px 3px rgba(160,80,220,0.6)';
            cursor.style.transform  = 'translate(-50%,-50%) scale(1.15)';
        } else if (type === 'clickable') {
            cursor.style.background = 'rgba(255,140,0,0.92)';
            cursor.style.boxShadow  = '0 0 8px 3px rgba(255,140,0,0.6)';
            cursor.style.transform  = 'translate(-50%,-50%) scale(1.1)';
        } else {
            cursor.style.background = 'rgba(220,30,30,0.85)';
            cursor.style.boxShadow  = '0 0 6px 2px rgba(220,30,30,0.5)';
            cursor.style.transform  = 'translate(-50%,-50%) scale(1)';
        }
    }, true);
})();
"""


_TAB_CLOSE_GUARD_SCRIPT = """
(() => {
    const isYouTubeStudio = () => {
        try {
            return location.hostname === 'studio.youtube.com' || location.hostname.endsWith('.studio.youtube.com');
        } catch (_) {
            return false;
        }
    };
    window.addEventListener('beforeunload', function(event) {
        if (!isYouTubeStudio()) return;
        try {
            event.stopImmediatePropagation();
            event.preventDefault = function() {};
            delete event.returnValue;
        } catch (_) {}
    }, true);
})();
"""


def _allow_chrome_extensions_in_cloakbrowser() -> None:
    try:
        from cloakbrowser import browser as cloak_browser
    except Exception as exc:
        logger.debug("Cannot access cloakbrowser default args to allow extensions: %s", exc)
        return

    ignored_args = getattr(cloak_browser, "IGNORE_DEFAULT_ARGS", None)
    if isinstance(ignored_args, list) and "--disable-extensions" not in ignored_args:
        ignored_args.append("--disable-extensions")


def _chrome_extension_args() -> list[str]:
    if not GOOGLE_NEW_TAB_EXTENSION_DIR.exists():
        logger.warning("Google new-tab extension directory is missing: %s", GOOGLE_NEW_TAB_EXTENSION_DIR)
        return []
    _allow_chrome_extensions_in_cloakbrowser()
    extension_path = str(GOOGLE_NEW_TAB_EXTENSION_DIR)
    return [
        f"--disable-extensions-except={extension_path}",
        f"--load-extension={extension_path}",
    ]



def _get_default_window_bounds() -> tuple[int, int, int, int]:
    """Return x, y, width, height for first profile open: fill visible work area."""
    try:
        class RECT(ctypes.Structure):
            _fields_ = [
                ("left", ctypes.c_long),
                ("top", ctypes.c_long),
                ("right", ctypes.c_long),
                ("bottom", ctypes.c_long),
            ]

        rect = RECT()
        spi_get_work_area = 0x0030
        if ctypes.windll.user32.SystemParametersInfoW(spi_get_work_area, 0, ctypes.byref(rect), 0):
            width = max(_MIN_WINDOW_WIDTH, int(rect.right - rect.left))
            height = max(_MIN_WINDOW_HEIGHT, int(rect.bottom - rect.top))
            return int(rect.left), int(rect.top), width, height
    except Exception:
        pass
    try:
        user32 = ctypes.windll.user32
        width = max(_MIN_WINDOW_WIDTH, int(user32.GetSystemMetrics(0)))
        height = max(_MIN_WINDOW_HEIGHT, int(user32.GetSystemMetrics(1)))
        return 0, 0, width, height
    except Exception:
        return 0, 0, 1280, 720

def _valid_window_size(width: Any, height: Any) -> tuple[int, int] | None:
    if isinstance(width, bool) or isinstance(height, bool):
        return None
    try:
        w = int(width)
        h = int(height)
    except Exception:
        return None
    if not (_MIN_WINDOW_WIDTH <= w <= _MAX_WINDOW_WIDTH):
        return None
    if not (_MIN_WINDOW_HEIGHT <= h <= _MAX_WINDOW_HEIGHT):
        return None
    return w, h


def _get_saved_window_size(profile_dir: Path) -> tuple[int, int] | None:
    state_file = profile_dir / _WINDOW_STATE_FILE
    if not state_file.exists():
        return None
    try:
        data = json.loads(state_file.read_text(encoding="utf-8"))
    except Exception:
        return None
    return _valid_window_size(data.get("width"), data.get("height")) if isinstance(data, dict) else None


def _save_window_size(profile_dir: Path | None, width: Any, height: Any) -> bool:
    if profile_dir is None:
        return False
    size = _valid_window_size(width, height)
    if size is None:
        return False
    try:
        profile_dir.mkdir(parents=True, exist_ok=True)
        (profile_dir / _WINDOW_STATE_FILE).write_text(
            json.dumps({"width": size[0], "height": size[1]}, ensure_ascii=False),
            encoding="utf-8",
        )
        return True
    except Exception:
        return False


def _valid_window_coordinate(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if -32768 <= value <= 32767 else None


def _chromium_window_placement(profile_dir: Path) -> dict[str, int | bool] | None:
    """Read Chromium's own saved placement for one persistent profile."""
    preferences_path = profile_dir / "Default" / "Preferences"
    if not preferences_path.exists():
        return None
    try:
        data = json.loads(preferences_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    browser = data.get("browser")
    placement = browser.get("window_placement") if isinstance(browser, dict) else None
    if not isinstance(placement, dict):
        return None
    coordinates = [_valid_window_coordinate(placement.get(key)) for key in ("left", "top", "right", "bottom")]
    if any(value is None for value in coordinates):
        return None
    left, top, right, bottom = cast(tuple[int, int, int, int], tuple(coordinates))
    size = _valid_window_size(right - left, bottom - top)
    if size is None:
        return None
    return {
        "x": left,
        "y": top,
        "width": size[0],
        "height": size[1],
        "maximized": placement.get("maximized") is True,
    }


def _normalize_fingerprint_seed(seed: Any, profile_name: str) -> int:
    if seed not in (None, ""):
        try:
            value = int(seed)
            if 0 <= value <= 0xFFFFFFFF:
                return value
        except Exception:
            pass
    from core.profile_store import normalize_fingerprint_seed

    return normalize_fingerprint_seed("", profile_name)


def _profile_launch_options(profile_data: dict[str, Any] | None) -> dict[str, str]:
    profile = profile_data or {}
    locale = normalize_profile_locale(
        profile.get("fingerprint_language") or profile.get("locale")
    )
    timezone = normalize_profile_timezone(profile.get("fingerprint_timezone"))
    options: dict[str, str] = {}
    if locale:
        options["locale"] = locale
    if timezone:
        options["timezone"] = timezone
    return options


class CloakSession:
    def __init__(self):
        self.context = None
        self.page = None
        self.profile_dir: Path | None = None
        self.profile_name = ""
        self.engine_id = "cloakbrowser"
        self._last_saved_window_size: tuple[int, int] | None = None
        self._title_overlay: WindowTitleOverlay | None = None
        self._profile_audio_sync_task: asyncio.Task[None] | None = None
        self._cosmetic_task: asyncio.Task[None] | None = None
        self._proxy_bridge: Socks5HttpBridge | None = None
        self._session_pid: int | None = None
        self._launch_args: list[str] = []
        self.page_crashed = False
        self.crash_event_detected = False
        self.crash_event: asyncio.Event = asyncio.Event()
        self.crash_url = ""
        self.last_crash_snapshot: dict[str, Any] | None = None
        self._launch_args: list[str] = []
        self._close_task: asyncio.Task[None] | None = None

    def _process_executable_path(self) -> str:
        if self._session_pid is None:
            return "unknown"
        try:
            return str(psutil.Process(int(self._session_pid)).exe())
        except Exception:
            return "unknown"

    def _process_executable_path(self) -> str:
        if self._session_pid is None:
            return "unknown"
        try:
            return str(psutil.Process(int(self._session_pid)).exe())
        except Exception:
            return "unknown"

    def _capture_crash_snapshot(self, page: Any) -> None:
        """Capture first crash evidence before Chromium releases its processes."""
        self.page_crashed = True
        self.crash_event_detected = True
        self.crash_event.set()
        if self.last_crash_snapshot is not None:
            return
        try:
            raw_crash_url = str(getattr(page, "url", "") or "")
            parsed_url = urlsplit(raw_crash_url)
            if parsed_url.scheme.lower() in {"http", "https"} and parsed_url.hostname:
                host = parsed_url.hostname
                if ":" in host and not host.startswith("["):
                    host = f"[{host}]"
                port = parsed_url.port
                netloc = host if port is None else f"{host}:{port}"
                crash_url = urlunsplit((parsed_url.scheme.lower(), netloc, parsed_url.path or "/", "", ""))[:500]
            else:
                crash_url = ""
        except Exception:
            crash_url = ""
        self.crash_url = crash_url
        try:
            memory = psutil.virtual_memory()
            available_ram = int(memory.available)
            committed_percent = _windows_commit_percent()
        except Exception:
            available_ram = 0
            committed_percent = 0.0
        processes: list[dict[str, Any]] = []
        try:
            pids = chrome_pids_for_user_data_dir(str(self.profile_dir)) if self.profile_dir else []
            for pid in pids:
                try:
                    process = psutil.Process(int(pid))
                    info = process.memory_info()
                    processes.append({
                        "pid": int(pid),
                        "name": str(process.name() or ""),
                        "working_set_size": int(getattr(info, "rss", 0)),
                        "rss_bytes": int(getattr(info, "rss", 0)),
                        "rss_mb": round(int(getattr(info, "rss", 0)) / (1024 * 1024), 2),
                    })
                except (psutil.Error, OSError, ValueError):
                    continue
        except Exception:
            processes = []
        try:
            topology = exact_profile_process_snapshot(str(self.profile_dir)) if self.profile_dir else []
        except Exception:
            topology = []
        self.last_crash_snapshot = {
            "crash_timestamp": datetime.now(timezone.utc).isoformat(timespec="microseconds"),
            "crash_url": crash_url,
            "available_ram_at_crash": available_ram,
            "committed_ram_percent": committed_percent,
            "browser_pid": self._session_pid,
            "browser_alive": any(item.get("pid") == self._session_pid and item.get("alive") for item in topology),
            "process_topology": topology,
            "renderer_pids_snapshot": processes,
        }
        _log_resource_snapshot("crash", self.profile_name, self.profile_dir, capture_processes=True)
        logger.warning(
            "Renderer crash snapshot captured | profile=%s | profile_dir=%s | url=%s | executable=%s | browser_pid=%s | renderer_pids=%s | process_count=%d | available_ram=%d | committed_percent=%.2f | launch_args=%s",
            self.profile_name,
            self.profile_dir,
            crash_url,
            self._process_executable_path(),
            self._session_pid or "unknown",
            [item["pid"] for item in processes],
            len(processes),
            available_ram,
            committed_percent,
            getattr(self, "_launch_args", []),
        )

    def _attach_crash_watcher(self, page: Any) -> None:
        if getattr(page, "_browsermulti_crash_watcher", False):
            return
        try:
            page.on("crash", self._capture_crash_snapshot)
            page._browsermulti_crash_watcher = True
        except Exception:
            logger.debug("Could not attach renderer crash watcher", exc_info=True)

    async def set_runtime_muted(self, muted: bool) -> dict[str, Any]:
        """Change only Windows audio sessions belonging to this profile."""
        from core.profile_audio import set_profile_muted

        return await asyncio.to_thread(set_profile_muted, self.profile_dir, bool(muted))

    async def sync_runtime_audio(self, muted: bool, retries: int = 0) -> dict[str, Any]:
        """Apply audio state now; muted sessions retry briefly for late renderers."""
        task = self._profile_audio_sync_task
        if task is not None:
            task.cancel()
            self._profile_audio_sync_task = None

        result = await self.set_runtime_muted(muted)
        if not muted or retries <= 0 or self.context is None:
            return result

        async def _retry() -> None:
            for _ in range(retries):
                await asyncio.sleep(1)
                if self.context is None:
                    return
                try:
                    await self.set_runtime_muted(True)
                except Exception:
                    logger.debug("Không đồng bộ lại âm thanh profile %s", self.profile_name, exc_info=True)

        self._profile_audio_sync_task = asyncio.create_task(_retry())
        return result

    async def _capture_current_window_size(self) -> tuple[int, int] | None:
        page = self.page
        if page is None or getattr(page, "is_closed", lambda: True)():
            return None
        try:
            data = await page.evaluate(
                """
                () => ({
                    width: Math.round(window.outerWidth || window.innerWidth || 0),
                    height: Math.round(window.outerHeight || window.innerHeight || 0)
                })
                """
            )
        except Exception:
            return None
        if not isinstance(data, dict):
            return None
        return _valid_window_size(data.get("width"), data.get("height"))

    async def remember_current_window_size(self) -> bool:
        if self.engine_id == "browsermulti":
            return True
        size = await self._capture_current_window_size()
        if size is None:
            return False
        w, h = size
        if self._last_saved_window_size == size:
            return True
        saved = _save_window_size(self.profile_dir, w, h)
        if saved:
            self._last_saved_window_size = size
            logger.info("Saved profile '%s' window size: %dx%d", self.profile_name, w, h)
        return saved

    def remember_window_size(self, width: Any, height: Any) -> bool:
        if self.engine_id == "browsermulti":
            return True
        saved = _save_window_size(self.profile_dir, width, height)
        if saved:
            size = _valid_window_size(width, height)
            if size:
                self._last_saved_window_size = size
                logger.info("Đã lưu kích thước cửa sổ profile '%s': %dx%d", self.profile_name, size[0], size[1])
        return saved

    async def start(
        self,
        profile_name: str,
        proxy: str | None = None,
        fingerprint_seed: Any = None,
        profile_dir_name: str | None = None,
        browser_badge_number: Any = None,
        mute_audio: bool = False,
        profile_data: dict[str, Any] | None = None,
    ):
        configure_bundled_cache()
        profile_name = validate_display_profile_name(profile_name)
        profile_dir_name = validate_profile_name(profile_dir_name or profile_name)
        user_data_dir = profile_data_dir(profile_dir_name)
        user_data_dir.mkdir(parents=True, exist_ok=True)
        self.profile_dir = user_data_dir
        self.profile_name = profile_name
        _log_resource_snapshot("before_launch", profile_name, user_data_dir)

        session_pid_path = user_data_dir / _SESSION_PID_FILENAME
        saved_pid: int | None = None
        if session_pid_path.exists():
            try:
                raw_pid = session_pid_path.read_text(encoding="ascii").strip()
                saved_pid = int(raw_pid)
                if saved_pid <= 0:
                    raise ValueError("PID must be positive")
            except (OSError, UnicodeError, ValueError) as exc:
                try:
                    live_pids = chrome_pids_for_user_data_dir(str(user_data_dir))
                except ChromiumProcessInspectionError as inspect_exc:
                    raise RuntimeError(
                        "Không thể xác minh session PID; không xóa lock hoặc mở trình duyệt để bảo vệ dữ liệu."
                    ) from inspect_exc
                if live_pids:
                    raise RuntimeError(
                        "Hồ sơ đang mở trong Chromium; không thể xác minh PID đã lưu "
                        f"(PID: {', '.join(str(pid) for pid in live_pids)})."
                    ) from exc
                saved_pid = None

        try:
            live_pids = chrome_pids_for_user_data_dir(str(user_data_dir))
            saved_pid_live = (
                saved_pid is not None
                and chromium_process_for_pid(saved_pid, str(user_data_dir))
            )
        except ChromiumProcessInspectionError as exc:
            raise RuntimeError(
                "Không thể kiểm tra hồ sơ đang chạy; không xóa lock hoặc mở trình duyệt để bảo vệ dữ liệu."
            ) from exc
        if saved_pid_live or live_pids:
            active_pids = sorted(set(live_pids) | ({saved_pid} if saved_pid_live and saved_pid is not None else set()))
            has_win = False
            try:
                from core.window_arranger import has_profile_windows
                has_win = has_profile_windows(user_data_dir, active_pids)
            except Exception:
                has_win = False

            if has_win:
                raise RuntimeError(
                    "Hồ sơ đang mở trong Chromium; hãy đóng trước khi chạy automation "
                    f"(PID: {', '.join(str(pid) for pid in active_pids)})."
                )
            else:
                logger.info(
                    "Phát hiện tiến trình Chromium treo ngầm không có cửa sổ (PIDs: %s). Đang tự động dọn dẹp để khởi động lại sạch sẽ.",
                    active_pids,
                )
                try:
                    import psutil
                    for pid in active_pids:
                        try:
                            if psutil.pid_exists(pid):
                                p = psutil.Process(pid)
                                for child in p.children(recursive=True):
                                    try:
                                        child.kill()
                                    except Exception:
                                        pass
                                p.kill()
                        except Exception:
                            pass
                    time.sleep(0.5)
                except Exception:
                    pass

        # Chỉ xóa marker/locks stale khi process scan xác nhận không có owner.
        _remove_profile_runtime_markers(user_data_dir)

        engine_name = (profile_data or {}).get("engine")
        runtime_version = (profile_data or {}).get("runtime_version")
        try:
            engine = get_browser_engine(engine_name, runtime_version=runtime_version)
        except TypeError:
            engine = get_browser_engine(engine_name)
        self.engine_id = engine.engine_id
        x, y, default_w, default_h = _get_default_window_bounds()
        placement = _chromium_window_placement(user_data_dir) if engine.engine_id == "browsermulti" else None
        if engine.engine_id == "browsermulti" and placement is not None:
            x = int(placement["x"])
            y = int(placement["y"])
            w = int(placement["width"])
            h = int(placement["height"])
            logger.info(
                "Use Chromium Preferences placement for profile '%s': x=%d y=%d size=%dx%d maximized=%s",
                profile_name,
                x,
                y,
                w,
                h,
                bool(placement["maximized"]),
            )
        else:
            saved_window_size = _get_saved_window_size(user_data_dir) if engine.engine_id == "cloakbrowser" else None
            if saved_window_size is not None:
                w, h = saved_window_size
                self._last_saved_window_size = saved_window_size
                logger.info("Use saved window size for profile '%s': %dx%d", profile_name, w, h)
            else:
                w, h = default_w, default_h
                logger.info("Profile '%s' first open uses work area: %dx%d", profile_name, w, h)
        ensure_google_search_provider(user_data_dir)
        if engine.engine_id == "browsermulti":
            _ensure_browsermulti_startup_preferences(user_data_dir)
        seed = _normalize_fingerprint_seed(fingerprint_seed, profile_name)
        spec = BrowserLaunchSpec(
            user_data_dir=user_data_dir,
            headless=False,
            proxy=None,
            locale=None,
            timezone=None,
            window_width=w,
            window_height=h,
            window_x=x,
            window_y=y,
            mute_audio=mute_audio,
            viewport=None,
            engine_options={
                "fingerprint_seed": seed,
                "extension_dir": GOOGLE_NEW_TAB_EXTENSION_DIR if engine.engine_id == "cloakbrowser" else None,
                "homepage": GOOGLE_HOME_URL,
                "scale_factor": WINDOW_SCALE_FACTOR,
                "restore_profile_window_placement": bool(placement),
                "start_maximized": bool(placement and placement["maximized"]),
                "studio_upload": str((profile_data or {}).get("action") or "").strip() == "upload",
                "benchmark_launch_flags": list((profile_data or {}).get("benchmark_launch_flags") or []),
                "benchmark_log_file": str((profile_data or {}).get("benchmark_log_file") or ""),
            },
        )
        proxy_config = None
        if proxy:
            proxy_scheme = (profile_data or {}).get("proxy_scheme") or "auto"
            if engine.engine_id == "browsermulti" and proxy_requires_bridge(proxy, proxy_scheme):
                self._proxy_bridge = Socks5HttpBridge(proxy)
                proxy_config = {"server": await self._proxy_bridge.start()}
            else:
                proxy_ok, proxy_error = proxy_launch_compatibility(proxy, proxy_scheme)
                if not proxy_ok:
                    raise RuntimeError(proxy_error)
                proxy_config = playwright_proxy_config(proxy, proxy_scheme)
            spec = BrowserLaunchSpec(**{**spec.__dict__, "proxy": proxy_config})
        launch_args = engine.build_launch_args(spec)
        self._launch_args = list(launch_args)
        launch_options = _profile_launch_options(profile_data)
        logger.info("Browser launch flags | profile=%s | engine=%s | args=%s", profile_name, engine.engine_id, launch_args)
        logger.info(
            "Browser engine launch plan | profile=%s | engine=%s | window=%dx%d | position=%d,%d | chromium_placement=%s | args=%d | mute_audio=%s",
            profile_name,
            engine.engine_id,
            w,
            h,
            x,
            y,
            bool(placement),
            len(launch_args),
            bool(mute_audio),
        )
        if proxy_config:
            logger.info("Configured proxy %s for engine %s", proxy_config.get("server", proxy), engine.engine_id)
        logger.info("Browser launch audio | profile=%s | mute_audio=%s", profile_name, bool(mute_audio))
        logger.info(
            "Profile lifecycle | event=profile_launch_requested | profile=%s | profile_dir=%s | engine=%s",
            profile_name,
            user_data_dir,
            engine.engine_id,
        )
        launch_started = time.perf_counter()
        try:
            self.context = await engine.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=False,
                proxy=proxy_config,
                locale=launch_options.get("locale"),
                timezone=launch_options.get("timezone"),
                args=launch_args,
                viewport=None,
                options={
                    "geoip": engine.engine_id == "cloakbrowser" and bool(proxy_config) and _has_geoip_support(),
                    "launcher": launch_persistent_context if engine.engine_id == "cloakbrowser" else None,
                },
            )
        except BaseException:
            if self._proxy_bridge is not None:
                await self._proxy_bridge.close()
                self._proxy_bridge = None
            raise
        await engine.post_launch(
            self.context,
            {
                "init_scripts": [_STEALTH_SCRIPT, _CURSOR_SCRIPT, _TAB_CLOSE_GUARD_SCRIPT]
                if engine.engine_id == "cloakbrowser"
                else [],
                "human_fallback": _install_native_viewport_human_fallback
                if engine.engine_id == "cloakbrowser"
                else None,
            },
        )
        _log_resource_snapshot("after_launch", profile_name, user_data_dir, capture_processes=True)
        logger.info(
            "Profile lifecycle | event=chromium_process_started | profile=%s | profile_dir=%s | pids=%s | elapsed_ms=%.1f",
            profile_name,
            user_data_dir,
            chrome_pids_for_user_data_dir(str(user_data_dir)),
            (time.perf_counter() - launch_started) * 1000,
        )
        logger.info(
            "Browser engine selected | profile=%s | engine=%s | version=%s",
            profile_name,
            engine.engine_id,
            engine.version(),
        )
        logger.info(
            "Browser startup phase | profile=%s | phase=chromium_launch_ms | elapsed_ms=%.1f",
            profile_name,
            (time.perf_counter() - launch_started) * 1000,
        )

        # Đóng tất cả tab thừa, chỉ giữ 1 tab duy nhất
        pages = self.context.pages
        if pages:
            self.page = pages[0]
            for extra in pages[1:]:
                try:
                    await extra.close()
                except Exception:
                    pass
            logger.info("Trình duyệt đã khởi động, dùng tab có sẵn (%d tab thừa đã đóng)", len(pages) - 1)
        else:
            self.page = await self.context.new_page()
            logger.info("Trình duyệt đã khởi động, đã mở tab mới")

        if engine.engine_id == "browsermulti":
            logger.info("BrowserMulti uses Chromium Preferences for window placement")
        if self.page is None:
            raise RuntimeError("Trình duyệt không tạo được tab")
        startup_url = str(getattr(self.page, "url", "") or "").strip().lower()
        startup_goto = getattr(self.page, "goto", None)
        if startup_url not in {GOOGLE_HOME_URL.rstrip("/"), GOOGLE_HOME_URL} and callable(startup_goto):
            try:
                await startup_goto(GOOGLE_HOME_URL, wait_until="commit", timeout=15000)
                logger.info(
                    "Browser startup phase | profile=%s | phase=google_commit | url=%s",
                    profile_name,
                    getattr(self.page, "url", ""),
                )
            except Exception as exc:
                logger.warning("Không mở được Google ngay sau launch cho profile '%s': %s", profile_name, exc)
        for candidate in getattr(self.context, "pages", []) or []:
            self._attach_crash_watcher(candidate)
        try:
            self.context.on("page", self._attach_crash_watcher)
        except Exception:
            logger.debug("Could not attach context crash watcher", exc_info=True)

        ready_ms = (time.perf_counter() - launch_started) * 1000
        logger.info(
            "Browser startup phase | profile=%s | phase=browser_ready_ms | elapsed_ms=%.1f",
            profile_name,
            ready_ms,
        )
        logger.info(
            "Profile lifecycle | event=profile_ready | profile=%s | profile_dir=%s | pid=%s | elapsed_ms=%.1f",
            profile_name,
            user_data_dir,
            self._session_pid or "unknown",
            ready_ms,
        )
        capability = host_capabilities()
        low_memory = bool(capability.get("low_memory_host"))
        context = self.context
        page = self.page
        badge_number = browser_badge_number or profile_badge_number(profile_dir=profile_dir_name, profile_name=profile_name)

        async def _cosmetic_startup() -> None:
            cosmetic_started = time.perf_counter()
            browser_timezone = ""
            try:
                if badge_number:
                    attempts = 1 if low_memory else 8
                    for attempt in range(attempts):
                        applied_windows = apply_browser_icon_badge_for_user_data_dir(user_data_dir, badge_number)
                        if applied_windows:
                            logger.info("Applied browser icon badge %s for profile '%s'", badge_number, profile_name)
                            break
                        if attempt + 1 < attempts:
                            await asyncio.sleep(0.25 if attempt < 4 else 0.5)
                try:
                    browser_timezone = await asyncio.wait_for(
                        page.evaluate("() => Intl.DateTimeFormat().resolvedOptions().timeZone || ''"),
                        timeout=3,
                    )
                except Exception:
                    browser_timezone = ""
                if self.context is not context:
                    return
                try:
                    self._title_overlay = WindowTitleOverlay(
                        user_data_dir=str(user_data_dir),
                        profile_name=profile_name,
                        timezone=str(browser_timezone or ""),
                    )
                    self._title_overlay.start()
                    logger.info(
                        "Started window title overlay for profile '%s' (tz=%s)",
                        profile_name,
                        browser_timezone or "local",
                    )
                except Exception as exc:
                    logger.debug("Could not start window title overlay: %s", exc)
                try:
                    set_overlay_entry(
                        user_data_dir=str(user_data_dir),
                        profile_name=profile_name,
                        order=badge_number or 0,
                        timezone=str(browser_timezone or ""),
                    )
                except Exception as exc:
                    logger.debug("Could not record overlay state: %s", exc)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.debug("Cosmetic startup failed for profile '%s'", profile_name, exc_info=True)
            finally:
                logger.info(
                    "Browser startup phase | profile=%s | phase=cosmetic_ready_ms | elapsed_ms=%.1f | low_memory=%s",
                    profile_name,
                    (time.perf_counter() - cosmetic_started) * 1000,
                    low_memory,
                )

        self._cosmetic_task = asyncio.create_task(_cosmetic_startup())
        if engine.engine_id == "browsermulti":
            try:
                self._session_pid = await asyncio.to_thread(
                    chromium_root_pid_for_user_data_dir,
                    str(user_data_dir),
                )
                _write_session_pid(user_data_dir, self._session_pid)
            except BaseException:
                await self.close()
                raise
        return self.page

    async def close(self):
        task = self._close_task
        if task is None:
            task = asyncio.create_task(self._close_once())
            self._close_task = task
        try:
            await asyncio.shield(task)
        finally:
            if task.done() and self._close_task is task:
                self._close_task = None

    async def _close_once(self):
        close_started = time.perf_counter()
        logger.info(
            "Profile lifecycle | event=close_requested | profile=%s | profile_dir=%s | engine=%s",
            self.profile_name,
            self.profile_dir,
            self.engine_id,
        )
        context = self.context
        if self.engine_id != "browsermulti":
            try:
                await asyncio.wait_for(self.remember_current_window_size(), timeout=1.5)
            except Exception:
                pass
        # Clear references up-front so a hung/dead browser cannot leave the
        # session looking "live" if close() raises or times out.
        self.context = None
        self.page = None
        audio_task = self._profile_audio_sync_task
        self._profile_audio_sync_task = None
        if audio_task is not None:
            audio_task.cancel()
        cosmetic_task = self._cosmetic_task
        self._cosmetic_task = None
        if cosmetic_task is not None:
            cosmetic_task.cancel()
            try:
                await cosmetic_task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.debug("Cosmetic startup cleanup failed", exc_info=True)
        title_overlay = self._title_overlay
        self._title_overlay = None
        if title_overlay is not None:
            try:
                title_overlay.stop()
            except Exception:
                pass
        try:
            if self.profile_dir is not None:
                remove_overlay_entry(str(self.profile_dir))
        except Exception:
            pass
        _log_resource_snapshot("before_close", self.profile_name, self.profile_dir, capture_processes=True)
        if context is None:
            try:
                if self._proxy_bridge is not None:
                    await self._proxy_bridge.close()
                    self._proxy_bridge = None
            finally:
                if self.profile_dir is not None:
                    _remove_owned_session_pid(self.profile_dir, self._session_pid)
                    self._session_pid = None
                    logger.info(
                        "Profile lifecycle | event=profile_release_confirmed | profile=%s | profile_dir=%s | elapsed_ms=%.1f",
                        self.profile_name,
                        self.profile_dir,
                        (time.perf_counter() - close_started) * 1000,
                    )
            return
        try:
            # Guard against a dead/disconnected browser where context.close()
            # can block indefinitely waiting for a response.
            logger.info(
                "Profile lifecycle | event=graceful_shutdown_started | profile=%s | profile_dir=%s | pid=%s",
                self.profile_name,
                self.profile_dir,
                self._session_pid or "unknown",
            )
            await asyncio.wait_for(context.close(), timeout=10)
            remaining = await asyncio.to_thread(wait_for_profile_processes_exit, self.profile_dir, 10.0) if self.profile_dir else []
            if remaining:
                logger.warning("Profile release waiting timed out | profile=%s | pids=%s", self.profile_name, remaining)
            _log_resource_snapshot("after_close", self.profile_name, self.profile_dir, capture_processes=True)
            logger.info("Đã đóng trình duyệt")
        except asyncio.TimeoutError:
            logger.warning("Đóng trình duyệt quá thời gian (10s), bỏ qua")
        except Exception as exc:
            if "Target page, context or browser has been closed" in str(exc):
                logger.info("Trình duyệt đã đóng trước khi hoàn tất context.close()")
            else:
                logger.warning("Lỗi khi đóng trình duyệt: %s", exc)
        finally:
            try:
                if self._proxy_bridge is not None:
                    await self._proxy_bridge.close()
                    self._proxy_bridge = None
            finally:
                if self.profile_dir is not None:
                    _remove_owned_session_pid(self.profile_dir, self._session_pid)
                    self._session_pid = None
                    logger.info(
                        "Profile lifecycle | event=profile_release_confirmed | profile=%s | profile_dir=%s | elapsed_ms=%.1f",
                        self.profile_name,
                        self.profile_dir,
                        (time.perf_counter() - close_started) * 1000,
                    )
