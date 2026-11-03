import base64
import hashlib
import json
import os
import platform
import sys
import uuid
import urllib.error
import urllib.parse
import urllib.request
import winreg
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from core.paths import app_path, user_data_path
from core import license_signing, secure_store


# Tauri ghi license.json vao %LOCALAPPDATA%\BrowserMulti\license.json (xem
# tauri-ui/src-tauri/src/lib.rs::find_license_file). Cac ban Python truoc day
# chi doc tu app_path("license.json") (canh exe), nen sau khi dang nhap qua
# Tauri thi sidecar khong thay session -> /transfer/public-key tra
# account_id="local". Resolver duoi day giu thu tu giong ben Tauri:
#   1. %LOCALAPPDATA%\BrowserMulti\license.json (uu tien)
#   2. license.json canh exe (build cu)
#   3. license.json o repo root (dev)
def _license_file_candidates() -> list[Path]:
    paths: list[Path] = [user_data_path("license.json"), app_path("license.json")]
    if getattr(sys, "_MEIPASS", None):
        paths.append(Path(sys._MEIPASS) / "license.json")
    return paths


def license_file_path() -> Path:
    """Tra ve license.json hien co; neu chua co thi mac dinh ghi vao LOCALAPPDATA."""
    for path in _license_file_candidates():
        if path.exists():
            return path
    return user_data_path("license.json")


# Backward compat: mot so test/module cu doc bien LICENSE_FILE truc tiep.
# Giu lai bien nay nhung dung ham resolver de tra path hien hanh.
LICENSE_FILE = license_file_path()
LICENSE_CONFIG_FILE = app_path("license_config.json")
DEFAULT_SERVER_URL = "https://browsermulti-license.dungdong333.workers.dev"


def _trusted_auth_server_url(_requested: str | None = None) -> str:
    """Use the fixed production endpoint for password-bearing auth requests."""
    return DEFAULT_SERVER_URL


@dataclass
class AuthStatus:
    ok: bool
    message: str
    account: str = ""
    server_url: str = ""


def _machine_guid() -> str:
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            value, _ = winreg.QueryValueEx(key, "MachineGuid")
            return str(value)
    except Exception:
        return ""


def _bios_uuid() -> str:
    # wmic removed on Windows 11 22H2+; use registry instead
    _BIOS_KEYS = [
        (r"HARDWARE\DESCRIPTION\System\BIOS", "SystemProductName"),
        (r"HARDWARE\DESCRIPTION\System\BIOS", "BaseBoardProduct"),
        (r"HARDWARE\DESCRIPTION\System\BIOS", "BIOSVendor"),
    ]
    parts = []
    for key_path, value_name in _BIOS_KEYS:
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as k:
                val, _ = winreg.QueryValueEx(k, value_name)
                if val and str(val).strip():
                    parts.append(str(val).strip())
        except Exception:
            pass
    return "|".join(parts)


def machine_id() -> str:
    raw = "|".join(
        part for part in [_machine_guid(), _bios_uuid(), platform.node(), str(uuid.getnode())] if part
    )
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest().upper()
    return "-".join(digest[i:i + 4] for i in range(0, 20, 4))


def configured_server_url() -> str:
    paths = [license_file_path(), LICENSE_CONFIG_FILE]
    if getattr(sys, "_MEIPASS", None):
        paths.append(Path(sys._MEIPASS) / "license_config.json")
    for path in paths:
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if data.get("server_url"):
                    return str(data["server_url"]).rstrip("/")
            except Exception:
                pass
    return DEFAULT_SERVER_URL


def _decode_pw(encoded: str) -> str:
    try:
        return base64.b64decode(encoded.encode("ascii")).decode("utf-8")
    except Exception:
        return ""


def _store_password_fields(session: dict, password: str) -> None:
    """Ghi mật khẩu DPAPI; không tạo fallback plaintext/base64."""
    session.pop("password", None)
    session.pop("password_b64", None)
    session.pop("password_dpapi", None)
    if secure_store.is_available():
        try:
            session["password_dpapi"] = secure_store.protect(password)
        except secure_store.DPAPIError:
            pass


