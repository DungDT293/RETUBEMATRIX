"""
Profile setup — chạy một lần sau khi đăng nhập lần đầu.
Thiết lập bookmarks theo geo + cài extension hữu ích từ Chrome Web Store.
"""
import json
import logging
import random
import asyncio
from pathlib import Path

from actions.tab_manager import TabManager
from actions.human_utils import (
    human_type, random_delay, move_to_locator,
    human_scroll, move_mouse_to,
)

logger = logging.getLogger(__name__)

# ── Bookmarks bắt buộc (luôn thêm vào) ───────────────────────────────────────
_REQUIRED_BOOKMARKS = [
    ("Gmail",        "https://mail.google.com/"),
    ("Google Drive", "https://drive.google.com/"),
    ("YouTube",      "https://www.youtube.com/"),
    ("Google Maps",  "https://maps.google.com/"),
]

# ── Bookmarks theo ngôn ngữ/vùng (chọn theo proxy geo) ───────────────────────
_GEO_BOOKMARKS = {
    "vi": [
        ("VnExpress",  "https://vnexpress.net/"),
        ("Tuổi Trẻ",   "https://tuoitre.vn/"),
        ("Dân Trí",    "https://dantri.com.vn/"),
        ("Zing News",  "https://zingnews.vn/"),
        ("Thanh Niên", "https://thanhnien.vn/"),
        ("Cafef",      "https://cafef.vn/"),
    ],
    "en": [
        ("BBC News",   "https://www.bbc.com/news"),
        ("CNN",        "https://edition.cnn.com/"),
        ("Reuters",    "https://www.reuters.com/"),
        ("TechCrunch", "https://techcrunch.com/"),
        ("The Verge",  "https://www.theverge.com/"),
        ("Bloomberg",  "https://www.bloomberg.com/"),
    ],
    "ja": [
        ("Yahoo Japan", "https://www.yahoo.co.jp/"),
        ("NHK",         "https://www3.nhk.or.jp/news/"),
        ("Nikkei",      "https://www.nikkei.com/"),
    ],
    "ko": [
        ("Naver",  "https://www.naver.com/"),
        ("Daum",   "https://www.daum.net/"),
        ("Chosun", "https://www.chosun.com/"),
    ],
    "zh": [
        ("Baidu", "https://www.baidu.com/"),
        ("Sina",  "https://www.sina.com.cn/"),
        ("163",   "https://www.163.com/"),
    ],
    "th": [
        ("Sanook",   "https://www.sanook.com/"),
        ("Kapook",   "https://www.kapook.com/"),
        ("Thairath", "https://www.thairath.co.th/"),
    ],
}

# ── Extensions hữu ích trên Chrome Web Store ──────────────────────────────────
_EXTENSIONS = [
    {
        "name": "uBlock Origin",
        "id":   "cjpalhdlnbpafiamejdnhcphjbkeiagm",
        "url":  "https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm",
    },
    {
        "name": "Google Translate",
        "id":   "aapbdbdomjkkjkaonfhkkikfgjllcleb",
        "url":  "https://chromewebstore.google.com/detail/google-translate/aapbdbdomjkkjkaonfhkkikfgjllcleb",
    },
    {
        "name": "Dark Reader",
        "id":   "eimadpbcbfnmbkopoojfekhnkhdbieeh",
        "url":  "https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh",
    },
    {
        "name": "Grammarly",
        "id":   "kbfnbcaeplbcioakkpcpgfkobkghlhen",
        "url":  "https://chromewebstore.google.com/detail/grammarly/kbfnbcaeplbcioakkpcpgfkobkghlhen",
    },
]


# ── Entry point ───────────────────────────────────────────────────────────────

async def setup_profile(page, locale: str = None) -> bool:
    """
    Thiết lập profile lần đầu:
    1. Thêm bookmarks bắt buộc + bookmarks theo geo
    2. Cài 1-2 extension từ Chrome Web Store
    """
    logger.info("=== Bắt đầu thiết lập profile lần đầu ===")
    lang = _detect_locale(locale)
    logger.info("Ngôn ngữ/vùng phát hiện: %s", lang)

    await _setup_bookmarks(page, lang)
    await random_delay(2.0, 4.0)
    await _install_extensions(page)

    logger.info("=== Hoàn thành thiết lập profile ===")
    return True


