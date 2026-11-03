"""Provider capabilities and bounded native adapters for YouTube AI comments.

No provider credential is defined in source. OAuth clients are configured by the
packager or deployment through environment variables; DPAPI credential material
is loaded separately by ``core.ai_oauth_store``.
"""
from __future__ import annotations

import base64
import hashlib
import ipaddress
import logging
import os
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urlparse

import aiohttp

logger = logging.getLogger(__name__)
REQUEST_TIMEOUT_SECONDS = 12


@dataclass(frozen=True)
class ProviderSpec:
    provider_id: str
    label: str
    auth_modes: tuple[str, ...]
    oauth_supported: bool
    default_model: str
    reason: str = ""
    fixed_callback: str = ""


PROVIDERS: dict[str, ProviderSpec] = {
    "custom_openai_compatible": ProviderSpec(
        "custom_openai_compatible", "Custom OpenAI-compatible", ("api_key",), False, "local-model"
    ),
    "9router_local": ProviderSpec(
        "9router_local", "9Router local", ("api_key",), False, "local-model"
    ),
    "gemini_cli": ProviderSpec(
        "gemini_cli", "Gemini / Google", ("oauth",), True, "gemini-2.5-flash"
    ),
    "xai": ProviderSpec("xai", "Grok / xAI", ("oauth",), True, "grok-3-mini"),
    "openai_codex": ProviderSpec(
        "openai_codex",
        "OpenAI Codex",
        (),
        False,
        "gpt-5.4",
        reason="OpenAI Codex OAuth chua duoc ho tro: BrowserMulti chua co callback listener 127.0.0.1:1455.",
    ),
    "deepseek": ProviderSpec(
        "deepseek", "DeepSeek", ("api_key",), False, "deepseek-chat", reason="DeepSeek chi ho tro API key."
    ),
    "claude": ProviderSpec(
        "claude", "Claude", (), False, "", reason="Claude OAuth subscription/private endpoint chua duoc BrowserMulti ho tro."
    ),
}


def get_provider(provider_id: str | None) -> ProviderSpec | None:
    return PROVIDERS.get(str(provider_id or "").strip().lower())


def _oauth_config(provider_id: str) -> dict[str, str]:
    prefix = "BROWSERMULTI_" + provider_id.upper() + "_OAUTH_"
    client_id = os.environ.get(prefix + "CLIENT_ID", "").strip()
    client_secret = os.environ.get(prefix + "CLIENT_SECRET", "").strip()
    if provider_id == "gemini_cli":
        return {
            "client_id": client_id,
            "client_secret": client_secret,
            "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url": "https://oauth2.googleapis.com/token",
        }
    if provider_id == "xai":
        return {
            "client_id": client_id,
            "client_secret": client_secret,
            "authorize_url": "https://auth.x.ai/oauth2/authorize",
            "token_url": "https://auth.x.ai/oauth2/token",
        }
    if provider_id == "openai_codex":
        return {
            "client_id": client_id,
            "client_secret": client_secret,
            "authorize_url": "https://auth.openai.com/oauth/authorize",
            "token_url": "https://auth.openai.com/oauth/token",
        }
    return {}


def oauth_ready(provider_id: str) -> bool:
    config = _oauth_config(provider_id)
    return bool(config.get("client_id"))


