# -*- coding: utf-8 -*-
"""
Stabilization and guarded targeted interaction helpers for YouTube Studio.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Callable, Dict, Iterable, List, Optional

from .eval import eval_studio_dom, get_studio_context

logger = logging.getLogger(__name__)

DEFAULT_FORBIDDEN_HREF_PATTERNS: List[str] = [
    r"/video/[^/]+/analytics",
    r"/video/[^/]+/comments",
    r"/video/[^/]+/subtitles",
    r"/video/[^/]+/monetization",
    r"/video/[^/]+/copyright",
    r"/video/[^/]+/editor",
]


def _url_matches_patterns(url_str: str, patterns: Optional[Iterable[str]]) -> bool:
    if not url_str or not patterns:
        return False
    for p in patterns:
        if not p:
            continue
        try:
            if re.search(p, url_str, flags=re.IGNORECASE):
                return True
        except re.error:
            if p.lower() in url_str.lower():
                return True
    return False


async def wait_for_stable_actionable(
    page: Any,
    selectors: List[str],
    timeout_ms: int = 8000,
    require_unobscured: bool = True,
    require_enabled: bool = True,
    root_selector: Optional[str] = None,
    exclude_ancestors: Optional[List[str]] = None,
    allow_href_patterns: Optional[List[str]] = None,
    forbidden_href_patterns: Optional[List[str]] = None,
    allow_inside_video_row: bool = False,
    forbid_cancel_controls: bool = True,
    prefer_top_layer_tooltip: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Poll until a deep-DOM target matching any selector is visible, optionally
    enabled & unobscured by backdrops, matches href/ancestor guards, and maintains
    a stable bounding box. Returns candidate metadata (including TOCTOU token) or None.
    """
    deadline = time.time() + max(timeout_ms, 500) / 1000.0
    prev_rect: Optional[tuple] = None
    last_probe: Any = None

    while time.time() < deadline:
        try:
            probe = await eval_studio_dom(
                page,
                "return __rtmDom.probeCandidateForClick(arg);",
                {
                    "selectors": selectors,
                    "rootSelector": root_selector,
                    "requireEnabled": require_enabled,
                    "requireUnobscured": require_unobscured,
                    "excludeAncestors": exclude_ancestors or [],
                    "allowHrefPatterns": allow_href_patterns or [],
                    "forbiddenHrefPatterns": forbidden_href_patterns or [],
                    "allowInsideVideoRow": allow_inside_video_row,
                    "forbidCancelControls": forbid_cancel_controls,
                    "preferTopLayerTooltip": prefer_top_layer_tooltip,
                },
            )
            last_probe = probe
            if isinstance(probe, dict) and probe.get("ok"):
                cur_rect = (
                    round(float(probe.get("left", probe["x"]))),
                    round(float(probe.get("top", probe["y"]))),
                    round(float(probe.get("width", 0))),
                    round(float(probe.get("height", 0))),
                )
                if prev_rect is not None and all(abs(a - b) <= 2 for a, b in zip(prev_rect, cur_rect)):
                    return probe
                prev_rect = cur_rect
            else:
                prev_rect = None
        except Exception as exc:
            logger.debug("wait_for_stable_actionable probe error: %s", exc)
            last_probe = {"ok": False, "reason": f"exception:{exc}"}
            prev_rect = None
        await asyncio.sleep(0.18)

    if isinstance(last_probe, dict):
        logger.warning(
            "[DOM] wait_for_stable_actionable timeout root=%s reason=%s rejected=%s selectors=%s",
            root_selector or "<document>",
            last_probe.get("reason"),
            (last_probe.get("rejected") or [])[:4],
            selectors[:4],
        )
    return None