def _detect_locale(locale: str = None) -> str:
    if not locale:
        return "en"
    lc = locale.lower()
    if any(x in lc for x in ["vi", "vn"]):  return "vi"
    if any(x in lc for x in ["ja", "jp"]):  return "ja"
    if any(x in lc for x in ["ko", "kr"]):  return "ko"
    if any(x in lc for x in ["zh", "cn", "tw"]): return "zh"
    if "th" in lc:                           return "th"
    return "en"


# ── Bookmarks ─────────────────────────────────────────────────────────────────

async def _setup_bookmarks(page, lang: str):
    logger.info("Đang thiết lập bookmarks")
    await page.goto("https://www.google.com/")
    await page.wait_for_load_state("domcontentloaded")
    await random_delay(1.5, 3.0)

    await page.keyboard.press("Control+Shift+B")
    await random_delay(0.5, 1.0)

    all_bookmarks = list(_REQUIRED_BOOKMARKS)
    geo_list = _GEO_BOOKMARKS.get(lang, _GEO_BOOKMARKS["en"])
    all_bookmarks.extend(random.sample(geo_list, min(4, len(geo_list))))

    for name, url in all_bookmarks:
        await _add_bookmark(page, name, url)
        await random_delay(1.0, 2.5)

    logger.info("Đã thêm %d bookmarks", len(all_bookmarks))


async def _add_bookmark(page, name: str, url: str):
    """Điều hướng đến URL rồi lưu bookmark qua CDP chrome.bookmarks API."""
    try:
        await page.goto(url)
        await page.wait_for_load_state("domcontentloaded")
        await random_delay(1.5, 3.0)

        cdp = await page.context.new_cdp_session(page)
        result = await cdp.send("Runtime.evaluate", {
            "expression": f"""
                new Promise((resolve, reject) => {{
                    chrome.bookmarks.create({{
                        parentId: '1',
                        title: {json.dumps(name)},
                        url: {json.dumps(url)}
                    }}, (node) => {{
                        if (chrome.runtime.lastError) {{
                            reject(chrome.runtime.lastError.message);
                        }} else {{
                            resolve(node ? node.id : 'ok');
                        }}
                    }});
                }})
            """,
            "awaitPromise": True,
            "returnByValue": True,
        })
        await cdp.detach()

        val = result.get("result", {}).get("value")
        if val:
            logger.info("Đã bookmark (CDP): %s", name)
        else:
            logger.debug("Bookmark CDP không trả về id cho '%s'", name)

        await random_delay(0.5, 1.0)

    except Exception as exc:
        logger.debug("Không bookmark được '%s' qua CDP: %s — thử Ctrl+D", name, exc)
        try:
            await page.keyboard.press("Control+D")
            await random_delay(0.8, 1.5)
            await page.keyboard.press("Enter")
            await random_delay(0.5, 1.0)
            logger.info("Đã bookmark (Ctrl+D fallback): %s", name)
        except Exception as exc2:
            logger.debug("Fallback Ctrl+D cũng thất bại: %s", exc2)


# ── Extensions ────────────────────────────────────────────────────────────────

async def _install_extensions(page):
    """Lướt Chrome Web Store và cài 1-2 extension ngẫu nhiên."""
    chosen = random.sample(_EXTENSIONS, min(2, len(_EXTENSIONS)))
    for ext in chosen:
        await _browse_and_install_extension(page, ext)
        await random_delay(3.0, 6.0)


