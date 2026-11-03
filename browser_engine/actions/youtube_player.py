"""
YouTube player interactions — ads, fullscreen, seek, pause, quality, like, comment.
"""
import asyncio
import logging
import random

from actions.input_human import (
    move_mouse_to, move_to_locator, random_delay, human_type,
)
from actions.youtube_ai_comments import generate_ai_comment

logger = logging.getLogger(__name__)


def _probability(default: float, override: float | None = None) -> float:
    """Return a clamped probability, preserving defaults unless overridden."""
    if override is None:
        value = default
    else:
        try:
            value = float(override)
        except (TypeError, ValueError):
            value = default
    return max(0.0, min(1.0, value))


_AD_SELECTORS = [
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button',
    '.ytp-skip-ad-button',
    'button[class*="ad-skip"]',
    '[id^="skip-button"]',
    '.ytp-ad-skip-button-container button',
]


async def try_skip_ad(page, skip_probability: float | None = None) -> bool:
    """Kiểm tra quảng cáo có thể bỏ qua, di chuột đến nút rồi click."""
    skip_chance = _probability(0.80, skip_probability)
    for selector in _AD_SELECTORS:
        try:
            btn = page.locator(selector).first
            if not await btn.is_visible(timeout=800):
                continue
            if random.random() < skip_chance:
                await move_to_locator(page, btn)
                await random_delay(0.5, 1.8)
                await btn.click()
                logger.info("Đã bỏ qua quảng cáo (selector: %s)", selector)
            else:
                logger.info("Để quảng cáo chạy (giả lập người dùng bị phân tâm)")
            return True
        except Exception:
            continue
    return False


async def maybe_adjust_volume(_page, probability: float | None = None):
    """No-op: automation must not change YouTube DOM/player volume."""
    _probability(0.0, probability)
    return None


async def exit_fullscreen_if_active(page) -> bool:
    """Thoát fullscreen YouTube nếu DOM hoặc player class còn báo fullscreen."""
    try:
        is_fullscreen = await page.evaluate(
            """
            () => {
                const player = document.querySelector('#movie_player, .html5-video-player');
                return Boolean(
                    document.fullscreenElement
                    || player?.classList?.contains('ytp-fullscreen')
                    || document.body?.classList?.contains('ytp-fullscreen')
                );
            }
            """
        )
        if not is_fullscreen:
            return False
        await page.keyboard.press("Escape")
        await random_delay(0.5, 1.0)
        logger.info("Đã thoát toàn màn hình bằng Escape")
        return True
    except Exception:
        return False


