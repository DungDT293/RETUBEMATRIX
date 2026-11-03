"""Provider result types and mapping helpers for proxy reputation."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ProviderResult:
    provider: str
    ok: bool
    risk: float = 50.0
    confidence: float = 0.5
    signals: list[str] = field(default_factory=list)
    flags: dict[str, bool] = field(default_factory=dict)
    raw_summary: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    cached: bool = False

    def public(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "ok": self.ok,
            "risk": round(float(self.risk), 1),
            "confidence": round(float(self.confidence), 2),
            "signals": self.signals,
            "flags": self.flags,
            "error": self.error,
            "cached": self.cached,
        }


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "y")
    return bool(value)


def result_error(provider: str, message: str) -> ProviderResult:
    return ProviderResult(provider=provider, ok=False, risk=70, confidence=0.0, error=message)


def result_disabled(provider: str) -> ProviderResult:
    return ProviderResult(provider=provider, ok=False, risk=50, confidence=0.0, error="provider_disabled")


def result_missing_key(provider: str) -> ProviderResult:
    return ProviderResult(provider=provider, ok=False, risk=50, confidence=0.0, error="missing_api_key")