def provider_status(credentials: dict[str, dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    credentials = credentials or {}
    result = []
    for spec in PROVIDERS.values():
        stored = credentials.get(spec.provider_id) or {}
        configured = oauth_ready(spec.provider_id) if spec.oauth_supported else False
        reason = spec.reason
        if spec.oauth_supported and not configured:
            reason = "OAuth client chua duoc cau hinh trong app."
        result.append({
            "id": spec.provider_id,
            "label": spec.label,
            "auth_modes": list(spec.auth_modes),
            "oauth_supported": spec.oauth_supported,
            "oauth_configured": configured,
            "key_configured": bool(stored.get("api_key_configured")),
            "oauth_connected": bool(stored.get("oauth_connected")),
            "account_hint": stored.get("account_hint") or None,
            "expires_at": stored.get("expires_at") or None,
            "reason": reason or None,
        })
    return result


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode("ascii")
    return verifier, challenge


def build_oauth_start(provider_id: str, redirect_uri: str, state: str) -> dict[str, str]:
    spec = get_provider(provider_id)
    if spec is None:
        raise ValueError("provider khong hop le")
    config = _oauth_config(provider_id)
    if not spec.oauth_supported or not config.get("client_id"):
        raise ValueError(spec.reason or "OAuth client chua duoc cau hinh")
    verifier, challenge = _pkce_pair()
    if provider_id == "gemini_cli":
        params = {
            "client_id": config["client_id"], "response_type": "code", "redirect_uri": redirect_uri,
            "scope": "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
            "state": state, "access_type": "offline", "prompt": "consent",
            "code_challenge": challenge, "code_challenge_method": "S256",
        }
    elif provider_id == "xai":
        params = {
            "client_id": config["client_id"], "response_type": "code", "redirect_uri": redirect_uri,
            "scope": "openid profile email offline_access api:access", "state": state,
            "code_challenge": challenge, "code_challenge_method": "S256",
        }
    else:
        params = {
            "client_id": config["client_id"], "response_type": "code", "redirect_uri": redirect_uri,
            "scope": "openid profile email offline_access", "state": state,
            "code_challenge": challenge, "code_challenge_method": "S256",
            "id_token_add_organizations": "true", "codex_cli_simplified_flow": "true", "originator": "codex_cli_rs",
        }
    return {"authorize_url": config["authorize_url"] + "?" + urlencode(params), "code_verifier": verifier}


def validate_endpoint(endpoint: str) -> str:
    value = str(endpoint or "").strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("endpoint AI phai la HTTP(S) URL hop le")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("endpoint AI khong duoc chua credential, query, hoac fragment")
    host = parsed.hostname.lower()
    if parsed.scheme == "http" and host not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("endpoint HTTP chi duoc phep o localhost")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_loopback and parsed.scheme != "https":
        raise ValueError("endpoint private khong phai localhost bi chan")
    return value


async def exchange_oauth_code(provider_id: str, code: str, redirect_uri: str, verifier: str) -> dict[str, Any]:
    code = str(code or "").strip()
    config = _oauth_config(provider_id)
    if not code or len(code) > 20000:
        raise ValueError("authorization code khong hop le")
    if not config.get("client_id"):
        raise ValueError("OAuth client chua duoc cau hinh")
    token_url = config.get("token_url", "")
    token_host = urlparse(token_url).hostname or ""
    allowed = {"oauth2.googleapis.com", "auth.x.ai", "auth.openai.com"}
    if urlparse(token_url).scheme != "https" or token_host not in allowed:
        raise ValueError("OAuth token endpoint khong an toan")
    body = {
        "grant_type": "authorization_code", "client_id": config["client_id"], "code": code,
        "redirect_uri": redirect_uri, "code_verifier": verifier,
    }
    if config.get("client_secret"):
        body["client_secret"] = config["client_secret"]
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(token_url, data=body, headers={"Accept": "application/json"}) as response:
            if response.status != 200:
                raise RuntimeError(f"OAuth token exchange HTTP {response.status}")
            data = await response.json(content_type=None)
    if not isinstance(data, dict) or not data.get("access_token"):
        raise RuntimeError("OAuth khong tra access token")
    account_hint = ""
    project_id = ""
    if provider_id == "gemini_cli":
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", headers={"Authorization": f"Bearer {data['access_token']}"}) as response:
                    user = await response.json(content_type=None) if response.ok else {}
            account_hint = str(user.get("email") or "")[:200]
        except Exception:
            logger.debug("Gemini user info unavailable", exc_info=True)
    return {
        "access_token": str(data["access_token"]), "refresh_token": str(data.get("refresh_token") or ""),
        "expires_in": int(data.get("expires_in") or 3600), "scope": str(data.get("scope") or ""),
        "account_hint": account_hint, "project_id": project_id,
    }


def _extract_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0] if isinstance(choices[0], dict) else {}
        message = first.get("message") if isinstance(first.get("message"), dict) else {}
        return str(message.get("content") or first.get("text") or "")
    candidates = payload.get("candidates")
    if isinstance(candidates, list) and candidates:
        content = candidates[0].get("content") if isinstance(candidates[0], dict) else {}
        parts = content.get("parts") if isinstance(content, dict) else []
        return "".join(str(part.get("text") or "") for part in parts if isinstance(part, dict))
    output = payload.get("output")
    if isinstance(output, list):
        return "".join(
            str(block.get("text") or "")
            for item in output if isinstance(item, dict)
            for block in (item.get("content") or []) if isinstance(block, dict)
        )
    return ""


async def generate_comment(provider_id: str, settings: dict[str, Any], messages: list[dict[str, str]]) -> str:
    spec = get_provider(provider_id)
    if spec is None or provider_id == "claude":
        return ""
    credential = settings.get("credential") if isinstance(settings.get("credential"), dict) else {}
    token = str(credential.get("access_token") or credential.get("api_key") or settings.get("api_key") or "").strip()
    if not token:
        return ""
    model = str(settings.get("model") or spec.default_model).strip()[:120]
    try:
        temperature = max(0.0, min(2.0, float(settings.get("temperature", 0.8))))
    except (TypeError, ValueError):
        temperature = 0.8
    if provider_id in {"custom_openai_compatible", "9router_local", "deepseek", "xai"}:
        default_endpoint = "https://api.deepseek.com" if provider_id == "deepseek" else "https://api.x.ai/v1" if provider_id == "xai" else "http://localhost:20128/v1"
        endpoint = validate_endpoint(str(settings.get("endpoint") or default_endpoint))
        url = endpoint if endpoint.endswith("/chat/completions") else endpoint + "/chat/completions"
        payload = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": 80, "stream": False}
    elif provider_id == "gemini_cli":
        # OAuth alone does not prove Cloud Code Assist inference entitlement.
        # Keep no-post behavior until official project-native transport is configured.
        return ""
    else:
        # Codex subscription Responses contract needs provider-specific account binding.
        # Do not send OAuth credentials to a generic chat endpoint.
        return ""
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SECONDS)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, json=payload) as response:
                if response.status != 200:
                    return ""
                data = await response.json(content_type=None)
        return _extract_text(data)
    except Exception:
        logger.debug("AI provider request failed", exc_info=True)
        return ""
