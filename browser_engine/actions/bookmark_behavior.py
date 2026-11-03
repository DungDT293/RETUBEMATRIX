"""
Bookmark behavior simulation — tạo Direct Traffic bằng cách click vào bookmarks.
Mục tiêu: mô phỏng người dùng truy cập trực tiếp các trang quen thuộc từ bookmark bar.
"""
import asyncio
import logging
import random
import time
import unicodedata
from urllib.parse import urljoin

from actions.human_utils import (
    random_delay, move_to_locator,
    move_mouse_to, human_read_and_scroll,
)
from actions.tab_manager import TabManager
from actions.popup_handler import dismiss_popups, maybe_handle_notification_popup
from actions.page_context import check_page_health, PageContextError

logger = logging.getLogger(__name__)

# Danh sách bookmark mặc định — đa dạng theo loại (báo chí, công cụ, mạng xã hội)
DEFAULT_BOOKMARKS = [
    # Báo chí / tin tức
    {"name": "VnExpress", "url": "https://vnexpress.net/", "category": "news"},
    {"name": "Tuổi Trẻ", "url": "https://tuoitre.vn/", "category": "news"},
    {"name": "Dân Trí", "url": "https://dantri.com.vn/", "category": "news"},
    {"name": "BBC News", "url": "https://www.bbc.com/news", "category": "news"},
    {"name": "TechCrunch", "url": "https://techcrunch.com/", "category": "tech"},
    # Công cụ / năng suất
    {"name": "Google Docs", "url": "https://docs.google.com/", "category": "productivity"},
    {"name": "Google Sheets", "url": "https://sheets.google.com/", "category": "productivity"},
    {"name": "Notion", "url": "https://www.notion.so/", "category": "productivity"},
    {"name": "Trello", "url": "https://trello.com/", "category": "productivity"},
    # Mạng xã hội / cộng đồng
    {"name": "Reddit", "url": "https://www.reddit.com/", "category": "social"},
    {"name": "LinkedIn", "url": "https://www.linkedin.com/feed/", "category": "social"},
    {"name": "Twitter/X", "url": "https://x.com/home", "category": "social"},
    # Học tập / tham khảo
    {"name": "Wikipedia", "url": "https://en.wikipedia.org/wiki/Main_Page", "category": "reference"},
    {"name": "Stack Overflow", "url": "https://stackoverflow.com/", "category": "reference"},
    {"name": "Medium", "url": "https://medium.com/", "category": "reference"},
]

VIETNAM_NEWS_BOOKMARKS = [
    {"name": "VnExpress", "url": "https://vnexpress.net/", "category": "news"},
    {"name": "Tuổi Trẻ", "url": "https://tuoitre.vn/", "category": "news"},
    {"name": "Dân Trí", "url": "https://dantri.com.vn/", "category": "news"},
]

FOREIGN_NEWS_BOOKMARKS = [
    {"name": "CNN", "url": "https://www.cnn.com/world", "category": "news"},
    {"name": "BBC News", "url": "https://www.bbc.com/news", "category": "news"},
    {"name": "Reuters", "url": "https://www.reuters.com/world/", "category": "news"},
    {"name": "The Guardian", "url": "https://www.theguardian.com/international", "category": "news"},
]

