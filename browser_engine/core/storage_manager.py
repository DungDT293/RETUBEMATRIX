import os
import shutil
from pathlib import Path
from typing import Any

from core.paths import profile_data_path
from core.profile_store import load_profiles
from core.upload_source_manager import normalize_after_upload_action, resolve_video_path


PROFILES_DIR = profile_data_path("profiles")
EXPORTS_DIR = profile_data_path("exports")
LOGS_DIR = profile_data_path("logs")

WARNING_MB = 300
CRITICAL_MB = 1024

_CACHE_DIRS = {
    "BrowserMetrics",
    "Cache",
    "CacheStorage",
    "Code Cache",
    "Crashpad",
    "DawnCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "GPUCache",
    "GraphiteDawnCache",
    "GrShaderCache",
    "Media Cache",
    "ShaderCache",
    "VideoDecodeStats",
    "blob_storage",
    "component_crx_cache",
    "optimization_guide_model_store",
}
_CACHE_SUFFIXES = (".indexeddb.blob",)
_LIGHT_CACHE_DIRS = {
    "BrowserMetrics",
    "Cache",
    "CacheStorage",
    "Code Cache",
    "Crashpad",
    "DawnCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "GPUCache",
    "GraphiteDawnCache",
    "GrShaderCache",
    "Media Cache",
    "ShaderCache",
    "VideoDecodeStats",
    "component_crx_cache",
    "optimization_guide_model_store",
}
_DEEP_RESET_NAMES = {
    "Cookies",
    "Extension Cookies",
    "History",
    "IndexedDB",
    "Local Storage",
    "Login Data",
    "Network",
    "Session Storage",
    "Sessions",
    "Web Data",
}
_CLEANUP_MODES = {"light", "web_data", "deep"}
_MANUAL_CACHE_DIRS = {
    Path("Default/Cache"),
    Path("Default/Code Cache"),
    Path("Default/GPUCache"),
    Path("Default/DawnGraphiteCache"),
    Path("Default/Crashpad"),
    Path("ShaderCache"),
    Path("GrShaderCache"),
}


def clean_manual_profile_cache(profile_id: str) -> dict[str, Any]:
    """Remove only disposable cache dirs; preserve cookies and profile state."""
    profile = _find_profile(profile_id)
    if not profile:
        raise ValueError("Không tìm thấy hồ sơ cần dọn cache.")
    root = _profile_dir(profile)
    before = _safe_size(root)
    removed_bytes = 0
    removed_items = 0
    errors: list[str] = []
    for relative in sorted(_MANUAL_CACHE_DIRS, key=lambda path: str(path)):
        target = root / relative
        try:
            _ensure_inside(target, root)
            if target.is_symlink():
                errors.append(f"{relative}: bỏ qua đường dẫn liên kết")
                continue
            if not target.exists():
                continue
            size = _safe_size(target)
            shutil.rmtree(target)
            removed_bytes += size
            removed_items += 1
        except Exception as exc:
            errors.append(f"{relative}: {exc}")
    after = _safe_size(root)
    return {
        "id": _profile_id(profile),
        "profile_name": str(profile.get("profile_name") or profile_id),
        "before_bytes": before,
        "after_bytes": after,
        "removed_bytes": max(removed_bytes, before - after),
        "removed_items": removed_items,
        "errors": errors,
        "message": "Đã dọn dẹp bộ nhớ đệm. Cookie và Preferences được giữ nguyên.",
    }




