"""DPAPI-backed provider credentials for local AI comments."""
from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from typing import Any

from core import secure_store
from core.paths import user_data_path

logger = logging.getLogger(__name__)
_PATH = user_data_path("security", "ai_provider_credentials.json")
_LOCK = threading.RLock()


class CredentialError(ValueError):
    pass


def _read() -> dict[str, Any]:
    try:
        data = json.loads(_PATH.read_text(encoding="utf-8")) if _PATH.exists() else {}
        return data if isinstance(data, dict) else {}
    except Exception:
        logger.warning("Khong doc duoc AI provider credentials", exc_info=True)
        return {}


def _write(data: dict[str, Any]) -> None:
    _PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _PATH.with_suffix(_PATH.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(_PATH)


def _protect(value: str) -> str:
    if not secure_store.is_available():
        raise CredentialError("DPAPI khong kha dung nen khong the luu credential AI")
    return secure_store.protect(value)


def _unprotect(value: Any) -> str:
    if not isinstance(value, str) or not value:
        return ""
    if not secure_store.is_dpapi_token(value):
        return ""
    try:
        return secure_store.unprotect(value)
    except Exception:
        logger.warning("Khong giai ma duoc credential AI", exc_info=True)
        return ""


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def list_public() -> dict[str, dict[str, Any]]:
    with _LOCK:
        raw = _read().get("providers")
    if not isinstance(raw, dict):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for provider, item in raw.items():
        if not isinstance(item, dict):
            continue
        result[str(provider)] = {
            "account_hint": str(item.get("account_hint") or "")[:200],
            "expires_at": str(item.get("expires_at") or "")[:40],
            "project_id": str(item.get("project_id") or "")[:200],
            "api_key_configured": bool(item.get("api_key_dpapi")),
            "oauth_connected": bool(item.get("access_token_dpapi") or item.get("refresh_token_dpapi")),
        }
    return result


def get(provider: str) -> dict[str, Any]:
    with _LOCK:
        item = _read().get("providers", {}).get(provider, {})
    if not isinstance(item, dict):
        return {}
    return {
        "access_token": _unprotect(item.get("access_token_dpapi")),
        "refresh_token": _unprotect(item.get("refresh_token_dpapi")),
        "api_key": _unprotect(item.get("api_key_dpapi")),
        "account_hint": str(item.get("account_hint") or "")[:200],
        "expires_at": str(item.get("expires_at") or "")[:40],
        "project_id": str(item.get("project_id") or "")[:200],
        "scope": str(item.get("scope") or "")[:500],
    }


def save_api_key(provider: str, api_key: str) -> None:
    value = str(api_key or "").strip()
    if not value:
        raise CredentialError("API key rong")
    with _LOCK:
        data = _read()
        providers = data.setdefault("providers", {})
        item = providers.setdefault(provider, {})
        item["api_key_dpapi"] = _protect(value)
        item["updated_at"] = _now()
        _write(data)


def save_oauth(provider: str, *, access_token: str, refresh_token: str = "", expires_in: int = 3600, account_hint: str = "", project_id: str = "", scope: str = "") -> None:
    if not str(access_token or "").strip():
        raise CredentialError("OAuth khong tra access token")
    expires_at = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + max(60, int(expires_in or 3600)), tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    with _LOCK:
        data = _read()
        providers = data.setdefault("providers", {})
        old = providers.get(provider) if isinstance(providers.get(provider), dict) else {}
        item = dict(old)
        item["access_token_dpapi"] = _protect(str(access_token).strip())
        if refresh_token:
            item["refresh_token_dpapi"] = _protect(str(refresh_token).strip())
        item.update({"account_hint": str(account_hint or "")[:200], "project_id": str(project_id or "")[:200], "scope": str(scope or "")[:500], "expires_at": expires_at, "updated_at": _now()})
        providers[provider] = item
        _write(data)


def clear_api_key(provider: str) -> bool:
    with _LOCK:
        data = _read()
        providers = data.get("providers")
        item = providers.get(provider) if isinstance(providers, dict) else None
        if not isinstance(item, dict) or "api_key_dpapi" not in item:
            return False
        item.pop("api_key_dpapi", None)
        _write(data)
        return True


def disconnect(provider: str) -> bool:
    with _LOCK:
        data = _read()
        providers = data.get("providers")
        if not isinstance(providers, dict) or provider not in providers:
            return False
        providers.pop(provider, None)
        _write(data)
        return True
