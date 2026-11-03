import base64
import io
import json
import os
import secrets
import shutil
import time
import uuid
import zipfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from core.paths import profile_data_dir, profile_data_path
from core.profile_store import (
    _safe_profile_dir_base,
    load_profiles,
    new_fingerprint_seed,
    profile_dir_for_identity,
    save_profiles,
    validate_display_profile_name,
    validate_profile_name,
)
from core.transfer_security import (
    current_account_id,
    current_public_key_pem,
    decrypt_key_for_current_account,
    encrypt_key_for_recipient,
    normalize_account_id,
)


PACKAGE_VERSION = 2
PACKAGE_EXT = ".bmprofile"
PROFILES_DIR = profile_data_path("profiles")
EXPORTS_DIR = profile_data_path("exports")

_LOCK_FILES = {"browsermulti_session.pid", "lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"}
_CACHE_DIRS = {
    "BrowserMetrics",
    "Cache",
    "CacheStorage",
    "Code Cache",
    "Crashpad",
    "DawnCache",
    "GPUCache",
    "GrShaderCache",
    "Media Cache",
    "ShaderCache",
    "VideoDecodeStats",
    "blob_storage",
    "component_crx_cache",
    "optimization_guide_model_store",
}
_CACHE_SUFFIXES = (".indexeddb.blob",)
_MAX_PACKAGE_BYTES = 250 * 1024 * 1024
_MAX_PAYLOAD_BYTES = 512 * 1024 * 1024
_MAX_PROFILE_MEMBERS = 100_000
_MAX_PROFILE_MEMBER_BYTES = 512 * 1024 * 1024
_MAX_PROFILE_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
_IMPORT_LOCK = threading.RLock()


def _find_profile(profile_id: str) -> dict[str, Any] | None:
    for profile in load_profiles():
        if profile.get("id") == profile_id or profile.get("profile_name") == profile_id:
            return profile
    return None


def _safe_package_name(name: str) -> str:
    value = validate_display_profile_name(name)
    return _safe_profile_dir_base(value)


def _unique_profile_name(base_name: str, existing_names: set[str]) -> str:
    base = validate_display_profile_name(base_name)
    existing = {str(name).casefold() for name in existing_names}
    if base.casefold() not in existing:
        return base
    for i in range(2, 1000):
        candidate = validate_display_profile_name(f"{base} {i}")
        if candidate.casefold() not in existing:
            return candidate
    raise ValueError("Không tạo được tên hồ sơ không trùng.")


def _unique_profile_dir(base_dir: str) -> str:
    base = validate_profile_name(base_dir)
    if not (PROFILES_DIR / base).exists():
        return base
    for i in range(2, 1000):
        candidate = validate_profile_name(f"{base}_{i}")
        if not (PROFILES_DIR / candidate).exists():
            return candidate
    raise ValueError("Không tạo được thư mục hồ sơ không trùng.")


def _should_skip_path(path: Path, root: Path) -> bool:
    if path.name in _LOCK_FILES:
        return True
    try:
        rel = path.relative_to(root)
    except ValueError:
        return True
    for part in rel.parts:
        if part in _CACHE_DIRS:
            return True
        if part.endswith(_CACHE_SUFFIXES):
            return True
    return False


def _zip_profile_data(zf: zipfile.ZipFile, source_dir: Path) -> int:
    count = 0
    if not source_dir.exists():
        return count
    for dirpath, dirnames, filenames in os.walk(source_dir):
        current = Path(dirpath)
        dirnames[:] = [d for d in dirnames if not _should_skip_path(current / d, source_dir)]
        for filename in filenames:
            path = current / filename
            if _should_skip_path(path, source_dir):
                continue
            arcname = Path("profile_data") / path.relative_to(source_dir)
            zf.write(path, arcname.as_posix())
            count += 1
    return count


def _build_payload_zip(profile: dict[str, Any], source_dir: Path, include_session: bool) -> tuple[bytes, int]:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("profile.json", json.dumps(profile, ensure_ascii=False, indent=2))
        file_count = _zip_profile_data(zf, source_dir) if include_session else 0
    return buffer.getvalue(), file_count