def _safe_size(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = [d for d in dirnames if not _is_reparse_point(Path(dirpath) / d)]
        for filename in filenames:
            file_path = Path(dirpath) / filename
            try:
                total += file_path.stat().st_size
            except OSError:
                continue
    return total


def _is_reparse_point(path: Path) -> bool:
    try:
        return path.is_symlink()
    except OSError:
        return True


def _profile_id(profile: dict[str, Any]) -> str:
    return str(profile.get("id") or profile.get("profile_name") or "").strip()


def _find_profile(profile_id: str) -> dict[str, Any] | None:
    for profile in load_profiles():
        if _profile_id(profile) == profile_id or profile.get("profile_name") == profile_id:
            return profile
    return None


def _profile_dir(profile: dict[str, Any]) -> Path:
    name = str(profile.get("profile_dir") or profile.get("profile_name") or "").strip()
    return PROFILES_DIR / name


def _status_for_size(size_bytes: int) -> str:
    size_mb = size_bytes / 1024 / 1024
    if size_mb >= CRITICAL_MB:
        return "critical"
    if size_mb >= WARNING_MB:
        return "warning"
    return "ok"


def _cache_candidate(path: Path) -> bool:
    if path.name in _CACHE_DIRS:
        return True
    return path.name.endswith(_CACHE_SUFFIXES)


def _ensure_inside(child: Path, parent: Path) -> None:
    child.resolve().relative_to(parent.resolve())


def _cache_targets(root: Path) -> list[Path]:
    if not root.exists():
        return []
    targets: list[Path] = []
    for dirpath, dirnames, _filenames in os.walk(root):
        current = Path(dirpath)
        keep_dirs = []
        for dirname in dirnames:
            candidate = current / dirname
            if _cache_candidate(candidate):
                try:
                    _ensure_inside(candidate, root)
                except ValueError:
                    continue
                targets.append(candidate)
            else:
                keep_dirs.append(dirname)
        dirnames[:] = keep_dirs
    return targets


def _light_cache_candidate(path: Path) -> bool:
    return path.name in _LIGHT_CACHE_DIRS


def _web_data_candidate(path: Path) -> bool:
    return path.name.endswith(_CACHE_SUFFIXES)


def _deep_reset_candidate(path: Path) -> bool:
    return path.name in _DEEP_RESET_NAMES


def _collect_targets(root: Path, predicate) -> list[Path]:
    if not root.exists():
        return []
    targets: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        current = Path(dirpath)
        keep_dirs = []
        for dirname in dirnames:
            candidate = current / dirname
            if predicate(candidate):
                try:
                    _ensure_inside(candidate, root)
                except ValueError:
                    continue
                targets.append(candidate)
            else:
                keep_dirs.append(dirname)
        dirnames[:] = keep_dirs
        for filename in filenames:
            candidate = current / filename
            if predicate(candidate):
                try:
                    _ensure_inside(candidate, root)
                except ValueError:
                    continue
                targets.append(candidate)
    return targets


def _dedupe_targets(targets: list[Path]) -> list[Path]:
    resolved: list[Path] = []
    for target in sorted(targets, key=lambda item: len(item.parts)):
        try:
            target_resolved = target.resolve()
        except OSError:
            continue
        if any(target_resolved == existing or target_resolved.is_relative_to(existing) for existing in resolved):
            continue
        resolved.append(target_resolved)
    return resolved


def _cleanup_targets(root: Path, mode: str) -> list[Path]:
    if mode not in _CLEANUP_MODES:
        raise ValueError("Chế độ dọn dữ liệu không hợp lệ.")
    targets: list[Path] = []
    if mode in {"light", "deep"}:
        targets.extend(_collect_targets(root, _light_cache_candidate))
    if mode in {"web_data", "deep"}:
        targets.extend(_collect_targets(root, _web_data_candidate))
    if mode == "deep":
        targets.extend(_collect_targets(root, _deep_reset_candidate))
    return _dedupe_targets(targets)


def _cache_target_label(path: Path) -> str:
    name = path.name
    lowered = str(path).lower()
    if name.endswith(".indexeddb.blob"):
        if "studio.youtube.com" in lowered:
            return "YouTube Studio IndexedDB blob"
        return "IndexedDB blob"
    if name == "CacheStorage":
        return "Service Worker CacheStorage"
    return name


def _relative_path(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return path.name


def _profile_cache_breakdown(path: Path) -> list[dict[str, Any]]:
    items = []
    for target in _cache_targets(path):
        size = _safe_size(target)
        if size <= 0:
            continue
        items.append({
            "name": _cache_target_label(target),
            "path": _relative_path(target, path),
            "size_bytes": size,
        })
    items.sort(key=lambda row: int(row["size_bytes"]), reverse=True)
    return items


def _storage_item_label(path: Path) -> str:
    name = path.name
    lowered = str(path).lower()
    if name == "IndexedDB" and "default" in lowered:
        return "IndexedDB / dữ liệu web app"
    if name == "Local Storage":
        return "Local Storage"
    if name == "Session Storage":
        return "Session Storage"
    if name in {"Cookies", "History", "Login Data", "Bookmarks", "Preferences"}:
        return name
    if name == "Network":
        return "Network / cookie metadata"
    if name == "Extensions":
        return "Extensions"
    if name == "Default":
        return "Default profile data"
    return name


def _profile_storage_breakdown(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    roots: list[Path] = []
    default_dir = path / "Default"
    if default_dir.exists() and default_dir.is_dir():
        roots.extend([child for child in default_dir.iterdir() if not _is_reparse_point(child)])
        roots.extend([child for child in path.iterdir() if child.name != "Default" and not _is_reparse_point(child)])
    else:
        roots.extend([child for child in path.iterdir() if not _is_reparse_point(child)])

    items = []
    for target in roots:
        size = _safe_size(target)
        if size <= 0:
            continue
        items.append({
            "name": _storage_item_label(target),
            "path": _relative_path(target, path),
            "size_bytes": size,
        })
    items.sort(key=lambda row: int(row["size_bytes"]), reverse=True)
    return items[:30]


def list_profile_storage() -> list[dict[str, Any]]:
    rows = []
    for profile in load_profiles():
        pid = _profile_id(profile)
        path = _profile_dir(profile)
        size_bytes = _safe_size(path)
        cache_breakdown = _profile_cache_breakdown(path)
        storage_breakdown = _profile_storage_breakdown(path)
        cache_bytes = sum(int(item["size_bytes"]) for item in cache_breakdown)
        rows.append({
            "id": pid,
            "profile_name": str(profile.get("profile_name") or pid),
            "profile_dir": str(profile.get("profile_dir") or profile.get("profile_name") or ""),
            "path": str(path),
            "exists": path.exists(),
            "size_bytes": size_bytes,
            "cache_bytes": cache_bytes,
            "cache_breakdown": cache_breakdown[:20],
            "storage_breakdown": storage_breakdown,
            "other_bytes": max(0, size_bytes - cache_bytes),
            "status": _status_for_size(size_bytes),
            "last_run_status": str(profile.get("last_run_status") or "idle"),
            "last_run_time": str(profile.get("last_run_time") or ""),
        })
    rows.sort(key=lambda row: int(row["size_bytes"]), reverse=True)
    return rows


def storage_summary() -> dict[str, Any]:
    profiles = list_profile_storage()
    disk = shutil.disk_usage(PROFILES_DIR)
    free_bytes = int(disk.free)
    upload_sources = list_upload_sources()
    profiles_size = sum(int(row["size_bytes"]) for row in profiles)
    upload_sources_size = sum(int(row["size_bytes"]) for row in upload_sources if row.get("exists"))
    exports_size = _safe_size(EXPORTS_DIR)
    logs_size = _safe_size(LOGS_DIR)
    warnings = []
    heavy = [row for row in profiles if row["status"] != "ok"]
    if heavy:
        warnings.append({
            "type": "profile",
            "message": f"{len(heavy)} hồ sơ đang chiếm dung lượng lớn, nên dọn cache.",
        })
    return {
        "profiles_size_bytes": profiles_size,
        "exports_size_bytes": exports_size,
        "upload_sources_size_bytes": upload_sources_size,
        "logs_size_bytes": logs_size,
        "total_size_bytes": profiles_size + upload_sources_size + exports_size + logs_size,
        "disk_free_bytes": free_bytes,
        "disk_free_gb": round(free_bytes / 1024**3, 2),
        "profile_count": len(profiles),
        "upload_source_count": len(upload_sources),
        "warnings": warnings,
    }


def list_upload_sources() -> list[dict[str, Any]]:
    rows = []
    seen: set[str] = set()
    for profile in load_profiles():
        raw_path = str(profile.get("video_path") or "").strip()
        if not raw_path:
            continue
        try:
            path = resolve_video_path(raw_path)
        except Exception:
            path = Path(raw_path)
        key = str(path).lower()
        if key in seen:
            continue
        seen.add(key)
        size_bytes = _safe_size(path)
        action = normalize_after_upload_action(str(profile.get("after_upload_video_action") or ""))
        rows.append({
            "profile_id": _profile_id(profile),
            "profile_name": str(profile.get("profile_name") or ""),
            "path": str(path),
            "exists": path.exists(),
            "size_bytes": size_bytes,
            "after_upload_video_action": action,
        })
    rows.sort(key=lambda row: int(row["size_bytes"]), reverse=True)
    return rows


def cleanup_profile_cache(profile_id: str, mode: str = "light") -> dict[str, Any]:
    profile = _find_profile(profile_id)
    if not profile:
        raise ValueError("Không tìm thấy hồ sơ cần dọn cache.")
    path = _profile_dir(profile)
    before = _safe_size(path)
    removed_bytes = 0
    removed_items = 0
    errors: list[str] = []
    for target in _cleanup_targets(path, mode):
        try:
            _ensure_inside(target, path)
            size = _safe_size(target)
            if target.is_dir():
                shutil.rmtree(target, ignore_errors=False)
            elif target.exists():
                target.unlink()
            removed_bytes += size
            removed_items += 1
        except Exception as exc:
            errors.append(f"{target.name}: {exc}")
    after = _safe_size(path)
    return {
        "id": _profile_id(profile),
        "profile_name": str(profile.get("profile_name") or profile_id),
        "mode": mode,
        "before_bytes": before,
        "after_bytes": after,
        "removed_bytes": max(removed_bytes, before - after),
        "removed_items": removed_items,
        "errors": errors,
    }


def cleanup_all_profile_caches(skip_ids: set[str] | None = None, mode: str = "light") -> dict[str, Any]:
    skip_ids = skip_ids or set()
    results = []
    skipped = []
    for profile in load_profiles():
        pid = _profile_id(profile)
        if pid in skip_ids:
            skipped.append({"id": pid, "reason": "Hồ sơ đang chạy, hãy đóng trước khi dọn cache."})
            continue
        try:
            results.append(cleanup_profile_cache(pid, mode=mode))
        except Exception as exc:
            skipped.append({"id": pid, "reason": str(exc)})
    return {
        "results": results,
        "skipped": skipped,
        "removed_bytes": sum(int(item.get("removed_bytes") or 0) for item in results),
        "removed_items": sum(int(item.get("removed_items") or 0) for item in results),
        "mode": mode,
    }
