"""
Profile store — nguồn dữ liệu chính cho toàn bộ app.
Lưu dạng JSON, không phụ thuộc Excel.
Excel chỉ dùng để import dữ liệu nurture/upload.
"""
import ast
import json
import uuid
import logging
import os
import re
import hashlib
import secrets
import shutil
import stat
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from core.paths import app_path, profile_data_dir, profile_data_path, profile_data_roots
from core.proxy_format import canonical_proxy_with_scheme, normalize_proxy_scheme, proxy_scheme_from_input

logger = logging.getLogger(__name__)

# Profile data must survive installer/update directory changes. Source builds keep
# their repo-local data; frozen builds use the per-user writable data root.
PROFILES_JSON = profile_data_path("profiles.json")
DELETED_PROFILES_JSON = profile_data_path("deleted_profiles.json")
PROFILES_ROOT = profile_data_path("profiles")
_PROFILE_SNAPSHOT_FILENAME = ".browsermulti-profile.json"
_PROFILE_TRANSACTION_FILENAME = ".profiles.transaction.json"
_PROFILE_MUTATION_LOCK = threading.RLock()
_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9_. -]{1,64}$")
_DISPLAY_NAME_MAX_LEN = 128
_EMAIL_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
_WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
}

_DEFAULTS = {
    "id": "",
    "group": "Default",
    "profile_name": "",
    "profile_dir": "",
    "proxy": "",
    "proxy_scheme": "",
    "engine": "browsermulti",
    "runtime_version": "155.0.8059.12",
    "locale": "",
    "action": "nurture_full",
    "fingerprint_seed": "",
    "fingerprint_os": "Windows 10",
    "fingerprint_browser_version": "Chromium stable",
    "fingerprint_webgl": "Theo seed",
    "fingerprint_canvas": "Theo seed",
    "fingerprint_timezone": "Theo proxy",
    "fingerprint_language": "vi-VN,en-US",
    "fingerprint_screen_resolution": "Tự động",
    "proxy_provider": "",
    "proxy_purchase_date": "",
    "proxy_expiry_date": "",
    "proxy_note": "",
    # phân loại / ghi chú (GPM-style)
    "tags": [],
    "note": "",
    "color": "",
    # nurture fields (từ Excel import)
    "google_keywords": "",
    "yt_search_topics": "",
    "target_video_titles": "",
    "youtube_preferred_channel": "",
    "youtube_channels": [],
    # upload fields (từ Excel import)
    "video_path": "",
    "title": "",
    "description": "",
    "thumbnail_path": "",
    "visibility": "public",
    "schedule_date": "",
    "schedule_time": "",
    "pinned_comment": "",
    "pre_nurture_keyword": "",
    "post_nurture_keyword": "",
    # drive upload field
    "drive_upload_path": "",
    # runtime history
    "last_run_status": "idle",
    "last_run_time": "",
    "last_run_error": "",
    "last_crash_snapshot": None,
    # proxy reputation (derived, non-sensitive)
    "proxy_score": None,
    "proxy_risk": "",
    "proxy_country": "",
    "proxy_ip_type": "",
    "proxy_asn": "",
    "proxy_checked_at": "",
    "proxy_login_flag": "",
}


def _new_id() -> str:
    return uuid.uuid4().hex[:8]


def _derive_seed_from_identity(identity: str) -> int:
    digest = hashlib.sha256(str(identity or "").casefold().encode()).hexdigest()
    return int(digest[:8], 16)


def _derive_legacy_fingerprint_seed(profile_name: str) -> int:
    """Keep old profiles on the same fingerprint they used before this field existed."""
    return _derive_seed_from_identity(f"legacy-profile-name:{profile_name}")


def extract_identity_email(*values) -> str:
    """Return the first Gmail/email-like identity found in profile input fields."""
    for value in values:
        match = _EMAIL_RE.search(str(value or ""))
        if match:
            return match.group(0).strip().casefold()
    return ""


def _safe_profile_dir_base(display_name: str) -> str:
    """Create a Windows-safe folder-name base from a display-only profile name."""
    value = str(display_name or "").strip()
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"[^A-Za-z0-9_. -]+", "_", value)
    value = re.sub(r"_+", "_", value).strip(" ._")
    value = value[:42].strip(" ._")
    return value or "profile"


def profile_dir_for_identity(profile_name: str, identity_email: str = "", profile_id: str = "") -> str:
    """Create a browser-data folder key that does not accidentally follow display names."""
    if identity_email:
        local, _, domain = identity_email.partition("@")
        label = re.sub(r"[^A-Za-z0-9_. -]+", "_", f"{local}_{domain}")[:42].strip(" ._")
        suffix = hashlib.sha256(identity_email.encode()).hexdigest()[:8]
        return validate_profile_name(f"{label}_{suffix}")
    base = _safe_profile_dir_base(profile_name)
    suffix = str(profile_id or _new_id())[:8]
    return validate_profile_name(f"{base}_{suffix}"[:64].rstrip(" ."))

def _legacy_profile_dir_or_new(profile_name: str, profile_id: str = "") -> str:
    """Preserve old browser folders when profiles.json lacks profile_dir."""
    try:
        legacy_dir = validate_profile_name(profile_name)
        if (PROFILES_ROOT / legacy_dir).exists() or (app_path("profiles") / legacy_dir).exists() or profile_data_dir(legacy_dir).exists():
            return legacy_dir
    except ValueError:
        pass
    return profile_dir_for_identity(profile_name, "", profile_id or _new_id())


def _metadata_read_path(primary: Path, filename: str) -> Path:
    """Pick usable metadata without letting an empty root hide recoverable rows."""
    candidates = [primary, *(root / filename for root in _configured_metadata_roots(primary))]
    first_empty: Path | None = None
    first_invalid: Path | None = None
    for candidate in candidates:
        if not candidate.exists():
            continue
        try:
            rows = _read_profile_rows(candidate)
        except ProfilePersistenceError:
            first_invalid = first_invalid or candidate
            logger.warning("Bỏ qua metadata profile không hợp lệ: %s", candidate)
            continue
        if rows:
            if candidate != primary:
                logger.warning("Dùng metadata profile từ root cũ: %s", candidate)
            return candidate
        first_empty = first_empty or candidate
    return first_empty or first_invalid or primary


def _configured_metadata_roots(primary: Path) -> tuple[Path, ...]:
    """Return alternate roots only when callers did not replace test metadata paths."""
    configured = profile_data_path(primary.name)
    try:
        if primary.resolve() != configured.resolve():
            return ()
    except OSError:
        if primary != configured:
            return ()
    return profile_data_roots()[1:]


def profile_recovery_diagnostics() -> dict:
    """Return read-only metadata/root hints for an empty or failed profile list."""
    metadata: list[dict[str, str | int | bool]] = []
    for root in profile_data_roots():
        path = root / "profiles.json"
        if not path.exists():
            metadata.append({"root": str(root), "state": "missing", "count": 0})
            continue
        try:
            rows = _read_profile_rows(path)
            metadata.append({"root": str(root), "state": "valid", "count": len(rows)})
        except ProfilePersistenceError as exc:
            metadata.append({"root": str(root), "state": "corrupt", "count": 0, "error": str(exc)})

    candidates: list[str] = []
    for root in profile_data_roots():
        profiles_root = root / "profiles"
        if not profiles_root.is_dir():
            continue
        try:
            for child in profiles_root.iterdir():
                if child.is_dir() and _is_chromium_profile_dir(child):
                    candidates.append(f"{profiles_root}:{child.name}")
        except OSError:
            continue
    nonempty_metadata = any(int(item.get("count", 0)) > 0 for item in metadata)
    warning = ""
    if candidates and not nonempty_metadata:
        warning = "Không tìm thấy metadata đang dùng nhưng vẫn còn folder Chromium có thể khôi phục."
    elif any(item.get("state") == "corrupt" for item in metadata):
        warning = "Metadata hồ sơ bị hỏng; folder Chromium vẫn được giữ nguyên để khôi phục."
    return {
        "metadata": metadata,
        "data_root": str(PROFILES_ROOT.parent),
        "recovery_available": bool(candidates),
        "recovery_candidates": candidates,
        "warning": warning,
    }


def load_profiles_with_diagnostics() -> tuple[list[dict], dict]:
    """Load profiles and diagnostics without converting recoverable failure to silent empty state."""
    try:
        profiles = load_profiles()
        diagnostics = profile_recovery_diagnostics() if not profiles else {}
        return profiles, diagnostics
    except ProfilePersistenceError:
        return [], profile_recovery_diagnostics()


def _protect_empty_profile_write(profiles: list[dict]) -> None:
    """Reject accidental empty writes when another root still has profile metadata."""
    if profiles:
        return
    for root in profile_data_roots():
        candidate = root / "profiles.json"
        if candidate == PROFILES_JSON or not candidate.exists():
            continue
        try:
            if _read_profile_rows(candidate):
                raise ProfilePersistenceError(
                    "Từ chối ghi danh sách hồ sơ rỗng vì còn metadata hồ sơ ở root khác; hãy khôi phục hoặc xác nhận rõ."
                )
        except ProfilePersistenceError:
            raise
        except Exception:
            continue




