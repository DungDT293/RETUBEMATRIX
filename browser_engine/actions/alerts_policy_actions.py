"""
Google Alerts & Policy page interactions.
"""
import logging
import random

from actions.input_human import (
    random_delay, move_to_locator, human_scroll, human_read_and_scroll, human_type,
)
from actions.page_context import ensure_on_alerts, where_am_i

logger = logging.getLogger(__name__)

_ALERT_KEYWORDS = [
    "công nghệ AI 2026",
    "tin tức kinh tế hôm nay",
    "cryptocurrency news",
    "technology trends 2026",
    "khởi nghiệp Việt Nam",
    "machine learning news",
    "startup news 2026",
    "digital marketing 2026",
]

_ALERT_FREQUENCIES = ["As-it-happens", "At most once a day", "At most once a week"]


async def alerts_interaction(page, keywords: list[str] = None) -> bool:
    """Đăng ký 1-2 Google Alerts cho từ khóa ngẫu nhiên."""
    kw_list = keywords or _ALERT_KEYWORDS
    chosen_kws = random.sample(kw_list, min(2, len(kw_list)))

    loc = await where_am_i(page)
    logger.info("Vị trí hiện tại: %s | → Google Alerts", loc)
    await ensure_on_alerts(page)
    await random_delay(2.0, 4.0)

    await human_scroll(page, "down", random.randint(100, 300))
    await random_delay(1.0, 2.0)

    for kw in chosen_kws:
        await _create_alert(page, kw)
        await random_delay(2.0, 4.0)

    logger.info("Hoàn thành đăng ký Google Alerts: %s", chosen_kws)
    return True


async def _create_alert(page, keyword: str):
    try:
        search_box = page.locator(
            'input[name="q"], '
            'input.gLFyf, '
            'input[aria-label*="alert"], '
            'input[placeholder*="Create"], '
            'input#query_string, input.alert_query'
        ).first
        await search_box.wait_for(state="visible", timeout=8000)
        await search_box.click()
        await random_delay(0.2, 0.5)
        await page.keyboard.press("Control+a")
        await random_delay(0.1, 0.2)
        await human_type(page, search_box, keyword, typo_rate=0.01)
        await random_delay(0.8, 1.5)
        await page.keyboard.press("Enter")
        await random_delay(1.5, 3.0)

        freq_sel = page.locator('select#delivery_frequency, select[name*="freq"]').first
        if await freq_sel.is_visible(timeout=2000):
            await freq_sel.select_option(label=random.choice(_ALERT_FREQUENCIES))
            await random_delay(0.5, 1.0)

        create_btn = page.locator(
            'button:has-text("Create Alert"), button:has-text("Tạo thông báo"), '
            'button:has-text("Create alert"), '
            'input[value*="Create"], '
            'div[role="button"]:has-text("Create")'
        ).first
        if await create_btn.is_visible(timeout=3000):
            await move_to_locator(page, create_btn)
            await random_delay(0.3, 0.7)
            await create_btn.click()
            await random_delay(1.0, 2.0)
            logger.info("Đã đăng ký Google Alert: '%s'", keyword)
        else:
            # Google Alerts tự động tạo khi nhấn Enter — log thành công
            logger.info("Đã đăng ký Google Alert (auto): '%s'", keyword)
    except Exception as exc:
        logger.debug("Không đăng ký được Alert '%s': %s", keyword, exc)


async def maybe_click_helpful_feedback(page) -> bool:
    """
    Phát hiện và click nút 'Có' / 'Yes' trên widget feedback
    'Thông tin này có hữu ích không?' của các trang Google support.
    Trả về True nếu đã click.
    """
    helpful_selectors = [
        # Tiếng Việt
        'button:has-text("Có")',
        'a:has-text("Có")',
        '[aria-label*="Có"]',
        # English variants
        'button:has-text("Yes")',
        'a:has-text("Yes")',
        '[data-answer="yes"]',
        '[data-helpful="true"]',
        # Google support specific
        'div[data-answer="1"]',
        'button[data-stats-id*="helpful"]',
        '.was-this-helpful button:first-child',
        '[class*="helpful"] button:first-child',
    ]
    try:
        for sel in helpful_selectors:
            try:
                btn = page.locator(sel).first
                if await btn.is_visible(timeout=600):
                    # Cuộn đến nút trước khi click (như người đọc xong rồi đánh giá)
                    await move_to_locator(page, btn)
                    await random_delay(0.8, 2.0)
                    await btn.click()
                    logger.info("Đã click 'Có' trên widget feedback hữu ích")
                    await random_delay(0.5, 1.2)
                    return True
            except Exception:
                continue
    except Exception as exc:
        logger.debug("maybe_click_helpful_feedback lỗi: %s", exc)
    return False


async def policy_interaction(page) -> bool:
    """Truy cập trang chính sách quảng cáo Google, cuộn đọc, xác nhận nếu có hộp thoại."""
    logger.info("Đang truy cập trang Chính sách quảng cáo Google")
    await page.goto("https://support.google.com/google-ads/answer/6008942")
    await page.wait_for_load_state("domcontentloaded")
    await random_delay(2.0, 4.0)

    await human_read_and_scroll(page, cycles=random.randint(2, 3))

    for selector, label in [
        ('button:has-text("I agree")',      "I agree"),
        ('button:has-text("Tôi đã hiểu")', "Tôi đã hiểu"),
        ('button:has-text("Got it")',       "Got it"),
        ('button:has-text("Accept")',       "Accept"),
    ]:
        try:
            btn = page.locator(selector).first
            if await btn.is_visible(timeout=2000):
                await move_to_locator(page, btn)
                await random_delay(0.5, 1.0)
                await btn.click()
                logger.info("Đã click xác nhận chính sách: '%s'", label)
                await random_delay(0.8, 1.5)
                break
        except Exception:
            pass

    # Click "Có" trên widget feedback nếu có — timeout ngắn để không bị treo
    await maybe_click_helpful_feedback(page)

    logger.info("Hoàn thành tương tác trang chính sách")
    return True
