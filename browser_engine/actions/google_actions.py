import logging
import random
from urllib.parse import urljoin

from actions.human_utils import (
    human_read_and_scroll, human_type, random_delay,
    move_mouse_to, move_to_locator, human_scroll, GOOGLE_KEYWORDS,
    maybe_handle_notification_popup, maybe_focus_address_bar,
    maybe_switch_tab, maybe_open_new_tab_and_close,
)
from actions.page_context import ensure_on_google, where_am_i, PageContextError, dismiss_blocking_popups
from actions.tab_manager import TabManager
from core.visit_history import load_visited, add_visited

logger = logging.getLogger(__name__)


class GoogleNurture:
    def __init__(self, profile_name: str = "", profile_dir: str = ""):
        self._profile_name = profile_name
        self._profile_dir = profile_dir
        # Load lịch sử từ file — nhớ qua các phiên chạy
        self._visited_urls: set[str] = (
            load_visited(profile_name, profile_dir) if (profile_name or profile_dir) else set()
        )
        logger.debug("Đã load %d URL đã thăm cho profile '%s'", len(self._visited_urls), profile_name)

    async def search_and_read(self, page, keyword: str):
        loc = await where_am_i(page)
        logger.info("Vị trí hiện tại: %s", loc)
        await ensure_on_google(page)
        await dismiss_blocking_popups(page, "Google")
        tabs = TabManager(page.context, page, "GoogleFlow")
        tabs.label_page(page, "google-search")

        # ở lại trang chủ 15-25 giây trước khi tìm kiếm (theo khuyến nghị CloakBrowser: 15s+ trước reCAPTCHA)
        logger.info("Đang xem trang chủ Google trước khi tìm kiếm")
        await random_delay(5, 10)
        await move_mouse_to(page, random.uniform(300, 900), random.uniform(200, 500))
        await random_delay(8, 15)
        await move_mouse_to(page, random.uniform(200, 700), random.uniform(300, 600))
        await random_delay(3, 5)

        # đóng dialog đồng ý cookie
        for selector in [
            'button:has-text("Accept all")',
            'button:has-text("I agree")',
            'button:has-text("Agree")',
        ]:
            try:
                btn = page.locator(selector).first
                if await btn.is_visible(timeout=3000):
                    await btn.click()
                    logger.info("Đã đóng hộp thoại đồng ý: %s", selector)
                    await random_delay(0.8, 1.5)
                    break
            except Exception:
                pass

        search_box = page.locator('textarea[name="q"], input[name="q"]').first
        await search_box.wait_for(state="visible", timeout=10000)

        logger.info("Đang gõ từ khóa: %s", keyword)
        await human_type(page, search_box, keyword, typo_rate=0.01)
        await random_delay(0.5, 1.5)

        # 40% click search button instead of Enter
        if random.random() < 0.40:
            try:
                search_btn = page.locator('input[name="btnK"], button[aria-label*="Search"]').first
                if await search_btn.is_visible(timeout=2000):
                    await move_to_locator(page, search_btn)
                    await random_delay(0.3, 0.8)
                    await search_btn.click()
                    logger.info("Clicked search button instead of Enter")
                else:
                    await page.keyboard.press("Enter")
            except Exception:
                await page.keyboard.press("Enter")
        else:
            await page.keyboard.press("Enter")

        logger.info("Đang chờ kết quả tìm kiếm")
        await page.wait_for_load_state("domcontentloaded")
        await random_delay(2.0, 4.0)
        await dismiss_blocking_popups(page, "Google search")

        logger.info("Đang đọc lướt trang kết quả")
        await human_read_and_scroll(page, cycles=random.randint(2, 3))

        # thu thập link kết quả tự nhiên — lọc đã thăm và không phải organic
        result_links = await page.locator("#search a:has(h3)").all()
        organic = []
        for link in result_links[:15]:
            href = await link.get_attribute("href")
            if not href:
                continue
            # Chỉ lấy link http(s) bên ngoài Google, chưa được click trong phiên này
            if (href.startswith("http")
                    and "google.com" not in href
                    and "google.co" not in href
                    and href not in self._visited_urls):
                organic.append((link, href))
            if len(organic) == 6:
                break

        if not organic:
            logger.warning("Không tìm thấy kết quả tự nhiên mới (chưa thăm), bỏ qua")
            return

        candidates = random.sample(organic, k=len(organic))
        for chosen_link, chosen_url in candidates:
            self._visited_urls.add(chosen_url)
            # Save immediately so blocked/visited results are not retried every session.
            if self._profile_name:
                add_visited(self._profile_name, chosen_url, self._profile_dir)

            ok = await _open_and_read_candidate(page, tabs, chosen_link, chosen_url)
            if not ok:
                logger.info("Skip blocked article and try another result: %s", chosen_url)
                await random_delay(1.0, 2.0)
                continue

            # Occasionally focus address bar, switch tabs, or open a blank tab
            await maybe_focus_address_bar(page)
            await maybe_switch_tab(page.context, page)
            await maybe_open_new_tab_and_close(page.context, page)

            logger.info("Finished article read")
            return True

        logger.warning("All selected article results were blocked or unreadable; skip Google article read")
        return False