def _migrate_legacy_metadata_once() -> None:
    """Tự động đồng bộ và nạp hồ sơ từ các vị trí legacy (reupytb, BrowserMulti) nếu chưa có."""
    from core.paths import legacy_profile_data_roots
    for root in legacy_profile_data_roots():
        source = root / "profiles.json"
        if not source.is_file():
            continue
        try:
            legacy_rows = _read_profile_rows(source)
            if not legacy_rows:
                continue
            canonical_rows = _read_profile_rows(PROFILES_JSON) if PROFILES_JSON.exists() else []
            existing_ids = {r.get("id") for r in canonical_rows if isinstance(r, dict)}
            deleted_rows = _read_profile_rows(DELETED_PROFILES_JSON) if DELETED_PROFILES_JSON.exists() else []
            deleted_ids = {r.get("id") for r in deleted_rows if isinstance(r, dict)}

            added = False
            for r in legacy_rows:
                if not isinstance(r, dict):
                    continue
                pid = r.get("id")
                if pid and pid not in existing_ids and pid not in deleted_ids:
                    canonical_rows.append(r)
                    existing_ids.add(pid)
                    added = True
            if added:
                PROFILES_JSON.parent.mkdir(parents=True, exist_ok=True)
                PROFILES_JSON.write_text(json.dumps(canonical_rows, ensure_ascii=False, indent=2), encoding="utf-8")
                logger.info("Đã tự động đồng bộ hồ sơ từ %s sang %s", source, PROFILES_JSON)
        except Exception as exc:
            logger.warning("Lỗi đồng bộ hồ sơ cũ từ %s: %s", source, exc)


def _is_chromium_profile_dir(path: Path) -> bool:
    local_state = path / "Local State"
    preferences = path / "Default" / "Preferences"
    return (local_state.is_file() and not _is_reparse_point(local_state)) or (
        preferences.is_file()
        and not _is_reparse_point(preferences.parent)
        and not _is_reparse_point(preferences)
    )


def live_chromium_pids_for_path(path: Path) -> list[int]:
    from core.window_icon_badge import chrome_pids_for_user_data_dir

    return chrome_pids_for_user_data_dir(str(path))


def _migrate_legacy_profile_dirs_once() -> None:
    """Copy only closed, valid Chromium folders; leave legacy folders intact."""
    if not getattr(sys, "frozen", False) or not PROFILES_JSON.exists():
        return
    try:
        rows = _read_profile_rows(PROFILES_JSON)
    except ProfilePersistenceError:
        return
    for row in rows:
        try:
            name = validate_profile_name(row.get("profile_dir") or "")
        except ValueError:
            continue
        destination = PROFILES_ROOT / name
        if destination.exists():
            continue
        for root in profile_data_roots()[1:]:
            source = root / "profiles" / name
            if not source.is_dir() or _is_reparse_point(source):
                continue
            temp = destination.with_name(f"{name}.migrate.tmp")
            try:
                if live_chromium_pids_for_path(source):
                    logger.warning("Không sao chép profile đang mở: %s", source)
                    break
                if not _is_chromium_profile_dir(source):
                    logger.warning("Bỏ qua folder profile cũ không hợp lệ: %s", source)
                    break
                destination.parent.mkdir(parents=True, exist_ok=True)
                fd, temp_name = tempfile.mkstemp(
                    prefix=f".{name}.migrate.",
                    suffix=".tmp",
                    dir=destination.parent,
                )
                os.close(fd)
                temp = Path(temp_name)
                temp.unlink(missing_ok=True)
                try:
                    shutil.copytree(source, temp, symlinks=False)
                    temp.replace(destination)
                finally:
                    if temp.exists():
                        shutil.rmtree(temp)
                logger.warning("Đã sao chép folder profile từ %s sang %s", source, destination)
            except OSError as exc:
                logger.warning("Không sao chép được folder profile cũ %s: %s", source, exc)
                try:
                    if temp.exists():
                        shutil.rmtree(temp)
                except OSError:
                    pass
            break


def _ensure_legacy_profile_migration() -> None:
    _migrate_legacy_metadata_once()
    _migrate_legacy_profile_dirs_once()


def _profiles_read_path() -> Path:
    return _metadata_read_path(PROFILES_JSON, "profiles.json")


def _deleted_profiles_read_path() -> Path:
    return _metadata_read_path(DELETED_PROFILES_JSON, "deleted_profiles.json")


def profile_data_root_label() -> str:
    """Return a user-facing root label without exposing unrelated paths."""
    return str(PROFILES_ROOT.parent)


def _profile_snapshot_path(profile_dir: str | Path, profiles_root: Path | None = None) -> Path:
    root = profiles_root or PROFILES_ROOT
    return root / validate_profile_name(str(profile_dir)) / _PROFILE_SNAPSHOT_FILENAME


def _write_profile_snapshot(profile_dir: str, row: dict) -> None:
    try:
        path = _profile_snapshot_path(profile_dir)
        path.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write_profile_rows(path, [{key: value for key, value in row.items() if key != "deleted_at"}])
    except Exception as exc:
        logger.warning("Không ghi được snapshot metadata profile %s: %s", profile_dir, exc)


def _read_profile_snapshot(profile_dir: str, profiles_root: Path | None = None) -> dict | None:
    try:
        rows = _read_profile_rows(_profile_snapshot_path(profile_dir, profiles_root))
    except (ProfilePersistenceError, ValueError):
        return None
    return rows[0] if rows else None


def _snapshot_seed(row: dict | None) -> int | None:
    if not row:
        return None
    value = row.get("fingerprint_seed")
    try:
        if isinstance(value, bool) or value is None:
            return None
        seed = int(str(value))
    except (TypeError, ValueError):
        return None
    return seed if 0 <= seed <= 0xFFFFFFFF else None


def _recover_row_from_snapshot(profile_dir: str, profiles_root: Path) -> dict | None:
    row = _read_profile_snapshot(profile_dir, profiles_root)
    if not row or str(row.get("profile_dir") or "") != profile_dir:
        return None
    row = dict(row)
    row["profile_dir"] = profile_dir
    row.pop("deleted_at", None)
    return row


def _write_profile_snapshots(rows: list[dict]) -> None:
    for row in rows:
        profile_dir = str(row.get("profile_dir") or "").strip()
        if profile_dir:
            _write_profile_snapshot(profile_dir, row)


def new_fingerprint_seed(identity_email: str = "") -> int:
    """Create a stable identity seed from email, otherwise a fresh per-profile seed."""
    if identity_email:
        return _derive_seed_from_identity(f"email:{identity_email}")
    return secrets.randbits(32)


def normalize_fingerprint_seed(value, profile_name: str = "", identity_email: str = "") -> int:
    try:
        seed = int(value)
        if 0 <= seed <= 0xFFFFFFFF:
            return seed
    except Exception:
        pass
    if identity_email:
        return new_fingerprint_seed(identity_email)
    return _derive_legacy_fingerprint_seed(profile_name)


def validate_display_profile_name(profile_name: str) -> str:
    """Return a user-facing display name. It is never used as a folder path."""
    name = re.sub(r"\s+", " ", str(profile_name or "").strip())
    if not name:
        raise ValueError("T\u00ean h\u1ed3 s\u01a1 kh\u00f4ng \u0111\u01b0\u1ee3c \u0111\u1ec3 tr\u1ed1ng")
    if len(name) > _DISPLAY_NAME_MAX_LEN:
        raise ValueError(f"T\u00ean h\u1ed3 s\u01a1 kh\u00f4ng \u0111\u01b0\u1ee3c d\u00e0i qu\u00e1 {_DISPLAY_NAME_MAX_LEN} k\u00fd t\u1ef1")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
        raise ValueError(f"T\u00ean h\u1ed3 s\u01a1 ch\u1ee9a k\u00fd t\u1ef1 \u0111i\u1ec1u khi\u1ec3n kh\u00f4ng h\u1ee3p l\u1ec7: {profile_name!r}")
    return name


def validate_profile_name(profile_name: str) -> str:
    """Return a safe profile folder name or raise ValueError."""
    name = str(profile_name or "").strip()
    if not name:
        raise ValueError("Tên hồ sơ không được để trống")
    if name in {".", ".."} or ".." in name:
        raise ValueError(f"Tên hồ sơ không hợp lệ: {profile_name!r}")
    if "/" in name or "\\" in name or ":" in name:
        raise ValueError(f"Tên hồ sơ không hợp lệ: {profile_name!r}")
    if name.endswith(".") or name.endswith(" "):
        raise ValueError(f"Tên hồ sơ không hợp lệ: {profile_name!r}")
    if not _PROFILE_NAME_RE.fullmatch(name):
        raise ValueError(f"Tên hồ sơ không hợp lệ: {profile_name!r}")
    if name.split(".")[0].upper() in _WINDOWS_RESERVED_NAMES:
        raise ValueError(f"Tên hồ sơ trùng tên hệ thống Windows: {profile_name!r}")
    return name


def _profile_match_key(profile_name: str) -> str:
    """Normalize profile names for Excel matching without renaming folders."""
    name = validate_display_profile_name(profile_name)
    return re.sub(r"\s+", " ", name).casefold()


def _coerce_legacy_profile_row(raw: dict) -> tuple[dict, bool]:
    """Recover one old row accidentally serialized as a Python dict string."""
    row = dict(raw)
    value = row.get("profile_name")
    if not isinstance(value, str):
        raise ValueError("profile_name phải là chuỗi")
    try:
        parsed = ast.literal_eval(value)
    except (SyntaxError, ValueError):
        return row, False
    if not isinstance(parsed, dict) or not isinstance(parsed.get("profile_name"), str):
        return row, False
    for key in _DEFAULTS:
        if key in parsed and key not in {"id", "profile_dir"}:
            row[key] = parsed[key]
    return row, True


