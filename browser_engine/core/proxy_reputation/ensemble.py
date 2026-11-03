"""Ensemble scoring for proxy reputation.

Combines an internal heuristic (latency/IP stability/geo type) with optional
commercial providers. Output is transparent: trust score, risk level,
confidence, reasons, and per-provider status. Never fails open to "good".
"""
from __future__ import annotations

import logging
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

from . import settings as rep_settings
from .providers.base import ProviderResult, clamp
from .providers.http import PROVIDER_CHECKS

logger = logging.getLogger(__name__)

_PROVIDER_WEIGHTS = {
    "ipqualityscore": 0.25,
    "scamalytics": 0.20,
    "proxycheck": 0.20,
    "ip2proxy": 0.15,
    "maxmind": 0.15,
    "internal": 0.05,
}

# Cache: ip -> {"expires": ts, "results": {provider: ProviderResult}}
_CACHE: dict[str, dict[str, Any]] = {}


def _now() -> float:
    return time.time()


def _cache_get(ip: str, ttl_seconds: int) -> dict[str, ProviderResult]:
    entry = _CACHE.get(ip)
    if not entry:
        return {}
    if entry.get("expires", 0) < _now():
        _CACHE.pop(ip, None)
        return {}
    return dict(entry.get("results", {}))


def _cache_put(ip: str, results: dict[str, ProviderResult], ttl_seconds: int) -> None:
    cacheable = {name: res for name, res in results.items() if res.ok}
    if not cacheable:
        return
    _CACHE[ip] = {"expires": _now() + ttl_seconds, "results": cacheable}


def _internal_result(internal_risk: float) -> ProviderResult:
    return ProviderResult(
        provider="internal",
        ok=True,
        risk=clamp(internal_risk),
        confidence=0.4,
        signals=["\u0110\u00e1nh gi\u00e1 n\u1ed9i b\u1ed9 (t\u1ed1c \u0111\u1ed9, IP \u1ed5n \u0111\u1ecbnh, lo\u1ea1i IP)"],
    )


def _recommendation(risk: float) -> tuple[str, str]:
    if risk <= 29:
        return "good", "R\u1ee7i ro th\u1ea5p"
    if risk <= 54:
        return "caution", "R\u1ee7i ro trung b\u00ecnh"
    if risk <= 74:
        return "risky", "R\u1ee7i ro cao"
    return "avoid", "R\u1ee7i ro r\u1ea5t cao"


def collect_provider_results(
    ip: str,
    *,
    settings: dict[str, Any] | None = None,
    check_map: dict[str, Callable[..., ProviderResult]] | None = None,
) -> dict[str, ProviderResult]:
    settings = settings or rep_settings.get_settings(include_secret=True)
    check_map = check_map or PROVIDER_CHECKS
    timeout = max(1.0, settings.get("timeout_ms", 3500) / 1000.0)
    ttl_seconds = settings.get("cache_ttl_hours", 12) * 3600

    cached = _cache_get(ip, ttl_seconds)
    for res in cached.values():
        res.cached = True

    pending = {}
    for name, provider_cfg in settings.get("providers", {}).items():
        if not provider_cfg.get("enabled"):
            continue
        if name in cached:
            continue
        check = check_map.get(name)
        if not check:
            continue
        pending[name] = provider_cfg

    results: dict[str, ProviderResult] = dict(cached)
    if pending:
        with ThreadPoolExecutor(max_workers=min(5, len(pending))) as pool:
            futures = {
                pool.submit(check_map[name], ip, cfg, timeout=timeout): name
                for name, cfg in pending.items()
            }
            for future in as_completed(futures):
                name = futures[future]
                try:
                    results[name] = future.result()
                except Exception as exc:  # pragma: no cover - defensive
                    results[name] = ProviderResult(name, ok=False, error=str(exc), confidence=0.0)

    fresh = {name: res for name, res in results.items() if res.ok and not res.cached}
    if fresh:
        _cache_put(ip, fresh, ttl_seconds)
    return results