async def _is_article_blocked(page) -> bool:
    """Detect bot/security verification pages and skip instead of waiting."""
    url = (getattr(page, "url", "") or "").lower()
    try:
        title = (await page.title()).lower()
    except Exception:
        title = ""
    try:
        body_text = (await page.locator("body").inner_text(timeout=1800)).lower()
    except Exception:
        body_text = ""

    text = f"{title}\n{url}\n{body_text}"
    signals = [
        "verify you are human",
        "performing security verification",
        "security verification",
        "just a moment",
        "checking your browser",
        "cloudflare",
        "cf-turnstile",
        "turnstile",
        "bot verification",
        "not a bot",
        "access denied",
    ]
    if any(signal in text for signal in signals):
        logger.warning("Blocked article detected; skip url=%s title=%s", getattr(page, "url", ""), title[:80])
        return True

    try:
        blocker = page.locator(
            "iframe[src*='challenges.cloudflare.com'], "
            "iframe[src*='turnstile'], "
            "input[name='cf-turnstile-response'], "
            ".cf-turnstile"
        ).first
        if await blocker.is_visible(timeout=800):
            logger.warning("Cloudflare/Turnstile widget detected; skip url=%s", getattr(page, "url", ""))
            return True
    except Exception:
        pass
    return False


async def _open_and_read_candidate(page, tabs: TabManager, chosen_link, chosen_url: str) -> bool:
    logger.info("Moving to result: %s", chosen_url)
    try:
        await dismiss_blocking_popups(page, "Google result")
        await move_to_locator(page, chosen_link)
        await random_delay(0.4, 1.0)

        # 25% Ctrl+click opens article in a new tab instead of direct click.
        if random.random() < 0.25:
            logger.info("Ctrl+click opens article in new tab")
            async with page.context.expect_page() as new_page_info:
                await chosen_link.click(modifiers=["Control"])
            article_page = tabs.label_page(await new_page_info.value, "article-tab")
            await article_page.wait_for_load_state("domcontentloaded", timeout=20000)
            await tabs.bring_to_front(article_page, "article-tab")
            await random_delay(1.5, 3.0)
            await dismiss_blocking_popups(article_page, "Google article")

            if await _is_article_blocked(article_page):
                await tabs.close_tab(article_page, return_to=page, reason="blocked article")
                return False

            await _read_article(article_page)
            await tabs.close_tab(article_page, return_to=page, reason="article read complete")
            logger.info("Closed article tab and returned to search results")
            return True

        # Normal click may still open a new tab due to target=_blank/redirect.
        before_pages = set(page.context.pages)
        await chosen_link.click()
        await random_delay(0.8, 1.5)

        new_pages = [p for p in page.context.pages if p not in before_pages and not p.is_closed()]
        article_page = new_pages[-1] if new_pages else page

        if article_page is not page:
            logger.info("Click opened article in new tab: %s", chosen_url)
            await article_page.wait_for_load_state("domcontentloaded", timeout=20000)
            await tabs.bring_to_front(article_page, "article-tab")
        else:
            await tabs.bring_to_front(page, "google-search")
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
            await random_delay(1.0, 2.0)
            if "google.com/search" in page.url or page.url == chosen_url.split("?")[0]:
                logger.info("Click stayed on search; goto direct on current tab: %s", chosen_url)
                await page.goto(chosen_url, wait_until="domcontentloaded", timeout=20000)
                await random_delay(1.0, 2.0)

        await dismiss_blocking_popups(article_page, "Google article")

        if await _is_article_blocked(article_page):
            if article_page is not page:
                await tabs.close_tab(article_page, return_to=page, reason="blocked article")
            else:
                try:
                    await page.go_back(wait_until="domcontentloaded", timeout=15000)
                    await tabs.bring_to_front(page, "google-search")
                except Exception:
                    await page.goto("https://www.google.com/search?q=", wait_until="domcontentloaded", timeout=15000)
            return False

        await _read_article(article_page)
        if article_page is not page:
            await tabs.close_tab(article_page, return_to=page, reason="article read complete")
            logger.info("Closed article tab and returned to search results")
        return True
    except Exception as exc:
        logger.warning("Article result failed, skip url=%s error=%s", chosen_url, exc)
        try:
            await tabs.close_new_pages_and_return(set([page]), page, reason="article error cleanup")
        except Exception:
            pass
        return False