def load_profiles() -> list[dict]:
    """Đọc profiles từ JSON. Tạo file mới nếu chưa có."""
    _ensure_legacy_profile_migration()
    metadata_path = _profiles_read_path()
    if not metadata_path.exists():
        return []
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8-sig"))
        profiles = data if isinstance(data, list) else data.get("profiles", [])
        if not isinstance(profiles, list) or any(not isinstance(profile, dict) for profile in profiles):
            raise ProfilePersistenceError(f"Định dạng {metadata_path.name} không hợp lệ")
        normalized_rows: list[tuple[dict, bool]] = []
        changed = False
        for p in profiles:
            try:
                raw_row, row_changed = _coerce_legacy_profile_row(p)
                row = dict(_DEFAULTS)
                row.update(raw_row)
                row["profile_name"] = validate_display_profile_name(row.get("profile_name", ""))
                from core.engines.registry import normalize_engine_id
                raw_engine = raw_row.get("engine", _DEFAULTS["engine"])
                if not isinstance(raw_engine, str):
                    raise ValueError("engine phải là chuỗi")
                row["engine"] = normalize_engine_id(raw_engine)
            except (TypeError, ValueError) as exc:
                logger.warning("Bỏ qua hồ sơ không hợp lệ trong profiles.json: %s", exc)
                changed = True
                continue
            changed = changed or row_changed
            if not row["id"]:
                row["id"] = _new_id()
                changed = True
            if not row.get("profile_dir"):
                row["profile_dir"] = _legacy_profile_dir_or_new(row["profile_name"], row.get("id") or _new_id())
                changed = True
            else:
                try:
                    row["profile_dir"] = validate_profile_name(row.get("profile_dir", ""))
                except ValueError:
                    row["profile_dir"] = _legacy_profile_dir_or_new(row["profile_name"], row.get("id") or _new_id())
                    changed = True
            identity_email = extract_identity_email(row.get("email", ""), row.get("gmail", ""), row.get("google_keywords", ""))
            old_seed = row.get("fingerprint_seed")
            row["fingerprint_seed"] = normalize_fingerprint_seed(
                row.get("fingerprint_seed"), row.get("profile_name", ""), identity_email
            )
            if str(old_seed if old_seed is not None else "") != str(row["fingerprint_seed"]):
                changed = True
            normalized_rows.append((row, row_changed))
        result = []
        seen_names: set[str] = set()
        for row, row_changed in sorted(normalized_rows, key=lambda item: item[1]):
            name_key = _profile_match_key(row["profile_name"])
            if name_key in seen_names:
                logger.warning("Bỏ qua hồ sơ trùng tên trong profiles.json: %s", row["profile_name"])
                changed = True
                continue
            seen_names.add(name_key)
            result.append(row)

        # Auto-recover any on-disk profiles with .browsermulti-profile.json not in profiles.json
        existing_ids = {r.get("id") for r in result if r.get("id")}
        for root in profile_data_roots():
            for p_sub in [root / "profiles", root]:
                if not p_sub.is_dir():
                    continue
                try:
                    for c in p_sub.iterdir():
                        if not c.is_dir():
                            continue
                        meta_path = c / ".browsermulti-profile.json"
                        if meta_path.exists():
                            try:
                                m_data = json.loads(meta_path.read_text(encoding="utf-8-sig"))
                                m_row = m_data[0] if isinstance(m_data, list) and m_data else m_data
                                m_id = m_row.get("id")
                                m_name = m_row.get("profile_name")
                                if m_id and m_id not in existing_ids and _profile_match_key(m_name) not in seen_names:
                                    raw_row, _ = _coerce_legacy_profile_row(m_row)
                                    rec_row = dict(_DEFAULTS)
                                    rec_row.update(raw_row)
                                    rec_row["profile_name"] = validate_display_profile_name(rec_row.get("profile_name", ""))
                                    seen_names.add(_profile_match_key(rec_row["profile_name"]))
                                    existing_ids.add(m_id)
                                    result.append(rec_row)
                                    changed = True
                            except Exception:
                                pass
                except Exception:
                    pass

        if changed:
            save_profiles(result)
        else:
            _write_profile_snapshots(result)
        return result
    except ProfilePersistenceError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        logger.error("Lỗi đọc %s: %s", metadata_path, exc)
        raise ProfilePersistenceError(f"Không đọc được {metadata_path.name}: {metadata_path}") from exc
    except Exception as exc:
        logger.exception("Lỗi xử lý %s", metadata_path)
        raise ProfilePersistenceError(f"Không xử lý được {metadata_path.name}: {metadata_path}") from exc

def save_profiles(profiles: list[dict]) -> bool:
    """Ghi toàn bộ profiles ra JSON — dùng atomic write để tránh corrupt."""
    with _PROFILE_MUTATION_LOCK:
        try:
            _protect_empty_profile_write(profiles)
            # A stale load-modify-save caller must not resurrect a row after delete.
            tombstoned_ids = {
                _case_key(row.get("id"))
                for row in _read_profile_rows(_deleted_profiles_read_path())
            }
            safe_profiles = [
                row for row in profiles
                if not _case_key(row.get("id")) or _case_key(row.get("id")) not in tombstoned_ids
            ]
            content = json.dumps(safe_profiles, ensure_ascii=False, indent=2)
            # Ghi vào file tạm cùng thư mục rồi rename — atomic trên Windows
            PROFILES_JSON.parent.mkdir(parents=True, exist_ok=True)
            _atomic_write_text(PROFILES_JSON, content)
            _write_profile_snapshots(safe_profiles)
            return True
        except Exception as exc:
            logger.error("Lỗi ghi profiles.json: %s", exc)
            return False