def _store_license_key(session: dict, license_key: str) -> None:
    """Ghi license key bằng DPAPI và xóa key plaintext legacy."""
    if not secure_store.is_available():
        raise secure_store.DPAPIError("DPAPI không khả dụng để lưu license key an toàn")
    token = secure_store.protect(license_key.strip())
    session.pop("license_key", None)
    session.pop("license_key_dpapi", None)
    session["license_key_dpapi"] = token
    if secure_store.unprotect(token) != license_key.strip():
        raise secure_store.DPAPIError("Không xác minh được license key sau khi mã hóa")


def _persist_session(session: dict) -> None:
    target = license_file_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    temp.write_text(json.dumps(session, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(target)


def session_license_key(session: dict, *, migrate: bool = False) -> str:
    """Đọc license key mã hóa; migrate raw legacy key khi DPAPI dùng được."""
    token = session.get("license_key_dpapi")
    if token:
        try:
            return secure_store.unprotect(token)
        except secure_store.DPAPIError:
            return ""
    legacy = str(session.get("license_key") or "").strip()
    if not legacy:
        return ""
    if migrate and secure_store.is_available():
        try:
            _store_license_key(session, legacy)
            target = license_file_path()
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(session, ensure_ascii=False, indent=2), encoding="utf-8")
        except (OSError, secure_store.DPAPIError):
            pass
    return legacy


def session_password(session: dict) -> str:
    """Đọc mật khẩu session, ưu tiên DPAPI; legacy chỉ dùng để migrate."""
    token = session.get("password_dpapi")
    if token:
        try:
            return secure_store.unprotect(token)
        except secure_store.DPAPIError:
            return ""
    if session.get("password_b64"):
        return _decode_pw(session["password_b64"])
    return session.get("password", "")


def saved_session() -> dict:
    path = license_file_path()
    if not path.exists():
        return {}
    try:
        session = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(session, dict) and session.get("license_key") and not session.get("license_key_dpapi"):
            session_license_key(session, migrate=True)
        return session
    except Exception:
        return {}


def check_version(server_url: str | None = None) -> dict:
    """Returns {"latest_version": str, "message": str} or empty dict on failure."""
    url = (server_url or configured_server_url()).rstrip("/") + "/api/version"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return {}


def _post_json(
    url: str,
    payload: dict,
    timeout: int = 12,
    require_signature: bool = False,
    expected_nonce: str | None = None,
) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "identity",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BrowserMulti/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8"))
        return license_signing.verify_response(
            data,
            require_signature=require_signature,
            expected_nonce=expected_nonce,
        )


def _get_json(url: str, timeout: int = 12) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BrowserMulti/1.0",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8"))
        return license_signing.verify_response(data)


def _public_key_for_account(account: str) -> str:
    try:
        from core.transfer_security import current_public_key_pem

        return current_public_key_pem(account)
    except Exception:
        return ""


def _status_from_error(exc: Exception, account: str, server_url: str) -> AuthStatus:
    if isinstance(exc, license_signing.SignatureError):
        return AuthStatus(False, f"License server response không tin cậy: {exc}", account, server_url)
    if isinstance(exc, urllib.error.HTTPError):
        raw = ""
        try:
            raw = exc.read().decode("utf-8", errors="replace")
            err = json.loads(raw)
            msg = err.get("message") or err.get("detail") or str(exc)
        except Exception:
            msg = raw.strip() or str(exc)
        return AuthStatus(False, f"Server từ chối ({exc.code}): {msg}", account, server_url)
    return AuthStatus(False, f"Không kết nối được license server: {exc}", account, server_url)


def register_online(account: str, password: str, full_name: str, notes: str, server_url: str | None = None) -> AuthStatus:
    account = account.strip()
    server_url = _trusted_auth_server_url(server_url)
    try:
        data = _post_json(
            f"{server_url}/api/register",
            {
                "account": account,
                "password": password,
                "full_name": full_name.strip(),
                "notes": notes.strip(),
                "public_key": _public_key_for_account(account),
            },
        )
        if not data.get("ok"):
            return AuthStatus(False, data.get("message", "Đăng ký thất bại."), account, server_url)
        return AuthStatus(True, "Đăng ký thành công. Vui lòng chờ admin xét duyệt.", account, server_url)
    except Exception as exc:
        return _status_from_error(exc, account, server_url)