async def _read_article(page):
    """Đọc bài báo như người thật: cuộn hết trang, di chuột, click link nội bộ."""
    logger.info("Đang đọc bài viết tại: %s", page.url)

    # Xử lý popup thông báo ngay khi vào trang bài viết
    await maybe_handle_notification_popup(page)

    # cuộn đọc từ trên xuống hết trang
    cycles = random.randint(4, 7)
    for i in range(cycles):
        await human_scroll(page, "down", random.randint(250, 600))
        await random_delay(2.0, 5.0)

        # di chuột vào vùng nội dung đang đọc (giả lập highlight text)
        if random.random() < 0.5:
            tx = random.uniform(200, 800)
            ty = random.uniform(200, 650)
            await move_mouse_to(page, tx, ty)
            await random_delay(0.3, 1.0)

        # thỉnh thoảng cuộn lên xem lại đoạn trước
        if random.random() < 0.2:
            await human_scroll(page, "up", random.randint(100, 300))
            await random_delay(1.0, 2.5)

        # giữa chừng: 15% focus address bar (Ctrl+L) rồi bỏ qua
        if i == cycles // 2:
            await maybe_focus_address_bar(page, retype_url=False)

        logger.debug("Đang đọc bài — lượt %d/%d", i + 1, cycles)

    # 20% click vào một link nội bộ trong bài
    if random.random() < 0.20:
        await _click_inline_link(page)


async def _click_inline_link(page):
    """Click vào một link trong nội dung bài báo (không phải nav/footer)."""
    try:
        tabs = TabManager(page.context, page, "GoogleInlineFlow")
        tabs.label_page(page, "article-current")
        await dismiss_blocking_popups(page, "Google article")
        # lấy tất cả link trong vùng nội dung bài, bỏ qua nav và footer
        links = await page.locator(
            "article a[href], .content a[href], .post-content a[href], "
            "main a[href], .entry-content a[href], p a[href]"
        ).all()

        candidates = []
        for link in links[:20]:
            href = await link.get_attribute("href")
            text = (await link.inner_text()).strip()
            if (href and len(text) > 3
                    and not href.startswith("javascript")
                    and "#" not in href
                    and "mailto:" not in href):
                candidates.append((link, href, text))
            if len(candidates) == 5:
                break

        if not candidates:
            return

        chosen_link, href, text = random.choice(candidates)
        logger.info("Đang click link trong bài: '%s'", text[:40])
        await move_to_locator(page, chosen_link)
        await random_delay(0.5, 1.2)

        # 30% Ctrl+click mở link trong tab mới
        if random.random() < 0.30:
            async with page.context.expect_page() as new_page_info:
                await chosen_link.click(modifiers=["Control"])
            new_page = tabs.label_page(await new_page_info.value, "inline-tab")
            await new_page.wait_for_load_state("domcontentloaded")
            await tabs.bring_to_front(new_page, "inline-tab")
            await random_delay(2.0, 4.0)
            await human_read_and_scroll(new_page, cycles=random.randint(2, 3))
            await tabs.close_tab(new_page, return_to=page, reason="inline link read complete")
            logger.info("Đã xem và đóng tab phụ")
        else:
            before_pages = set(page.context.pages)
            await chosen_link.click()
            await random_delay(0.8, 1.5)

            new_pages = [
                p for p in page.context.pages
                if p not in before_pages and not p.is_closed()
            ]
            inline_page = new_pages[-1] if new_pages else page

            if inline_page is not page:
                logger.info("Link trong bài mở tab mới — chuyển automation sang tab mới")
                await inline_page.wait_for_load_state("domcontentloaded", timeout=15000)
                await tabs.bring_to_front(inline_page, "inline-tab")
                await random_delay(1.5, 3.0)
                await human_read_and_scroll(inline_page, cycles=random.randint(2, 3))
                await tabs.close_tab(inline_page, return_to=page, reason="inline link read complete")
                logger.info("Đã xem và đóng tab link trong bài")
            else:
                await tabs.bring_to_front(page, "article-current")
                await page.wait_for_load_state("domcontentloaded")
                await random_delay(1.5, 3.0)
                await human_read_and_scroll(page, cycles=random.randint(2, 3))
                await page.go_back()
                await page.wait_for_load_state("domcontentloaded", timeout=10000)
                await random_delay(1.0, 2.0)

    except Exception as exc:
        logger.debug("Không thể click link trong bài: %s", exc)


