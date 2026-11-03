import sys
import os
from pathlib import Path


def app_root() -> Path:
    """Return the writable app root for source and PyInstaller builds."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def app_path(*parts: str) -> Path:
    return app_root().joinpath(*parts)


def user_data_root() -> Path:
    """Return a per-user writable fallback directory for reupytb browser data."""
    override = os.environ.get("REUPYTB_BROWSER_DATA_DIR", "").strip() or os.environ.get("YOUWEE_BROWSER_DATA_DIR", "").strip()
    if override:
        return Path(override)
    base = os.environ.get("LOCALAPPDATA")
    if base:
        return Path(base) / "reupytb" / "browser_engine"
    return Path.home() / "AppData" / "Local" / "reupytb" / "browser_engine"


def user_data_path(*parts: str) -> Path:
    return user_data_root().joinpath(*parts)


def profile_data_root() -> Path:
    """Return one per-user profile root for source and frozen app launches."""
    override = (
        os.environ.get("REUPYTB_BROWSER_DATA_DIR", "").strip()
        or os.environ.get("YOUWEE_BROWSER_DATA_DIR", "").strip()
        or os.environ.get("BROWSERMULTI_PROFILE_DATA_DIR", "").strip()
    )
    if override:
        return Path(override).expanduser()
    return user_data_root()


def profile_data_path(*parts: str) -> Path:
    return profile_data_root().joinpath(*parts)


def legacy_profile_data_roots() -> tuple[Path, ...]:
    """Return compatible source/frozen roots without moving profile data."""
    canonical = profile_data_root()
    candidates = [app_root(), user_data_root()]
    roots: list[Path] = []
    for candidate in candidates:
        try:
            if candidate.resolve() == canonical.resolve():
                continue
        except OSError:
            if candidate == canonical:
                continue
        if all(str(existing).casefold() != str(candidate).casefold() for existing in roots):
            roots.append(candidate)
    return tuple(roots)


def profile_data_dir(profile_dir: str, root: str | Path | None = None) -> Path:
    """Resolve existing profile data without moving or overwriting it."""
    name = str(profile_dir or "").strip()
    candidate_name = Path(name)
    if not name or candidate_name.name != name or name in {".", ".."} or any(char in name for char in "/\\:"):
        raise ValueError("Tên thư mục profile không hợp lệ")
    if root is not None:
        selected_root = validate_profile_data_root(root)
        return selected_root / name
    roots = profile_data_roots()
    for data_root in roots:
        candidate = data_root / "profiles" / name
        if candidate.is_dir():
            return candidate
    return roots[0] / "profiles" / name


def validate_profile_data_root(root: str | Path) -> Path:
    selected_root = Path(root).expanduser().resolve(strict=True)
    if not selected_root.is_dir() or selected_root.name.casefold() != "profiles":
        raise ValueError("Đường dẫn profile phải là thư mục profiles")
    return selected_root


def profile_data_roots() -> tuple[Path, ...]:
    """Return canonical root first, then compatible legacy roots."""
    roots: list[Path] = []
    for root in (profile_data_root(), *legacy_profile_data_roots()):
        try:
            key = str(root.resolve()).casefold()
        except OSError:
            key = str(root).casefold()
        if all(str(existing).casefold() != key for existing in roots):
            roots.append(root)
    return tuple(roots)


def profile_data_path_in_root(root: Path, *parts: str) -> Path:
    return root.joinpath(*parts)


def profile_metadata_path(filename: str) -> Path:
    """Use canonical metadata, falling back to an old executable root."""
    canonical = profile_data_path(filename)
    if canonical.exists():
        return canonical
    for root in legacy_profile_data_roots():
        candidate = root / filename
        if candidate.exists():
            return candidate
    return canonical