def normalize_proxy_input(value: str | None, proxy_scheme: str | None = "") -> str:
    """Normalize proxy formats while preserving raw protocol detection state."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    scheme = normalize_proxy_scheme(proxy_scheme)
    if scheme:
        return canonical_proxy_with_scheme(raw, scheme)
    explicit = proxy_scheme_from_input(raw)
    if explicit:
        return canonical_proxy_with_scheme(raw, explicit)
    return canonical_proxy_with_scheme(raw, "http")


def normalize_legacy_proxy_input(value: str | None) -> str:
    """Keep legacy import behavior while new profile input waits for detection."""
    return canonical_proxy_with_scheme(value, "http")


def normalize_profile_proxy_scheme(proxy: str | None, proxy_scheme: str | None = "") -> str:
    explicit = proxy_scheme_from_input(proxy)
    if explicit:
        return explicit
    return normalize_proxy_scheme(proxy_scheme)


def add_profile(profile_name: str, proxy: str = "", group: str = "Default",
                locale: str = "", action: str = "nurture_full",
                google_keywords: str = "", identity_email: str = "", proxy_scheme: str = "") -> dict:
    """Tạo profile mới, thêm vào JSON, trả về dict đã tạo."""
    profile_name = validate_display_profile_name(profile_name)
    with _PROFILE_MUTATION_LOCK:
        profiles = load_profiles()
        profile_id = _new_id()
        identity_email = extract_identity_email(identity_email, google_keywords)
        row = dict(_DEFAULTS)
        row.update({
            "id": profile_id,
            "profile_name": profile_name,
            "profile_dir": profile_dir_for_identity(profile_name, identity_email, profile_id),
            "proxy": normalize_proxy_input(proxy, proxy_scheme),
            "proxy_scheme": normalize_profile_proxy_scheme(proxy, proxy_scheme),
            "group": group,
            "locale": locale,
            "action": action,
            "google_keywords": google_keywords,
            "fingerprint_seed": new_fingerprint_seed(identity_email),
        })
        profiles.append(row)
        if not save_profiles(profiles):
            raise ProfilePersistenceError("Không lưu được hồ sơ mới vào bộ nhớ")
        return row


class ProfileStoreError(RuntimeError):
    """Base error for profile metadata transactions."""


class ProfileNotFoundError(ProfileStoreError):
    pass


class ProfileConflictError(ProfileStoreError):
    pass


class ProfilePersistenceError(ProfileStoreError):
    pass


def _read_profile_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        rows = data if isinstance(data, list) else data.get("profiles", [])
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError("metadata must be a list of objects")
        return [dict(row) for row in rows]
    except Exception as exc:
        logger.error("Lỗi đọc %s: %s", path.name, exc)
        raise ProfilePersistenceError(f"Không đọc được {path.name}") from exc


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.stem}.", suffix=".tmp", dir=path.parent)
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        tmp.write_text(content, encoding="utf-8")
        for attempt in range(4):
            try:
                tmp.replace(path)
                return
            except (PermissionError, FileNotFoundError) as exc:
                if attempt == 3:
                    logger.warning("Metadata replace retry exhausted for %s: %s", path, exc)
                    break
                time.sleep(0.05 * (2 ** attempt))
        fd, fallback_name = tempfile.mkstemp(prefix=f".{path.stem}.recovery.", suffix=".tmp", dir=path.parent)
        os.close(fd)
        fallback = Path(fallback_name)
        try:
            fallback.write_text(content, encoding="utf-8")
            try:
                fallback.replace(path)
            except (PermissionError, FileNotFoundError):
                path.write_text(content, encoding="utf-8")
        except OSError as exc:
            raise ProfilePersistenceError(f"Không thể ghi metadata bị khóa: {path.name}") from exc
        finally:
            try:
                fallback.unlink(missing_ok=True)
            except OSError:
                pass
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass


def _atomic_write_profile_rows(path: Path, rows: list[dict]) -> None:
    try:
        _atomic_write_text(path, json.dumps(rows, ensure_ascii=False, indent=2))
    except Exception as exc:
        logger.error("Lỗi ghi %s: %s", path.name, exc)
        raise ProfilePersistenceError(f"Không ghi được {path.name}") from exc


def _case_key(value) -> str:
    return str(value or "").strip().casefold()


def load_deleted_profiles() -> list[dict]:
    """Read tombstones that do not already exist in active metadata."""
    with _PROFILE_MUTATION_LOCK:
        active_ids = {_case_key(row.get("id")) for row in _read_profile_rows(_profiles_read_path())}
        return [
            row
            for row in _read_profile_rows(_deleted_profiles_read_path())
            if _case_key(row.get("id")) not in active_ids
        ]



def recovery_metadata(profile: dict) -> dict:
    """Return recovery-safe public metadata without proxy credentials."""
    profile_dir = str(profile.get("profile_dir") or "")
    return {
        "id": str(profile.get("id") or ""),
        "profile_name": str(profile.get("profile_name") or ""),
        "profile_dir": profile_dir,
        "fingerprint_seed": profile.get("fingerprint_seed"),
        "deleted_at": str(profile.get("deleted_at") or ""),
    }


def recovery_root_metadata() -> dict[str, str]:
    return {"data_root": profile_data_root_label()}


def delete_profile(profile_id: str) -> dict:
    """Write a full tombstone before removing active metadata; never touch its folder."""
    profile_key = _case_key(profile_id)
    with _PROFILE_MUTATION_LOCK:
        profiles = _read_profile_rows(_profiles_read_path())
        source = next((row for row in profiles if _case_key(row.get("id")) == profile_key), None)
        if source is None:
            raise ProfileNotFoundError("Không tìm thấy hồ sơ")

        tombstone = dict(source)
        tombstone["deleted_at"] = datetime.now(timezone.utc).isoformat()
        deleted = _read_profile_rows(_deleted_profiles_read_path())
        deleted = [row for row in deleted if _case_key(row.get("id")) != profile_key]
        deleted.append(tombstone)

        # Ordering is deliberate: a later active-file failure may leave duplicate
        # metadata, but can never lose the only row needed for recovery.
        _atomic_write_profile_rows(DELETED_PROFILES_JSON, deleted)
        _atomic_write_profile_rows(
            PROFILES_JSON,
            [row for row in profiles if _case_key(row.get("id")) != profile_key],
        )
        return tombstone


def restore_deleted_profile(profile_id: str) -> dict:
    """Restore exact tombstoned metadata after case-insensitive conflict checks."""
    profile_key = _case_key(profile_id)
    with _PROFILE_MUTATION_LOCK:
        deleted = _read_profile_rows(_deleted_profiles_read_path())
        tombstone = next((row for row in deleted if _case_key(row.get("id")) == profile_key), None)
        if tombstone is None:
            raise ProfileNotFoundError("Không tìm thấy hồ sơ đã xóa")

        profiles = _read_profile_rows(_profiles_read_path())
        restored = dict(tombstone)
        restored.pop("deleted_at", None)
        conflicts = (
            ("ID", "id"),
            ("tên", "profile_name"),
            ("thư mục", "profile_dir"),
        )
        for label, field in conflicts:
            value = _case_key(restored.get(field))
            if value and any(_case_key(row.get(field)) == value for row in profiles):
                raise ProfileConflictError(f"Xung đột {label} hồ sơ")

        new_profiles = [*profiles, restored]
        _atomic_write_profile_rows(PROFILES_JSON, new_profiles)
        try:
            _atomic_write_profile_rows(
                DELETED_PROFILES_JSON,
                [row for row in deleted if _case_key(row.get("id")) != profile_key],
            )
        except ProfilePersistenceError:
            try:
                _atomic_write_profile_rows(PROFILES_JSON, profiles)
            except ProfilePersistenceError:
                logger.exception("Không rollback được profiles.json sau lỗi restore %s", profile_id)
            raise
        return restored


def _is_reparse_point(path: Path) -> bool:
    try:
        attrs = getattr(os.lstat(path), "st_file_attributes", 0)
        flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
        return path.is_symlink() or bool(attrs & flag)
    except OSError:
        return True


def _reject_nested_reparse_points(root: Path) -> None:
    """Reject links/junctions before copying an external browser folder."""
    if _is_reparse_point(root):
        raise ValueError("Folder Chromium chứa liên kết hoặc junction không an toàn")
    try:
        for directory, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
            current = Path(directory)
            for name in [*dirnames, *filenames]:
                if _is_reparse_point(current / name):
                    raise ValueError("Folder Chromium chứa liên kết hoặc junction không an toàn")
    except OSError as exc:
        raise ProfilePersistenceError("Không kiểm tra được folder Chromium trước khi sao chép") from exc


def _referenced_profile_dirs(active: list[dict], deleted: list[dict]) -> set[str]:
    return {
        key
        for row in [*active, *deleted]
        if (key := _case_key(row.get("profile_dir")))
    }


def _validated_profiles_root(root_path: str | Path | None = None) -> Path:
    root = PROFILES_ROOT if (root_path is None or not str(root_path).strip()) else Path(root_path).expanduser()
    try:
        resolved = root.resolve(strict=True)
    except OSError as exc:
        raise ProfileNotFoundError("Không tìm thấy thư mục profiles") from exc
    if _is_reparse_point(root) or not resolved.is_dir():
        raise ProfileNotFoundError("Đường dẫn folder profile không hợp lệ")
    if resolved.name.casefold() == "profiles":
        return resolved
    if _is_chromium_profile_dir(resolved):
        return resolved.parent
    children = [child for child in resolved.iterdir() if child.is_dir() and not _is_reparse_point(child) and _is_chromium_profile_dir(child)]
    if children:
        return resolved
    raise ProfileNotFoundError("Folder không chứa folder Chromium hợp lệ")


def _validated_orphan_path(profile_dir: str, referenced_dirs: set[str], profiles_root: Path | None = None) -> Path:
    raw_name = str(profile_dir or "")
    name = validate_profile_name(raw_name)
    if name != raw_name or name.casefold() == ".tmp" or name.casefold().endswith(".tmp"):
        raise ValueError("Thư mục hồ sơ không hợp lệ")
    root_path = _validated_profiles_root(profiles_root)
    candidate = root_path / name
    if _is_reparse_point(candidate) or not candidate.is_dir():
        raise ProfileNotFoundError("Không tìm thấy thư mục hồ sơ hợp lệ")
    try:
        root = root_path.resolve(strict=True)
        resolved = candidate.resolve(strict=True)
    except OSError as exc:
        raise ProfileNotFoundError("Không tìm thấy thư mục hồ sơ hợp lệ") from exc
    if os.path.normcase(str(resolved.parent)) != os.path.normcase(str(root)):
        raise ValueError("Thư mục hồ sơ phải nằm trực tiếp trong profiles")
    if _case_key(name) in referenced_dirs:
        raise ProfileConflictError("Thư mục hồ sơ đã được tham chiếu")
    local_state = resolved / "Local State"
    preferences = resolved / "Default" / "Preferences"
    valid_marker = (
        local_state.is_file() and not _is_reparse_point(local_state)
    ) or (
        preferences.is_file()
        and not _is_reparse_point(preferences.parent)
        and not _is_reparse_point(preferences)
    )
    if not valid_marker:
        raise ValueError("Thư mục không có dấu hiệu dữ liệu Chromium")
    return resolved


def list_orphan_profiles(profiles_root: str | Path | None = None, profiles_roots: list[str] | None = None) -> list[dict[str, str]]:
    """List valid immediate Chromium profile folders from one or many arbitrary roots."""
    if profiles_root is not None and not str(profiles_root).strip() and not profiles_roots:
        raise ProfileNotFoundError("Không tìm thấy folder profile")
    if profiles_roots:
        root_specs = [(Path(root).expanduser(), str(Path(root).expanduser())) for root in profiles_roots]
    elif profiles_root is None:
        root_specs = [(PROFILES_ROOT, "")]
    else:
        root_specs = [(Path(profiles_root).expanduser(), str(Path(profiles_root).expanduser()))]
    normalized_specs: list[tuple[Path, str, set[str] | None]] = []
    for candidate_root, root_label in root_specs:
        if _is_reparse_point(candidate_root):
            raise ProfileNotFoundError("Folder nguồn chứa liên kết hoặc junction không an toàn")
        resolved = candidate_root.resolve(strict=True)
        if _is_reparse_point(resolved):
            raise ProfileNotFoundError("Folder nguồn chứa liên kết hoặc junction không an toàn")
        if _is_chromium_profile_dir(resolved):
            normalized_specs.append((resolved.parent, str(resolved.parent), {resolved.name.casefold()}))
        else:
            normalized_specs.append((resolved, str(resolved), None))
    root_specs = normalized_specs
    with _PROFILE_MUTATION_LOCK:
        try:
            active = _read_profile_rows(_profiles_read_path())
        except ProfilePersistenceError as exc:
            logger.warning("Không đọc được profiles.json khi quét recovery: %s", exc)
            active = []
        try:
            deleted = _read_profile_rows(_deleted_profiles_read_path())
        except ProfilePersistenceError as exc:
            logger.warning("Không đọc được deleted_profiles.json khi quét recovery: %s", exc)
            deleted = []
        referenced = _referenced_profile_dirs(active, deleted)
        result: list[dict[str, str]] = []
        for candidate_root, root_label, selected_names in root_specs:
            if not candidate_root.is_dir():
                if profiles_root is not None:
                    raise ProfileNotFoundError("Không tìm thấy thư mục profiles")
                continue
            root = _validated_profiles_root(candidate_root)
            try:
                children = list(root.iterdir())
            except OSError as exc:
                raise ProfilePersistenceError("Không quét được thư mục profiles") from exc
            for child in children:
                if selected_names is not None and child.name.casefold() not in selected_names:
                    continue
                try:
                    _validated_orphan_path(child.name, referenced, root)
                except (ValueError, ProfileNotFoundError, ProfileConflictError):
                    continue
                result.append({
                    "profile_dir": child.name,
                    **({"data_root": root_label, "profiles_root": str(root)} if root_label else {}),
                })
        unique = {(row["profile_dir"].casefold(), row.get("profiles_root", "").casefold()): row for row in result}
        return sorted(unique.values(), key=lambda row: (row["profile_dir"].casefold(), row.get("profiles_root", "").casefold()))


def live_chromium_pids_for_profile_dir(profile_dir: str, profiles_root: str | Path | None = None) -> list[int]:
    """Return Chromium PIDs using exact profile folder without opening it."""
    from core.window_icon_badge import chrome_pids_for_user_data_dir

    root = _validated_profiles_root(profiles_root)
    return chrome_pids_for_user_data_dir(str(root / validate_profile_name(profile_dir)))


def adopt_orphan_profile(
    profile_dir: str,
    profile_name: str,
    group: str = "Default",
    fingerprint_seed: int | None = None,
    accept_new_fingerprint: bool = False,
    profiles_root: str | Path | None = None,
) -> dict:
    """Adopt an orphan folder in place without reading secrets or moving data."""
    display_name = validate_display_profile_name(profile_name)
    if fingerprint_seed is not None:
        if isinstance(fingerprint_seed, bool) or not 0 <= int(fingerprint_seed) <= 0xFFFFFFFF:
            raise ValueError("fingerprint_seed phải là uint32")
        seed = int(fingerprint_seed)
        fingerprint_changed = False
    else:
        if not accept_new_fingerprint:
            raise ValueError("Cần xác nhận tạo fingerprint mới")
        seed = new_fingerprint_seed()
        fingerprint_changed = True

    with _PROFILE_MUTATION_LOCK:
        profiles = _read_profile_rows(_profiles_read_path())
        deleted = _read_profile_rows(_deleted_profiles_read_path())
        referenced = _referenced_profile_dirs(profiles, deleted)
        selected_root = Path(profiles_root).expanduser() if profiles_root else None
        path = _validated_orphan_path(profile_dir, referenced, profiles_root=selected_root)
        if selected_root is None:
            live_pids = live_chromium_pids_for_profile_dir(path.name)
        else:
            live_pids = live_chromium_pids_for_profile_dir(path.name, selected_root)
        if live_pids:
            raise ProfileConflictError("Thư mục đang được Chromium sử dụng")

        name_key = _case_key(display_name)
        if any(_case_key(row.get("profile_name")) == name_key for row in [*profiles, *deleted]):
            raise ProfileConflictError("Tên hồ sơ đã tồn tại")
        existing_ids = {_case_key(row.get("id")) for row in [*profiles, *deleted]}
        profile_id = _new_id()
        while _case_key(profile_id) in existing_ids:
            profile_id = _new_id()

        destination = PROFILES_ROOT / path.name
        copied_destination = False
        if selected_root is not None and path != destination:
            if destination.exists():
                raise ProfileConflictError("Thư mục profile đích đã tồn tại")
            temp = destination.with_name(f"{path.name}.adopt.tmp")
            try:
                destination.parent.mkdir(parents=True, exist_ok=True)
                if temp.exists():
                    shutil.rmtree(temp)
                shutil.copytree(path, temp, symlinks=False)
                if not _is_chromium_profile_dir(temp):
                    raise ValueError("Folder Chromium sao chép không hợp lệ")
                temp.replace(destination)
                copied_destination = True
            except OSError as exc:
                try:
                    if temp.exists():
                        shutil.rmtree(temp)
                except OSError:
                    pass
                raise ProfilePersistenceError("Không sao chép được folder Chromium để khôi phục") from exc

        row = dict(_DEFAULTS)
        row.update({
            "id": profile_id,
            "profile_name": display_name,
            "profile_dir": path.name,
            "group": str(group or "Default").strip() or "Default",
            "fingerprint_seed": seed,
        })
        try:
            _atomic_write_profile_rows(PROFILES_JSON, [*profiles, row])
        except ProfilePersistenceError:
            if copied_destination:
                try:
                    shutil.rmtree(destination)
                except OSError:
                    logger.exception("Không xóa được folder profile đã sao chép sau lỗi metadata: %s", destination)
            raise
        return {
            "profile": row,
            "fingerprint_changed": fingerprint_changed,
            "new_fingerprint_seed": seed if fingerprint_changed else None,
        }


def duplicate_profile(profile_id: str) -> dict | None:
    """Nhân bản metadata profile; browser folder sẽ được tạo khi mở profile mới."""
    with _PROFILE_MUTATION_LOCK:
        profiles = load_profiles()
        source = next((p for p in profiles if p.get("id") == profile_id), None)
        if not source:
            return None

        base_name = validate_display_profile_name(source.get("profile_name", "Profile"))
        existing = {str(p.get("profile_name", "")).casefold() for p in profiles}
        for index in range(1, 1000):
            candidate = validate_display_profile_name(f"{base_name} Copy" if index == 1 else f"{base_name} Copy {index}")
            if candidate.casefold() not in existing:
                break
        else:
            raise ValueError("Không thể tạo tên hồ sơ nhân bản duy nhất")

        row = dict(source)
        row_id = _new_id()
        row.update({
            "id": row_id,
            "profile_name": candidate,
            "profile_dir": profile_dir_for_identity(candidate, "", row_id),
            "fingerprint_seed": new_fingerprint_seed(),
            "last_run_status": "idle",
            "last_run_time": "",
            "last_run_error": "",
        })
        profiles.append(row)
        if not save_profiles(profiles):
            return None
        return row


def update_profile(profile_id: str, **kwargs) -> bool:
    """Cập nhật một hoặc nhiều field của profile theo id."""
    if "engine" in kwargs:
        from core.engines.registry import normalize_engine_id
        if not isinstance(kwargs["engine"], str):
            raise ValueError("engine phải là chuỗi")
        kwargs["engine"] = normalize_engine_id(kwargs["engine"])
    if "profile_name" in kwargs:
        if not isinstance(kwargs["profile_name"], str):
            raise ValueError("profile_name phải là chuỗi")
        kwargs["profile_name"] = validate_display_profile_name(kwargs["profile_name"])
    if "proxy" in kwargs:
        proxy = str(kwargs["proxy"] or "")
        scheme = kwargs.get("proxy_scheme", "")
        kwargs["proxy"] = normalize_proxy_input(proxy, scheme)
        kwargs["proxy_scheme"] = normalize_profile_proxy_scheme(proxy, scheme) if proxy else ""
    elif "proxy_scheme" in kwargs:
        kwargs["proxy_scheme"] = normalize_proxy_scheme(kwargs["proxy_scheme"])
    with _PROFILE_MUTATION_LOCK:
        profiles = load_profiles()
        for p in profiles:
            if p.get("id") == profile_id:
                p.update(kwargs)
                return save_profiles(profiles)
        return False


def update_run_result(
    profile_id: str,
    status: str,
    error: str | None = None,
    crash_snapshot: dict[str, Any] | None = None,
) -> bool:
    """Persist the latest runtime result for dashboard/profile views."""
    with _PROFILE_MUTATION_LOCK:
        profiles = load_profiles()
        now = datetime.now(timezone.utc).isoformat()
        for p in profiles:
            if p.get("id") == profile_id or p.get("profile_name") == profile_id:
                p["last_run_status"] = status
                p["last_run_time"] = now
                p["last_run_error"] = error or ""
                if crash_snapshot is not None:
                    p["last_crash_snapshot"] = dict(crash_snapshot)
                elif status in {"opening", "running", "success", "ready", "idle"}:
                    p["last_crash_snapshot"] = None
                return save_profiles(profiles)
        return False


def clear_profile_run_error(profile_id: str, status: str = "idle") -> bool:
    """Clear stale manual-run errors without changing automation workflow state."""
    return update_run_result(profile_id, status, None)


def update_proxy_reputation(profile_id: str, result: dict) -> bool:
    """Persist derived proxy reputation onto a profile (no secrets)."""
    with _PROFILE_MUTATION_LOCK:
        profiles = load_profiles()
        now = datetime.now(timezone.utc).isoformat()
        for p in profiles:
            if p.get("id") == profile_id or p.get("profile_name") == profile_id:
                score = result.get("score")
                p["proxy_score"] = int(score) if isinstance(score, (int, float)) else None
                p["proxy_risk"] = str(result.get("risk") or "")
                p["proxy_country"] = str(result.get("country_code") or "")
                p["proxy_ip_type"] = str(result.get("ip_type") or "")
                p["proxy_asn"] = str(result.get("asn") or "")
                p["proxy_checked_at"] = now
                return save_profiles(profiles)
        return False


def persist_proxy_test_result(profile_id: str, result: dict) -> bool:
    """Persist one browser-compatible probe atomically, including detected protocol."""
    if not result.get("ok") or not result.get("normalized_proxy") or result.get("browser_compatible") is False:
        return False
    with _PROFILE_MUTATION_LOCK:
        profiles = load_profiles()
        now = datetime.now(timezone.utc).isoformat()
        for profile in profiles:
            if profile.get("id") != profile_id and profile.get("profile_name") != profile_id:
                continue
            proxy = str(result["normalized_proxy"])
            profile["proxy"] = normalize_proxy_input(proxy, result.get("detected_scheme") or "")
            profile["proxy_scheme"] = normalize_profile_proxy_scheme(proxy, result.get("detected_scheme") or "")
            score = result.get("score")
            profile["proxy_score"] = int(score) if isinstance(score, (int, float)) else None
            profile["proxy_risk"] = str(result.get("risk") or "")
            profile["proxy_country"] = str(result.get("country_code") or "")
            profile["proxy_ip_type"] = str(result.get("ip_type") or "")
            profile["proxy_asn"] = str(result.get("asn") or "")
            profile["proxy_checked_at"] = now
            return save_profiles(profiles)
        return False


def set_proxy_login_flag(profile_id: str, flag: str) -> bool:
    """Record that a profile hit a login challenge (verify/captcha/phone)."""
    with _PROFILE_MUTATION_LOCK:
        profiles = load_profiles()
        for p in profiles:
            if p.get("id") == profile_id or p.get("profile_name") == profile_id:
                p["proxy_login_flag"] = str(flag or "")
                return save_profiles(profiles)
        return False


def reorder_profiles(ordered_ids: list[str]) -> list[dict] | None:
    """Reorder profiles list exactly according to ordered_ids.

    Validates that ordered_ids contains exactly the same set of IDs as the
    current profiles (no missing, no duplicates, no extras). If valid, rewrites
    the list and persists atomically. Returns the new ordered list on success,
    or None on failure.
    """
    if not isinstance(ordered_ids, list) or not ordered_ids:
        return None
    with _PROFILE_MUTATION_LOCK:
        profiles = load_profiles()
        if not profiles:
            return None
        current_ids = [str(p.get("id")) for p in profiles if p.get("id")]
        want = [str(x) for x in ordered_ids]
        if len(want) != len(current_ids) or set(want) != set(current_ids):
            logger.warning("Reorder rejected: ID set mismatch")
            return None
        # Build lookup for fast access while preserving original dict objects
        by_id = {str(p.get("id")): p for p in profiles if p.get("id")}
        new_list = []
        for pid in want:
            p = by_id.get(pid)
            if p:
                new_list.append(p)
        if len(new_list) != len(profiles):
            return None
        if save_profiles(new_list):
            return new_list
        return None


def get_groups(profiles: list[dict]) -> list[str]:
    """Trả về danh sách nhóm duy nhất, sắp xếp."""
    groups = sorted({p.get("group", "Default") or "Default" for p in profiles})
    return groups or ["Default"]


def merge_excel_data(profiles: list[dict], excel_rows: list[dict]) -> list[dict]:
    """
    Merge Excel data into existing profiles by profile_name only.
    Rows that do not match an existing app profile are ignored; importing Excel
    must never create browser profiles implicitly.
    """
    upload_fields = {
        "google_keywords", "yt_search_topics", "target_video_titles", "youtube_preferred_channel",
        "video_path", "title", "description", "thumbnail_path",
        "visibility", "schedule_date", "schedule_time", "pinned_comment",
        "pre_nurture_keyword", "post_nurture_keyword", "drive_upload_path",
        "action", "proxy", "proxy_scheme", "locale",
    }
    excel_by_name: dict[str, dict] = {}
    for row in excel_rows:
        raw_name = row.get("profile_name", "")
        if not str(raw_name).strip():
            continue
        try:
            name = validate_display_profile_name(raw_name)
        except ValueError as exc:
            logger.warning("Skip Excel row with invalid profile name: %s", exc)
            continue
        excel_by_name[_profile_match_key(name)] = row

    updated = 0
    matched_keys: set[str] = set()
    for profile in profiles:
        try:
            match_key = _profile_match_key(profile.get("profile_name", ""))
        except ValueError as exc:
            logger.warning("Skip stored profile with invalid name while merging Excel: %s", exc)
            continue
        excel_row = excel_by_name.get(match_key)
        if not excel_row:
            continue
        matched_keys.add(match_key)
        for field in upload_fields:
            if excel_row.get(field):
                if field == "proxy":
                    raw_proxy = excel_row[field]
                    profile[field] = normalize_legacy_proxy_input(raw_proxy)
                    if excel_row.get("proxy_scheme"):
                        profile[field] = normalize_proxy_input(raw_proxy, excel_row.get("proxy_scheme", ""))
                    profile["proxy_scheme"] = normalize_profile_proxy_scheme(raw_proxy, excel_row.get("proxy_scheme", ""))
                else:
                    profile[field] = excel_row[field]
        updated += 1

    skipped = max(0, len(excel_by_name) - len(matched_keys))
    logger.info("Merged Excel into existing profiles: updated=%d skipped_unmatched=%d", updated, skipped)
    return profiles


def _read_recovery_metadata(primary: Path, filename: str) -> tuple[list[dict], str, str, str]:
    """Read canonical metadata, with an optional valid legacy fallback."""
    try:
        rows = _read_profile_rows(primary)
        return rows, "valid", "", str(primary)
    except ProfilePersistenceError as canonical_error:
        for root in profile_data_roots()[1:]:
            candidate = root / filename
            try:
                rows = _read_profile_rows(candidate)
            except ProfilePersistenceError:
                continue
            logger.warning("Dùng metadata %s từ root cũ để khôi phục", filename)
            return rows, "legacy", str(canonical_error), str(candidate)
        return [], "corrupt", str(canonical_error), str(primary)


def _recovery_preview_unlocked(profiles_root: str | Path | None = None) -> dict:
    root = _validated_profiles_root(profiles_root)
    active, active_state, active_error, active_source = _read_recovery_metadata(PROFILES_JSON, "profiles.json")
    deleted, deleted_state, deleted_error, deleted_source = _read_recovery_metadata(
        DELETED_PROFILES_JSON, "deleted_profiles.json"
    )
    referenced = _referenced_profile_dirs(active, deleted)
    from core.window_icon_badge import batch_chromium_process_cache

    candidates: list[dict] = []
    skipped: list[dict[str, str]] = []
    try:
        children = sorted(root.iterdir(), key=lambda child: child.name.casefold())
    except OSError as exc:
        raise ProfilePersistenceError("Không quét được thư mục profiles") from exc
    with batch_chromium_process_cache():
        for child in children:
            try:
                path = _validated_orphan_path(child.name, referenced, root)
            except ProfileConflictError:
                skipped.append({"profile_dir": child.name, "reason": "Folder đã có metadata hoặc đã bị gỡ"})
                continue
            except (ValueError, ProfileNotFoundError):
                continue
            try:
                live_pids = live_chromium_pids_for_profile_dir(path.name, root)
            except Exception as exc:
                logger.warning("Không kiểm tra được Chromium đang dùng %s: %s", path, exc)
                skipped.append({"profile_dir": path.name, "reason": "Không xác minh được folder có đang được Chromium sử dụng"})
                continue
            if live_pids:
                skipped.append({"profile_dir": path.name, "reason": "Folder đang được Chromium sử dụng"})
                continue
            snapshot = _recover_row_from_snapshot(path.name, root)
            candidates.append({
                "profile_dir": path.name,
                "profile_name": str(snapshot.get("profile_name") or path.name) if snapshot else path.name,
                "fingerprint_changed": _snapshot_seed(snapshot) is None,
                "snapshot_available": bool(snapshot),
                "warning": (
                    "Sẽ khôi phục proxy, nhóm, cấu hình và fingerprint seed từ snapshot trong folder."
                    if snapshot
                    else "Không tìm thấy fingerprint seed cũ; sẽ tạo seed mới sau xác nhận."
                ),
            })
    metadata = {
        "profiles": {"state": active_state, "error": active_error, "source": active_source},
        "deleted_profiles": {"state": deleted_state, "error": deleted_error, "source": deleted_source},
    }
    return {
        "profiles_root": str(root),
        "metadata": metadata,
        "candidates": candidates,
        "skipped": skipped,
        "requires_new_fingerprint": [
            row["profile_dir"] for row in candidates if row["fingerprint_changed"]
        ],
    }


def _recovery_preview_sources_unlocked(sources: list[dict[str, Any]]) -> dict:
    """Preview direct Chromium folders from arbitrary one-or-more source roots."""
    active, active_state, active_error, active_source = _read_recovery_metadata(PROFILES_JSON, "profiles.json")
    deleted, deleted_state, deleted_error, deleted_source = _read_recovery_metadata(DELETED_PROFILES_JSON, "deleted_profiles.json")
    referenced = _referenced_profile_dirs(active, deleted)
    candidates: list[dict] = []
    skipped: list[dict[str, str]] = []
    seen: set[str] = set()
    from core.window_icon_badge import batch_chromium_process_cache

    with batch_chromium_process_cache():
        for source in sources:
            raw_root = str(source.get("profiles_root") or "").strip()
            if not raw_root:
                continue
            try:
                root = _validated_profiles_root(raw_root)
            except (OSError, ValueError, ProfileNotFoundError) as exc:
                skipped.append({"profile_dir": raw_root, "reason": str(exc)})
                continue
            for profile_dir in list(source.get("profile_dirs") or []):
                name = str(profile_dir or "").strip()
                try:
                    path = _validated_orphan_path(name, referenced, root)
                except ProfileConflictError:
                    skipped.append({"profile_dir": name, "reason": "Folder đã có metadata hoặc đã bị gỡ"})
                    continue
                except (ValueError, ProfileNotFoundError) as exc:
                    skipped.append({"profile_dir": name, "reason": str(exc)})
                    continue
                key = f"{root.resolve()}::{path.name}".casefold()
                if key in seen:
                    continue
                seen.add(key)
                try:
                    live_pids = live_chromium_pids_for_profile_dir(path.name, root)
                except Exception as exc:
                    skipped.append({"profile_dir": name, "reason": f"Không thể kiểm tra tiến trình Chromium ({exc})"})
                    continue
                if live_pids:
                    skipped.append({"profile_dir": name, "reason": "Folder đang được Chromium sử dụng"})
                    continue
                snapshot = _recover_row_from_snapshot(path.name, root)
                candidates.append({
                    "profile_dir": path.name,
                    "source_root": str(root),
                    "profile_name": str(snapshot.get("profile_name") or path.name) if snapshot else path.name,
                    "fingerprint_changed": _snapshot_seed(snapshot) is None,
                    "snapshot_available": bool(snapshot),
                    "warning": (
                        "Snapshot đầy đủ: giữ proxy, cấu hình và fingerprint seed cũ."
                        if snapshot else "Không tìm thấy fingerprint seed cũ; sẽ tạo seed mới sau xác nhận."
                    ),
                })
    return {
        "profiles_root": str(PROFILES_ROOT),
        "metadata": {
            "profiles": {"state": active_state, "error": active_error, "source": active_source},
            "deleted_profiles": {"state": deleted_state, "error": deleted_error, "source": deleted_source},
        },
        "candidates": candidates,
        "skipped": skipped,
        "requires_new_fingerprint": [row["profile_dir"] for row in candidates if row["fingerprint_changed"]],
    }


def preview_profile_rebuild(profiles_root: str | Path | None = None, profiles_roots: list[str] | None = None) -> dict:
    """Preview all immediate Chromium folders without changing metadata or folders."""
    with _PROFILE_MUTATION_LOCK:
        if profiles_roots:
            sources: list[dict[str, Any]] = []
            for raw_root in profiles_roots:
                selected_root = Path(raw_root).expanduser()
                if _is_reparse_point(selected_root):
                    raise ProfileNotFoundError("Folder nguồn chứa liên kết hoặc junction không an toàn")
                selected = selected_root.resolve(strict=True)
                if _is_reparse_point(selected) or not selected.is_dir():
                    raise ProfileNotFoundError("Đường dẫn folder profile không hợp lệ")
                if _is_chromium_profile_dir(selected):
                    sources.append({"profiles_root": str(selected.parent), "profile_dirs": [selected.name]})
                else:
                    sources.append({"profiles_root": str(selected), "profile_dirs": [child.name for child in selected.iterdir() if child.is_dir()]})
            return _recovery_preview_sources_unlocked(sources)
        return _recovery_preview_unlocked(profiles_root)


def _stage_external_recovery_sources(sources: list[dict[str, Any]], progress=None) -> list[Path]:
    """Stage multiple arbitrary source roots into canonical profiles transactionally."""
    staged: list[tuple[Path, Path]] = []
    temporary_paths: list[Path] = []
    promoted: list[Path] = []
    destination_names: set[str] = set()
    try:
        PROFILES_ROOT.mkdir(parents=True, exist_ok=True)
        for source in sources:
            root = _validated_profiles_root(str(source["profiles_root"]))
            for name_raw in source.get("profile_dirs") or []:
                name = validate_profile_name(str(name_raw))
                if name.casefold() in destination_names:
                    raise ProfileConflictError(f"Trùng tên folder profile khi khôi phục: {name}")
                destination_names.add(name.casefold())
                path = _validated_orphan_path(name, set(), root)
                _reject_nested_reparse_points(path)
                destination = PROFILES_ROOT / name
                if destination.exists():
                    raise ProfileConflictError("Thư mục profile đích đã tồn tại")
                temporary = destination.with_name(f"{name}.recovery.tmp")
                if temporary.exists():
                    raise ProfileConflictError("Đang có thư mục recovery tạm; hãy kiểm tra lại dữ liệu trước khi thử lại")
                temporary_paths.append(temporary)
                copy_function = lambda src, dst, profile=name: _copy_recovery_file(src, dst, progress or (lambda _event: None), profile)
                shutil.copytree(path, temporary, symlinks=False, copy_function=copy_function)
                if not _is_chromium_profile_dir(temporary):
                    raise ProfilePersistenceError("Folder Chromium sao chép không hợp lệ")
                staged.append((temporary, destination))
        for index, (temporary, destination) in enumerate(staged, start=1):
            temporary.replace(destination)
            promoted.append(destination)
            if progress:
                progress({"phase": "promote", "current_profile_dir": destination.name, "completed_profiles": index})
        return promoted
    except (ProfileConflictError, ProfilePersistenceError, ValueError):
        _remove_recovery_folders(temporary_paths + promoted)
        raise
    except (OSError, shutil.Error) as exc:
        _remove_recovery_folders(temporary_paths + promoted)
        raise ProfilePersistenceError("Không sao chép được folder Chromium để khôi phục") from exc


def _rebuild_profiles_from_sources(profile_sources: list[dict[str, Any]], confirm_text: str, progress=None) -> dict:
    requested = []
    for source in profile_sources:
        root = str(source.get("profiles_root") or "")
        for name in list(source.get("profile_dirs") or []):
            requested.append({"profiles_root": root, "profile_dir": validate_profile_name(str(name))})
    if not requested:
        raise ValueError("Chọn ít nhất một folder hồ sơ để khôi phục")
    if len({_case_key(item["profile_dir"]) for item in requested}) != len(requested):
        raise ProfileConflictError("Trùng tên folder profile khi khôi phục")
    expected_confirmation = f"KHOI PHUC {len(requested)} PROFILE"
    if str(confirm_text or "").strip() != expected_confirmation:
        raise ValueError(f"Nhập chính xác {expected_confirmation} để khôi phục")
    preview = _recovery_preview_sources_unlocked(profile_sources)
    allowed = {(str(row["source_root"]).casefold(), str(row["profile_dir"]).casefold()) for row in preview["candidates"]}
    if any((item["profiles_root"].casefold(), item["profile_dir"].casefold()) not in allowed for item in requested):
        raise ProfileConflictError("Một hoặc nhiều folder không còn hợp lệ để khôi phục")
    active, active_state, _, _ = _read_recovery_metadata(PROFILES_JSON, "profiles.json")
    deleted, deleted_state, _, _ = _read_recovery_metadata(DELETED_PROFILES_JSON, "deleted_profiles.json")
    existing_names = {_case_key(row.get("profile_name")) for row in [*active, *deleted]}
    existing_ids = {_case_key(row.get("id")) for row in [*active, *deleted]}
    rebuilt: list[dict] = []
    seed_changed: list[str] = []
    for item in requested:
        root = Path(item["profiles_root"]).expanduser().resolve(strict=True)
        snapshot = _recover_row_from_snapshot(item["profile_dir"], root)
        profile_id = str((snapshot or {}).get("id") or "")
        if not profile_id or _case_key(profile_id) in existing_ids:
            profile_id = _new_id()
            while _case_key(profile_id) in existing_ids:
                profile_id = _new_id()
        existing_ids.add(_case_key(profile_id))
        row = dict(_DEFAULTS)
        row.update(snapshot or {})
        row.update({"id": profile_id, "profile_name": _unique_recovered_profile_name(str((snapshot or {}).get("profile_name") or item["profile_dir"]), existing_names), "profile_dir": item["profile_dir"], "last_run_status": "idle", "last_run_time": "", "last_run_error": ""})
        if _snapshot_seed(snapshot) is None:
            seed_changed.append(item["profile_dir"])
        rebuilt.append(row)
    file_states = _capture_recovery_file_states([PROFILES_JSON, DELETED_PROFILES_JSON, *_recovery_snapshot_paths([*active, *rebuilt], [row["profile_dir"] for row in rebuilt])])
    promoted: list[Path] = []
    backups: list[str] = []
    try:
        external_sources: dict[str, dict[str, Any]] = {}
        for item in requested:
            if _same_path(Path(item["profiles_root"]), PROFILES_ROOT):
                continue
            key = item["profiles_root"]
            external_sources.setdefault(key, {"profiles_root": key, "profile_dirs": []})["profile_dirs"].append(item["profile_dir"])
        if external_sources:
            promoted = _stage_external_recovery_sources(list(external_sources.values()), progress)
        if active_state != "valid":
            backup = _backup_corrupt_metadata(PROFILES_JSON)
            if backup: backups.append(backup)
        if deleted_state != "valid":
            backup = _backup_corrupt_metadata(DELETED_PROFILES_JSON)
            if backup: backups.append(backup)
        if deleted_state != "valid":
            _atomic_write_profile_rows(DELETED_PROFILES_JSON, deleted)
        _atomic_write_profile_rows(PROFILES_JSON, [*active, *rebuilt])
        _write_recovery_profile_snapshots([*active, *rebuilt])
    except Exception:
        _remove_recovery_folders(promoted)
        _restore_recovery_file_states(file_states)
        raise
    return {"profiles": rebuilt, "skipped": preview["skipped"], "seed_changed": [row["profile_dir"] for row in rebuilt if _snapshot_seed(row) is None], "metadata_backups": backups, "message": f"Đã khôi phục {len(rebuilt)} hồ sơ."}


def preview_profile_rebuild_legacy(profiles_root: str | Path | None = None) -> dict:
    return preview_profile_rebuild(profiles_root)


def _backup_corrupt_metadata(path: Path) -> str:
    if not path.exists():
        return ""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = path.with_name(f"{path.name}.{stamp}.bak")
    suffix = 1
    while backup.exists():
        backup = path.with_name(f"{path.name}.{stamp}.{suffix}.bak")
        suffix += 1
    try:
        shutil.copy2(path, backup)
    except OSError as exc:
        raise ProfilePersistenceError(f"Không sao lưu được {path.name}") from exc
    return str(backup)


def _same_path(left: Path, right: Path) -> bool:
    try:
        return os.path.normcase(str(left.resolve(strict=True))) == os.path.normcase(str(right.resolve(strict=True)))
    except OSError:
        return os.path.normcase(str(left)) == os.path.normcase(str(right))


def _unique_recovered_profile_name(profile_dir: str, existing_names: set[str]) -> str:
    base = validate_display_profile_name(profile_dir)
    candidate = base
    index = 2
    while _case_key(candidate) in existing_names:
        suffix = f" ({index})"
        candidate = validate_display_profile_name(f"{base[:_DISPLAY_NAME_MAX_LEN - len(suffix)]}{suffix}")
        index += 1
    existing_names.add(_case_key(candidate))
    return candidate


def _capture_recovery_file_states(paths: list[Path]) -> dict[Path, tuple[bool, bytes]]:
    states: dict[Path, tuple[bool, bytes]] = {}
    for path in paths:
        if path in states:
            continue
        try:
            states[path] = (path.exists(), path.read_bytes() if path.exists() else b"")
        except OSError as exc:
            raise ProfilePersistenceError(f"Không sao lưu được trạng thái {path.name} trước khi khôi phục") from exc
    return states


def _restore_recovery_file_states(states: dict[Path, tuple[bool, bytes]]) -> None:
    for path, (existed, content) in states.items():
        try:
            if existed:
                path.parent.mkdir(parents=True, exist_ok=True)
                temp = path.with_name(f"{path.name}.recovery-rollback.tmp")
                temp.write_bytes(content)
                temp.replace(path)
            elif path.exists():
                path.unlink()
        except OSError:
            logger.exception("Không rollback được metadata khôi phục: %s", path)


def _remove_recovery_folders(paths: list[Path]) -> None:
    for path in reversed(paths):
        try:
            if path.exists():
                shutil.rmtree(path)
        except OSError:
            logger.exception("Không xóa được folder recovery sau lỗi: %s", path)


def _recovery_source_bytes(source: Path) -> int:
    total = 0
    try:
        for directory, dirnames, filenames in os.walk(source, topdown=True, followlinks=False):
            current = Path(directory)
            dirnames[:] = [name for name in dirnames if not _is_reparse_point(current / name)]
            for name in filenames:
                path = current / name
                if _is_reparse_point(path):
                    raise ValueError("Folder Chromium chứa liên kết hoặc junction không an toàn")
                total += path.stat().st_size
    except OSError as exc:
        raise ProfilePersistenceError("Không đọc được kích thước folder Chromium") from exc
    return total


def _copy_recovery_file(source: str | Path, destination: str | Path, progress, profile_dir: str) -> str:
    source_path = Path(source)
    destination_path = Path(destination)
    copied = 0
    try:
        with source_path.open("rb") as source_file, destination_path.open("wb") as destination_file:
            while True:
                chunk = source_file.read(1024 * 1024)
                if not chunk:
                    break
                destination_file.write(chunk)
                copied += len(chunk)
                progress({"phase": "copy", "current_profile_dir": profile_dir, "bytes_delta": len(chunk)})
        shutil.copystat(source_path, destination_path)
    except OSError as exc:
        raise ProfilePersistenceError("Không sao chép được file Chromium để khôi phục") from exc
    return str(destination_path)


def _stage_external_recovery_folders(selected_root: Path, requested: list[str], progress=None) -> list[Path]:
    """Copy selected external profiles into canonical root without changing sources."""
    staged: list[tuple[Path, Path]] = []
    temporary_paths: list[Path] = []
    promoted: list[Path] = []
    try:
        PROFILES_ROOT.mkdir(parents=True, exist_ok=True)
        total_bytes = 0
        for profile_dir in requested:
            source = _validated_orphan_path(profile_dir, set(), selected_root)
            _reject_nested_reparse_points(source)
            total_bytes += _recovery_source_bytes(source)
        if progress:
            progress({"phase": "preflight", "total_profiles": len(requested), "bytes_total": total_bytes})
        for profile_dir in requested:
            source = selected_root / profile_dir
            destination = PROFILES_ROOT / profile_dir
            temporary = destination.with_name(f"{profile_dir}.recovery.tmp")
            if destination.exists():
                raise ProfileConflictError("Thư mục profile đích đã tồn tại")
            if temporary.exists():
                raise ProfileConflictError("Đang có thư mục recovery tạm; hãy kiểm tra lại dữ liệu trước khi thử lại")
            temporary_paths.append(temporary)
            copy_function = lambda src, dst, name=profile_dir: _copy_recovery_file(src, dst, progress or (lambda _event: None), name)
            shutil.copytree(source, temporary, symlinks=False, copy_function=copy_function)
            if not _is_chromium_profile_dir(temporary):
                raise ProfilePersistenceError("Folder Chromium sao chép không hợp lệ")
            staged.append((temporary, destination))
        for index, (temporary, destination) in enumerate(staged, start=1):
            temporary.replace(destination)
            promoted.append(destination)
            if progress:
                progress({"phase": "promote", "current_profile_dir": destination.name, "completed_profiles": index})
        return promoted
    except (ProfileConflictError, ProfilePersistenceError, ValueError):
        _remove_recovery_folders(temporary_paths + promoted)
        raise
    except (OSError, shutil.Error) as exc:
        _remove_recovery_folders(temporary_paths + promoted)
        raise ProfilePersistenceError("Không sao chép được folder Chromium để khôi phục") from exc


def _recovery_snapshot_paths(rows: list[dict], profile_dirs: list[str]) -> list[Path]:
    names = [str(row.get("profile_dir") or "").strip() for row in rows]
    names.extend(profile_dirs)
    return [_profile_snapshot_path(name) for name in dict.fromkeys(name for name in names if name)]


def _write_recovery_profile_snapshots(rows: list[dict]) -> None:
    """Persist rebuilt snapshots strictly so the recovery transaction can roll back."""
    for row in rows:
        profile_dir = str(row.get("profile_dir") or "").strip()
        if not profile_dir:
            continue
        path = _profile_snapshot_path(profile_dir)
        path.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write_profile_rows(path, [{key: value for key, value in row.items() if key != "deleted_at"}])


def rebuild_profiles_from_folders(
    profiles_root: str | Path | None,
    profile_dirs: list[str],
    confirm_text: str,
    progress=None,
) -> dict:
    """Rebuild metadata from selected current-root Chromium folders after preview."""
    if not isinstance(profile_dirs, list) or not profile_dirs:
        raise ValueError("Chọn ít nhất một folder hồ sơ để khôi phục")
    requested = [validate_profile_name(name) for name in profile_dirs]
    if len({_case_key(name) for name in requested}) != len(requested):
        raise ValueError("Danh sách folder khôi phục bị trùng")
    expected_confirmation = f"KHOI PHUC {len(requested)} PROFILE"
    if str(confirm_text or "").strip() != expected_confirmation:
        raise ValueError(f"Nhập chính xác {expected_confirmation} để khôi phục")

    with _PROFILE_MUTATION_LOCK:
        preview = _recovery_preview_unlocked(profiles_root)
        selected_root = Path(preview["profiles_root"])
        canonical_root = _same_path(selected_root, PROFILES_ROOT)
        if progress:
            progress({"phase": "preflight", "total_profiles": len(requested), "completed_profiles": 0})
        candidate_by_dir = {_case_key(row["profile_dir"]): row for row in preview["candidates"]}
        unknown = [name for name in requested if _case_key(name) not in candidate_by_dir]
        if unknown:
            raise ProfileConflictError(f"Folder không còn hợp lệ để khôi phục: {', '.join(unknown)}")

        active, active_state, _, _ = _read_recovery_metadata(PROFILES_JSON, "profiles.json")
        deleted, deleted_state, _, _ = _read_recovery_metadata(
            DELETED_PROFILES_JSON, "deleted_profiles.json"
        )
        existing_names = {_case_key(row.get("profile_name")) for row in [*active, *deleted]}
        existing_ids = {_case_key(row.get("id")) for row in [*active, *deleted]}
        if not canonical_root:
            referenced = _referenced_profile_dirs(active, deleted)
            for profile_dir in requested:
                source = _validated_orphan_path(profile_dir, referenced, selected_root)
                if live_chromium_pids_for_path(source):
                    raise ProfileConflictError("Thư mục đang được Chromium sử dụng")
                if (PROFILES_ROOT / profile_dir).exists():
                    raise ProfileConflictError("Thư mục profile đích đã tồn tại")
        rebuilt: list[dict] = []
        seed_changed: list[str] = []
        for profile_dir in requested:
            snapshot = _recover_row_from_snapshot(profile_dir, selected_root)
            seed = _snapshot_seed(snapshot)
            profile_id = str(snapshot.get("id") or "") if snapshot else ""
            if not profile_id or _case_key(profile_id) in existing_ids:
                profile_id = _new_id()
                while _case_key(profile_id) in existing_ids:
                    profile_id = _new_id()
            existing_ids.add(_case_key(profile_id))
            row = dict(_DEFAULTS)
            row.update(snapshot or {})
            row.update({
                "id": profile_id,
                "profile_name": _unique_recovered_profile_name(
                    str((snapshot or {}).get("profile_name") or profile_dir), existing_names
                ),
                "profile_dir": profile_dir,
                "fingerprint_seed": seed if seed is not None else new_fingerprint_seed(),
                "last_run_status": "idle",
                "last_run_time": "",
                "last_run_error": "",
            })
            if seed is None:
                seed_changed.append(profile_dir)
            rebuilt.append(row)

        metadata_paths = [PROFILES_JSON, DELETED_PROFILES_JSON]
        if canonical_root:
            metadata_paths.extend(_recovery_snapshot_paths([*active, *rebuilt], requested))
        else:
            metadata_paths.extend(_recovery_snapshot_paths([*active, *rebuilt], []))
        file_states = _capture_recovery_file_states(metadata_paths)
        promoted: list[Path] = []
        backups: list[str] = []
        try:
            if not canonical_root:
                promoted = _stage_external_recovery_folders(selected_root, requested, progress)

            if progress:
                progress({"phase": "metadata", "current_profile_dir": None})
            if active_state != "valid":
                backup = _backup_corrupt_metadata(PROFILES_JSON)
                if backup:
                    backups.append(backup)
            if deleted_state != "valid":
                backup = _backup_corrupt_metadata(DELETED_PROFILES_JSON)
                if backup:
                    backups.append(backup)

            # Replace only unreadable canonical metadata after preserving a timestamped backup.
            # A valid legacy tombstone list is copied, never discarded.
            if deleted_state != "valid":
                _atomic_write_profile_rows(DELETED_PROFILES_JSON, deleted)
            _atomic_write_profile_rows(PROFILES_JSON, [*active, *rebuilt])
            _write_recovery_profile_snapshots([*active, *rebuilt])
        except Exception:
            _remove_recovery_folders(promoted)
            _restore_recovery_file_states(file_states)
            raise

        return {
            "profiles": rebuilt,
            "skipped": preview["skipped"],
            "seed_changed": seed_changed,
            "metadata_backups": backups,
            "message": f"Đã khôi phục {len(rebuilt)} hồ sơ. Fingerprint mới có thể yêu cầu xác minh lại.",
        }
