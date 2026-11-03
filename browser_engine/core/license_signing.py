"""Verify chữ ký Ed25519 trên response license.

Server (Cloudflare Worker hoặc license_server/server.py) ký toàn bộ payload
JSON bằng khoá riêng Ed25519. Client embed public key compile-time, verify
trước khi tin response. Attacker giả server (sửa hosts/MITM) không có private
key sẽ bị phát hiện.

Định dạng response đã ký:
    {
        "payload": "<base64url của JSON canonical>",
        "sig":     "<base64 signature Ed25519>"
    }

Ba chế độ:
- Lenient: chưa cấu hình public key VÀ ``BROWSERMULTI_LICENSE_STRICT`` chưa
  bật. Response không ký được chấp nhận. Dùng cho dev và rollout.
- Strict-with-key: client có public key (embed/env/file). Mọi response gọi
  với ``require_signature=True`` BẮT BUỘC phải là envelope ký hợp lệ. Sai/
  thiếu sig -> reject. Đây là chế độ production.
- Strict-no-key: ``BROWSERMULTI_LICENSE_STRICT=1`` nhưng chưa có public key.
  Hàm verify từ chối luôn để fail-closed thay vì âm thầm rơi về lenient.
  Dùng để bảo vệ build production lỡ quên embed key.

Public key cấu hình theo thứ tự ưu tiên:
1. Tham số ``public_key_pem`` truyền vào hàm.
2. Biến môi trường ``BROWSERMULTI_LICENSE_PUBKEY_PEM`` (chứa nội dung PEM).
3. Biến môi trường ``BROWSERMULTI_LICENSE_PUBKEY_PATH`` (đường dẫn file PEM).
4. Hằng ``EMBEDDED_PUBLIC_KEY_PEM`` ở dưới (hardcode khi build production).

Bật strict mode ngoài tham số gọi hàm:
- ``BROWSERMULTI_LICENSE_STRICT=1`` -> mọi lần gọi với
  ``require_signature=True`` đều phải có sig hợp lệ, kể cả khi caller mặc
  định lenient.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import secrets
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


# Hardcode public key Ed25519 ở đây trước khi build production. Trong dev có
# thể override qua env ``BROWSERMULTI_LICENSE_PUBKEY_PEM`` /
# ``BROWSERMULTI_LICENSE_PUBKEY_PATH`` để khỏi phải đổi source.
EMBEDDED_PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEALjFmoP7gMjCDgEJm6u0PdvtQGfwxM1PJcPbCK35Gurc=
-----END PUBLIC KEY-----"""


_ENV_PUBKEY_PEM = "BROWSERMULTI_LICENSE_PUBKEY_PEM"
_ENV_PUBKEY_PATH = "BROWSERMULTI_LICENSE_PUBKEY_PATH"
_ENV_STRICT = "BROWSERMULTI_LICENSE_STRICT"


def _strict_mode_enabled() -> bool:
    """True nếu deployer ép strict mode qua env, bất kể đã có public key chưa."""
    raw = os.environ.get(_ENV_STRICT, "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _load_pem_from_env_or_file() -> str:
    """Đọc public key PEM từ env hoặc file. Lỗi -> trả "" để fallback embed."""
    raw = os.environ.get(_ENV_PUBKEY_PEM, "").strip()
    if raw:
        return raw
    path = os.environ.get(_ENV_PUBKEY_PATH, "").strip()
    if path:
        try:
            return Path(path).read_text(encoding="utf-8").strip()
        except Exception as exc:
            logger.warning("Không đọc được %s=%s: %s", _ENV_PUBKEY_PATH, path, exc)
    return ""


class SignatureError(Exception):
    """Response license có vấn đề về chữ ký (giả mạo, lỗi decode, sai key)."""


def _b64url_decode(value: str) -> bytes:
    pad = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + pad)


def _b64_decode(value: str) -> bytes:
    pad = "=" * (-len(value) % 4)
    return base64.b64decode(value + pad)


def generate_nonce() -> str:
    """Sinh nonce ngẫu nhiên cho activate/login để chống replay response đã ký."""
    return secrets.token_urlsafe(32)


def _check_expected_nonce(payload: dict, expected_nonce: str | None) -> None:
    if not expected_nonce:
        return
    actual = str(payload.get("nonce") or "")
    if not actual:
        raise SignatureError("Response thiếu nonce chống replay.")
    if not secrets.compare_digest(actual, expected_nonce):
        raise SignatureError("Response nonce không khớp. Có thể là replay response cũ.")


def _load_public_key(pem: str):
    from cryptography.hazmat.primitives.serialization import load_pem_public_key
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    key = load_pem_public_key(pem.encode("utf-8"))
    if not isinstance(key, Ed25519PublicKey):
        raise SignatureError("Public key không phải Ed25519")
    return key


