import base64
import os
import re
import subprocess
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from core import secure_store
from core.license_client import saved_session
from core.paths import app_path


KEYS_DIR = app_path("security", "transfer_keys")
_PRIVATE_KEY_SUFFIX = "_private.dpapi"
_LEGACY_PRIVATE_KEY_SUFFIX = "_private.pem"


def normalize_account_id(account_id: str | None = None) -> str:
    value = str(account_id or "").strip()
    if not value:
        value = str(saved_session().get("account") or "").strip()
    return value or "local"


def _safe_account_filename(account_id: str) -> str:
    value = normalize_account_id(account_id)
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value)[:120] or "local"


def current_account_id() -> str:
    return normalize_account_id()


def _private_key_path(account_id: str | None = None) -> Path:
    return KEYS_DIR / f"{_safe_account_filename(normalize_account_id(account_id))}{_PRIVATE_KEY_SUFFIX}"


def _legacy_private_key_path(account_id: str | None = None) -> Path:
    return KEYS_DIR / f"{_safe_account_filename(normalize_account_id(account_id))}{_LEGACY_PRIVATE_KEY_SUFFIX}"


def _public_key_path(account_id: str | None = None) -> Path:
    return KEYS_DIR / f"{_safe_account_filename(normalize_account_id(account_id))}_public.pem"


def _harden_path_acl(path: Path, *, is_directory: bool) -> None:
    """Restrict private-key paths to current user, SYSTEM, and Administrators."""
    if sys.platform != "win32":
        raise secure_store.DPAPIError("Private key chuyển profile chỉ hỗ trợ persistent storage trên Windows")
    username = os.environ.get("USERNAME", "").strip()
    if not username:
        raise secure_store.DPAPIError("Không xác định được user Windows để đặt ACL private key")
    permission = "(OI)(CI)F" if is_directory else "F"
    result = subprocess.run(
        [
            "icacls",
            str(path),
            "/inheritance:r",
            "/grant:r",
            f"{username}:{permission}",
            "/grant:r",
            f"*S-1-5-18:{permission}",
            "/grant:r",
            f"*S-1-5-32-544:{permission}",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "icacls failed").strip()
        raise secure_store.DPAPIError(f"Không đặt được ACL private key: {message}")


def _write_private_key(account: str, private_bytes: bytes) -> None:
    if not secure_store.is_available():
        raise secure_store.DPAPIError("DPAPI không khả dụng để lưu private key chuyển profile")
    token = secure_store.protect_bytes(private_bytes)
    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    _harden_path_acl(KEYS_DIR, is_directory=True)

    target = _private_key_path(account)
    old = target.read_bytes() if target.exists() else None
    temp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    try:
        temp.write_text(token, encoding="ascii")
        if secure_store.unprotect_bytes(temp.read_text(encoding="ascii")) != private_bytes:
            raise secure_store.DPAPIError("Không xác minh được private key chuyển profile sau khi lưu")
        temp.replace(target)
        _harden_path_acl(target, is_directory=False)
    except Exception:
        if old is None:
            target.unlink(missing_ok=True)
        else:
            target.write_bytes(old)
        raise
    finally:
        temp.unlink(missing_ok=True)


def _load_private_key_bytes(account: str) -> bytes:
    path = _private_key_path(account)
    if path.exists():
        return secure_store.unprotect_bytes(path.read_text(encoding="ascii"))

    legacy = _legacy_private_key_path(account)
    if not legacy.exists():
        raise FileNotFoundError(str(path))
    raw = legacy.read_bytes()
    _write_private_key(account, raw)
    try:
        legacy.unlink()
    except OSError as exc:
        raise secure_store.DPAPIError("Không xóa được private key plaintext cũ") from exc
    return raw


def ensure_transfer_keypair(account_id: str | None = None):
    account = normalize_account_id(account_id)
    public_path = _public_key_path(account)
    private_path = _private_key_path(account)
    legacy_path = _legacy_private_key_path(account)
    if public_path.exists() and (private_path.exists() or legacy_path.exists()):
        return load_private_key(account)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    _write_private_key(account, private_bytes)
    try:
        public_path.write_bytes(public_bytes)
    except Exception:
        private_path.unlink(missing_ok=True)
        raise
    return private_key


def load_private_key(account_id: str | None = None):
    account = normalize_account_id(account_id)
    try:
        private_bytes = _load_private_key_bytes(account)
    except FileNotFoundError:
        return ensure_transfer_keypair(account)
    return serialization.load_pem_private_key(private_bytes, password=None)


def current_public_key_pem(account_id: str | None = None) -> str:
    account = normalize_account_id(account_id)
    ensure_transfer_keypair(account)
    return _public_key_path(account).read_text(encoding="utf-8")


def load_public_key(public_key_pem: str):
    return serialization.load_pem_public_key(public_key_pem.encode("utf-8"))


def encrypt_key_for_recipient(aes_key: bytes, public_key_pem: str) -> str:
    public_key = load_public_key(public_key_pem)
    encrypted = public_key.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(encrypted).decode("ascii")


def decrypt_key_for_current_account(encrypted_key_b64: str, account_id: str | None = None) -> bytes:
    private_key = load_private_key(account_id)
    encrypted = base64.b64decode(encrypted_key_b64.encode("ascii"))
    return private_key.decrypt(
        encrypted,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