def _encrypt_payload(payload: bytes, manifest: dict[str, Any], recipient_public_key_pem: str) -> dict[str, str]:
    aes_key = AESGCM.generate_key(bit_length=256)
    nonce = secrets.token_bytes(12)
    aad = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ciphertext = AESGCM(aes_key).encrypt(nonce, payload, aad)
    return {
        "encrypted_key": encrypt_key_for_recipient(aes_key, recipient_public_key_pem),
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }


def _decrypt_payload(envelope: dict[str, str], manifest: dict[str, Any], receiver_account_id: str) -> bytes:
    aes_key = decrypt_key_for_current_account(envelope["encrypted_key"], receiver_account_id)
    nonce = base64.b64decode(envelope["nonce"].encode("ascii"))
    ciphertext = base64.b64decode(envelope["ciphertext"].encode("ascii"))
    aad = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return AESGCM(aes_key).decrypt(nonce, ciphertext, aad)


def export_profile_package(
    profile_id: str,
    export_dir: str | None = None,
    include_session: bool = True,
    receiver_account_id: str | None = None,
    receiver_public_key_pem: str | None = None,
) -> dict[str, Any]:
    profile = _find_profile(profile_id)
    if not profile:
        raise ValueError("Không tìm thấy hồ sơ cần xuất.")

    sender_account = current_account_id()
    receiver_account = normalize_account_id(receiver_account_id or sender_account)
    if receiver_public_key_pem:
        public_key = receiver_public_key_pem
    elif receiver_account == sender_account:
        public_key = current_public_key_pem(sender_account)
    else:
        raise ValueError("Thiếu public key của tài khoản nhận.")
    if not public_key:
        raise ValueError("Thiếu public key của tài khoản nhận.")

    profile_name = validate_display_profile_name(profile.get("profile_name") or profile.get("profile_dir") or "profile")
    try:
        profile_dir = validate_profile_name(profile.get("profile_dir") or "")
    except ValueError:
        profile_dir = profile_dir_for_identity(profile_name, "", str(profile.get("id") or ""))
    source_dir = profile_data_dir(profile_dir)

    target_dir = Path(export_dir).expanduser() if export_dir else EXPORTS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    package_path = target_dir / f"{_safe_package_name(profile_name)}_{timestamp}{PACKAGE_EXT}"

    transfer_id = uuid.uuid4().hex
    manifest = {
        "app": "BrowserMulti",
        "package_version": PACKAGE_VERSION,
        "encrypted": True,
        "encryption": "AES-256-GCM+RSA-OAEP-SHA256",
        "transfer_id": transfer_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "sender_account_id": sender_account,
        "receiver_account_id": receiver_account,
        "profile_id": profile.get("id", ""),
        "profile_name": profile_name,
        "profile_dir": profile_dir,
        "fingerprint_seed": profile.get("fingerprint_seed", ""),
        "export_type": "full" if include_session else "light",
        "include_session": include_session,
        "note": "Gói hồ sơ đã được mã hóa cho tài khoản nhận. Chỉ tài khoản nhận có private key phù hợp mới giải mã được.",
    }

    payload, file_count = _build_payload_zip(profile, source_dir, include_session)
    envelope = _encrypt_payload(payload, manifest, public_key)

    with zipfile.ZipFile(package_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        zf.writestr("encrypted_payload.json", json.dumps(envelope, ensure_ascii=False))

    return {
        "path": str(package_path),
        "file_count": file_count,
        "size_bytes": package_path.stat().st_size,
        "profile": profile,
        "manifest": manifest,
    }


def _validate_zip_member(name: str) -> Path:
    rel = Path(name)
    if rel.is_absolute() or ".." in rel.parts:
        raise ValueError(f"Gói hồ sơ có đường dẫn không an toàn: {name}")
    return rel


def _safe_rmtree(path: Path, *, retries: int = 3, delay: float = 0.2) -> None:
    """Best-effort cleanup with a short retry for Windows file-lock races."""
    for attempt in range(retries):
        try:
            shutil.rmtree(path, ignore_errors=True)
            if not path.exists():
                return
        except Exception:
            pass
        if attempt < retries - 1:
            time.sleep(delay)


def _read_decrypted_payload(zf: zipfile.ZipFile, manifest: dict[str, Any]) -> bytes:
    if not manifest.get("encrypted"):
        raise ValueError("Gói hồ sơ chưa mã hóa không được phép nhập.")
    receiver_account = normalize_account_id(manifest.get("receiver_account_id"))
    current_account = current_account_id()
    if receiver_account != current_account:
        raise ValueError(
            f"Gói này được cấp cho tài khoản '{receiver_account}', không phải tài khoản hiện tại '{current_account}'."
        )
    envelope = json.loads(zf.read("encrypted_payload.json").decode("utf-8"))
    payload = _decrypt_payload(envelope, manifest, receiver_account)
    if len(payload) > _MAX_PAYLOAD_BYTES:
        raise ValueError("Gói hồ sơ đã giải mã vượt giới hạn an toàn")
    return payload


def _validate_outer_package(source: Path) -> None:
    if source.stat().st_size > _MAX_PACKAGE_BYTES:
        raise ValueError("File .bmprofile vượt giới hạn dung lượng")


def _validate_payload_zip(zf: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    infos = zf.infolist()
    if len(infos) > _MAX_PROFILE_MEMBERS + 1:
        raise ValueError("Gói hồ sơ có quá nhiều file")
    profile_info = next((info for info in infos if info.filename == "profile.json"), None)
    if profile_info is None or profile_info.file_size > 1024 * 1024:
        raise ValueError("Gói hồ sơ có metadata không hợp lệ")
    members: list[zipfile.ZipInfo] = []
    total_size = 0
    for info in infos:
        if info.filename == "profile.json" or info.is_dir():
            continue
        if not info.filename.startswith("profile_data/"):
            raise ValueError("Gói hồ sơ chứa file không hợp lệ")
        _validate_zip_member(info.filename)
        if info.file_size > _MAX_PROFILE_MEMBER_BYTES:
            raise ValueError("Gói hồ sơ chứa file vượt giới hạn an toàn")
        total_size += info.file_size
        if total_size > _MAX_PROFILE_TOTAL_BYTES:
            raise ValueError("Gói hồ sơ vượt giới hạn dung lượng giải nén")
        members.append(info)
    return members


def _extract_profile_data(zf: zipfile.ZipFile, target_dir: Path) -> int:
    members = _validate_payload_zip(zf)
    target_dir.mkdir(parents=True, exist_ok=True)
    base_resolved = target_dir.resolve()
    extracted_bytes = 0
    for info in members:
        rel = _validate_zip_member(info.filename)
        parts = rel.parts[1:]
        if not parts:
            continue
        out_path = target_dir.joinpath(*parts)
        resolved = out_path.resolve()
        if resolved != base_resolved and base_resolved not in resolved.parents:
            raise ValueError(f"Gói hồ sơ có đường dẫn thoát thư mục: {info.filename}")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as src, open(out_path, "wb") as dst:
            while chunk := src.read(1024 * 1024):
                extracted_bytes += len(chunk)
                if extracted_bytes > _MAX_PROFILE_TOTAL_BYTES:
                    raise ValueError("Gói hồ sơ vượt giới hạn dung lượng giải nén")
                dst.write(chunk)
    return len(members)


def import_profile_package(package_path: str, *, regenerate_fingerprint_seed: bool = False) -> dict[str, Any]:
    source = Path(package_path).expanduser()
    if not source.exists():
        raise ValueError("Không tìm thấy file .bmprofile.")
    if source.suffix.lower() != PACKAGE_EXT:
        raise ValueError("File nhập phải có đuôi .bmprofile.")
    _validate_outer_package(source)

    with _IMPORT_LOCK:
        with zipfile.ZipFile(source, "r") as outer:
            manifest = json.loads(outer.read("manifest.json").decode("utf-8"))
            if int(manifest.get("package_version", 0)) != PACKAGE_VERSION:
                raise ValueError("Phiên bản gói hồ sơ không được hỗ trợ.")
            payload_bytes = _read_decrypted_payload(outer, manifest)

        with zipfile.ZipFile(io.BytesIO(payload_bytes), "r") as payload:
            profile = json.loads(payload.read("profile.json").decode("utf-8"))
            profiles = load_profiles()
            existing_names = {p.get("profile_name", "") for p in profiles}
            imported_name = validate_display_profile_name(profile.get("profile_name") or manifest.get("profile_name") or "imported")
            try:
                imported_dir = validate_profile_name(profile.get("profile_dir") or manifest.get("profile_dir") or "")
            except ValueError:
                imported_dir = profile_dir_for_identity(imported_name, "", str(profile.get("id") or ""))
            new_name = _unique_profile_name(imported_name, existing_names)
            new_dir = _unique_profile_dir(imported_dir)

            profile["id"] = uuid.uuid4().hex[:8]
            profile["profile_name"] = new_name
            profile["profile_dir"] = new_dir
            if regenerate_fingerprint_seed:
                profile["fingerprint_seed"] = new_fingerprint_seed()
            else:
                profile["fingerprint_seed"] = profile.get("fingerprint_seed") or manifest.get("fingerprint_seed")
            profile["last_run_status"] = "idle"
            profile["last_run_time"] = ""
            profile["last_run_error"] = ""
            profile["transferred_from_account_id"] = manifest.get("sender_account_id", "")
            profile["transfer_id"] = manifest.get("transfer_id", "")

            final_dir = PROFILES_DIR / new_dir
            temp_dir = PROFILES_DIR / f".{new_dir}.{uuid.uuid4().hex}.import.tmp"
            if final_dir.exists():
                raise RuntimeError("Thư mục hồ sơ đích đã tồn tại")
            try:
                file_count = _extract_profile_data(payload, temp_dir)
                temp_dir.rename(final_dir)
                profiles.append(profile)
                if not save_profiles(profiles):
                    _safe_rmtree(final_dir)
                    raise RuntimeError("Không lưu được profiles.json")
            except Exception:
                _safe_rmtree(temp_dir)
                raise

    return {
        "profile": profile,
        "file_count": file_count,
        "source": str(source),
        "manifest": manifest,
        "risk": {
            "level": "medium",
            "message": "Đã giải mã và giữ nguyên fingerprint. Nếu đổi mạng hoặc thiết bị, website vẫn có thể yêu cầu xác minh lại.",
        },
    }


def inspect_profile_package(package_path: str) -> dict[str, Any]:
    """Decrypt a .bmprofile enough to preview metadata without importing it."""
    source = Path(package_path).expanduser()
    if not source.exists():
        raise ValueError("Khong tim thay file .bmprofile.")
    if source.suffix.lower() != PACKAGE_EXT:
        raise ValueError("File nhap phai co duoi .bmprofile.")

    with zipfile.ZipFile(source, "r") as outer:
        manifest = json.loads(outer.read("manifest.json").decode("utf-8"))
        payload_bytes = _read_decrypted_payload(outer, manifest)

    with zipfile.ZipFile(io.BytesIO(payload_bytes), "r") as payload:
        profile = json.loads(payload.read("profile.json").decode("utf-8"))
        file_count = sum(
            1 for info in payload.infolist()
            if info.filename.startswith("profile_data/") and not info.is_dir()
        )

    proxy = str(profile.get("proxy") or "").strip()
    return {
        "ok": True,
        "source": str(source),
        "manifest": manifest,
        "profile": {
            "id": profile.get("id", ""),
            "profile_name": profile.get("profile_name") or manifest.get("profile_name") or "",
            "profile_dir": profile.get("profile_dir") or manifest.get("profile_dir") or "",
            "fingerprint_seed": profile.get("fingerprint_seed") or manifest.get("fingerprint_seed") or "",
            "proxy": proxy,
            "has_proxy": bool(proxy),
        },
        "file_count": file_count,
        "risk": {
            "level": "medium",
            "message": "Goi ho so chua duoc nhap. Hay kiem tra proxy/IP truoc khi chay profile tren may moi.",
        },
    }