async def _browse_and_install_extension(page, ext: dict):
    """Mở trang extension, cuộn đọc mô tả, rồi cài."""
    name = ext["name"]
    url  = ext["url"]
    logger.info("Đang xem extension: %s", name)

    try:
        await page.goto(url)
        await page.wait_for_load_state("domcontentloaded")
        await random_delay(2.0, 4.0)

        # Dismiss "Switch to Chrome" banner nếu có
        try:
            no_thanks = page.locator('button:has-text("No thanks"), a:has-text("No thanks")').first
            if await no_thanks.is_visible(timeout=3000):
                await no_thanks.click()
                await random_delay(0.5, 1.0)
        except Exception:
            pass

        # Cuộn đọc mô tả
        for _ in range(random.randint(2, 4)):
            await human_scroll(page, "down", random.randint(200, 500))
            await random_delay(1.5, 3.5)
            if random.random() < 0.3:
                await move_mouse_to(page, random.uniform(200, 800), random.uniform(200, 600))
                await random_delay(0.5, 1.5)

        await human_scroll(page, "up", random.randint(400, 800))
        await random_delay(1.0, 2.0)

        add_btn = page.locator(
            'button:has-text("Add to Chrome"), button:has-text("Thêm vào Chrome"), '
            'button[aria-label*="Add"], button[jsname="b3VHJd"]'
        ).first

        if not await add_btn.is_visible(timeout=5000):
            logger.debug("Không tìm thấy nút cài extension '%s'", name)
            return

        await move_to_locator(page, add_btn)
        await random_delay(0.8, 1.5)
        await add_btn.click()
        await random_delay(1.0, 2.0)

        confirm_btn = page.locator(
            'button:has-text("Add extension"), button:has-text("Thêm tiện ích"), '
            'button[jsname="b3VHJd"]'
        ).first
        if await confirm_btn.is_visible(timeout=5000):
            await move_to_locator(page, confirm_btn)
            await random_delay(0.5, 1.2)
            await confirm_btn.click()
            logger.info("Đã cài extension: %s", name)
            await random_delay(2.0, 4.0)
        else:
            logger.debug("Extension '%s' có thể đã được cài rồi", name)

    except Exception as exc:
        logger.debug("Lỗi cài extension '%s': %s", name, exc)


# ── Simulate address bar usage ────────────────────────────────────────────────

_ADDRESS_BAR_URLS = [
    "https://www.youtube.com/",
    "https://mail.google.com/",
    "https://drive.google.com/",
    "https://www.google.com/",
    "https://maps.google.com/",
]


def urls_without_youtube(urls: list[str]) -> list[str]:
    return [url for url in urls if "youtube.com" not in url.lower()]


async def simulate_address_bar_navigation(page, urls: list[str] = None):
    """
    Mô phỏng điều hướng trực tiếp qua thanh địa chỉ.
    Dùng Ctrl+L + gõ URL thay vì page.goto() để tạo tín hiệu navigation tự nhiên hơn.
    """
    targets = urls or random.sample(_ADDRESS_BAR_URLS, min(3, len(_ADDRESS_BAR_URLS)))

    for full_url in targets:
        try:
            logger.info("Đang điều hướng qua thanh địa chỉ: %s", full_url)

            # Focus address bar bằng CDP để tránh gõ nhầm vào search box của trang
            try:
                cdp = await page.context.new_cdp_session(page)
                await cdp.send("Page.navigate", {"url": full_url})
                await cdp.detach()
            except Exception:
                await page.goto(full_url, wait_until="domcontentloaded", timeout=15000)

            await page.wait_for_load_state("domcontentloaded")
            await random_delay(2.0, 4.0)

            await human_scroll(page, "down", random.randint(200, 400))
            await random_delay(1.5, 3.0)

        except Exception as exc:
            logger.debug("Lỗi navigate '%s': %s", full_url, exc)

    return True


# ── New tab behavior ──────────────────────────────────────────────────────────

_NEW_TAB_URLS = [
    "https://www.google.com/",
    "https://www.youtube.com/",
    "https://mail.google.com/",
    "https://drive.google.com/",
    "https://maps.google.com/",
    "https://news.google.com/",
    "https://translate.google.com/",
    "https://calendar.google.com/",
]