async def click_stable_element(
    page: Any,
    selectors: List[str],
    timeout_ms: int = 8000,
    pre_delay: float = 0.35,
    root_selector: Optional[str] = None,
    allow_js_fallback: bool = True,
) -> Optional[str]:
    """
    Wait until target element is visible, enabled, unobscured, and geometrically
    stable, pause deliberately, re-verify point ownership, and click via mouse.
    """
    target = await wait_for_stable_actionable(
        page,
        selectors=selectors,
        timeout_ms=timeout_ms,
        require_unobscured=True,
        require_enabled=True,
        root_selector=root_selector,
        forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS,
    )
    if target:
        if pre_delay > 0:
            await asyncio.sleep(pre_delay)
        try:
            await page.mouse.move(target["x"], target["y"], steps=5)
            await asyncio.sleep(0.08)
            verify = await eval_studio_dom(
                page,
                "return __rtmDom.verifyPointStillHitsToken(arg.token, arg.x, arg.y, 6);",
                {"token": target.get("token"), "x": target["x"], "y": target["y"]},
            )
            if isinstance(verify, dict) and verify.get("ok"):
                click_x = float(verify.get("x", target["x"]))
                click_y = float(verify.get("y", target["y"]))
                await page.mouse.click(click_x, click_y)
                return f"mouse:{target['matchedSelector']}"
            logger.warning(
                "[DOM] click_stable_element aborted before click selector=%s reason=%s",
                target.get("matchedSelector"),
                verify,
            )
        except Exception as exc:
            logger.debug("click_stable_element mouse click failed: %s", exc)

    if not allow_js_fallback:
        return None

    # Fallback only when element is still unobscured & passes forbidden-href/cancel guards
    try:
        clicked_sel = await eval_studio_dom(
            page,
            """
            const { selectors, rootSelector, forbiddenPatterns } = arg;
            const res = __rtmDom.probeCandidateForClick({
                selectors,
                rootSelector,
                requireUnobscured: true,
                requireEnabled: true,
                forbidCancelControls: true,
                forbiddenHrefPatterns: forbiddenPatterns || [],
            });
            if (!res || !res.ok || !res.token) return null;
            const entry = (window.__rtmTokenMap && window.__rtmTokenMap.get(res.token)) || null;
            if (!entry || !entry.nativeBtn) return null;
            if ((entry.nativeBtn.tagName || '').toUpperCase() === 'A') return null;
            entry.nativeBtn.click();
            return 'js:' + res.matchedSelector;
            """,
            {
                "selectors": selectors,
                "rootSelector": root_selector,
                "forbiddenPatterns": DEFAULT_FORBIDDEN_HREF_PATTERNS,
            },
        )
        return clicked_sel
    except Exception as exc:
        logger.debug("click_stable_element js fallback error: %s", exc)
        return None


