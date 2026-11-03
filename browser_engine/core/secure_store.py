"""Mã hóa chuỗi nhạy cảm (mật khẩu license) bằng Windows DPAPI.

DPAPI ràng buộc dữ liệu mã hóa với user account hiện tại trên chính máy đó:
- Chỉ user đã mã hóa, trên đúng máy đó, mới giải mã được.
- Copy license.json sang máy/user khác sẽ KHÔNG giải mã được.

Gọi trực tiếp crypt32.dll qua ctypes để không phải thêm dependency pywin32.
Có fallback an toàn: nếu DPAPI không khả dụng (môi trường non-Windows, lỗi),
hàm sẽ raise để caller xử lý — KHÔNG âm thầm lưu plaintext.
"""
from __future__ import annotations

import base64
import ctypes
import sys
from ctypes import wintypes

__all__ = ["protect", "unprotect", "protect_bytes", "unprotect_bytes", "is_available", "DPAPIError"]


class DPAPIError(Exception):
    """Lỗi khi mã hóa/giải mã bằng DPAPI."""


_DPAPI_PREFIX = "dpapi:"


class _DATA_BLOB(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_char)),
    ]


def is_available() -> bool:
    """True nếu DPAPI dùng được (Windows + load được crypt32)."""
    if sys.platform != "win32":
        return False
    try:
        ctypes.WinDLL("crypt32.dll")
        return True
    except Exception:
        return False


def _to_blob(data: bytes) -> tuple[_DATA_BLOB, ctypes.Array[ctypes.c_char]]:
    buf = ctypes.create_string_buffer(data, len(data))
    blob = _DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    return blob, buf


def _from_blob(blob: _DATA_BLOB) -> bytes:
    size = int(blob.cbData)
    try:
        return ctypes.string_at(blob.pbData, size)
    finally:
        # Giải phóng buffer do CryptProtectData/CryptUnprotectData cấp phát
        ctypes.windll.kernel32.LocalFree(blob.pbData)


def protect_bytes(plaintext: bytes) -> str:
    """Mã hóa bytes -> token 'dpapi:<base64>'. Raise DPAPIError nếu thất bại."""
    if not is_available():
        raise DPAPIError("DPAPI không khả dụng trên môi trường này")
    crypt32 = ctypes.WinDLL("crypt32.dll")
    data_in, _in_buf = _to_blob(plaintext)
    data_out = _DATA_BLOB()
    # CRYPTPROTECT_UI_FORBIDDEN = 0x1 (không bật prompt UI)
    ok = crypt32.CryptProtectData(
        ctypes.byref(data_in), None, None, None, None, 0x1, ctypes.byref(data_out)
    )
    if not ok:
        raise DPAPIError(f"CryptProtectData thất bại (err={ctypes.GetLastError()})")
    encrypted = _from_blob(data_out)
    return _DPAPI_PREFIX + base64.b64encode(encrypted).decode("ascii")


def unprotect_bytes(token: str) -> bytes:
    """Giải mã token 'dpapi:<base64>' -> bytes gốc. Raise DPAPIError nếu thất bại."""
    if not token.startswith(_DPAPI_PREFIX):
        raise DPAPIError("Token không phải định dạng DPAPI")
    if not is_available():
        raise DPAPIError("DPAPI không khả dụng trên môi trường này")
    crypt32 = ctypes.WinDLL("crypt32.dll")
    try:
        raw = base64.b64decode(token[len(_DPAPI_PREFIX):].encode("ascii"), validate=True)
    except Exception as exc:
        raise DPAPIError("Token DPAPI không hợp lệ") from exc
    data_in, _in_buf = _to_blob(raw)
    data_out = _DATA_BLOB()
    ok = crypt32.CryptUnprotectData(
        ctypes.byref(data_in), None, None, None, None, 0x1, ctypes.byref(data_out)
    )
    if not ok:
        raise DPAPIError(f"CryptUnprotectData thất bại (err={ctypes.GetLastError()})")
    return _from_blob(data_out)


def protect(plaintext: str) -> str:
    """Mã hóa chuỗi UTF-8 -> token DPAPI."""
    return protect_bytes(plaintext.encode("utf-8"))


def unprotect(token: str) -> str:
    """Giải mã token DPAPI -> chuỗi UTF-8."""
    try:
        return unprotect_bytes(token).decode("utf-8")
    except UnicodeDecodeError as exc:
        raise DPAPIError("Token DPAPI không chứa chuỗi UTF-8") from exc


def is_dpapi_token(value: object) -> bool:
    return isinstance(value, str) and value.startswith(_DPAPI_PREFIX)
