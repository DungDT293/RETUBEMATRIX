# -*- coding: utf-8 -*-
"""
DOM traversal, stabilization, modal management, and evaluation helpers for YouTube Studio.
"""
from __future__ import annotations

from .js_lib import (
    STUDIO_DOM_JS_LIB,
    STUDIO_DOM_INIT_SCRIPT,
    _DOM_CACHE_MISS_SENTINEL,
    build_extract_table_rows_js,
)
from .eval import (
    logger,
    init_studio_dom,
    ensure_studio_dom,
    eval_studio_dom,
    get_studio_context,
)
from .modals import (
    inspect_studio_modal_state,
    dismiss_post_save_studio_modals,
)
from .interaction import (
    DEFAULT_FORBIDDEN_HREF_PATTERNS,
    _url_matches_patterns,
    wait_for_stable_actionable,
    click_stable_element,
    safe_targeted_click,
)

__all__ = [
    "STUDIO_DOM_JS_LIB",
    "STUDIO_DOM_INIT_SCRIPT",
    "_DOM_CACHE_MISS_SENTINEL",
    "build_extract_table_rows_js",
    "logger",
    "init_studio_dom",
    "ensure_studio_dom",
    "eval_studio_dom",
    "get_studio_context",
    "inspect_studio_modal_state",
    "dismiss_post_save_studio_modals",
    "DEFAULT_FORBIDDEN_HREF_PATTERNS",
    "_url_matches_patterns",
    "wait_for_stable_actionable",
    "click_stable_element",
    "safe_targeted_click",
]