async def safe_targeted_click(
    page: Any,
    selectors: List[str],
    action_name: str = "click",
    root_selector: Optional[str] = None,
    timeout_ms: int = 8000,
    pre_delay: float = 0.25,
    allowed_page_types: Optional[Iterable[str]] = None,
    exclude_ancestors: Optional[List[str]] = None,
    allow_href_patterns: Optional[List[str]] = None,
    forbidden_href_patterns: Optional[List[str]] = None,
    allow_inside_video_row: bool = False,
    forbid_cancel_controls: bool = True,
    prefer_top_layer_tooltip: bool = False,
    allow_js_fallback: bool = False,
    verify_fn: Optional[Callable[[Dict[str, Any]], Any]] = None,
    post_click_settle: float = 0.2,
) -> Dict[str, Any]:
    """
    Context-aware, href-guarded, TOCTOU-verified click primitive with structured [DOM] logs.
    Never performs unscoped document fallbacks or unverified coordinate clicks.
    """
    eff_forbidden = DEFAULT_FORBIDDEN_HREF_PATTERNS if forbidden_href_patterns is None else list(forbidden_href_patterns)
    allowed_types_set = set(allowed_page_types) if allowed_page_types else None

    ctx_before = await get_studio_context(page)
    before_page_type = str(ctx_before.get("pageType") or "unknown")
    before_url = str(ctx_before.get("url") or getattr(page, "url", "") or "")

    if allowed_types_set is not None and before_page_type not in allowed_types_set:
        logger.warning(
            "[DOM] %s skipped: wrong_page_type current=%s allowed=%s url=%s",
            action_name,
            before_page_type,
            sorted(allowed_types_set),
            before_url,
        )
        return {
            "ok": False,
            "reason": "wrong_page_type",
            "beforePageType": before_page_type,
            "beforeUrl": before_url,
            "afterPageType": before_page_type,
            "afterUrl": before_url,
        }

    deadline = time.time() + max(timeout_ms, 500) / 1000.0
    last_reason = "no_match"

    for retry_idx in range(3):
        rem_ms = int(max((deadline - time.time()) * 1000.0, 400))
        target = await wait_for_stable_actionable(
            page,
            selectors=selectors,
            timeout_ms=rem_ms,
            require_unobscured=True,
            require_enabled=True,
            root_selector=root_selector,
            exclude_ancestors=exclude_ancestors,
            allow_href_patterns=allow_href_patterns,
            forbidden_href_patterns=eff_forbidden,
            allow_inside_video_row=allow_inside_video_row,
            forbid_cancel_controls=forbid_cancel_controls,
            prefer_top_layer_tooltip=prefer_top_layer_tooltip,
        )
        if not target:
            last_reason = "not_found_or_unstable"
            break

        if pre_delay > 0:
            await asyncio.sleep(pre_delay)

        try:
            await page.mouse.move(target["x"], target["y"], steps=5)
            await asyncio.sleep(0.08)
            verify = await eval_studio_dom(
                page,
                "return __rtmDom.verifyPointStillHitsToken(arg.token, arg.x, arg.y, 6);",
                {"token": target.get("token"), "x": target["x"], "y": target["y"]},
            )
            if not isinstance(verify, dict) or not verify.get("ok"):
                last_reason = str((verify or {}).get("reason") or "verify_failed")
                logger.warning(
                    "[DOM] %s aborted_before_click retry=%d selector=%s reason=%s hitTag=%s hitId=%s",
                    action_name,
                    retry_idx + 1,
                    target.get("matchedSelector"),
                    last_reason,
                    (verify or {}).get("hitTag", ""),
                    (verify or {}).get("hitId", ""),
                )
                if time.time() < deadline:
                    await asyncio.sleep(0.15)
                    continue
                break

            click_x = float(verify.get("x", target["x"]))
            click_y = float(verify.get("y", target["y"]))
            logger.info(
                "[DOM] %s page=%s target=%s tag=%s id=%s href=%s pos=(%d,%d) text=%r",
                action_name,
                before_page_type,
                target.get("matchedSelector"),
                target.get("tag"),
                target.get("id"),
                target.get("href") or "",
                round(click_x),
                round(click_y),
                target.get("text") or "",
            )
            await page.mouse.click(click_x, click_y)
            if post_click_settle > 0:
                await asyncio.sleep(post_click_settle)

            ctx_after = await get_studio_context(page)
            after_url = str(ctx_after.get("url") or getattr(page, "url", "") or "")
            after_page_type = str(ctx_after.get("pageType") or "unknown")

            if eff_forbidden and _url_matches_patterns(after_url, eff_forbidden):
                logger.error(
                    "[DOM] %s navigated_to_forbidden_url before=%s after=%s",
                    action_name,
                    before_url,
                    after_url,
                )
                return {
                    "ok": False,
                    "reason": "navigated_to_forbidden_url",
                    "method": f"mouse:{target.get('matchedSelector')}",
                    "selector": target.get("matchedSelector"),
                    "tag": target.get("tag"),
                    "id": target.get("id"),
                    "href": target.get("href") or "",
                    "text": target.get("text") or "",
                    "beforeUrl": before_url,
                    "afterUrl": after_url,
                    "beforePageType": before_page_type,
                    "afterPageType": after_page_type,
                    "context": ctx_after,
                }

            verified_ok = True
            if verify_fn is not None:
                res_check = verify_fn(ctx_after)
                if asyncio.iscoroutine(res_check):
                    res_check = await res_check
                verified_ok = bool(res_check)
                if not verified_ok:
                    logger.warning(
                        "[DOM] %s post_verify_failed method=%s page=%s->%s",
                        action_name,
                        f"mouse:{target.get('matchedSelector')}",
                        before_page_type,
                        after_page_type,
                    )

            return {
                "ok": verified_ok,
                "reason": "ok" if verified_ok else "post_verify_failed",
                "method": f"mouse:{target.get('matchedSelector')}",
                "selector": target.get("matchedSelector"),
                "tag": target.get("tag"),
                "id": target.get("id"),
                "href": target.get("href") or "",
                "text": target.get("text") or "",
                "beforeUrl": before_url,
                "afterUrl": after_url,
                "beforePageType": before_page_type,
                "afterPageType": after_page_type,
                "context": ctx_after,
            }
        except Exception as exc:
            last_reason = f"exception:{exc}"
            logger.debug("[DOM] %s click error: %s", action_name, exc)
            break

    if allow_js_fallback:
        try:
            js_probe = await eval_studio_dom(
                page,
                """
                const res = __rtmDom.probeCandidateForClick(arg);
                if (!res || !res.ok || !res.token) return res || { ok: false, reason: 'js_probe_none' };
                const entry = window.__rtmTokenMap && window.__rtmTokenMap.get(res.token);
                if (!entry || !entry.nativeBtn) return { ok: false, reason: 'js_entry_missing' };
                if ((entry.nativeBtn.tagName || '').toUpperCase() === 'A') {
                    return { ok: false, reason: 'js_refuses_anchor_nav' };
                }
                entry.nativeBtn.click();
                return res;
                """,
                {
                    "selectors": selectors,
                    "rootSelector": root_selector,
                    "requireUnobscured": True,
                    "requireEnabled": True,
                    "forbidCancelControls": forbid_cancel_controls,
                    "allowInsideVideoRow": allow_inside_video_row,
                    "excludeAncestors": exclude_ancestors or [],
                    "allowHrefPatterns": allow_href_patterns or [],
                    "forbiddenHrefPatterns": eff_forbidden,
                    "preferTopLayerTooltip": prefer_top_layer_tooltip,
                },
            )
            if isinstance(js_probe, dict) and js_probe.get("ok"):
                if post_click_settle > 0:
                    await asyncio.sleep(post_click_settle)
                ctx_after = await get_studio_context(page)
                after_url = str(ctx_after.get("url") or getattr(page, "url", "") or "")
                after_page_type = str(ctx_after.get("pageType") or "unknown")
                verified_ok = True
                if eff_forbidden and _url_matches_patterns(after_url, eff_forbidden):
                    return {
                        "ok": False,
                        "reason": "navigated_to_forbidden_url",
                        "method": f"js:{js_probe.get('matchedSelector')}",
                        "beforeUrl": before_url,
                        "afterUrl": after_url,
                        "beforePageType": before_page_type,
                        "afterPageType": after_page_type,
                        "context": ctx_after,
                    }
                if verify_fn is not None:
                    res_check = verify_fn(ctx_after)
                    if asyncio.iscoroutine(res_check):
                        res_check = await res_check
                    verified_ok = bool(res_check)
                return {
                    "ok": verified_ok,
                    "reason": "ok" if verified_ok else "post_verify_failed",
                    "method": f"js:{js_probe.get('matchedSelector')}",
                    "selector": js_probe.get("matchedSelector"),
                    "tag": js_probe.get("tag"),
                    "id": js_probe.get("id"),
                    "href": js_probe.get("href") or "",
                    "text": js_probe.get("text") or "",
                    "beforeUrl": before_url,
                    "afterUrl": after_url,
                    "beforePageType": before_page_type,
                    "afterPageType": after_page_type,
                    "context": ctx_after,
                }
        except Exception as exc:
            last_reason = f"js_exception:{exc}"

    logger.warning(
        "[DOM] %s failed page=%s root=%s reason=%s selectors=%s",
        action_name,
        before_page_type,
        root_selector or "<document>",
        last_reason,
        selectors[:4],
    )
    return {
        "ok": False,
        "reason": last_reason,
        "beforePageType": before_page_type,
        "beforeUrl": before_url,
        "afterPageType": before_page_type,
        "afterUrl": before_url,
    }


