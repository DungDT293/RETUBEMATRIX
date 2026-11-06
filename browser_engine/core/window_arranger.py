import ctypes
import logging
import math
from ctypes import wintypes
from typing import Any

from core.window_icon_badge import ChromiumProcessInspectionError, chrome_pids_for_user_data_dir

logger = logging.getLogger(__name__)

SW_RESTORE = 9
SWP_NOZORDER = 0x0004
SWP_NOACTIVATE = 0x0010
WM_SIZE = 0x0005
SIZE_RESTORED = 0
WINDOW_TITLE_MAX = 512
WINDOW_CLASS_MAX = 256


def _is_windows() -> bool:
    return hasattr(ctypes, "windll")


def _get_screen_size() -> tuple[int, int]:
    if not _is_windows():
        return 1920, 1080
    user32 = ctypes.windll.user32
    return int(user32.GetSystemMetrics(0)), int(user32.GetSystemMetrics(1))


def _get_work_area() -> tuple[int, int, int, int]:
    if not _is_windows():
        return 0, 0, 1920, 1080
    rect = wintypes.RECT()
    ok = ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0)
    if not ok:
        width, height = _get_screen_size()
        return 0, 0, width, height
    return int(rect.left), int(rect.top), int(rect.right - rect.left), int(rect.bottom - rect.top)


def _get_window_text(hwnd: int) -> str:
    user32 = ctypes.windll.user32
    buffer = ctypes.create_unicode_buffer(WINDOW_TITLE_MAX)
    user32.GetWindowTextW(hwnd, buffer, WINDOW_TITLE_MAX)
    return buffer.value


def _is_visible_window(hwnd: int) -> bool:
    user32 = ctypes.windll.user32
    return bool(user32.IsWindowVisible(hwnd))


def _is_browser_window(hwnd: int) -> bool:
    try:
        return _window_class(hwnd) == "Chrome_WidgetWin_1"
    except Exception:
        return False


def _window_class(hwnd: int) -> str:
    buffer = ctypes.create_unicode_buffer(WINDOW_CLASS_MAX)
    ctypes.windll.user32.GetClassNameW(hwnd, buffer, WINDOW_CLASS_MAX)
    return buffer.value


def _window_pid(hwnd: int) -> int | None:
    if not _is_windows():
        return None
    pid = wintypes.DWORD()
    ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return int(pid.value) if pid.value else None


def _list_browser_windows() -> list[dict[str, Any]]:
    if not _is_windows():
        return []

    user32 = ctypes.windll.user32
    windows: list[dict[str, Any]] = []
    seen_hwnds: set[int] = set()

    enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def enum_proc(hwnd: int, _lparam: int) -> bool:
        if hwnd in seen_hwnds:
            return True
        if not _is_visible_window(hwnd) or not _is_browser_window(hwnd):
            return True
        pid = _window_pid(hwnd)
        if pid is not None:
            seen_hwnds.add(hwnd)
            windows.append({"hwnd": hwnd, "pid": pid, "title": _get_window_text(hwnd).strip()})
        return True

    cb = enum_proc_type(enum_proc)
    user32.EnumWindows(cb, 0)

    try:
        access = 0x0040 | 0x0001
        hdesk = user32.OpenInputDesktop(0, False, access)
        if not hdesk:
            hdesk = user32.OpenDesktopW("Default", 0, False, access)
        if hdesk:
            user32.EnumDesktopWindows(hdesk, cb, 0)
            user32.CloseDesktop(hdesk)
    except Exception as exc:
        logger.debug("Desktop window enum fallback error: %s", exc)

    return windows


def _profile_browser_pids(profile_dirs: dict[str, str]) -> tuple[dict[str, set[int]], dict[str, str]]:
    pids_by_profile: dict[str, set[int]] = {}
    failures: dict[str, str] = {}
    for profile_id, user_data_dir in profile_dirs.items():
        try:
            from core.paths import profile_data_dir
            resolved_dir = str(profile_data_dir(user_data_dir))
        except Exception:
            resolved_dir = user_data_dir
        try:
            pids = {int(pid) for pid in chrome_pids_for_user_data_dir(resolved_dir)}
        except ChromiumProcessInspectionError:
            failures[profile_id] = "Không xác minh được tiến trình Chromium của hồ sơ"
            continue
        if pids:
            pids_by_profile[profile_id] = pids
        else:
            failures[profile_id] = "Không tìm thấy tiến trình Chromium của hồ sơ"
    return pids_by_profile, failures