async def maybe_fullscreen(page, probability: float | None = None):
    """4% khả năng vào fullscreen (phím F) xem một lúc rồi thoát (Escape)."""
    if random.random() > _probability(0.04, probability):
        return
    try:
        player = page.locator("#movie_player, .html5-video-player").first
        if not await player.is_visible(timeout=1000):
            return
        # Click vào player để focus trước khi bấm phím tắt
        box = await player.bounding_box(timeout=2000)
        if box:
            await move_mouse_to(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            await random_delay(0.3, 0.6)
        await page.keyboard.press("f")
        logger.info("Đã vào toàn màn hình (phím F)")
        await random_delay(10.0, 25.0)
        await exit_fullscreen_if_active(page)
    except Exception:
        pass


async def maybe_theater_mode(page, probability: float | None = None):
    """8% khả năng bật theater mode (phím T) xem một lúc rồi tắt."""
    if random.random() > _probability(0.08, probability):
        return
    try:
        player = page.locator("#movie_player, .html5-video-player").first
        if not await player.is_visible(timeout=1000):
            return
        box = await player.bounding_box(timeout=2000)
        if box:
            await move_mouse_to(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            await random_delay(0.3, 0.6)
        await page.keyboard.press("t")
        logger.info("Đã bật chế độ rạp chiếu phim (phím T)")
        await random_delay(15.0, 40.0)
        await page.keyboard.press("t")
        await random_delay(0.5, 1.0)
        logger.info("Đã tắt chế độ rạp chiếu phim")
    except Exception:
        pass


async def maybe_seek_video(page, probability: float | None = None):
    """10% khả năng tua tới/lui ngẫu nhiên trong video."""
    if random.random() > _probability(0.10, probability):
        return
    try:
        prog_bar = page.locator(".ytp-progress-bar").first
        if not await prog_bar.is_visible(timeout=1000):
            return
        box = await prog_bar.bounding_box(timeout=2000)
        if not box:
            return
        target_x = box["x"] + box["width"] * random.uniform(0.1, 0.9)
        target_y = box["y"] + box["height"] / 2
        await move_mouse_to(page, target_x, target_y)
        await asyncio.sleep(random.uniform(0.3, 0.7))
        await page.mouse.click(target_x, target_y)
        direction = "tới" if target_x > box["x"] + box["width"] / 2 else "lui"
        logger.info("Đã tua video %s", direction)
        await random_delay(0.5, 1.5)
    except Exception:
        pass


async def maybe_pause_resume(page, probability: float | None = None):
    """6% khả năng nhấn pause rồi play lại sau vài giây."""
    if random.random() > _probability(0.06, probability):
        return
    try:
        player = page.locator("#movie_player, .html5-video-player").first
        if not await player.is_visible(timeout=1000):
            return
        box = await player.bounding_box(timeout=2000)
        if not box:
            return
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        await move_mouse_to(page, cx, cy)
        play_btn = page.locator(".ytp-play-button").first
        if await play_btn.is_visible(timeout=1000):
            await move_to_locator(page, play_btn)
            await play_btn.click()
        else:
            await page.keyboard.press("k")
        await exit_fullscreen_if_active(page)
        logger.info("Đã tạm dừng video")
        await random_delay(3.0, 10.0)
        await move_mouse_to(page, cx, cy)
        if await play_btn.is_visible(timeout=1000):
            await move_to_locator(page, play_btn)
            await play_btn.click()
        else:
            await page.keyboard.press("k")
        await exit_fullscreen_if_active(page)
        logger.info("Đã tiếp tục phát video")
    except Exception:
        pass


async def maybe_change_quality(page, probability: float | None = None):
    """8% khả năng mở menu cài đặt và đổi chất lượng video."""
    if random.random() > _probability(0.08, probability):
        return
    try:
        settings_btn = page.locator(".ytp-settings-button").first
        if not await settings_btn.is_visible(timeout=1000):
            return
        await move_to_locator(page, settings_btn)
        await settings_btn.click()
        await random_delay(0.8, 1.5)

        quality_option = None
        for item in await page.locator(".ytp-menuitem").all():
            try:
                label = (await item.inner_text()).lower()
                if "quality" in label or "chất lượng" in label:
                    quality_option = item
                    break
            except Exception:
                continue
        if quality_option is None:
            await page.keyboard.press("Escape")
            return
        await quality_option.click()
        await random_delay(0.5, 1.0)

        items = await page.locator(".ytp-menuitem").all()
        if items:
            quality_items = []
            for item in items:
                try:
                    label = (await item.inner_text()).strip()
                    if label:
                        quality_items.append((item, label))
                except Exception:
                    pass
            if quality_items:
                chosen_item, chosen_label = random.choice(quality_items[:5])
                await chosen_item.click()
                logger.info("Đã đổi chất lượng video: %s", chosen_label)
        await random_delay(0.5, 1.0)
    except Exception as exc:
        logger.debug("Không thể đổi chất lượng: %s", exc)
        try:
            await page.keyboard.press("Escape")
        except Exception:
            pass


async def maybe_like_video(page, like_rate: float = 0.20):
    """Like video theo xác suất like_rate (0.0-1.0)."""
    like_rate = max(0.0, min(1.0, float(like_rate or 0.0)))
    if random.random() > like_rate:
        return
    try:
        like_locators = [
            page.get_by_label("like this video", exact=False).first,
            page.get_by_label("I like this", exact=False).first,
            page.get_by_label("Thích video này", exact=False).first,
            page.locator("like-button-view-model button, ytd-toggle-button-renderer button").first,
        ]
        for like_btn in like_locators:
            try:
                if not await like_btn.is_visible(timeout=2000):
                    continue
                aria_label = (await like_btn.get_attribute("aria-label") or "").lower()
                if "dislike" in aria_label or "không thích" in aria_label:
                    continue
                if (await like_btn.get_attribute("aria-pressed") or "").lower() == "true":
                    logger.info("Video đã được thích trước đó")
                    return
                await move_to_locator(page, like_btn)
                await random_delay(0.5, 1.5)
                await like_btn.click()
                logger.info("Đã thích video")
                return
            except Exception:
                continue

        clicked = await page.evaluate(
            """
            () => {
                const buttons = Array.from(document.querySelectorAll('button[aria-label], like-button-view-model button, ytd-toggle-button-renderer button'));
                const button = buttons.find((candidate) => {
                    const label = `${candidate.getAttribute('aria-label') || ''} ${candidate.textContent || ''}`.toLowerCase();
                    if (!label.trim()) return false;
                    if (label.includes('dislike') || label.includes('không thích')) return false;
                    return label.includes('like') || label.includes('thích');
                });
                if (!button) return 'missing';
                if ((button.getAttribute('aria-pressed') || '').toLowerCase() === 'true') return 'already';
                button.click();
                return 'clicked';
            }
            """
        )
        if clicked == "clicked":
            logger.info("Đã thích video")
        elif clicked == "already":
            logger.info("Video đã được thích trước đó")
    except Exception as exc:
        logger.debug("Không thể thích video: %s", exc)


async def maybe_comment_video(page, comment_pool: list[str] = None, comment_rate: float = 0.08, ai_comment_settings: dict | None = None):
    """Để lại bình luận ngắn trên video theo xác suất comment_rate."""
    comment_rate = max(0.0, min(1.0, float(comment_rate or 0.0)))
    if random.random() > comment_rate:
        return
    default_pool = [
        "Thanks for sharing", "Interesting update", "Good overview",
        "This was useful", "Nice explanation", "Helpful context",
        "Worth watching", "Good breakdown", "I learned something new",
    ]

    pool = comment_pool or default_pool
    comment = ""
    if ai_comment_settings and ai_comment_settings.get("enabled"):
        comment = await generate_ai_comment(page, ai_comment_settings)
        if not comment:
            logger.debug("AI comment khong kha dung")
    if not comment and (not ai_comment_settings or ai_comment_settings.get("fallback_to_manual", True)):
        comment = random.choice(pool)
    if not comment:
        logger.info("Bo qua comment vi AI khong tao duoc noi dung va fallback_to_manual tat")
        return
    try:
        for _ in range(3):
            await page.mouse.wheel(0, 500)
            await random_delay(0.8, 1.5)

        placeholder = page.locator(
            "#simplebox-placeholder, "
            "ytd-comment-simplebox-renderer #placeholder-area, "
            "[id='simplebox-placeholder']"
        ).first
        if not await placeholder.is_visible(timeout=8000):
            logger.debug("Không tìm thấy ô bình luận YouTube")
            return

        await move_to_locator(page, placeholder)
        await placeholder.click()
        await random_delay(0.5, 1.2)

        editable = page.locator(
            "#contenteditable-root, "
            "ytd-commentbox #contenteditable-root, "
            "div[contenteditable='true'][id='contenteditable-root']"
        ).first
        if not await editable.is_visible(timeout=5000):
            logger.debug("Không tìm thấy ô nhập bình luận")
            return

        await human_type(page, editable, comment, typo_rate=0.01)
        await random_delay(0.8, 1.5)

        submit_btn = page.locator(
            "#submit-button, "
            "ytd-commentbox #submit-button, "
            "button[aria-label*='Comment'], "
            "#comment-button"
        ).first
        if await submit_btn.is_visible(timeout=3000):
            await move_to_locator(page, submit_btn)
            await random_delay(0.5, 1.0)
            await submit_btn.click()
            logger.info("Đã bình luận: '%s'", comment)
            await random_delay(2.0, 4.0)
        else:
            await page.keyboard.press("Control+Enter")
            logger.info("Đã bình luận qua Ctrl+Enter: '%s'", comment)
            await random_delay(2.0, 4.0)
    except Exception as exc:
        logger.debug("Không thể bình luận: %s", exc)