async def simulate_new_tab_behavior(page, urls: list[str] = None):
    """
    Mô phỏng hành vi đa nhiệm thật sự:
    - Ctrl+T mở tab mới (tối đa 3 tab)
    - Ctrl+1/2/3 chuyển qua lại giữa các tab
    - Ctrl+W đóng tab hiện tại
    - Dùng context.new_page() vì Ctrl+T không trigger event trong cloakbrowser
    """
    url_pool = urls or _NEW_TAB_URLS
    context = page.context
    tabs = TabManager(context, page, "NewTabFlow")
    tabs.label_page(page, "main")
    new_pages = []
    try:
        await tabs.bring_to_front(page, "main")
        # Kiểm tra số tab hiện tại — tối đa 3
        current_pages = [p for p in context.pages if not p.is_closed()]
        n_current = len(current_pages)

        if n_current >= 3:
            # Đã đủ 3 tab — chỉ chuyển qua lại rồi đóng 1 tab cũ
            logger.info("Đã có %d tab — chuyển qua lại rồi đóng 1", n_current)
            await _switch_tabs_randomly(page, context, cycles=random.randint(2, 3))
            # Đóng tab cuối (không phải tab gốc)
            extra_tabs = [p for p in context.pages if not p.is_closed() and p != page]
            if extra_tabs:
                victim = extra_tabs[-1]
                tab_manager = TabManager(context, page, "NewTabFlow")
                tab_manager.label_page(victim, "old-extra")
                await tab_manager.bring_to_front(victim, "old-extra")
                await random_delay(0.5, 1.0)
                await victim.keyboard.press("Control+w")
                await random_delay(0.3, 0.7)
                try:
                    await tab_manager.close_tab(victim, reason="too many tabs")
                except Exception:
                    pass
                await tab_manager.bring_to_front(page, "main")
                logger.info("Closed extra tab and returned to main")
            return

        # Mở 1-2 tab mới (không vượt quá 3 tổng)
        n_to_open = min(random.randint(1, 2), 3 - n_current)

        for i in range(n_to_open):
            logger.info("Mở tab mới (%d/%d)", i + 1, n_to_open)
            await tabs.bring_to_front(page, "main")
            await random_delay(0.3, 0.7)
            url = random.choice(url_pool)
            new_p = await tabs.open_new_tab_human(page, f"newtab-{i + 1}", url, timeout=15000)
            await random_delay(1.5, 3.0)
            new_pages.append(new_p)

            # Làm việc thật sự trên tab mới — cuộn đọc 50-70% thời gian
            try:
                scroll_cycles = random.randint(2, 4)
                for _ in range(scroll_cycles):
                    await new_p.mouse.wheel(0, random.randint(300, 600))
                    await random_delay(2.0, 4.0)
                    # Di chuột vào nội dung
                    await new_p.mouse.move(
                        random.uniform(300, 900),
                        random.uniform(200, 600)
                    )
                    await random_delay(0.5, 1.5)
                logger.info("Đã đọc nội dung tab mới: %s", url[:50])
            except Exception:
                pass

        # Chuyển qua lại giữa các tab bằng Ctrl+1/2/3
        await _switch_tabs_randomly(page, context, cycles=random.randint(2, 4))
        logger.info("Đã hoàn thành simulate_new_tab_behavior")

    except Exception as exc:
        logger.debug("Lỗi simulate new tab: %s", exc)
    finally:
        # Luôn đóng các tab mới đã mở và quay về tab gốc, kể cả khi lỗi giữa chừng,
        # để tab đang hiển thị khớp với tab automation sẽ thao tác tiếp.
        for new_p in new_pages:
            try:
                if not new_p.is_closed():
                    await tabs.close_tab(new_p, reason="newtab flow complete")
            except Exception:
                pass
        try:
            if not page.is_closed():
                await page.bring_to_front()
        except Exception:
            pass
    return True


async def _switch_tabs_randomly(page, context, cycles: int = 2):
    """Chuyển qua lại giữa các tab bằng Ctrl+1/2/3 như người dùng thật."""
    try:
        current = page

        for _ in range(cycles):
            all_pages = [p for p in context.pages if not p.is_closed()]
            if len(all_pages) < 2:
                return

            # Chọn tab ngẫu nhiên (không phải tab hiện tại)
            candidates = [p for p in all_pages if p != current]
            if not candidates:
                return
            target = random.choice(candidates)
            tab_idx = all_pages.index(target) + 1  # 1-based

            # Giả lập Ctrl+1/2/3 bằng bring_to_front
            try:
                await current.keyboard.press(f"Control+{min(tab_idx, 8)}")
                await random_delay(0.2, 0.5)
            except Exception:
                pass
            await target.bring_to_front()
            current = target
            logger.debug("Chuyển sang tab %d (Ctrl+%d)", tab_idx, tab_idx)
            await random_delay(2.0, 5.0)

            # Cuộn một chút trên tab mới
            try:
                await target.mouse.wheel(0, random.randint(200, 500))
                await random_delay(1.0, 2.5)
            except Exception:
                pass

    except Exception as exc:
        logger.debug("Lỗi switch tabs: %s", exc)