def activate_online(account: str, password: str, license_key: str, server_url: str | None = None) -> AuthStatus:
    account = account.strip()
    server_url = _trusted_auth_server_url(server_url)
    try:
        nonce = license_signing.generate_nonce()
        data = _post_json(
            f"{server_url}/api/activate",
            {
                "account": account,
                "license_key": license_key.strip(),
                "machine_id": machine_id(),
                "app": "BrowserMulti",
                "public_key": _public_key_for_account(account),
                "client_nonce": nonce,
            },
            require_signature=True,
            expected_nonce=nonce,
        )
        if not data.get("ok"):
            return AuthStatus(False, data.get("message", "License không hợp lệ."), account, server_url)
        activate_session = {
            "account": account,
            "server_url": server_url,
            "machine_id": machine_id(),
            "activated_at": datetime.now().isoformat(timespec="seconds"),
        }
        _store_license_key(activate_session, license_key)
        _store_password_fields(activate_session, password)
        _persist_session(activate_session)
        return AuthStatus(True, "Kích hoạt thành công. Chuyển sang đăng nhập.", account, server_url)
    except Exception as exc:
        return _status_from_error(exc, account, server_url)


def login_online(account: str, password: str, server_url: str | None = None) -> AuthStatus:
    account = account.strip()
    server_url = _trusted_auth_server_url(server_url)
    try:
        nonce = license_signing.generate_nonce()
        data = _post_json(
            f"{server_url}/api/login",
            {
                "account": account,
                "password": password,
                "machine_id": machine_id(),
                "public_key": _public_key_for_account(account),
                "client_nonce": nonce,
            },
            require_signature=True,
            expected_nonce=nonce,
        )
        if not data.get("ok"):
            return AuthStatus(False, data.get("message", "Đăng nhập thất bại."), account, server_url)
        session = saved_session()
        previous_account = str(session.get("account") or "").strip()
        if previous_account and previous_account != account:
            session.pop("license_key", None)
            session.pop("license_key_dpapi", None)
        session.update({
            "account": account,
            "server_url": server_url,
            "machine_id": machine_id(),
            "last_login_at": datetime.now().isoformat(timespec="seconds"),
        })
        _store_password_fields(session, password)  # ưu tiên DPAPI, dọn key cũ
        if session.get("license_key") and not session.get("license_key_dpapi"):
            _store_license_key(session, str(session["license_key"]))
        _persist_session(session)
        return AuthStatus(True, "Đăng nhập thành công.", account, server_url)
    except Exception as exc:
        return _status_from_error(exc, account, server_url)


def fetch_public_key(account: str, server_url: str | None = None) -> dict:
    account = account.strip()
    server_url = (server_url or configured_server_url()).strip().rstrip("/")
    if not account:
        return {"ok": False, "message": "Thiếu tài khoản người nhận"}
    try:
        query = urllib.parse.urlencode({"account": account})
        data = _get_json(f"{server_url}/api/public-key?{query}")
        if not data.get("ok"):
            return {"ok": False, "message": data.get("message", "Không lấy được public key của người nhận")}
        return data
    except Exception as exc:
        if isinstance(exc, license_signing.SignatureError):
            return {"ok": False, "message": f"License server response không tin cậy: {exc}"}
        if isinstance(exc, urllib.error.HTTPError):
            raw = ""
            try:
                raw = exc.read().decode("utf-8", errors="replace")
                err = json.loads(raw)
                msg = err.get("message") or err.get("detail") or str(exc)
            except Exception:
                msg = raw.strip() or str(exc)
            return {"ok": False, "message": f"Server từ chối ({exc.code}): {msg}"}
        return {"ok": False, "message": f"Không kết nối được license server: {exc}"}