LOCAL_NEWS_BOOKMARKS_BY_COUNTRY = {
    "vietnam": VIETNAM_NEWS_BOOKMARKS,
    "viet nam": VIETNAM_NEWS_BOOKMARKS,
    "vn": VIETNAM_NEWS_BOOKMARKS,
    "usa": [
        {"name": "CNN", "url": "https://www.cnn.com/us", "category": "news"},
        {"name": "The New York Times", "url": "https://www.nytimes.com/", "category": "news"},
        {"name": "USA Today", "url": "https://www.usatoday.com/news/", "category": "news"},
    ],
    "us": [
        {"name": "CNN", "url": "https://www.cnn.com/us", "category": "news"},
        {"name": "The New York Times", "url": "https://www.nytimes.com/", "category": "news"},
        {"name": "USA Today", "url": "https://www.usatoday.com/news/", "category": "news"},
    ],
    "my": [
        {"name": "CNN", "url": "https://www.cnn.com/us", "category": "news"},
        {"name": "The New York Times", "url": "https://www.nytimes.com/", "category": "news"},
        {"name": "USA Today", "url": "https://www.usatoday.com/news/", "category": "news"},
    ],
    "united states": [
        {"name": "CNN", "url": "https://www.cnn.com/us", "category": "news"},
        {"name": "The New York Times", "url": "https://www.nytimes.com/", "category": "news"},
        {"name": "USA Today", "url": "https://www.usatoday.com/news/", "category": "news"},
    ],
    "uk": [
        {"name": "BBC News", "url": "https://www.bbc.com/news/uk", "category": "news"},
        {"name": "The Guardian UK", "url": "https://www.theguardian.com/uk", "category": "news"},
        {"name": "Sky News", "url": "https://news.sky.com/uk", "category": "news"},
    ],
    "anh": [
        {"name": "BBC News", "url": "https://www.bbc.com/news/uk", "category": "news"},
        {"name": "The Guardian UK", "url": "https://www.theguardian.com/uk", "category": "news"},
        {"name": "Sky News", "url": "https://news.sky.com/uk", "category": "news"},
    ],
    "japan": [
        {"name": "NHK", "url": "https://www3.nhk.or.jp/news/", "category": "news"},
        {"name": "Japan Times", "url": "https://www.japantimes.co.jp/news/", "category": "news"},
    ],
    "nhat ban": [
        {"name": "NHK", "url": "https://www3.nhk.or.jp/news/", "category": "news"},
        {"name": "Japan Times", "url": "https://www.japantimes.co.jp/news/", "category": "news"},
    ],
    "korea": [
        {"name": "Yonhap News", "url": "https://en.yna.co.kr/", "category": "news"},
        {"name": "Korea Herald", "url": "https://www.koreaherald.com/", "category": "news"},
    ],
    "han quoc": [
        {"name": "Yonhap News", "url": "https://en.yna.co.kr/", "category": "news"},
        {"name": "Korea Herald", "url": "https://www.koreaherald.com/", "category": "news"},
    ],
    "germany": [
        {"name": "Tagesschau", "url": "https://www.tagesschau.de/", "category": "news"},
        {"name": "DW", "url": "https://www.dw.com/en/top-stories/s-9097", "category": "news"},
    ],
    "duc": [
        {"name": "Tagesschau", "url": "https://www.tagesschau.de/", "category": "news"},
        {"name": "DW", "url": "https://www.dw.com/en/top-stories/s-9097", "category": "news"},
    ],
    "france": [
        {"name": "Le Monde", "url": "https://www.lemonde.fr/en/", "category": "news"},
        {"name": "France 24", "url": "https://www.france24.com/en/", "category": "news"},
    ],
    "phap": [
        {"name": "Le Monde", "url": "https://www.lemonde.fr/en/", "category": "news"},
        {"name": "France 24", "url": "https://www.france24.com/en/", "category": "news"},
    ],
}


