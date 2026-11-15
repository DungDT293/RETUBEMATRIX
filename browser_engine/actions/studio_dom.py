# -*- coding: utf-8 -*-
"""
Backward-compatible facade for actions.dom submodules.

Provides unified visibility detection (ignoring hidden templates/tooltips),
deep Shadow DOM traversal, deliberate click-stability verification,
modal state inspection, post-save dialog dismissal with safety guards,
and structured Content-table row snapshot extraction.
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from .dom import (
        DEFAULT_FORBIDDEN_HREF_PATTERNS,
        STUDIO_DOM_INIT_SCRIPT,
        STUDIO_DOM_JS_LIB,
        _DOM_CACHE_MISS_SENTINEL,
        _url_matches_patterns,
        build_extract_table_rows_js,
        click_stable_element,
        dismiss_post_save_studio_modals,
        ensure_studio_dom,
        eval_studio_dom,
        get_studio_context,
        init_studio_dom,
        inspect_studio_modal_state,
        logger,
        safe_targeted_click,
        wait_for_stable_actionable,
    )
except ImportError:
    _cur_dir = Path(__file__).resolve().parent
    for _cand in (_cur_dir, _cur_dir.parent):
        if str(_cand) not in sys.path:
            sys.path.insert(0, str(_cand))
    from actions.dom import (
        DEFAULT_FORBIDDEN_HREF_PATTERNS,
        STUDIO_DOM_INIT_SCRIPT,
        STUDIO_DOM_JS_LIB,
        _DOM_CACHE_MISS_SENTINEL,
        _url_matches_patterns,
        build_extract_table_rows_js,
        click_stable_element,
        dismiss_post_save_studio_modals,
        ensure_studio_dom,
        eval_studio_dom,
        get_studio_context,
        init_studio_dom,
        inspect_studio_modal_state,
        logger,
        safe_targeted_click,
        wait_for_stable_actionable,
    )

__all__ = [
    "DEFAULT_FORBIDDEN_HREF_PATTERNS",
    "STUDIO_DOM_INIT_SCRIPT",
    "STUDIO_DOM_JS_LIB",
    "_DOM_CACHE_MISS_SENTINEL",
    "_url_matches_patterns",
    "build_extract_table_rows_js",
    "click_stable_element",
    "dismiss_post_save_studio_modals",
    "ensure_studio_dom",
    "eval_studio_dom",
    "get_studio_context",
    "init_studio_dom",
    "inspect_studio_modal_state",
    "logger",
    "safe_targeted_click",
    "wait_for_stable_actionable",
]
