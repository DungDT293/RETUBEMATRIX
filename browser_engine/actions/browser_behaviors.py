"""
Browser UI behaviors — address bar focus, tab switching, new tab simulation.
"""
import asyncio
import logging
import random

logger = logging.getLogger(__name__)


async def maybe_focus_address_bar(page, retype_url: bool = False):
    """
    15% khả năng nhấn Ctrl+L để focus thanh địa chỉ — giả lập người dùng
    kiểm tra URL hoặc chuẩn bị điều hướng.
    retype_url=True: gõ lại URL hiện tại rồi Enter (giả lập reload bằng tay).
    """
    if random.random() > 0.15:
        return
    try:
        await page.keyboard.press("Control+l")
        await asyncio.sleep(random.uniform(0.5, 1.5))

        if retype_url and random.random() < 0.40:
            current_url = page.url
            await asyncio.sleep(random.uniform(0.3, 0.8))
            await page.keyboard.press("Control+a")
            await asyncio.sleep(random.uniform(0.1, 0.3))
            for char in current_url:
                await page.keyboard.press(char)
                await asyncio.sleep(random.uniform(0.02, 0.06))
            await asyncio.sleep(random.uniform(0.3, 0.8))
            await page.keyboard.press("Enter")
            await page.wait_for_load_state("domcontentloaded")
            logger.info("Đã gõ lại URL qua thanh địa chỉ: %s", current_url[:60])
        else:
            await asyncio.sleep(random.uniform(0.4, 1.2))
            await page.keyboard.press("Escape")
            logger.debug("Đã focus thanh địa chỉ rồi bỏ qua")
    except Exception as exc:
        logger.debug("maybe_focus_address_bar lỗi: %s", exc)


async def maybe_switch_tab(context, current_page):
    """
    10% khả năng chuyển sang tab khác rồi quay lại — giả lập người dùng
    đa nhiệm giữa các tab.
    """
    if random.random() > 0.10:
        return
    try:
        pages = context.pages
        other_pages = [p for p in pages if p != current_page and not p.is_closed()]
        if not other_pages:
            return

        other = random.choice(other_pages)
        try:
            tab_idx = [p for p in pages if not p.is_closed()].index(other) + 1
            await current_page.keyboard.press(f"Control+{min(tab_idx, 8)}")
            await asyncio.sleep(random.uniform(0.2, 0.5))
        except Exception:
            pass
        await other.bring_to_front()
        logger.debug("Chuyển sang tab khác tạm thời")
        await asyncio.sleep(random.uniform(3.0, 8.0))

        try:
            current_idx = [p for p in context.pages if not p.is_closed()].index(current_page) + 1
            await other.keyboard.press(f"Control+{min(current_idx, 8)}")
            await asyncio.sleep(random.uniform(0.2, 0.5))
        except Exception:
            pass
        await current_page.bring_to_front()
        logger.debug("Quay lại tab chính")
        await asyncio.sleep(random.uniform(0.5, 1.5))
    except Exception as exc:
        logger.debug("maybe_switch_tab lỗi: %s", exc)


async def maybe_open_new_tab_and_close(context, return_page=None):
    """
    8% khả năng mở tab mới trống, nhìn một chút rồi đóng — giả lập
    người dùng vô tình mở tab hoặc kiểm tra tab mới.
    """
    if random.random() > 0.08:
        return
    try:
        if return_page is None:
            previous_pages = [p for p in context.pages if not p.is_closed()]
            return_page = previous_pages[-1] if previous_pages else None
        new_page = await context.new_page()
        await new_page.bring_to_front()
        logger.debug("Mở tab mới trống")
        await asyncio.sleep(random.uniform(1.5, 4.0))
        await new_page.close()
        if return_page and not return_page.is_closed():
            await return_page.bring_to_front()
        logger.debug("Đóng tab mới trống")
    except Exception as exc:
        logger.debug("maybe_open_new_tab_and_close lỗi: %s", exc)
