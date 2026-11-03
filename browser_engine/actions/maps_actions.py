"""
Google Maps interaction — tìm kiếm địa điểm, xem ảnh, đọc reviews, chỉ đường.
"""
import logging
import random

from actions.input_human import (
    human_type, random_delay, move_to_locator,
    human_scroll, move_mouse_to,
)
from actions.page_context import ensure_on_maps, where_am_i, dismiss_blocking_popups

logger = logging.getLogger(__name__)

_MAPS_QUERIES = [
    "quán cafe gần đây",
    "nhà hàng ngon gần đây",
    "siêu thị gần đây",
    "bệnh viện gần đây",
    "ATM gần đây",
    "trường học gần đây",
    "công viên gần đây",
    "khách sạn gần đây",
    "pharmacy near me",
    "coffee shop near me",
    "restaurant near me",
    "gym near me",
]

_MAPS_QUERIES_VIETNAM = _MAPS_QUERIES[:8]
_MAPS_QUERIES_ENGLISH = [
    "coffee shop near me",
    "restaurant near me",
    "supermarket near me",
    "hospital near me",
    "ATM near me",
    "school near me",
    "park near me",
    "hotel near me",
    "pharmacy near me",
    "gym near me",
]


def maps_query_pool(keyword_preset: str = "mixed") -> list[str]:
    preset = str(keyword_preset or "mixed").strip().lower()
    if preset == "english":
        return _MAPS_QUERIES_ENGLISH
    if preset == "vietnam":
        return _MAPS_QUERIES_VIETNAM
    return _MAPS_QUERIES


async def maps_interaction(page, keyword_preset: str = "mixed") -> bool:
    """
    Tìm kiếm địa điểm ngẫu nhiên trên Maps, xem ảnh, đọc reviews, phóng to/thu nhỏ.
    """
    query_pool = maps_query_pool(keyword_preset)
    query = random.choice(query_pool)
    loc = await where_am_i(page)
    logger.info("Vị trí hiện tại: %s | → Maps tìm: '%s'", loc, query)

    await ensure_on_maps(page, query)
    await dismiss_blocking_popups(page, "Maps")
    await random_delay(3.0, 5.0)

    await dismiss_blocking_popups(page, "Maps")
    await _mouse_around_map(page)
    await _zoom_map(page)

    opened = await _open_place(page)
    if not opened:
        logger.info("Maps chưa mở được địa điểm sau tìm kiếm, thử cuộn kết quả và mở lại")
        await human_scroll(page, "down", random.randint(250, 500))
        await random_delay(1.0, 2.0)
        opened = await _open_place(page)
    if opened:
        await random_delay(2.0, 3.5)
        viewed_photos = await _view_photos(page)
        read_reviews = await _read_reviews(page)
        if not viewed_photos:
            logger.info("Maps không thấy nút ảnh, tiếp tục đọc panel địa điểm")
        if not read_reviews:
            logger.info("Maps không thấy tab đánh giá, đọc/scroll panel địa điểm")
            await _read_place_panel(page)
    else:
        logger.info("Maps không mở được địa điểm nào, tìm lại query phụ rồi thử mở địa điểm")
        await _search_in_maps(page, random.choice(query_pool))
        opened = await _open_place(page)
        if not opened:
            opened = await _open_place_dom_fallback(page)
        if opened:
            await _read_place_panel(page)
        else:
            logger.info("Maps chưa hoàn thành vì không mở được địa điểm cụ thể nào")

    if random.random() < 0.60:
        await _get_directions(page)

    await _search_in_maps(page, random.choice(query_pool))

    if opened:
        logger.info("Hoàn thành tương tác Google Maps")
        return True
    return False


async def _search_in_maps(page, query: str):
    try:
        search_box = page.locator(
            'input#searchboxinput, '
            'input[aria-label*="Search Google Maps"], '
            'input[aria-label*="Tìm kiếm Google Maps"], '
            'input[name="q"][aria-label]'
        ).first
        if not await search_box.is_visible(timeout=4000):
            return
        await move_to_locator(page, search_box)
        await search_box.triple_click()
        await random_delay(0.3, 0.7)
        await human_type(page, search_box, query, typo_rate=0.01)
        await random_delay(0.8, 1.5)
        await page.keyboard.press("Enter")
        await page.wait_for_load_state("domcontentloaded")
        await random_delay(2.0, 4.0)
        await dismiss_blocking_popups(page, "Maps search")
        logger.info("Đã tìm kiếm Maps: '%s'", query)
    except Exception as exc:
        logger.debug("Không tìm kiếm được trong Maps: %s", exc)


