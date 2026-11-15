# -*- coding: utf-8 -*-
"""
Copyright and restrictions evaluation (BKT) engine for YouTube Studio.
"""
from __future__ import annotations

from .evaluator import (
    CLEAN_VALUES,
    _target_ids_without_identity,
    _timeout_result,
    _pending_result,
)
from .network import (
    is_browser_disconnected,
    is_target_closed_exception,
    setup_low_end_route_interception,
    navigate_to_channel_content,
)
from .claim_extractor import (
    extract_copyright_claim_details,
)
from .monitor import (
    check_copyright_and_restrictions,
)

__all__ = [
    "CLEAN_VALUES",
    "_target_ids_without_identity",
    "_timeout_result",
    "_pending_result",
    "is_browser_disconnected",
    "is_target_closed_exception",
    "setup_low_end_route_interception",
    "navigate_to_channel_content",
    "extract_copyright_claim_details",
    "check_copyright_and_restrictions",
]
