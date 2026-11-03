"""Client helpers for profile transfer inbox relay.

The relay server stores only encrypted .bmprofile packages. Decryption still
happens locally through core.profile_package using the receiver private key.
"""
from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

# Prioritize IPv4 over IPv6 on Windows to avoid 21s TCP SYN timeouts when ISP IPv6 routing to Cloudflare is broken
_orig_getaddrinfo = socket.getaddrinfo

def _getaddrinfo_prefer_ipv4(host: Any, port: Any, family: int = 0, type: int = 0, proto: int = 0, flags: int = 0) -> Any:
    res = _orig_getaddrinfo(host, port, family, type, proto, flags)
    return sorted(res, key=lambda x: 0 if x[0] == socket.AF_INET else 1)

socket.getaddrinfo = _getaddrinfo_prefer_ipv4

from core.license_client import configured_server_url, machine_id, saved_session, session_license_key
from core.paths import profile_data_path
from core.profile_package import import_profile_package

INBOX_DOWNLOAD_DIR = profile_data_path("exports", "inbox")


def _server_url(server_url: str | None = None) -> str:
    return (server_url or configured_server_url()).strip().rstrip("/")


def _auth_headers() -> dict[str, str]:
    session = saved_session()
    account = str(session.get("account") or "").strip()
    license_key = session_license_key(session)
    session_machine_id = str(session.get("machine_id") or "").strip().upper()
    current_machine_id = str(machine_id() or "").strip().upper()
    if not account:
        raise ValueError("Chưa đăng nhập tài khoản BrowserMulti")
    if not license_key:
        raise ValueError("Tài khoản hiện tại chưa có license_key để xác thực chuyển profile")
    return {
        "X-BrowserMulti-Account": account,
        "X-BrowserMulti-License": license_key,
        "X-BrowserMulti-Machine": session_machine_id or current_machine_id,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BrowserMulti/1.0",
    }


def _read_error(exc: urllib.error.HTTPError) -> str:
    raw = ""
    try:
        raw = exc.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        return str(data.get("message") or data.get("detail") or raw or exc)
    except Exception:
        return raw.strip() or str(exc)


def _request_json(method: str, path: str, payload: dict[str, Any] | None = None, server_url: str | None = None) -> dict[str, Any]:
    url = _server_url(server_url) + path
    data = json.dumps(payload or {}).encode("utf-8") if payload is not None else None
    headers = {"Accept": "application/json", **_auth_headers()}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ValueError(f"Server chuyển profile từ chối ({exc.code}): {_read_error(exc)}") from exc
    except Exception as exc:
        raise ValueError(f"Không kết nối được server chuyển profile: {exc}") from exc


def _request_bytes(method: str, path: str, body: bytes | None = None, server_url: str | None = None) -> bytes:
    url = _server_url(server_url) + path
    headers = {"Accept": "application/octet-stream", **_auth_headers()}
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise ValueError(f"Server chuyển profile từ chối ({exc.code}): {_read_error(exc)}") from exc
    except Exception as exc:
        raise ValueError(f"Không tải được gói chuyển profile: {exc}") from exc


def send_profile_transfer(
    package_path: str,
    *,
    receiver_account: str,
    manifest: dict[str, Any] | None = None,
    server_url: str | None = None,
) -> dict[str, Any]:
    receiver = str(receiver_account or "").strip()
    if not receiver:
        raise ValueError("Thiếu tài khoản người nhận")
    source = Path(package_path).expanduser()
    if not source.exists():
        raise ValueError("Không tìm thấy file .bmprofile để gửi")
    if source.suffix.lower() != ".bmprofile":
        raise ValueError("Chỉ gửi file .bmprofile")

    meta = manifest or {}
    query = urllib.parse.urlencode(
        {
            "receiver_account": receiver,
            "profile_name": str(meta.get("profile_name") or source.stem),
            "export_type": str(meta.get("export_type") or "full"),
            "profile_has_proxy": "1" if meta.get("profile_has_proxy") else "0",
        }
    )
    response = _request_bytes("POST", f"/api/transfers?{query}", source.read_bytes(), server_url)
    try:
        return json.loads(response.decode("utf-8"))
    except Exception as exc:
        raise ValueError("Server chuyển profile trả dữ liệu không hợp lệ") from exc


def list_transfer_inbox(server_url: str | None = None) -> dict[str, Any]:
    return _request_json("GET", "/api/transfers/inbox", server_url=server_url)

def list_transfer_sent(server_url: str | None = None) -> dict[str, Any]:
    return _request_json("GET", "/api/transfers/sent", server_url=server_url)


def download_transfer_package(transfer_id: str, server_url: str | None = None) -> dict[str, Any]:
    transfer = str(transfer_id or "").strip()
    if not transfer:
        raise ValueError("Thiếu mã chuyển profile")
    content = _request_bytes("GET", f"/api/transfers/{urllib.parse.quote(transfer)}/download", server_url=server_url)
    INBOX_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    path = INBOX_DOWNLOAD_DIR / f"{transfer}.bmprofile"
    path.write_bytes(content)
    return {"ok": True, "path": str(path), "size_bytes": path.stat().st_size, "transfer_id": transfer}


def import_transfer_package(transfer_id: str, server_url: str | None = None, *, regenerate_fingerprint_seed: bool = False) -> dict[str, Any]:
    transfer = str(transfer_id or "").strip()
    if not transfer:
        raise ValueError("Thiếu mã chuyển profile")

    from core.profile_store import load_profiles, update_profile
    for existing in load_profiles():
        if str(existing.get("inbox_transfer_id") or "") == transfer or str(existing.get("transfer_id") or "") == transfer:
            mark_transfer_imported(transfer, server_url)
            return {"ok": True, "profile": existing, "already_imported": True}

    downloaded = download_transfer_package(transfer, server_url)
    try:
        imported = import_profile_package(downloaded["path"], regenerate_fingerprint_seed=regenerate_fingerprint_seed)
        profile_data = imported.get("profile")
        if isinstance(profile_data, dict) and profile_data.get("id"):
            update_profile(profile_data["id"], inbox_transfer_id=transfer, transfer_id=transfer)
            profile_data["inbox_transfer_id"] = transfer
            profile_data["transfer_id"] = transfer
        mark_transfer_imported(transfer, server_url)
        return {"ok": True, "download": downloaded, **imported}
    finally:
        try:
            Path(downloaded["path"]).unlink(missing_ok=True)
        except Exception:
            pass


def mark_transfer_imported(transfer_id: str, server_url: str | None = None) -> dict[str, Any]:
    transfer = str(transfer_id or "").strip()
    return _request_json("PATCH", f"/api/transfers/{urllib.parse.quote(transfer)}/imported", {}, server_url)


def delete_transfer(transfer_id: str, server_url: str | None = None) -> dict[str, Any]:
    transfer = str(transfer_id or "").strip()
    return _request_json("DELETE", f"/api/transfers/{urllib.parse.quote(transfer)}", server_url=server_url)
