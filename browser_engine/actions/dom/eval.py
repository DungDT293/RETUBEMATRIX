# -*- coding: utf-8 -*-
"""
Evaluation and context extraction helpers for YouTube Studio DOM.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict

from .js_lib import (
    STUDIO_DOM_INIT_SCRIPT,
    STUDIO_DOM_JS_LIB,
    _DOM_CACHE_MISS_SENTINEL,
)

logger = logging.getLogger(__name__)

async def init_studio_dom(page: Any) -> None:
    """Inject STUDIO_DOM_INIT_SCRIPT directly onto page to initialize window.__rtmDom."""
    await page.evaluate(STUDIO_DOM_INIT_SCRIPT)


async def ensure_studio_dom(page: Any) -> None:
    """Ensure window.__rtmDom is present on the page, initializing it if absent."""
    try:
        is_ready = bool(
            await page.evaluate(
                "() => Boolean(typeof window !== 'undefined' && window.__rtmDom && window.__rtmDom.inspectStudioState)"
            )
        )
    except Exception:
        is_ready = False
    if not is_ready:
        await init_studio_dom(page)


async def eval_studio_dom(page: Any, body_js: str, arg: Any = None) -> Any:
    """
    Execute a JS snippet with __rtmDom helpers bound cleanly in scope.
    Caches window.__rtmDom on the page to avoid resending the 47KB STUDIO_DOM_JS_LIB
    over CDP on every polling iteration.
    """
    fast_script = (
        f"(arg) => {{\n"
        f"    if (typeof window === 'undefined' || !window.__rtmDom) {{\n"
        f"        return '{_DOM_CACHE_MISS_SENTINEL}';\n"
        f"    }}\n"
        f"    const __rtmDom = window.__rtmDom;\n"
        f"    {body_js}\n"
        f"}}"
    )
    try:
        if arg is None:
            res = await page.evaluate(fast_script)
        else:
            res = await page.evaluate(fast_script, arg)
    except Exception:
        # If fast evaluation failed (e.g. execution context invalidated during navigation),
        # initialize and retry
        await init_studio_dom(page)
        if arg is None:
            return await page.evaluate(fast_script)
        return await page.evaluate(fast_script, arg)

    if res == _DOM_CACHE_MISS_SENTINEL:
        await init_studio_dom(page)
        if arg is None:
            return await page.evaluate(fast_script)
        return await page.evaluate(fast_script, arg)

    return res




async def get_studio_context(page: Any) -> Dict[str, Any]:
    """Return full real-time YouTube Studio URL, scope, leftNav, menus, upload & table context."""
    try:
        res = await eval_studio_dom(page, "return __rtmDom.getPageContext();")
        if isinstance(res, dict):
            return res
    except Exception as exc:
        logger.debug("get_studio_context failed: %s", exc)
    raw_url = str(getattr(page, "url", "") or "")
    channel_id = ""
    video_id = ""
    page_type = "unknown"
    scope = "other"
    ch_m = re.search(r"/channel/([^/?#]+)", raw_url)
    if ch_m:
        channel_id = ch_m.group(1)
        scope = "channel"
        if re.search(r"/channel/[^/]+/videos(?:/|$|\?)", raw_url):
            page_type = "channel_content_videos"
        elif re.search(r"/channel/[^/]+/analytics", raw_url):
            page_type = "channel_analytics"
        else:
            page_type = "channel_other"
    else:
        v_m = re.search(r"/video/([^/?#]+)", raw_url)
        if v_m:
            video_id = v_m.group(1)
            scope = "video"
            if "/analytics" in raw_url:
                page_type = "video_analytics"
            elif "/edit" in raw_url:
                page_type = "video_edit"
            elif "/copyright" in raw_url:
                page_type = "video_copyright"
            else:
                page_type = "video_other"
    return {
        "url": raw_url,
        "pageType": page_type,
        "scope": scope,
        "channelId": channel_id,
        "videoId": video_id,
        "leftNav": [],
        "backToChannelLinks": [],
        "headerMenus": {"createButtonVisible": False, "activeMenuKind": None, "menuItems": []},
        "uploadState": {},
        "tableSummary": {"rowCount": 0, "visibleRowCount": 0, "hasTableHost": False},
    }