def _normalize_country_key(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    without_marks = "".join(
        ch for ch in unicodedata.normalize("NFD", raw)
        if unicodedata.category(ch) != "Mn"
    )
    return " ".join(without_marks.replace(".", " ").split())


def bookmarks_for_news_source(news_source: str | None) -> list[dict]:
    source = str(news_source or "foreign").strip().lower()
    normalized = _normalize_country_key(source)
    if source == "mixed":
        return list(FOREIGN_NEWS_BOOKMARKS + VIETNAM_NEWS_BOOKMARKS)
    if normalized in LOCAL_NEWS_BOOKMARKS_BY_COUNTRY:
        return list(LOCAL_NEWS_BOOKMARKS_BY_COUNTRY[normalized])
    return list(FOREIGN_NEWS_BOOKMARKS)


# Thời gian đọc theo loại trang
_READ_TIME = {
    "news": (30, 90),
    "tech": (25, 70),
    "productivity": (15, 40),
    "social": (20, 60),
    "reference": (30, 80),
}
_DEFAULT_BOOKMARK_SITE_TIMEOUT_SECONDS = 150.0


async def click_random_bookmark(
    page,
    bookmarks: list[dict] | None = None,
    count: int | None = None,
    max_seconds: float | None = None,
) -> bool:
    """
    Click ngẫu nhiên vào 1-2 bookmark, đọc trang, di chuột như người thật.
    bookmarks: danh sách dict với keys 'name', 'url', 'category'
    count: số bookmark muốn truy cập (mặc định 1-2 ngẫu nhiên)
    """
    pool = bookmarks or DEFAULT_BOOKMARKS
    n = count or random.randint(1, 2)
    chosen = random.sample(pool, min(max(n + 2, n), len(pool)))

    started = time.monotonic()
    deadline = started + float(max_seconds) if max_seconds and max_seconds > 0 else None
    success_count = 0
    for bm in chosen:
        if success_count >= n:
            break
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                logger.info("Bookmark budget exhausted before next site | success=%d/%d", success_count, n)
                break
            site_timeout = min(_DEFAULT_BOOKMARK_SITE_TIMEOUT_SECONDS, max(0.1, remaining))
        else:
            site_timeout = _DEFAULT_BOOKMARK_SITE_TIMEOUT_SECONDS
        try:
            result = await asyncio.wait_for(_visit_bookmark(page, bm), timeout=site_timeout)
        except asyncio.TimeoutError:
            logger.warning(
                "Bookmark site timeout | site=%s | timeout=%.0fs | url=%s",
                bm.get("name"),
                site_timeout,
                bm.get("url"),
            )
            result = False
        if result == "captcha":
            logger.info("Bookmark gặp xác minh bot, bỏ qua site này và chuyển site khác trong cùng job")
            continue
        if result:
            success_count += 1
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 3:
                break
            await asyncio.sleep(min(random.uniform(3.0, 7.0), max(0.0, remaining)))
        else:
            await random_delay(3.0, 7.0)

    return success_count > 0


async def _visit_bookmark(page, bookmark: dict) -> bool | str:
    name = bookmark["name"]
    url = bookmark["url"]
    category = bookmark.get("category", "news")

    logger.info("Đang truy cập bookmark: %s (%s)", name, url)

    try:
        logger.info("Bookmark state | site=%s | phase=goto | url=%s", name, url)
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await random_delay(2.0, 4.0)
        logger.info("Bookmark state | site=%s | phase=popup_cleanup | url=%s", name, page.url)
        await maybe_handle_notification_popup(page)
        await dismiss_popups(page)
        if await check_page_health(page) == "captcha":
            logger.info("%s bị xác minh bot, skip sang site khác trong job đọc báo", name)
            return "captcha"

        # Thời gian đọc theo loại trang
        min_t, max_t = _READ_TIME.get(category, (20, 60))
        read_seconds = random.uniform(min_t, max_t)
        logger.info("Bookmark state | site=%s | phase=read | seconds=%.0f | url=%s", name, read_seconds, page.url)
        logger.info("Đang đọc %s trong %.0f giây", name, read_seconds)

        # Cuộn đọc trang chủ để tìm bài/link đáng đọc.
        cycles = max(2, int(read_seconds / 15))
        await human_read_and_scroll(page, cycles=min(cycles, 3))

        # Di chuột vào vùng nội dung
        for _ in range(random.randint(2, 4)):
            tx = random.uniform(200, 900)
            ty = random.uniform(200, 600)
            await move_mouse_to(page, tx, ty)
            await random_delay(0.5, 2.0)

        # Báo chí/tech phải mở bài viết thật; các loại khác vẫn có xác suất click sâu.
        must_click_deeper = category in {"news", "tech", "reference"}
        if must_click_deeper or random.random() < 0.45:
            logger.info("Bookmark state | site=%s | phase=click_internal | url=%s", name, page.url)
            clicked = await _click_internal_link(page, category)
            if clicked == "captcha":
                logger.info("Bài/link trong %s bị xác minh bot, quay lại chọn site/link khác", name)
                return "captcha"
            if not clicked and must_click_deeper:
                logger.info("Không tìm được link bài viết rõ ràng trên %s, đọc tiếp trang chủ", name)

        logger.info("Hoàn thành đọc bookmark: %s", name)
        return True

    except PageContextError as exc:
        logger.info("Bookmark bị chặn xác minh, skip site trong cùng job: %s", exc)
        return "captcha"
    except Exception as exc:
        logger.warning("Lỗi truy cập/đọc bookmark '%s': %s", name, exc)
        return False


async def _click_internal_link(page, category: str):
    """Click vào một link nội bộ trong trang để tạo thêm page view."""
    try:
        await dismiss_popups(page)
        # Selector theo loại trang
        selectors = {
            "news": "article a[href], .article-title a, h3 a, h2 a",
            "tech": "article a[href], .post-title a, h2 a, h3 a",
            "social": "a[href*='/r/'], a[href*='/post/'], article a",
            "productivity": "a[href*='/doc'], a[href*='/sheet'], nav a",
            "reference": "a[href*='/wiki/'], .mw-parser-output a, article a",
        }
        selector = selectors.get(category, "article a[href], main a[href], h2 a")

        links = await page.locator(selector).all()
        candidates = []
        for link in links[:45]:
            href = await link.get_attribute("href")
            text = (await link.inner_text()).strip()
            if (href and len(text) > 18
                    and not href.startswith("javascript")
                    and "mailto:" not in href
                    and "#" not in href
                    and not _is_low_value_link(href, text)):
                candidates.append((link, href, text))
            if len(candidates) == 8:
                break

        if not candidates:
            return await _click_internal_link_dom_fallback(page)

        chosen_link, href, text = random.choice(candidates)
        tabs = TabManager(page.context, page, "BookmarkInlineFlow")
        tabs.label_page(page, "bookmark-main")
        logger.info("Đang click link nội bộ: '%s'", text[:40])
        await move_to_locator(page, chosen_link)
        await random_delay(0.5, 1.2)

        # 30% mở tab mới
        if random.random() < 0.30:
            new_page = await tabs.open_new_tab("bookmark-inline-tab")
            try:
                full_url = href if href.startswith("http") else urljoin(page.url, href)
                await new_page.goto(full_url)
                await new_page.wait_for_load_state("domcontentloaded")
                await random_delay(2.0, 4.0)
                await maybe_handle_notification_popup(new_page)
                await dismiss_popups(new_page)
                if await check_page_health(new_page) == "captcha":
                    logger.info("Link bài viết mở tab mới bị xác minh bot, đóng tab và skip link")
                    return "captcha"
                await human_read_and_scroll(new_page, cycles=random.randint(2, 3))
                logger.debug("Đã đọc và đóng tab phụ")
            except Exception as exc:
                logger.debug("Lỗi tab phụ: %s", exc)
            finally:
                if not new_page.is_closed():
                    await tabs.close_tab(new_page, reason="bookmark inline complete")
                await tabs.bring_to_front(page, "bookmark-main")
        else:
            before_pages = set(page.context.pages)
            await chosen_link.click()
            await random_delay(0.8, 1.5)

            new_pages = [
                p for p in page.context.pages
                if p not in before_pages and not p.is_closed()
            ]
            active_page = new_pages[-1] if new_pages else page

            if active_page is not page:
                logger.info("Link nội bộ mở tab mới — chuyển automation sang tab mới")
                await active_page.wait_for_load_state("domcontentloaded", timeout=15000)
                await tabs.bring_to_front(active_page, "bookmark-inline-tab")
                await random_delay(1.5, 3.0)
                await human_read_and_scroll(active_page, cycles=random.randint(2, 3))
                await tabs.close_tab(active_page, return_to=page, reason="bookmark inline complete")
                logger.info("Đã xem và đóng tab link nội bộ")
            else:
                await tabs.bring_to_front(page, "bookmark-main")
                await page.wait_for_load_state("domcontentloaded")
                await random_delay(1.5, 3.0)
                await maybe_handle_notification_popup(page)
                await dismiss_popups(page)
                if await check_page_health(page) == "captcha":
                    logger.info("Link bài viết bị xác minh bot, quay lại trang chính và skip link")
                    try:
                        await page.go_back(wait_until="domcontentloaded", timeout=10000)
                    except Exception:
                        pass
                    return "captcha"
                await human_read_and_scroll(page, cycles=random.randint(2, 3))
                await page.go_back()
                await page.wait_for_load_state("domcontentloaded", timeout=10000)
                await random_delay(1.0, 2.0)
        return True

    except Exception as exc:
        logger.debug("Không click được link nội bộ: %s", exc)
        return False


def _is_low_value_link(href: str, text: str) -> bool:
    low = f"{href} {text}".lower()
    blocked = [
        "subscribe", "newsletter", "sign in", "login", "account", "privacy", "terms",
        "cookie", "advertise", "about us", "contact", "video", "podcast", "live tv",
        "facebook", "twitter", "instagram", "linkedin", "whatsapp", "mailto:",
        "browse", "menu", "section", "category", "topics", "authors", "tag/",
    ]
    return any(token in low for token in blocked)


async def _click_internal_link_dom_fallback(page) -> bool | str:
    try:
        result = await page.evaluate(
            """
            () => {
                const lowValue = /(subscribe|newsletter|sign in|login|privacy|terms|cookie|advertise|about|contact|facebook|twitter|instagram|linkedin|mailto:)/i;
                const links = Array.from(document.querySelectorAll('article a[href], main a[href], h1 a[href], h2 a[href], h3 a[href]'));
                for (const link of links) {
                    const text = (link.innerText || link.textContent || '').trim();
                    const href = link.href || '';
                    if (text.length < 18 || !href || href.startsWith('javascript:') || lowValue.test(text + ' ' + href)) continue;
                    link.scrollIntoView({ block: 'center', inline: 'center' });
                    link.click();
                    return { ok: true, text, href };
                }
                return { ok: false };
            }
            """
        )
        if result and result.get("ok"):
            logger.info("Đã click bài viết bằng DOM fallback: '%s'", str(result.get("text", ""))[:60])
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
            await random_delay(1.5, 3.0)
            await maybe_handle_notification_popup(page)
            await dismiss_popups(page)
            if await check_page_health(page) == "captcha":
                logger.info("DOM fallback bài viết bị xác minh bot, quay lại và skip link")
                try:
                    await page.go_back(wait_until="domcontentloaded", timeout=10000)
                except Exception:
                    pass
                return "captcha"
            await human_read_and_scroll(page, cycles=random.randint(2, 3))
            try:
                await page.go_back(wait_until="domcontentloaded", timeout=10000)
            except Exception:
                pass
            return True
    except Exception as exc:
        logger.debug("DOM fallback click bài viết thất bại: %s", exc)
    return False
