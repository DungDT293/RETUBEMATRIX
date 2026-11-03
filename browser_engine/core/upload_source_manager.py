import json
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from core.paths import app_path


logger = logging.getLogger(__name__)

UPLOAD_ARCHIVE_DIR = app_path("uploaded_videos")
UPLOAD_HISTORY_FILE = app_path("logs", "uploaded_video_sources.jsonl")

_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
_ACTION_ALIASES = {
    "": "keep",
    "keep": "keep",
    "giu": "keep",
    "giữ": "keep",
    "khong_xoa": "keep",
    "không_xóa": "keep",
    "archive": "archive",
    "move": "archive",
    "luu_tru": "archive",
    "lưu_trữ": "archive",
    "delete": "delete",
    "xoa": "delete",
    "xóa": "delete",
}


def normalize_after_upload_action(value: str | None) -> str:
    raw = str(value or "").strip().lower().replace(" ", "_")
    return _ACTION_ALIASES.get(raw, "keep")


def resolve_video_path(raw: str) -> Path:
    source = Path(str(raw or "").strip()).expanduser()
    if source.exists():
        return source.resolve()
    for ext in _VIDEO_EXTENSIONS:
        candidate = source.with_suffix(ext)
        if candidate.exists():
            return candidate.resolve()
    return source.resolve()


def _unique_archive_path(source: Path, profile_name: str) -> Path:
    safe_profile = "".join(ch if ch.isalnum() or ch in "._- " else "_" for ch in profile_name).strip() or "profile"
    date_dir = datetime.now().strftime("%Y%m%d")
    target_dir = UPLOAD_ARCHIVE_DIR / safe_profile / date_dir
    target_dir.mkdir(parents=True, exist_ok=True)

    target = target_dir / source.name
    if not target.exists():
        return target
    stem = source.stem
    suffix = source.suffix
    for i in range(2, 1000):
        candidate = target_dir / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
    raise ValueError("Không tạo được tên file lưu trữ không trùng.")


def _write_history(entry: dict[str, Any]) -> None:
    UPLOAD_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(UPLOAD_HISTORY_FILE, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def handle_uploaded_video_source(
    video_path: str,
    action: str | None,
    profile_name: str,
    video_url: str,
) -> dict[str, Any]:
    normalized = normalize_after_upload_action(action)
    source = resolve_video_path(video_path)
    result: dict[str, Any] = {
        "action": normalized,
        "source": str(source),
        "profile_name": profile_name,
        "video_url": video_url,
        "handled_at": datetime.now().isoformat(timespec="seconds"),
        "status": "skipped",
        "message": "",
    }

    if normalized == "keep":
        result["message"] = "Giữ nguyên file video nguồn sau khi upload."
        _write_history(result)
        return result

    if not source.exists():
        result["message"] = "Không tìm thấy file video nguồn để xử lý."
        _write_history(result)
        return result

    if source.suffix.lower() not in _VIDEO_EXTENSIONS:
        result["message"] = "File nguồn không phải định dạng video được hỗ trợ, đã giữ nguyên."
        _write_history(result)
        return result

    size_bytes = source.stat().st_size
    result["size_bytes"] = size_bytes

    if normalized == "archive":
        target = _unique_archive_path(source, profile_name)
        shutil.move(str(source), str(target))
        result["status"] = "archived"
        result["target"] = str(target)
        result["message"] = f"Đã chuyển video nguồn vào thư mục lưu trữ: {target}"
        _write_history(result)
        logger.info("Đã lưu trữ video nguồn sau upload: %s -> %s", source, target)
        return result

    if normalized == "delete":
        source.unlink()
        result["status"] = "deleted"
        result["message"] = "Đã xóa video nguồn sau khi upload thành công."
        _write_history(result)
        logger.info("Đã xóa video nguồn sau upload: %s", source)
        return result

    result["message"] = "Cấu hình xử lý video nguồn không hợp lệ, đã giữ nguyên."
    _write_history(result)
    return result
