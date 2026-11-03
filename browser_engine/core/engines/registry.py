"""Allowlisted browser engine selection."""
from __future__ import annotations

from .base import BaseBrowserEngine
from .browsermulti_engine import BrowserMultiEngine
from .cloakbrowser_engine import CloakBrowserEngine

DEFAULT_ENGINE_ID = "cloakbrowser"
DEFAULT_BROWSERMULTI_VERSION = "155.0.8059.12"


def normalize_engine_id(value: str | None) -> str:
    engine_id = str(value or "").strip().lower()
    return engine_id if engine_id in {"cloakbrowser", "browsermulti"} else DEFAULT_ENGINE_ID


def get_browser_engine(value: str | None = None, runtime_version: str | None = None) -> BaseBrowserEngine:
    engine_id = normalize_engine_id(value)
    if engine_id == "browsermulti":
        return BrowserMultiEngine(runtime_version=runtime_version or DEFAULT_BROWSERMULTI_VERSION)
    return CloakBrowserEngine()
