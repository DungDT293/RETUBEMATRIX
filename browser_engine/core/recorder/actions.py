"""Bounded recorder payload sanitizer and graph conversion."""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit

_MAX_STEPS = 200
_MAX_TEXT = 500
_MAX_SELECTORS = 5
_SECRET_RE = re.compile(
    r"password|passcode|secret|token|otp|one[\s-]?time|credit[\s-]?card|security[\s-]?code|api[\s-]?key|private[\s-]?key",
    re.I,
)
_ACTION_TYPES = {"click", "input", "fill", "key", "navigate", "scroll"}


def _text(value: Any, limit: int = _MAX_TEXT) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _safe_url(value: Any) -> str:
    raw = _text(value, 2000)
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return ""
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return ""
    host = parsed.hostname
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    try:
        port = parsed.port
    except ValueError:
        return ""
    netloc = host if port is None else f"{host}:{port}"
    return urlunsplit((parsed.scheme.lower(), netloc, parsed.path or "/", "", ""))[:500]


def _bounded_int(value: Any, limit: int = 100000) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return 0
    return max(-limit, min(limit, number))


def _sequence(value: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return 0
    return max(0, min(2_000_000_000, number))


def _sensitive(target: dict[str, Any]) -> bool:
    tag = str(target.get("tag") or "").lower()
    if tag == "textarea" or str(target.get("contenteditable") or "").lower() in {"true", "plaintext-only"}:
        return True
    fields = " ".join(
        str(target.get(key) or "")
        for key in ("tag", "type", "name", "id", "aria_label", "autocomplete", "role", "data_testid")
    )
    return str(target.get("type") or "").lower() == "password" or bool(_SECRET_RE.search(fields))


def sanitize_action(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    action_type = _text(raw.get("type"), 20).lower()
    if action_type not in _ACTION_TYPES:
        return None
    target_raw = raw.get("target") if isinstance(raw.get("target"), dict) else {}
    raw_selectors = target_raw.get("selectors")
    if not isinstance(raw_selectors, list):
        raw_selectors = []
    target = {
        "tag": _text(target_raw.get("tag"), 20),
        "role": _text(target_raw.get("role"), 60),
        "aria_label": _text(target_raw.get("aria_label"), 160),
        "name": _text(target_raw.get("name"), 120),
        "id": _text(target_raw.get("id"), 120),
        "data_testid": _text(target_raw.get("data_testid"), 120),
        "type": _text(target_raw.get("type"), 30),
        "autocomplete": _text(target_raw.get("autocomplete"), 80),
        "contenteditable": _text(target_raw.get("contenteditable"), 20),
        "selectors": [_text(item, 180) for item in raw_selectors[:12] if _text(item, 180)][: _MAX_SELECTORS],
    }
    sensitive = _sensitive(target)
    value = "" if sensitive else _text(raw.get("value"))
    action = {
        "type": action_type,
        "url": _safe_url(raw.get("url")),
        "title": _text(raw.get("title"), 200),
        "target": target,
        "value": value,
        "redacted": sensitive,
        "key": _text(raw.get("key"), 30),
        "x": _bounded_int(raw.get("x")),
        "y": _bounded_int(raw.get("y")),
        "delta_x": _bounded_int(raw.get("delta_x"), 10000),
        "delta_y": _bounded_int(raw.get("delta_y"), 10000),
        "seq": _sequence(raw.get("seq")),
    }
    return action


def append_action(actions: list[dict[str, Any]], raw: Any) -> dict[str, Any] | None:
    action = sanitize_action(raw)
    if action is None or len(actions) >= _MAX_STEPS:
        return None
    if action["type"] in {"input", "fill"} and action["redacted"]:
        action["value"] = ""
    actions.append(action)
    return action
