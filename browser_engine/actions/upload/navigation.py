# -*- coding: utf-8 -*-
"""
RETubeMatrix - YouTube Studio Channel Content Navigator (Zero-Sticking).
Guarantees the browser leaves Dashboard and lands on /videos/upload sorted by date descending.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


async def goto_channel_videos(page: Any) -> None:
    """
    Directly navigates to YouTube Studio Channel Content (/videos/upload) with descending date sort.
    Guarantees the browser leaves Dashboard and lands on /channel/{cid}/videos/upload sorted by date descending.
    Never navigates to bare 'https://studio.youtube.com/videos/upload' without cid to avoid white-screen error.
    """
    try:
        curr_url = getattr(page, "url", "") or ""
        if "/videos/upload" in curr_url:
            return

        cid = ""
        m = re.search(r"/channel/([^/?#]+)", curr_url)
        if m:
            cid = m.group(1)

        if not cid:
            try:
                cid = await page.evaluate(
                    """() => {
                        return (window.ytcfg && window.ytcfg.get && window.ytcfg.get('CHANNEL_ID'))
                            || (document.querySelector('a[href*="/channel/UC"]')?.href?.match(/\\/channel\\/(UC[A-Za-z0-9_-]+)/)?.[1])
                            || (document.querySelector('ytcp-navigation-drawer a[href*="/channel/"]')?.href?.match(/\\/channel\\/([^/?#]+)/)?.[1])
                            || '';
                    }"""
                ) or ""
            except Exception:
                pass

        # 0. Giải phóng blocking dialog nếu có
        try:
            from actions.studio_dom import dismiss_blocking_studio_dialogs
            await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="navigation")
        except Exception:
            pass

        # 1. Try SPA navigation via Playwright locators (automatically pierces Shadow DOM)
        clicked = False
        nav_selectors = [
            'ytcp-navigation-drawer a[href*="/videos"]',
            'ytcp-navigation-item a[href*="/videos"]',
            'a#menu-item-link[href*="/videos"]',
            'a[test-id="menu-item-link"][href*="/videos"]',
            'a[href*="/videos/upload"]',
            'a[href*="/videos"]',
            'ytcp-navigation-item[test-id="videos"]',
        ]
        for sel in nav_selectors:
            try:
                loc = page.locator(sel).first
                if await loc.count() > 0 and await loc.is_visible():
                    await loc.click(timeout=3000)
                    clicked = True
                    logger.info("Da click menu Noi dung qua Playwright locator: %s", sel)
                    break
            except Exception:
                continue

        # Fallback to recursive shadow DOM search via JavaScript
        if not clicked:
            try:
                clicked = await page.evaluate(
                    """() => {
                        function deepFindLink(root) {
                            if (!root) return null;
                            const direct = root.querySelectorAll('ytcp-navigation-drawer a[href*="/videos"], a[href*="/videos"]');
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
                            return true;
                        }
                        return false;
                    }"""
                )
            except Exception:
                pass

        if clicked:
            for _ in range(12):
                await asyncio.sleep(0.4)
                c_url = getattr(page, "url", "") or ""
                if "/videos" in c_url:
                    logger.info("Da chuyen sang tab Noi dung qua SPA: %s", c_url)
                    return

        # 2. Re-extract cid if page transitioned or loaded more context
        if not cid:
            c_url = getattr(page, "url", "") or ""
            m = re.search(r"/channel/([^/?#]+)", c_url)
            if m:
                cid = m.group(1)
        if not cid:
            try:
                cid = await page.evaluate(
                    """() => {
                        return (window.ytcfg && window.ytcfg.get && window.ytcfg.get('CHANNEL_ID'))
                            || (document.querySelector('a[href*="/channel/UC"]')?.href?.match(/\\/channel\\/(UC[A-Za-z0-9_-]+)/)?.[1])
                            || (document.querySelector('ytcp-navigation-drawer a[href*="/channel/"]')?.href?.match(/\\/channel\\/([^/?#]+)/)?.[1])
                            || '';
                    }"""
                ) or ""
            except Exception:
                pass

        # 3. Hard navigation fallback ONLY when valid channel cid is present
        if cid:
            target_url = (
                f'https://studio.youtube.com/channel/{cid}/videos/upload?filter=%5B%5D&sort=%7B"columnType"%3A"date"%2C"sortOrder"%3A"DESCENDING"%7D'
            )
            logger.info("Chuyen thang sang URL Noi dung co CID (Zero-Sticking): %s", target_url)
            await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(1.5)
        else:
            logger.warning(
                "Chua xac dinh duoc CID de dieu huong truc tiep; da thu click SPA menu drawer va KHONG goi URL fallback videos/upload de tranh loi trang trang YouTube Studio."
            )
    except Exception as e:
        logger.warning("Loi nhe khi chuyen sang tab Noi dung: %s", e)


navigate_to_channel_content = goto_channel_videos