async def trending_interaction(page) -> bool:
    """Xem Google Trends — lướt các chủ đề đang hot, click vào 1-2 trend."""
    try:
        logger.info("Đang truy cập Google Trends")
        await page.goto("https://trends.google.com/trending", wait_until="domcontentloaded", timeout=20000)
        await random_delay(2.0, 4.0)

        # Cuộn đọc danh sách trending
        for _ in range(random.randint(2, 4)):
            await human_scroll(page, "down", random.randint(300, 600))
            await random_delay(1.5, 3.0)

        # Thử nhiều selector khác nhau cho Google Trends
        trend_selectors = [
            'feed-item',
            'div.feed-item',
            'div[jsname="oKdM2c"]',
            'tbody tr',
            'tr[jsname]',
            '[data-entityname]',
            'div[role="row"]',
            'a[href*="/trending/explore"]',
            'a[href*="trends.google.com/trends/explore"]',
        ]

        # Material icon names that appear as text in Google Trends rows
        _ICON_NAMES = {
            "arrow_upward", "arrow_downward", "trending_up", "trending_down",
            "trending_flat", "help_outline", "help", "calendar_today",
            "calendar_month", "more_vert", "search", "close", "expand_more",
            "expand_less", "chevron_right", "chevron_left", "info", "info_outline",
        }

        def _is_valid_trend_name(line: str) -> bool:
            stripped = line.strip()
            if not (5 < len(stripped) < 80):
                return False
            if stripped.lower() in _ICON_NAMES:
                return False
            if stripped.startswith(("help_", "calendar_", "arrow_", "trending_")):
                return False
            if stripped.isdigit():
                return False
            if stripped.startswith("+") and stripped[1:].isdigit():
                return False
            # Skip lines that are purely ASCII lowercase with underscores (icon names)
            if "_" in stripped and stripped.replace("_", "").isalpha() and stripped == stripped.lower():
                return False
            return True

        candidates = []
        for selector in trend_selectors:
            try:
                items = await page.locator(selector).all()
                if items:
                    logger.debug("Selector '%s' tìm thấy %d items", selector, len(items))
                    for item in items[:20]:
                        try:
                            text = (await item.inner_text()).strip()
                            lines = [l.strip() for l in text.splitlines() if l.strip()]
                            for line in lines:
                                if _is_valid_trend_name(line):
                                    candidates.append((item, line))
                                    break
                        except Exception:
                            pass
                    if candidates:
                        break
            except Exception:
                pass

        if not candidates:
            # Fallback: tìm tất cả link có href chứa "explore" hoặc "trending"
            try:
                links = await page.locator('a[href*="explore"], a[href*="trending"]').all()
                for link in links[:20]:
                    try:
                        text = (await link.inner_text()).strip()
                        if 5 < len(text) < 80:
                            candidates.append((link, text))
                    except Exception:
                        pass
            except Exception:
                pass

        if not candidates:
            logger.debug("Không tìm thấy trend items sau khi thử tất cả selector")
            await human_scroll(page, "up", 400)
            await random_delay(1.0, 2.0)
        else:
            logger.debug("Tìm thấy %d trend candidates", len(candidates))
            chosen = random.sample(candidates, min(2, len(candidates)))
            for item, text in chosen:
                try:
                    await move_to_locator(page, item)
                    await random_delay(0.5, 1.2)

                    # Trends có thể mở trang explore ở tab mới (target=_blank).
                    before_pages = set(page.context.pages)
                    # Tìm link bên trong item để click
                    try:
                        link = item.locator("a").first
                        if await link.is_visible(timeout=1000):
                            await link.click()
                        else:
                            await item.click()
                    except Exception:
                        await item.click()
                    await random_delay(0.8, 1.5)

                    new_pages = [
                        p for p in page.context.pages
                        if p not in before_pages and not p.is_closed()
                    ]
                    trend_page = new_pages[-1] if new_pages else page

                    if trend_page is not page:
                        logger.info("Trend mở tab mới — chuyển automation sang tab mới: '%s'", text[:50])
                        await trend_page.wait_for_load_state("domcontentloaded", timeout=15000)
                        await trend_page.bring_to_front()
                        await random_delay(2.0, 4.0)
                        await human_read_and_scroll(trend_page, cycles=random.randint(1, 2))
                        await trend_page.close()
                        await page.bring_to_front()
                        logger.info("Đã xem trend (tab mới): '%s'", text[:50])
                    else:
                        await page.wait_for_load_state("domcontentloaded", timeout=15000)
                        await random_delay(2.0, 4.0)
                        await human_read_and_scroll(page, cycles=random.randint(1, 2))
                        logger.info("Đã xem trend: '%s'", text[:50])
                        await page.go_back()
                        await page.wait_for_load_state("domcontentloaded", timeout=10000)
                        await random_delay(1.5, 3.0)
                except Exception as exc:
                    logger.debug("Không click được trend '%s': %s", text[:30], exc)

        logger.info("Hoàn thành tương tác Google Trends")
        return True
    except Exception as exc:
        logger.debug("Lỗi trending_interaction: %s", exc)
        return False
