"""HTTP provider integrations for public proxy reputation services.

Only the resolved public IP is sent to providers. Proxy credentials/profile data
must never be sent here.
"""
from __future__ import annotations

from typing import Any

import requests

from .base import ProviderResult, boolish, clamp, result_error, result_missing_key


def _get_json(url: str, *, timeout: float, params: dict[str, Any] | None = None, auth: Any = None) -> dict[str, Any]:
    resp = requests.get(url, params=params, timeout=timeout, auth=auth)
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code}")
    data = resp.json()
    if not isinstance(data, dict):
        raise RuntimeError("invalid_json")
    return data


def check_ipqualityscore(ip: str, provider: dict[str, Any], *, timeout: float) -> ProviderResult:
    key = str(provider.get("api_key") or "").strip()
    if not key:
        return result_missing_key("ipqualityscore")
    try:
        data = _get_json(
            f"https://ipqualityscore.com/api/json/ip/{key}/{ip}",
            timeout=timeout,
            params={"strictness": 1, "allow_public_access_points": "true"},
        )
        if data.get("success") is False:
            return result_error("ipqualityscore", str(data.get("message") or "api_error"))
        fraud = clamp(float(data.get("fraud_score") or 0))
        flags = {
            "proxy": boolish(data.get("proxy")),
            "vpn": boolish(data.get("vpn")),
            "tor": boolish(data.get("tor")),
            "bot": boolish(data.get("bot_status")),
            "recent_abuse": boolish(data.get("recent_abuse")),
            "active_vpn": boolish(data.get("active_vpn")),
            "active_tor": boolish(data.get("active_tor")),
        }
        risk = fraud
        signals = []
        for key_name, label in [
            ("proxy", "IPQS b\u00e1o proxy"),
            ("vpn", "IPQS b\u00e1o VPN"),
            ("tor", "IPQS b\u00e1o Tor"),
            ("bot", "IPQS b\u00e1o bot"),
            ("recent_abuse", "IPQS b\u00e1o abuse g\u1ea7n \u0111\u00e2y"),
            ("active_vpn", "IPQS b\u00e1o active VPN"),
            ("active_tor", "IPQS b\u00e1o active Tor"),
        ]:
            if flags[key_name]:
                signals.append(label)
        if any(flags.values()):
            risk = max(risk, 75)
        return ProviderResult("ipqualityscore", True, risk=risk, confidence=0.9, signals=signals, flags=flags)
    except Exception as exc:
        return result_error("ipqualityscore", str(exc))


def check_proxycheck(ip: str, provider: dict[str, Any], *, timeout: float) -> ProviderResult:
    key = str(provider.get("api_key") or "").strip()
    if not key:
        return result_missing_key("proxycheck")
    try:
        data = _get_json(
            "https://proxycheck.io/v2/" + ip,
            timeout=timeout,
            params={"key": key, "vpn": 1, "risk": 1, "asn": 1, "node": 1, "time": 1},
        )
        node = data.get(ip) if isinstance(data.get(ip), dict) else {}
        if data.get("status") == "error":
            return result_error("proxycheck", str(data.get("message") or "api_error"))
        risk = clamp(float(node.get("risk") or 0))
        is_proxy = str(node.get("proxy") or "").lower() == "yes"
        is_vpn = str(node.get("vpn") or "").lower() == "yes"
        ip_type = str(node.get("type") or "").lower()
        flags = {
            "proxy": is_proxy,
            "vpn": is_vpn,
            "datacenter": ip_type in ("hosting", "business", "education") or "hosting" in ip_type,
        }
        signals = []
        if is_proxy:
            signals.append("ProxyCheck b\u00e1o proxy")
        if is_vpn:
            signals.append("ProxyCheck b\u00e1o VPN")
        if flags["datacenter"]:
            signals.append("ProxyCheck b\u00e1o IP hosting/datacenter")
        if is_proxy or is_vpn:
            risk = max(risk, 75)
        elif flags["datacenter"]:
            risk = max(risk, 65)
        return ProviderResult("proxycheck", True, risk=risk, confidence=0.85, signals=signals, flags=flags)
    except Exception as exc:
        return result_error("proxycheck", str(exc))