async def _mouse_around_map(page):
    try:
        map_area = page.locator("#map, canvas, .scene-container").first
        box = await map_area.bounding_box(timeout=5000)
        if not box:
            return
        for _ in range(random.randint(3, 6)):
            tx = box["x"] + random.uniform(0.2, 0.8) * box["width"]
            ty = box["y"] + random.uniform(0.2, 0.8) * box["height"]
            await move_mouse_to(page, tx, ty)
            await random_delay(0.5, 1.5)
    except Exception as exc:
        logger.debug("Không di chuột được trên bản đồ: %s", exc)


async def _zoom_map(page):
    try:
        zoom_in = page.locator('button[aria-label*="Zoom in"], button[jsaction*="zoom_in"]').first
        if await zoom_in.is_visible(timeout=3000):
            for _ in range(random.randint(1, 3)):
                await move_to_locator(page, zoom_in)
                await zoom_in.click()
                await random_delay(0.5, 1.2)

        await random_delay(1.0, 2.0)

        zoom_out = page.locator('button[aria-label*="Zoom out"], button[jsaction*="zoom_out"]').first
        if await zoom_out.is_visible(timeout=3000):
            for _ in range(random.randint(1, 2)):
                await move_to_locator(page, zoom_out)
                await zoom_out.click()
                await random_delay(0.5, 1.2)
    except Exception as exc:
        logger.debug("Không zoom được bản đồ: %s", exc)


async def _open_place(page) -> bool:
    try:
        await page.wait_for_timeout(1200)
        results = await _visible_place_results(page)
        if not results:
            return False
        chosen = random.choice(results[:5])
        await move_to_locator(page, chosen)
        await random_delay(0.5, 1.0)
        await chosen.click()
        await page.wait_for_load_state("domcontentloaded")
        await random_delay(2.0, 3.5)
        await dismiss_blocking_popups(page, "Maps place")
        logger.info("Đã mở trang địa điểm trên Maps")
        return True
    except Exception as exc:
        logger.debug("Không thể mở địa điểm: %s", exc)
        return False


async def _visible_place_results(page):
    selectors = [
        'a.hfpxzc[href*="/maps/place/"]',
        'a[href*="/maps/place/"]',
        'div.Nv2PK[role="article"]',
        'div[role="article"]',
        'div[role="feed"] a[aria-label]',
        'div[role="main"] a[aria-label][href*="/maps"]',
    ]
    for selector in selectors:
        try:
            visible = []
            for item in await page.locator(selector).all():
                try:
                    if await item.is_visible(timeout=500):
                        visible.append(item)
                except Exception:
                    continue
            if visible:
                return visible
        except Exception:
            continue
    return []


async def _open_place_dom_fallback(page) -> bool:
    try:
        opened = await page.evaluate(
            """
            () => {
                const selectors = [
                    'a[href*="/maps/place/"]',
                    'a.hfpxzc',
                    'div[role="article"] a',
                    'div.Nv2PK a'
                ];
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.scrollIntoView({ block: 'center', inline: 'center' });
                        element.click();
                        return true;
                    }
                }
                return false;
            }
            """
        )
        if opened:
            await page.wait_for_load_state("domcontentloaded", timeout=10000)
            await random_delay(2.0, 3.5)
            await dismiss_blocking_popups(page, "Maps place")
            logger.info("Đã mở địa điểm Maps bằng DOM fallback")
            return True
    except Exception as exc:
        logger.debug("Không mở được địa điểm bằng DOM fallback: %s", exc)
    return False


async def _get_directions(page) -> bool:
    try:
        dir_btn = page.locator(
            'button[data-value="Directions"], '
            'button[aria-label*="Directions"], '
            'a[aria-label*="Directions"], '
            'div[aria-label*="Directions"], '
            'button[jsaction*="pane.directions"]'
        ).first

        if not await dir_btn.is_visible(timeout=4000):
            dir_btn = page.locator(
                'button[aria-label*="Directions"]:visible, '
                'a[data-value="Directions"]:visible'
            ).first
            if not await dir_btn.is_visible(timeout=2000):
                logger.debug("Không tìm thấy nút Directions")
                return False

        await move_to_locator(page, dir_btn)
        await random_delay(0.8, 1.5)
        await dir_btn.click()
        await page.wait_for_load_state("domcontentloaded")
        await random_delay(2.0, 3.5)
        await dismiss_blocking_popups(page, "Maps directions")

        from_box = page.locator(
            'input[aria-label*="Starting point"], '
            'input[aria-label*="Choose starting point"], '
            'input[placeholder*="Starting point"], '
            'div[id="directions-searchbox-0"] input'
        ).first
        if await from_box.is_visible(timeout=3000):
            current_val = await from_box.input_value()
            if not current_val:
                await move_to_locator(page, from_box)
                await from_box.click()
                await random_delay(0.3, 0.7)
                await human_type(page, from_box, "My location", typo_rate=0.005)
                await random_delay(0.5, 1.0)
                suggestion = page.locator(
                    'li[role="option"]:first-child, '
                    'div[data-index="0"].suggestion-item'
                ).first
                if await suggestion.is_visible(timeout=2000):
                    await suggestion.click()
                    await random_delay(0.5, 1.0)
                else:
                    await page.keyboard.press("Enter")
                    await random_delay(1.0, 2.0)
                await dismiss_blocking_popups(page, "Maps location")

        logger.info("Đã xem chỉ đường trên Maps")

        for _ in range(random.randint(2, 3)):
            await human_scroll(page, "down", random.randint(200, 400))
            await random_delay(1.5, 3.0)

        back_btn = page.locator(
            'button[aria-label="Back"], '
            'button[jsaction*="back"], '
            'button[aria-label="Close directions"]'
        ).first
        if await back_btn.is_visible(timeout=3000):
            await move_to_locator(page, back_btn)
            await back_btn.click()
            await random_delay(1.0, 2.0)

        return True
    except Exception as exc:
        logger.debug("Lỗi xem chỉ đường: %s", exc)
        return False


