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
    """Return a per-user writable directory for RETubeMatrix browser data."""
    override = os.environ.get("RETUBEMATRIX_BROWSER_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser()
    base = os.environ.get("LOCALAPPDATA")
    if base:
        return Path(base) / "RETubeMatrix" / "browser_engine"
    return Path.home() / "AppData" / "Local" / "RETubeMatrix" / "browser_engine"


def user_data_path(*parts: str) -> Path:
    return user_data_root().joinpath(*parts)


def profile_data_root() -> Path:
    """Return the profile root for RETubeMatrix."""
    override = os.environ.get("RETUBEMATRIX_BROWSER_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser()
    return user_data_root()


def profile_data_path(*parts: str) -> Path:
    return profile_data_root().joinpath(*parts)


def legacy_profile_data_roots() -> tuple[Path, ...]:
    """External legacy roots disabled so RETubeMatrix never mixes BrowserMulti/reupytb data."""
    return ()


def profile_data_dir(profile_dir: str, root: str | Path | None = None) -> Path:
    """Resolve existing profile data strictly within the isolated RETubeMatrix root."""
    name = str(profile_dir or "").strip()
    candidate_name = Path(name)
    if not name or candidate_name.name != name or name in {".", ".."} or any(char in name for char in "/\\:"):
        raise ValueError("Tên thư mục profile không hợp lệ")
    if root is not None:
        selected_root = validate_profile_data_root(root)
        return selected_root / name
    return profile_data_root() / "profiles" / name


def validate_profile_data_root(root: str | Path) -> Path:
    selected_root = Path(root).expanduser().resolve(strict=True)
    if not selected_root.is_dir() or selected_root.name.casefold() != "profiles":
        raise ValueError("Đường dẫn profile phải là thư mục profiles")
    return selected_root


def profile_data_roots() -> tuple[Path, ...]:
    """Return only the isolated canonical root for RETubeMatrix."""
    return (profile_data_root(),)


def profile_data_path_in_root(root: Path, *parts: str) -> Path:
    return root.joinpath(*parts)


def profile_metadata_path(filename: str) -> Path:
    """Return canonical RETubeMatrix metadata path without falling back to external tools."""
    return profile_data_path(filename)