def check_scamalytics(ip: str, provider: dict[str, Any], *, timeout: float) -> ProviderResult:
    key = str(provider.get("api_key") or "").strip()
    if not key:
        return result_missing_key("scamalytics")
    try:
        data = _get_json("https://api12.scamalytics.com/" + key, timeout=timeout, params={"ip": ip})
        score = data.get("score") or data.get("risk_score") or data.get("fraud_score") or 0
        risk = clamp(float(score))
        flags = {
            "proxy": boolish(data.get("is_proxy") or data.get("proxy")),
            "vpn": boolish(data.get("is_vpn") or data.get("vpn")),
            "tor": boolish(data.get("is_tor") or data.get("tor")),
        }
        signals = ["Scamalytics b\u00e1o IP r\u1ee7i ro cao"] if risk >= 75 else []
        for flag, label in [("proxy", "Scamalytics b\u00e1o proxy"), ("vpn", "Scamalytics b\u00e1o VPN"), ("tor", "Scamalytics b\u00e1o Tor")]:
            if flags[flag]:
                signals.append(label)
                risk = max(risk, 75)
        return ProviderResult("scamalytics", True, risk=risk, confidence=0.85, signals=signals, flags=flags)
    except Exception as exc:
        return result_error("scamalytics", str(exc))


def check_ip2proxy(ip: str, provider: dict[str, Any], *, timeout: float) -> ProviderResult:
    key = str(provider.get("api_key") or "").strip()
    if not key:
        return result_missing_key("ip2proxy")
    try:
        data = _get_json("https://api.ip2proxy.com/", timeout=timeout, params={"key": key, "ip": ip, "package": "PX11", "format": "json"})
        proxy_type = str(data.get("proxy_type") or data.get("proxyType") or "").upper()
        usage_type = str(data.get("usage_type") or data.get("usageType") or "").upper()
        is_proxy = proxy_type not in ("", "-", "N/A", "DCH")
        datacenter = proxy_type == "DCH" or usage_type in ("DCH", "CDN", "SES")
        risk = 20
        signals = []
        if is_proxy:
            risk = 75
            signals.append(f"IP2Proxy b\u00e1o proxy type {proxy_type}")
        if datacenter:
            risk = max(risk, 65)
            signals.append("IP2Proxy b\u00e1o datacenter/hosting")
        flags = {"proxy": is_proxy, "datacenter": datacenter, "vpn": proxy_type in ("VPN", "PUB")}
        return ProviderResult("ip2proxy", True, risk=risk, confidence=0.8, signals=signals, flags=flags)
    except Exception as exc:
        return result_error("ip2proxy", str(exc))


def check_maxmind(ip: str, provider: dict[str, Any], *, timeout: float) -> ProviderResult:
    account_id = str(provider.get("account_id") or "").strip()
    license_key = str(provider.get("license_key") or provider.get("api_key") or "").strip()
    if not (account_id and license_key):
        return result_missing_key("maxmind")
    try:
        # minFraud is primarily transaction-risk oriented. We send only the IP.
        resp = requests.post(
            "https://minfraud.maxmind.com/minfraud/v2.0/insights",
            json={"device": {"ip_address": ip}},
            timeout=timeout,
            auth=(account_id, license_key),
        )
        if resp.status_code != 200:
            return result_error("maxmind", f"HTTP {resp.status_code}")
        data = resp.json()
        risk = clamp(float(data.get("risk_score") or data.get("riskScore") or 0))
        ip_data = data.get("ip_address") if isinstance(data.get("ip_address"), dict) else {}
        traits = ip_data.get("traits") if isinstance(ip_data.get("traits"), dict) else {}
        flags = {
            "anonymous": boolish(traits.get("is_anonymous")),
            "anonymous_vpn": boolish(traits.get("is_anonymous_vpn")),
            "hosting": boolish(traits.get("is_hosting_provider")),
            "public_proxy": boolish(traits.get("is_public_proxy")),
            "tor": boolish(traits.get("is_tor_exit_node")),
        }
        signals = []
        for flag, label in [
            ("anonymous", "MaxMind b\u00e1o anonymous IP"),
            ("anonymous_vpn", "MaxMind b\u00e1o anonymous VPN"),
            ("hosting", "MaxMind b\u00e1o hosting provider"),
            ("public_proxy", "MaxMind b\u00e1o public proxy"),
            ("tor", "MaxMind b\u00e1o Tor exit node"),
        ]:
            if flags[flag]:
                signals.append(label)
        if flags["tor"] or flags["public_proxy"]:
            risk = max(risk, 85)
        elif flags["anonymous"] or flags["anonymous_vpn"]:
            risk = max(risk, 75)
        elif flags["hosting"]:
            risk = max(risk, 65)
        return ProviderResult("maxmind", True, risk=risk, confidence=0.85, signals=signals, flags=flags)
    except Exception as exc:
        return result_error("maxmind", str(exc))


PROVIDER_CHECKS = {
    "ipqualityscore": check_ipqualityscore,
    "scamalytics": check_scamalytics,
    "proxycheck": check_proxycheck,
    "ip2proxy": check_ip2proxy,
    "maxmind": check_maxmind,
}