async def _view_photos(page):
    try:
        photo_btn = page.locator(
            'button[aria-label*="Photo"], button[aria-label*="photo"], '
            'button[aria-label*="Ảnh"], div[aria-label*="Photos"], div[aria-label*="Ảnh"], '
            'button:has-text("Photos"), button:has-text("Ảnh"), '
            'button[jsaction*="pane.heroHeaderImage"], button[jsaction*="photo"]'
        ).first
        if not await photo_btn.is_visible(timeout=4000):
            return False
        await move_to_locator(page, photo_btn)
        await photo_btn.click()
        await random_delay(1.5, 3.0)

        for _ in range(random.randint(2, 4)):
            next_btn = page.locator(
                'button[aria-label*="Next photo"], button[aria-label*="next"], '
                'button[data-photo-index]'
            ).first
            if await next_btn.is_visible(timeout=2000):
                await move_to_locator(page, next_btn)
                await next_btn.click()
                await random_delay(1.0, 2.5)

        close_btn = page.locator('button[aria-label*="Close"], button[jsaction*="close"]').first
        if await close_btn.is_visible(timeout=2000):
            await move_to_locator(page, close_btn)
            await close_btn.click()
            await random_delay(0.5, 1.0)
        logger.info("Đã xem ảnh địa điểm trên Maps")
        return True
    except Exception as exc:
        logger.debug("Không xem được ảnh: %s", exc)
        return False


async def _read_reviews(page):
    try:
        review_tab = page.locator(
            'button[aria-label*="Reviews"], button[aria-label*="Đánh giá"], '
            'button:has-text("Reviews"), button:has-text("Đánh giá"), '
            '[data-tab-index="1"], div[role="tab"]:has-text("Reviews"), div[role="tab"]:has-text("Đánh giá")'
        ).first
        opened_tab = False
        if await review_tab.is_visible(timeout=4000):
            await move_to_locator(page, review_tab)
            await review_tab.click()
            await random_delay(1.0, 2.0)
            opened_tab = True

        for _ in range(random.randint(2, 4)):
            await human_scroll(page, "down", random.randint(300, 600))
            await random_delay(2.0, 4.0)
            tx = random.uniform(200, 600)
            ty = random.uniform(300, 600)
            await move_mouse_to(page, tx, ty)
            await random_delay(0.5, 1.5)

        logger.info("Đã đọc reviews/panel địa điểm trên Maps")
        return True if opened_tab else await _has_review_content(page)
    except Exception as exc:
        logger.debug("Không đọc được reviews: %s", exc)
        return False


async def _has_review_content(page) -> bool:
    try:
        review_text = page.locator(
            'div[aria-label*="stars"], span[aria-label*="stars"], '
            'div[aria-label*="sao"], span[aria-label*="sao"], '
            'button:has-text("reviews"), button:has-text("đánh giá")'
        ).first
        return await review_text.is_visible(timeout=1500)
    except Exception:
        return False


async def _read_place_panel(page) -> bool:
    try:
        panel = page.locator('div[role="main"], div[role="region"], div[aria-label*="Results"]').first
        if await panel.is_visible(timeout=2500):
            await move_to_locator(page, panel)
        for _ in range(random.randint(2, 4)):
            await human_scroll(page, "down", random.randint(250, 550))
            await random_delay(1.5, 3.0)
            await move_mouse_to(page, random.uniform(220, 650), random.uniform(260, 620))
            await random_delay(0.4, 1.2)
        logger.info("Đã đọc panel thông tin địa điểm trên Maps")
        return True
    except Exception as exc:
        logger.debug("Không đọc được panel địa điểm Maps: %s", exc)
        return False