def _tile_positions(count: int, width: int, height: int, screen_w: int, screen_h: int, columns: int | None = None, gap: int = 0) -> list[tuple[int, int]]:
    if count <= 0:
        return []

    max_cols_by_width = max(1, (screen_w + gap) // max(width + gap, 1))
    if columns is None:
        cols = max(1, min(count, max_cols_by_width))
    else:
        cols = max(1, min(count, int(columns)))
    positions: list[tuple[int, int]] = []
    for index in range(count):
        col = index % cols
        row = index // cols
        positions.append((col * (width + gap), row * (height + gap)))
    return positions


def _auto_fit_grid(
    count: int,
    screen_w: int,
    screen_h: int,
    gap: int = 0,
    min_width: int = 300,
    min_height: int = 300,
) -> tuple[int, int, int, int]:
    """Tính lưới auto-fit không vượt quá vùng màn hình khả dụng."""
    gap = max(0, int(gap or 0))
    if count <= 0:
        return 1, 1, max(1, screen_w), max(1, screen_h)

    best_cols = 1
    best_score = float("-inf")
    for cols in range(1, count + 1):
        rows = math.ceil(count / cols)
        available_w = screen_w - gap * (cols - 1)
        available_h = screen_h - gap * (rows - 1)
        if available_w <= 0 or available_h <= 0:
            continue

        cell_w = available_w / cols
        cell_h = available_h / rows
        if cell_w <= 0 or cell_h <= 0:
            continue

        # Ưu tiên tỷ lệ gần cửa sổ browser, nhưng phạt mạnh nếu ô quá nhỏ.
        ratio = cell_w / cell_h
        ratio_penalty = abs(ratio - 0.8) * 10000
        undersize_penalty = max(0, min_width - cell_w) * 200 + max(0, min_height - cell_h) * 200
        score = (cell_w * cell_h) - ratio_penalty - undersize_penalty
        if score > best_score:
            best_score = score
            best_cols = cols

    cols = best_cols
    rows = math.ceil(count / cols)
    available_w = max(1, screen_w - gap * (cols - 1))
    available_h = max(1, screen_h - gap * (rows - 1))
    width = max(1, available_w // cols)
    height = max(1, available_h // rows)
    return cols, rows, width, height


def _cascade_positions(count: int, width: int, height: int, screen_w: int, screen_h: int) -> list[tuple[int, int]]:
    positions: list[tuple[int, int]] = []
    offset = 32
    x = 0
    y = 0
    for _ in range(count):
        positions.append((x, y))
        x += offset
        y += offset
        if x + width > screen_w or y + height > screen_h:
            x = 0
            y = 0
    return positions


def _match_windows(
    profile_ids: list[str],
    profile_names: dict[str, str],
    profile_dirs: dict[str, str],
) -> tuple[list[tuple[str, str, int, str]], dict[str, str]]:
    browser_windows = _list_browser_windows()
    pids_by_profile, failures = _profile_browser_pids(profile_dirs)
    matched: list[tuple[str, str, int, str]] = []
    used_hwnds: set[int] = set()

    for profile_id in profile_ids:
        profile_name = str(profile_names.get(profile_id) or profile_id)
        profile_pids = pids_by_profile.get(profile_id)
        if not profile_pids:
            continue
        chosen = next(
            (
                window
                for window in browser_windows
                if int(window["hwnd"]) not in used_hwnds and int(window["pid"]) in profile_pids
            ),
            None,
        )
        if chosen is None:
            failures.setdefault(profile_id, "Không tìm thấy cửa sổ Chromium của hồ sơ")
            continue
        hwnd = int(chosen["hwnd"])
        used_hwnds.add(hwnd)
        matched.append((profile_id, profile_name, hwnd, str(chosen["title"])))

    return matched, failures


def arrange_windows(
    profile_ids: list[str],
    profile_names: dict[str, str],
    profile_dirs: dict[str, str] | None = None,
    layout: str = "tile",
    window_width: int = 516,
    window_height: int = 600,
    apply_to_visible_area: bool = True,
    columns: int | None = None,
    gap: int = 0,
) -> dict[str, Any]:
    if not _is_windows():
        message = "Chức năng sắp xếp cửa sổ chỉ hỗ trợ Windows."
        return {
            "ok": False,
            "found_count": 0,
            "arranged_count": 0,
            "arranged": [],
            "skipped": [{"profile_id": pid, "reason": message} for pid in profile_ids],
            "message": message,
            "error": message,
        }

    width = max(300, int(window_width or 516))
    height = max(300, int(window_height or 600))
    origin_x, origin_y, screen_w, screen_h = _get_work_area() if apply_to_visible_area else (0, 0, *_get_screen_size())
    gap = max(0, int(gap or 0))

    resolved_profile_dirs = profile_dirs or {}
    matched, match_failures = _match_windows(profile_ids, profile_names, resolved_profile_dirs)
    if not matched:
        skipped = [
            {"profile_id": pid, "reason": match_failures.get(pid, "Không tìm thấy cửa sổ trình duyệt")}
            for pid in profile_ids
        ]
        message = "Không tìm thấy cửa sổ Chromium đúng hồ sơ để sắp xếp."
        return {
            "ok": False,
            "found_count": 0,
            "arranged_count": 0,
            "arranged": [],
            "skipped": skipped,
            "message": message,
            "error": message,
        }


    if layout == "auto":
        cols, _rows, width, height = _auto_fit_grid(len(matched), screen_w, screen_h, gap=gap)
        positions = [
            ((index % cols) * (width + gap), (index // cols) * (height + gap))
            for index in range(len(matched))
        ]
    elif layout == "cascade":
        positions = _cascade_positions(len(matched), width, height, screen_w, screen_h)
    else:
        if columns:
            cols = max(1, min(len(matched), int(columns)))
        else:
            cols = max(1, min(len(matched), (screen_w + gap) // max(width + gap, 1)))
        rows = max(1, math.ceil(len(matched) / cols))
        max_w = max(280, (screen_w - gap * (cols - 1)) // cols)
        max_h = max(240, (screen_h - gap * (rows - 1)) // rows)
        width = min(width, max_w)
        height = min(height, max_h)
        positions = _tile_positions(len(matched), width, height, screen_w, screen_h, columns=cols, gap=gap)

    user32 = ctypes.windll.user32
    arranged: list[dict[str, Any]] = []

    for index, (profile_id, profile_name, hwnd, title) in enumerate(matched):
        x, y = positions[index]
        try:
            user32.ShowWindow(hwnd, SW_RESTORE)
            x = origin_x + x
            y = origin_y + y
            ok = user32.SetWindowPos(
                hwnd,
                0,
                int(x),
                int(y),
                width,
                height,
                SWP_NOZORDER | SWP_NOACTIVATE,
            )
            if ok:
                # Force Chromium to recompute layout after programmatic resize.
                # Some restored windows keep the old content viewport until WM_SIZE is delivered.
                user32.PostMessageW(hwnd, WM_SIZE, SIZE_RESTORED, (height << 16) | width)
                arranged.append({
                    "profile_id": profile_id,
                    "profile_name": profile_name,
                    "title": title,
                    "x": int(x),
                    "y": int(y),
                    "width": width,
                    "height": height,
                })
        except Exception as exc:
            logger.warning("Failed to arrange window %s: %s", title, exc)

    arranged_ids = {item["profile_id"] for item in arranged}
    matched_ids = {profile_id for profile_id, _profile_name, _hwnd, _title in matched}
    skipped = [
        {"profile_id": profile_id, "profile_name": profile_name, "reason": "Không xếp được cửa sổ"}
        for profile_id, profile_name, _hwnd, _title in matched
        if profile_id not in arranged_ids
    ]
    skipped.extend(
        {
            "profile_id": profile_id,
            "profile_name": profile_names.get(profile_id, profile_id),
            "reason": match_failures.get(profile_id, "Không tìm thấy cửa sổ Chromium của hồ sơ"),
        }
        for profile_id in profile_ids
        if profile_id not in matched_ids
    )
    message = f"Tìm thấy {len(matched)} cửa sổ, đã xếp {len(arranged)} cửa sổ."
    return {
        "ok": True,
        "found_count": len(matched),
        "arranged_count": len(arranged),
        "arranged": arranged,
        "skipped": skipped,
        "message": message,
        "total": len(matched),
        "layout": layout,
    }


def preview_arrangement(
    count: int,
    layout: str = "tile",
    window_width: int = 516,
    window_height: int = 600,
    apply_to_visible_area: bool = True,
    columns: int | None = None,
    gap: int = 0,
) -> dict[str, Any]:
    count = max(0, int(count or 0))
    width = max(300, int(window_width or 516))
    height = max(300, int(window_height or 600))
    origin_x, origin_y, screen_w, screen_h = _get_work_area() if apply_to_visible_area else (0, 0, *_get_screen_size())
    gap = max(0, int(gap or 0))

    if layout == "auto":
        cols, _rows, width, height = _auto_fit_grid(count, screen_w, screen_h, gap=gap)
        positions = [
            ((index % cols) * (width + gap), (index // cols) * (height + gap))
            for index in range(count)
        ]
    elif layout == "cascade":
        positions = _cascade_positions(count, width, height, screen_w, screen_h)
    else:
        if columns:
            cols = max(1, min(count, int(columns)))
        else:
            cols = max(1, min(count, (screen_w + gap) // max(width + gap, 1)))
        rows = max(1, math.ceil(count / cols))
        max_w = max(280, (screen_w - gap * (cols - 1)) // cols)
        max_h = max(240, (screen_h - gap * (rows - 1)) // rows)
        width = min(width, max_w)
        height = min(height, max_h)
        positions = _tile_positions(count, width, height, screen_w, screen_h, columns=cols, gap=gap)

    return {
        "ok": True,
        "screen_width": screen_w,
        "screen_height": screen_h,
        "layout": layout,
        "preview": [
            {"index": index, "x": origin_x + x, "y": origin_y + y, "width": width, "height": height}
            for index, (x, y) in enumerate(positions)
        ],
    }


def focus_profile_windows(user_data_dir: Any, pids: list[int] | set[int] | None = None) -> bool:
    """Find and bring to front any visible Chromium window for this profile."""
    if not _is_windows():
        return False

    from core.window_icon_badge import chrome_pids_for_user_data_dir

    if pids is None:
        try:
            target_pids = set(chrome_pids_for_user_data_dir(str(user_data_dir)))
        except Exception:
            return False
    else:
        target_pids = set(pids)

    if not target_pids:
        return False

    user32 = ctypes.windll.user32
    focused = False

    enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def enum_proc(hwnd: int, _lparam: int) -> bool:
        nonlocal focused
        if not _is_visible_window(hwnd) or not _is_browser_window(hwnd):
            return True
        wpid = _window_pid(hwnd)
        if wpid in target_pids:
            try:
                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                user32.SetForegroundWindow(hwnd)
                user32.BringWindowToTop(hwnd)
                focused = True
            except Exception:
                pass
        return True

    user32.EnumWindows(enum_proc_type(enum_proc), 0)
    return focused


def has_profile_windows(user_data_dir: Any, pids: list[int] | set[int] | None = None) -> bool:
    """Check if there is any visible Chromium window for this profile without modifying window state."""
    if not _is_windows():
        return False

    from core.window_icon_badge import chrome_pids_for_user_data_dir

    if pids is None:
        try:
            target_pids = set(chrome_pids_for_user_data_dir(str(user_data_dir)))
        except Exception:
            return False
    else:
        target_pids = set(pids)

    if not target_pids:
        return False

    has_win = False
    user32 = ctypes.windll.user32
    enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def enum_proc(hwnd: int, _lparam: int) -> bool:
        nonlocal has_win
        if not _is_visible_window(hwnd) or not _is_browser_window(hwnd):
            return True
        wpid = _window_pid(hwnd)
        if wpid in target_pids:
            has_win = True
            return False
        return True

    user32.EnumWindows(enum_proc_type(enum_proc), 0)
    return has_win
