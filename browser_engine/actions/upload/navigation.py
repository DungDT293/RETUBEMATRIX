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
    Guarantees the browser never stays stuck on Dashboard or modal backdrop.
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
                            || '';
                    }"""
                ) or ""
            except Exception:
                pass

        target_url = (
            f'https://studio.youtube.com/channel/{cid}/videos/upload?filter=%5B%5D&sort=%7B"columnType"%3A"date"%2C"sortOrder"%3A"DESCENDING"%7D'
            if cid else
            'https://studio.youtube.com/videos/upload?filter=%5B%5D&sort=%7B"columnType"%3A"date"%2C"sortOrder"%3A"DESCENDING"%7D'
        )

        # 1. Try SPA navigation via Polymer events
        clicked = False
        try:
            clicked = await page.evaluate(
                """() => {
                    const item = document.querySelector('ytcp-navigation-item[test-id="videos"]')
                        || document.querySelector('ytcp-navigation-drawer a[href*="/videos"]')
                        || document.querySelector('[test-id="menu-item-content"]')
                        || document.querySelector('#menu-item-1');
                    if (item) {
                        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true }));
                        item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true, cancelable: true }));
                        item.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
                        return true;
                    }
                    return false;
                }"""
            )
        except Exception:
            pass

        if clicked:
            for _ in range(8):
                await asyncio.sleep(0.5)
                c_url = getattr(page, "url", "") or ""
                if "/videos" in c_url:
                    logger.info("Da chuyen sang tab Noi dung qua SPA: %s", c_url)
                    return

        # 2. Hard navigation fallback if SPA didn't transition
        logger.info("Chuyen thang sang URL Noi dung (Zero-Sticking): %s", target_url)
        await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(1.5)
    except Exception as e:
        logger.warning("Loi nhe khi chuyen sang tab Noi dung: %s", e)


navigate_to_channel_content = goto_channel_videos
