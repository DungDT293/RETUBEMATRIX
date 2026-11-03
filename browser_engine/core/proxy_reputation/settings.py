"""Provider settings for proxy reputation checks.

API keys are encrypted with Windows DPAPI via core.secure_store. Public status
never returns secret values to the UI.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from core import secure_store
from core.paths import app_path

logger = logging.getLogger(__name__)

_SETTINGS_PATH = app_path("security", "proxy_reputation_settings.json")
PROVIDERS = ("ipqualityscore", "scamalytics", "proxycheck", "ip2proxy", "maxmind")
DEFAULT_TIMEOUT_MS = 3500
DEFAULT_CACHE_TTL_HOURS = 12

_PROVIDER_LABELS = {
    "ipqualityscore": "IPQualityScore",
    "scamalytics": "Scamalytics",
    "proxycheck": "ProxyCheck.io",
    "ip2proxy": "IP2Proxy",
    "maxmind": "MaxMind minFraud",
}

_DEFAULT_PROVIDER_SETTINGS = {
    name: {
        "enabled": False,
        "api_key": "",
        "account_id": "",
        "license_key": "",
    }
    for name in PROVIDERS
}


def _read_raw() -> dict[str, Any]:
    try:
        if _SETTINGS_PATH.exists():
            data = json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception as exc:
        logger.warning("Khong doc duoc proxy_reputation_settings.json: %s", exc)
    return {}


def _write_raw(data: dict[str, Any]) -> None:
    _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SETTINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _decrypt_secret(stored: Any) -> str:
    if not isinstance(stored, str) or not stored:
        return ""
    if secure_store.is_dpapi_token(stored):
        try:
            return secure_store.unprotect(stored)
        except secure_store.DPAPIError as exc:
            logger.warning("Khong giai ma duoc proxy reputation key: %s", exc)
            return ""
    return stored


def _protect_secret(value: str) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    if not secure_store.is_available():
        raise secure_store.DPAPIError("DPAPI khong kha dung nen khong the luu API key proxy reputation")
    return secure_store.protect(value)


def _provider_settings(raw_provider: Any, name: str, *, include_secret: bool) -> dict[str, Any]:
    data = raw_provider if isinstance(raw_provider, dict) else {}
    result = dict(_DEFAULT_PROVIDER_SETTINGS[name])
    result.update({k: v for k, v in data.items() if k in result})
    api_key = _decrypt_secret(result.get("api_key"))
    license_key = _decrypt_secret(result.get("license_key"))
    account_id = str(result.get("account_id") or "").strip()
    public = {
        "name": name,
        "label": _PROVIDER_LABELS[name],
        "enabled": bool(result.get("enabled", False)),
        "key_configured": bool(api_key or license_key),
        "account_id_configured": bool(account_id),
    }
    if include_secret:
        public.update({
            "api_key": api_key,
            "license_key": license_key,
            "account_id": account_id,
        })
    return public


def get_settings(*, include_secret: bool = False) -> dict[str, Any]:
    raw = _read_raw()
    providers_raw = raw.get("providers") if isinstance(raw.get("providers"), dict) else {}
    try:
        timeout_ms = int(raw.get("timeout_ms", DEFAULT_TIMEOUT_MS))
    except (TypeError, ValueError):
        timeout_ms = DEFAULT_TIMEOUT_MS
    try:
        cache_ttl_hours = int(raw.get("cache_ttl_hours", DEFAULT_CACHE_TTL_HOURS))
    except (TypeError, ValueError):
        cache_ttl_hours = DEFAULT_CACHE_TTL_HOURS
    return {
        "enabled": bool(raw.get("enabled", False)),
        "timeout_ms": max(1000, min(15000, timeout_ms)),
        "cache_ttl_hours": max(1, min(168, cache_ttl_hours)),
        "providers": {
            name: _provider_settings(providers_raw.get(name), name, include_secret=include_secret)
            for name in PROVIDERS
        },
    }


def public_status() -> dict[str, Any]:
    return get_settings(include_secret=False)


def save_settings(payload: dict[str, Any]) -> dict[str, Any]:
    raw = _read_raw()
    if "enabled" in payload:
        raw["enabled"] = bool(payload.get("enabled"))
    if "timeout_ms" in payload:
        try:
            raw["timeout_ms"] = max(1000, min(15000, int(payload.get("timeout_ms"))))
        except (TypeError, ValueError):
            raw["timeout_ms"] = DEFAULT_TIMEOUT_MS
    if "cache_ttl_hours" in payload:
        try:
            raw["cache_ttl_hours"] = max(1, min(168, int(payload.get("cache_ttl_hours"))))
        except (TypeError, ValueError):
            raw["cache_ttl_hours"] = DEFAULT_CACHE_TTL_HOURS

    providers_raw = raw.get("providers") if isinstance(raw.get("providers"), dict) else {}
    incoming = payload.get("providers") if isinstance(payload.get("providers"), dict) else {}
    for name in PROVIDERS:
        if name not in incoming:
            continue
        current = providers_raw.get(name) if isinstance(providers_raw.get(name), dict) else {}
        update = incoming.get(name) if isinstance(incoming.get(name), dict) else {}
        if "enabled" in update:
            current["enabled"] = bool(update.get("enabled"))
        if "account_id" in update:
            current["account_id"] = str(update.get("account_id") or "").strip()
        if update.get("clear_key"):
            current.pop("api_key", None)
            current.pop("license_key", None)
        api_key = str(update.get("api_key") or "").strip()
        license_key = str(update.get("license_key") or "").strip()
        if api_key:
            current["api_key"] = _protect_secret(api_key)
        if license_key:
            current["license_key"] = _protect_secret(license_key)
        providers_raw[name] = current
    raw["providers"] = providers_raw
    _write_raw(raw)
    return public_status()