def score_ensemble(
    *,
    internal_risk: float,
    provider_results: dict[str, ProviderResult],
    ip_unstable: bool = False,
    ip_type: str = "",
) -> dict[str, Any]:
    results = dict(provider_results)
    results["internal"] = _internal_result(internal_risk)

    ok_results = {name: res for name, res in results.items() if res.ok}

    num = 0.0
    den = 0.0
    for name, res in ok_results.items():
        weight = _PROVIDER_WEIGHTS.get(name, 0.05)
        num += weight * res.risk * res.confidence
        den += weight * res.confidence
    weighted_risk = (num / den) if den > 0 else internal_risk

    commercial_ok = [name for name in ok_results if name != "internal"]
    available_weight = sum(_PROVIDER_WEIGHTS.get(name, 0.05) for name in ok_results)
    coverage = min(1.0, available_weight / 0.75)

    risks = [res.risk for res in ok_results.values()]
    spread = statistics.pstdev(risks) if len(risks) > 1 else 0.0
    agreement = 1.0 - min(1.0, spread / 35.0)

    freshness = 1.0
    if any(res.cached for res in ok_results.values()):
        freshness = 0.8

    final_confidence = 0.45 * coverage + 0.35 * agreement + 0.20 * freshness
    if not commercial_ok:
        final_confidence = min(final_confidence, 0.30)
    elif len(commercial_ok) == 1:
        final_confidence = min(final_confidence, 0.45)

    reasons: list[str] = []
    for res in ok_results.values():
        reasons.extend(res.signals)

    final_risk = weighted_risk

    # Conflict: some providers flag proxy/datacenter while another says low risk.
    flagged = [name for name in commercial_ok if any(results[name].flags.values())]
    low_risk = [name for name in commercial_ok if results[name].risk <= 30]
    if len(flagged) >= 2 and low_risk:
        final_risk += 8
        reasons.append("C\u00e1c ngu\u1ed3n \u0111\u00e1nh gi\u00e1 m\u00e2u thu\u1eabn, c\u1ea7n ki\u1ec3m tra l\u1ea1i.")

    # Hard flags from any commercial provider.
    def any_flag(*keys: str) -> bool:
        for name in commercial_ok:
            flags = results[name].flags
            if any(flags.get(k) for k in keys):
                return True
        return False

    if any_flag("tor", "public_proxy"):
        final_risk = max(final_risk, 85)
    if any_flag("proxy", "vpn", "anonymous_vpn", "anonymous"):
        final_risk = max(final_risk, 75)
    if any_flag("datacenter", "hosting") or ip_type == "datacenter":
        final_risk = max(final_risk, 65)

    if ip_unstable:
        final_risk = min(100, final_risk + 25)
        reasons.append("IP thay \u0111\u1ed5i gi\u1eefa c\u00e1c l\u1ea7n ki\u1ec3m tra (proxy xoay).")

    # 3 strong providers agreeing high -> avoid.
    strong = [name for name in ("ipqualityscore", "scamalytics", "maxmind") if name in ok_results and results[name].risk >= 70]
    if len(strong) >= 2:
        final_risk = max(final_risk, 80)

    final_risk = clamp(final_risk)
    trust_score = int(round(100 - final_risk))
    recommendation, risk_label = _recommendation(final_risk)

    # Dedup reasons preserving order.
    seen = set()
    deduped = []
    for reason in reasons:
        if reason and reason not in seen:
            seen.add(reason)
            deduped.append(reason)

    return {
        "score": trust_score,
        "risk_value": round(final_risk, 1),
        "recommendation": recommendation,
        "risk_label": risk_label,
        "confidence": round(final_confidence, 2),
        "reasons": deduped,
        "providers": [res.public() for res in results.values()],
        "providers_used": commercial_ok,
    }
