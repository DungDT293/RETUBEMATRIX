"""
Luu lich su URL da click theo tung profile va nho qua cac phien chay.
File chinh: profiles/<profile_dir>/visit_history.json
Toi da MAX_HISTORY URL moi profile de tranh file phinh to.
"""
import json
import logging
from pathlib import Path
from core.paths import profile_data_dir, profile_data_path
from core.profile_store import _safe_profile_dir_base, validate_profile_name

logger = logging.getLogger(__name__)

MAX_HISTORY = 500
_PROFILES_DIR = profile_data_path("profiles")

def _history_key(profile_name: str = "", profile_dir: str = "") -> str:
    """Return the stable folder key used for visit history."""
    if profile_dir:
        return validate_profile_name(profile_dir)
    try:
        return validate_profile_name(profile_name)
    except ValueError:
        return validate_profile_name(_safe_profile_dir_base(profile_name))

def _history_file(profile_name: str = "", profile_dir: str = "") -> Path:
    return _PROFILES_DIR / _history_key(profile_name, profile_dir) / "visit_history.json"

def _legacy_history_file(profile_name: str = "", profile_dir: str = "") -> Path | None:
    if not profile_name or not profile_dir:
        return None
    try:
        legacy = _history_file(profile_name)
        primary = _history_file(profile_name, profile_dir)
    except ValueError:
        return None
    return legacy if legacy != primary else None

def load_visited(profile_name: str = "", profile_dir: str = "") -> set[str]:
    """Doc danh sach URL da tham cua profile."""
    f = _history_file(profile_name, profile_dir)
    if not f.exists():
        legacy = _legacy_history_file(profile_name, profile_dir)
        if legacy and legacy.exists():
            f = legacy
    if not f.exists():
        return set()
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        return set(data) if isinstance(data, list) else set()
    except Exception as exc:
        logger.debug("Khong doc duoc visit_history cho '%s': %s", profile_name or profile_dir, exc)
        return set()

def save_visited(profile_name: str = "", urls: set[str] | None = None, profile_dir: str = ""):
    """Ghi danh sach URL da tham vao key chinh cua profile_dir."""
    f = _history_file(profile_name, profile_dir)
    try:
        f.parent.mkdir(parents=True, exist_ok=True)
        url_list = list(urls or set())[-MAX_HISTORY:]
        f.write_text(json.dumps(url_list, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        logger.debug("Khong ghi duoc visit_history cho '%s': %s", profile_name or profile_dir, exc)

def add_visited(profile_name: str = "", url: str = "", profile_dir: str = ""):
    """Them 1 URL vao lich su va luu ngay."""
    visited = load_visited(profile_name, profile_dir)
    visited.add(url)
    save_visited(profile_name, visited, profile_dir)