def effective_public_key_pem(public_key_pem: str | None = None) -> str:
    """Trả về public key PEM đang áp dụng, theo thứ tự ưu tiên.

    1. Tham số trực tiếp.
    2. ``BROWSERMULTI_LICENSE_PUBKEY_PEM`` env.
    3. ``BROWSERMULTI_LICENSE_PUBKEY_PATH`` env.
    4. ``EMBEDDED_PUBLIC_KEY_PEM`` build constant.
    """
    if public_key_pem and public_key_pem.strip():
        return public_key_pem.strip()
    env_pem = _load_pem_from_env_or_file()
    if env_pem:
        return env_pem
    if EMBEDDED_PUBLIC_KEY_PEM and EMBEDDED_PUBLIC_KEY_PEM.strip():
        return EMBEDDED_PUBLIC_KEY_PEM.strip()
    return ""


def is_signed_envelope(data: Any) -> bool:
    """True nếu response có dạng envelope đã ký {payload, sig}."""
    return (
        isinstance(data, dict)
        and isinstance(data.get("payload"), str)
        and isinstance(data.get("sig"), str)
    )


def _decode_envelope_payload(data: Any) -> dict:
    """Giải payload từ envelope mà KHÔNG verify (dùng cho lenient)."""
    if is_signed_envelope(data):
        try:
            return json.loads(_b64url_decode(data["payload"]).decode("utf-8"))
        except Exception:
            logger.warning("Không giải được payload envelope (lenient mode)")
            return data if isinstance(data, dict) else {}
    return data if isinstance(data, dict) else {}


def verify_response(
    data: Any,
    public_key_pem: str | None = None,
    *,
    require_signature: bool = False,
    expected_nonce: str | None = None,
) -> dict:
    """Verify và trả về payload JSON đã giải.

    require_signature=False (mặc định): lenient. Chỉ giải payload nếu là
    envelope, không bắt buộc chữ ký. Dùng cho endpoint không cấp quyền truy
    cập (register, public-key, version).

    require_signature=True: luôn bắt buộc public key và envelope ký hợp lệ;
    thiếu/sai chữ ký -> raise SignatureError. Dùng cho activate/login.

    expected_nonce: nếu truyền vào, payload đã verify phải echo đúng nonce
    này để chặn replay response hợp lệ đã ký từ request trước.
    """
    pem = effective_public_key_pem(public_key_pem)
    strict_env = _strict_mode_enabled()

    # Any auth response that requests signature verification must fail closed.
    if require_signature and not pem:
        raise SignatureError(
            "Thiếu public key license để xác minh response ký. Từ chối tiếp tục."
        )
    if strict_env and not pem:
        raise SignatureError(
            "Strict mode bật (BROWSERMULTI_LICENSE_STRICT) nhưng chưa cấu "
            "hình public key. Từ chối response không ký."
        )

    # Non-auth endpoints remain lenient unless deployment enables strict mode.
    if not require_signature:
        payload = _decode_envelope_payload(data)
        if expected_nonce and is_signed_envelope(data):
            _check_expected_nonce(payload, expected_nonce)
        return payload

    # Strict auth path: envelope and signature are mandatory.
    if not is_signed_envelope(data):
        raise SignatureError(
            "Response không có chữ ký số. Có thể server bị giả mạo (MITM/hosts)."
        )

    try:
        payload_bytes = _b64url_decode(data["payload"])
        signature = _b64_decode(data["sig"])
    except Exception as exc:
        raise SignatureError(f"Không decode được payload/sig: {exc}") from exc

    try:
        key = _load_public_key(pem)
        key.verify(signature, payload_bytes)
    except SignatureError:
        raise
    except Exception as exc:
        raise SignatureError(
            "Chữ ký không hợp lệ — response có thể bị giả mạo."
        ) from exc

    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        raise SignatureError(f"Payload không phải JSON hợp lệ: {exc}") from exc
    _check_expected_nonce(payload, expected_nonce)
    return payload


# --- Tiện ích chỉ dùng trong test / tooling tạo key (không gọi khi runtime app) ---

def generate_keypair_pem() -> tuple[str, str]:
    """Sinh cặp khoá Ed25519, trả (private_pem, public_pem). Dùng cho admin tooling."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization

    priv = Ed25519PrivateKey.generate()
    private_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = priv.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return private_pem, public_pem


def sign_payload(payload: dict, private_key_pem: str) -> dict:
    """Ký payload -> envelope {payload, sig}. Dùng cho test / server Python."""
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    canonical = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(canonical).decode("ascii").rstrip("=")
    payload_bytes = _b64url_decode(payload_b64)
    priv = load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
    signature = priv.sign(payload_bytes)  # type: ignore[attr-defined]
    sig_b64 = base64.b64encode(signature).decode("ascii")
    return {"payload": payload_b64, "sig": sig_b64}