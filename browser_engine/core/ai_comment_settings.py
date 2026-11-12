"""Encrypted local settings for the AI comment generator.

Stores the API key encrypted with Windows DPAPI under ``security/`` (gitignored).
Non-sensitive options (endpoint, model, enabled, temperature) are kept in the
same JSON file in clear text because they are not secrets.

The key is never returned to the UI; callers only learn whether a key is set.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from core import secure_store
from core.paths import user_data_path
from core import ai_oauth_store
from core import ai_provider_registry

logger = logging.getLogger(__name__)

_SETTINGS_PATH = user_data_path("security", "ai_comment_settings.json")
DEFAULT_ENDPOINT = "http://localhost:20128/v1"
DEFAULT_MODEL = "local-model"
DEFAULT_TEMPERATURE = 0.8


def _read_raw() -> dict[str, Any]:
    try:
        if _SETTINGS_PATH.exists():
            data = json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception as exc:
        logger.warning("Khong doc duoc ai_comment_settings.json: %s", exc)
    return {}


def _write_raw(data: dict[str, Any]) -> None:
    _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SETTINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_settings() -> dict[str, Any]:
    raw = _read_raw()
    endpoint = str(raw.get("endpoint") or DEFAULT_ENDPOINT).strip() or DEFAULT_ENDPOINT
    model = str(raw.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    try:
        temperature = float(raw.get("temperature", DEFAULT_TEMPERATURE))
    except (TypeError, ValueError):
        temperature = DEFAULT_TEMPERATURE
    temperature = max(0.0, min(2.0, temperature))
    provider_id = str(raw.get("provider_id") or "custom_openai_compatible").strip().lower()
    if provider_id not in ai_provider_registry.PROVIDERS:
        provider_id = "custom_openai_compatible"
    fallback_to_manual = bool(raw.get("fallback_to_manual", True))
    credential = ai_oauth_store.get(provider_id)
    stored_key = str(credential.get("api_key") or "").strip()
    return {
        "enabled": bool(raw.get("enabled", False)),
        "provider_id": provider_id,
        "endpoint": endpoint,
        "model": model,
        "temperature": temperature,
        "api_key": stored_key,
        "credential": credential,
        "key_configured": bool(stored_key),
        "oauth_connected": bool(credential.get("access_token") or credential.get("refresh_token")),
        "account_hint": credential.get("account_hint") or "",
        "fallback_to_manual": fallback_to_manual,
    }


def public_status() -> dict[str, Any]:
    """Settings safe to send to the UI (never includes the API key value)."""
    settings = get_settings()
    return {
        "enabled": settings["enabled"],
        "provider_id": settings["provider_id"],
        "endpoint": settings["endpoint"],
        "model": settings["model"],
        "temperature": settings["temperature"],
        "key_configured": settings["key_configured"],
        "oauth_connected": settings["oauth_connected"],
        "account_hint": settings["account_hint"],
        "fallback_to_manual": settings["fallback_to_manual"],
    }


def save_settings(
    *,
    enabled: bool | None = None,
    endpoint: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    api_key: str | None = None,
    clear_key: bool = False,
    provider_id: str | None = None,
    fallback_to_manual: bool | None = None,
) -> dict[str, Any]:
    raw = _read_raw()

    if enabled is not None:
        raw["enabled"] = bool(enabled)
    if provider_id is not None:
        raw["provider_id"] = str(provider_id).strip().lower() or "custom_openai_compatible"
    if fallback_to_manual is not None:
        raw["fallback_to_manual"] = bool(fallback_to_manual)
    if endpoint is not None:
        raw["endpoint"] = str(endpoint).strip() or DEFAULT_ENDPOINT
    if model is not None:
        raw["model"] = str(model).strip() or DEFAULT_MODEL
    if temperature is not None:
        try:
            raw["temperature"] = max(0.0, min(2.0, float(temperature)))
        except (TypeError, ValueError):
            raw["temperature"] = DEFAULT_TEMPERATURE

    provider = str(raw.get("provider_id") or "custom_openai_compatible").strip().lower()
    if clear_key:
        raw.pop("api_key", None)
        ai_oauth_store.clear_api_key(provider)
    elif api_key is not None:
        key_value = str(api_key).strip()
        if key_value:
            if not secure_store.is_available():
                raise secure_store.DPAPIError("DPAPI khong kha dung nen khong the luu API key AI comment")
            provider = str(raw.get("provider_id") or "custom_openai_compatible").strip().lower()
        ai_oauth_store.save_api_key(provider, key_value)
        raw.pop("api_key", None)

    _write_raw(raw)
    return public_status()
