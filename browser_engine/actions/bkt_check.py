# -*- coding: utf-8 -*-
"""
Backward-compatible facade for actions.bkt submodules.

Provides realtime Content ID scanning, copyright restriction evaluation,
and modal claim inspection on YouTube Studio.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

try:
    from .bkt import (
        CLEAN_VALUES,
        _pending_result,
        _target_ids_without_identity,
        _timeout_result,
        check_copyright_and_restrictions,
        extract_copyright_claim_details,
        is_browser_disconnected,
        is_target_closed_exception,
        navigate_to_channel_content,
        setup_low_end_route_interception,
    )
    from .dom import (
        DEFAULT_FORBIDDEN_HREF_PATTERNS,
        build_extract_table_rows_js,
        dismiss_post_save_studio_modals,
        eval_studio_dom,
        get_studio_context,
        inspect_studio_modal_state,
        safe_targeted_click,
    )
except ImportError:
    _cur_dir = Path(__file__).resolve().parent
    for _cand in (_cur_dir, _cur_dir.parent):
        if str(_cand) not in sys.path:
            sys.path.insert(0, str(_cand))
    from actions.bkt import (
        CLEAN_VALUES,
        _pending_result,
        _target_ids_without_identity,
        _timeout_result,
        check_copyright_and_restrictions,
        extract_copyright_claim_details,
        is_browser_disconnected,
        is_target_closed_exception,
        navigate_to_channel_content,
        setup_low_end_route_interception,
    )
    from actions.dom import (
        DEFAULT_FORBIDDEN_HREF_PATTERNS,
        build_extract_table_rows_js,
        dismiss_post_save_studio_modals,
        eval_studio_dom,
        get_studio_context,
        inspect_studio_modal_state,
        safe_targeted_click,
    )

logger = logging.getLogger(__name__)

__all__ = [
    "CLEAN_VALUES",
    "DEFAULT_FORBIDDEN_HREF_PATTERNS",
    "_pending_result",
    "_target_ids_without_identity",
    "_timeout_result",
    "build_extract_table_rows_js",
    "check_copyright_and_restrictions",
    "dismiss_post_save_studio_modals",
    "eval_studio_dom",
    "extract_copyright_claim_details",
    "get_studio_context",
    "inspect_studio_modal_state",
    "is_browser_disconnected",
    "is_target_closed_exception",
    "logger",
    "navigate_to_channel_content",
    "safe_targeted_click",
    "setup_low_end_route_interception",
]
