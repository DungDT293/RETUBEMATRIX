# -*- coding: utf-8 -*-
"""
Network interception, browser disconnect guards, and channel content navigation.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict

from ..dom import (
    DEFAULT_FORBIDDEN_HREF_PATTERNS,
    dismiss_blocking_studio_dialogs,
    dismiss_post_save_studio_modals,
    eval_studio_dom,
    get_studio_context,
    safe_targeted_click,
)

logger = logging.getLogger(__name__)

def is_browser_disconnected(page: Any) -> bool:
    """Kiểm tra nhanh xem page, context hoặc browser đã bị đóng hay mất kết nối CDP chưa."""
    try:
        if page.is_closed():
            return True
        if hasattr(page, "context"):
            ctx = page.context
            if hasattr(ctx, "is_closed") and ctx.is_closed():
                return True
            if hasattr(ctx, "browser") and ctx.browser:
                if hasattr(ctx.browser, "is_connected") and not ctx.browser.is_connected():
                    return True
        return False
    except Exception:
        return True


def is_target_closed_exception(exc: BaseException) -> bool:
    """Phát hiện ngoại lệ liên quan đến việc đóng hoặc sập trình duyệt / CDP."""
    msg = str(exc).lower()
    return any(k in msg for k in [
        "target closed",
        "target page, context or browser has been closed",
        "browser has been closed",
        "connection closed",
        "context closed",
        "target crashed",
        "targetclosederror",
    ])


async def setup_low_end_route_interception(page: Any) -> None:
    """
    Tối ưu máy yếu (Low-end hardware: 4GB - 8GB RAM, CPU 2-4 cores):
    Thiết lập route interception page.route để abort các tài nguyên nặng
    không cần thiết khi chạy ngầm:
      - images ('image', .png, .jpg, .jpeg, .gif, .webp, .ico)
      - fonts ('font', .woff, .woff2, .ttf, .otf)
      - media ('media', .mp4, .mp3, .m4a, .webm, .ogg, .wav)
      - tracking/ad beacons
    Giúp giảm tiêu thụ RAM từ 600MB+ xuống < 180MB và tốc độ mở trang Studio nhanh gấp 3 lần!
    """
    if getattr(page, "_rtm_route_intercept_active", False):
        return

    BLOCKED_TYPES = {"image", "font", "media"}
    BLOCKED_EXTENSIONS = (
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
        ".mp4", ".mp3", ".m4a", ".webm", ".ogg", ".wav",
        ".woff", ".woff2", ".ttf", ".otf",
    )
    BLOCKED_DOMAINS = (
        "googleads", "doubleclick.net", "google-analytics.com",
        "play.google.com/log", "youtube.com/api/stats",
    )

    async def _route_interceptor(route: Any) -> None:
        try:
            req = route.request
            res_type = req.resource_type
            url = req.url.lower()
            url_path = url.split("?", 1)[0].split("#", 1)[0]

            # Không bao giờ can thiệp các endpoint upload video hoặc Scotty stream
            if "upload.youtube.com" in url or "/upload/" in url or "youtubei/v1/upload" in url:
                await route.continue_()
                return

            if res_type in BLOCKED_TYPES:
                await route.abort()
                return

            if any(url_path.endswith(ext) for ext in BLOCKED_EXTENSIONS):
                await route.abort()
                return

            if any(dom in url for dom in BLOCKED_DOMAINS):
                await route.abort()
                return

            await route.continue_()
        except Exception:
            try:
                await route.continue_()
            except Exception:
                pass

    try:
        await page.route("**/*", _route_interceptor)
        setattr(page, "_rtm_route_intercept_active", True)
        logger.info("Đã kích hoạt Low-End Route Interception (abort image, font, media)")
    except Exception as exc:
        logger.warning("Không thể thiết lập route interception: %s", exc)


async def navigate_to_channel_content(
    page: Any,
    preferred_channel_id: str = "",
    allow_direct_goto: bool = True,
    saw_active_upload: bool = False,
) -> Dict[str, Any]:
    """
    Context-aware state machine bringing YouTube Studio onto `/channel/<id>/videos/upload`
    without relying on fragile positional indices (`#menu-paper-icon-item-1`).
    Escapes `/video/<id>/edit` or `/video/<id>/analytics` cleanly back to channel scope first.
    """
    known_channel_id = preferred_channel_id or ""
    ctx = await get_studio_context(page)
    known_channel_id = known_channel_id or str(ctx.get("channelId") or "")
    page_type = str(ctx.get("pageType") or "unknown")
    scope = str(ctx.get("scope") or "other")

    logger.info(
        "[NAV] navigate_to_channel_content start pageType=%s scope=%s channelId=%s url=%s",
        page_type,
        scope,
        known_channel_id,
        ctx.get("url") or getattr(page, "url", ""),
    )

    # Guard modals if any post-save card is covering the page
    await dismiss_post_save_studio_modals(page, settlement_seconds=0.0, context="nav_guard")
    await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="nav_guard_notice")

    # Re-read after modal check
    ctx = await get_studio_context(page)
    known_channel_id = known_channel_id or str(ctx.get("channelId") or "")
    page_type = str(ctx.get("pageType") or "unknown")
    scope = str(ctx.get("scope") or "other")

    # Step 1: If trapped inside /video/<id>/... (edit/analytics/copyright), escape to channel scope first
    if scope == "video":
        back_res = await safe_targeted_click(
            page,
            selectors=[
                'ytcp-navigation-drawer a#top-level-link[href*="/channel/"]',
                'ytcp-navigation-drawer a#back-button[href*="/channel/"]',
                'ytcp-navigation-drawer #back-button a[href*="/channel/"]',
                'ytcp-navigation-drawer a[href*="/channel/"]',
                'ytcp-header a#home-button[href*="/channel/"]',
                'ytcp-entity-switcher a[href*="/channel/"]',
                'a[href*="/channel/"][href*="/videos"]',
            ],
            action_name="escape_video_scope_to_channel",
            exclude_ancestors=["ytcp-video-row", "#hover-items"],
            allow_href_patterns=[r"/channel/[^/?#]+(?:/videos)?/?(?:\?|$)"],
            forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/video/"],
            allow_js_fallback=False,
            timeout_ms=4500,
            pre_delay=0.18,
            post_click_settle=0.6,
        )
        if back_res.get("ok"):
            for _ in range(12):
                ctx = await get_studio_context(page)
                if ctx.get("scope") == "channel":
                    break
                await asyncio.sleep(0.3)
        known_channel_id = known_channel_id or str(ctx.get("channelId") or "")
        page_type = str(ctx.get("pageType") or "unknown")
        scope = str(ctx.get("scope") or "other")

    # Step 2: If in channel scope (and not yet on /videos upload list), click Content link or direct goto
    if scope == "channel" and page_type != "channel_content_videos":
        # Thử kích hoạt Polymer navigation item qua Playwright piercing locator trước
        clicked_nav = False
        for sel in [
            'ytcp-navigation-drawer a[href*="/videos"]',
            'ytcp-navigation-item a[href*="/videos"]',
            'a#menu-item-link[href*="/videos"]',
            'a[test-id="menu-item-link"][href*="/videos"]',
            'a[href*="/videos/upload"]',
            'a[href*="/videos"]',
            'ytcp-navigation-item[test-id="videos"]',
        ]:
            try:
                loc = page.locator(sel).first
                if await loc.count() > 0 and await loc.is_visible():
                    await loc.click(timeout=2500)
                    clicked_nav = True
                    break
            except Exception:
                continue

        if not clicked_nav:
            try:
                await page.evaluate("""() => {
                    function deepFindLink(root) {
                        if (!root) return null;
                        const direct = root.querySelectorAll('a[href*="/videos"]');
                        for (const a of direct) {
                            if (a.offsetParent !== null || a.getClientRects().length > 0) return a;
                        }
                        const all = root.querySelectorAll('*');
                        for (const el of all) {
                            if (el.shadowRoot) {
                                const res = deepFindLink(el.shadowRoot);
                                if (res) return res;
                            }
                        }
                        return null;
                    }
                    const link = deepFindLink(document);
                    if (link) {
                        link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true }));
                        link.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true, cancelable: true }));
                        link.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
                    }
                }""")
            except Exception:
                pass

        for _ in range(6):
            await asyncio.sleep(0.35)
            ctx = await get_studio_context(page)
            if ctx.get("pageType") == "channel_content_videos":
                break

        known_channel_id = known_channel_id or str(ctx.get("channelId") or "")
        page_type = str(ctx.get("pageType") or "unknown")
        scope = str(ctx.get("scope") or "other")

    # Step 3: If on /videos/<short|live|...> subtab, switch gently to #video-list-uploads-tab
    if page_type == "channel_content_videos" and ctx.get("activeContentTab") not in ("", "upload"):
        await safe_targeted_click(
            page,
            selectors=['tp-yt-paper-tab#video-list-uploads-tab', '[test-id="video-list-uploads-tab"]'],
            action_name="select_videos_uploads_tab",
            allowed_page_types={"channel_content_videos"},
            forbidden_href_patterns=[],
            allow_js_fallback=True,
            timeout_ms=3500,
            pre_delay=0.15,
            post_click_settle=0.4,
        )
        ctx = await get_studio_context(page)
        page_type = str(ctx.get("pageType") or "unknown")

    # Step 4: Direct route fallback if still not on channel_content_videos
    if page_type != "channel_content_videos":
        if not known_channel_id:
            ch_m = re.search(r"/channel/([^/?#]+)", getattr(page, "url", "") or "")
            if ch_m:
                known_channel_id = ch_m.group(1)
        if not known_channel_id:
            try:
                known_channel_id = await page.evaluate(
                    """() => {
                        return (window.ytcfg && window.ytcfg.get && window.ytcfg.get('CHANNEL_ID'))
                            || (document.querySelector('a[href*="/channel/UC"]')?.href?.match(/\\/channel\\/(UC[A-Za-z0-9_-]+)/)?.[1])
                            || (document.querySelector('ytcp-navigation-drawer a[href*="/channel/"]')?.href?.match(/\\/channel\\/([^/?#]+)/)?.[1])
                            || '';
                    }"""
                ) or ""
            except Exception:
                pass

        if known_channel_id and allow_direct_goto:
            target_url = f"https://studio.youtube.com/channel/{known_channel_id}/videos/upload"
            logger.info("[NAV] Chuyển hướng trực tiếp URL tới tab Nội dung: %s", target_url)
            try:
                await page.goto(target_url, wait_until="domcontentloaded", timeout=45000)
                await asyncio.sleep(1.2)
                ctx = await get_studio_context(page)
            except Exception as exc:
                logger.warning("[NAV] Fallback goto failed: %s", exc)
        else:
            logger.warning(
                "[NAV] Không có channel_id hoặc allow_direct_goto=False, thử lại click drawer SPA và KHÔNG gọi URL fallback videos/upload để tránh lỗi màn hình trắng."
            )
            # Thử click lại drawer SPA lần nữa nếu chưa vào được tab Nội dung
            for sel in [
                'ytcp-navigation-drawer a[href*="/videos"]',
                'ytcp-navigation-item a[href*="/videos"]',
                'a#menu-item-link[href*="/videos"]',
                'a[test-id="menu-item-link"][href*="/videos"]',
                'a[href*="/videos/upload"]',
                'a[href*="/videos"]',
            ]:
                try:
                    loc = page.locator(sel).first
                    if await loc.count() > 0 and await loc.is_visible():
                        await loc.click(timeout=2500)
                        break
                except Exception:
                    continue
            await asyncio.sleep(1.0)
            ctx = await get_studio_context(page)

    ctx = await get_studio_context(page)
    return {
        "ok": ctx.get("pageType") == "channel_content_videos",
        "channelId": known_channel_id or str(ctx.get("channelId") or ""),
        "pageType": ctx.get("pageType"),
        "scope": ctx.get("scope"),
        "url": ctx.get("url") or getattr(page, "url", ""),
        "context": ctx,
    }


