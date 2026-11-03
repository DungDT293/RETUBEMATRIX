"""
OAuth simulation — mô phỏng hành vi 'Đăng nhập bằng Google' trên các nền tảng bên thứ ba.
Tín hiệu cực mạnh để Google xác nhận tài khoản đang hoạt động đa dịch vụ.
"""
import logging
import random

from actions.human_utils import (
    random_delay, move_to_locator, human_scroll,
    move_mouse_to, human_read_and_scroll,
)
from actions.page_context import where_am_i, check_page_health

logger = logging.getLogger(__name__)

# Các nền tảng hỗ trợ "Continue with Google"
_OAUTH_PLATFORMS = [
    {
        "name": "Canva",
        "url": "https://www.canva.com/login",
        "btn_selectors": [
            'button:has-text("Continue with Google")',
            'a:has-text("Continue with Google")',
            '[data-anchor="google-login"]',
        ],
        "post_browse_url": "https://www.canva.com/",
        "post_browse_action": "scroll",
    },
    {
        "name": "Pinterest",
        "url": "https://www.pinterest.com/login/",
        "btn_selectors": [
            'button:has-text("Continue with Google")',
            'div[data-test-id="google-login-button"]',
            'a:has-text("Continue with Google")',
        ],
        "post_browse_url": "https://www.pinterest.com/",
        "post_browse_action": "scroll",
    },
    {
        "name": "Quora",
        "url": "https://www.quora.com/",
        "btn_selectors": [
            'button:has-text("Continue with Google")',
            'div.GoogleButton',
            'a:has-text("Continue with Google")',
        ],
        "post_browse_url": "https://www.quora.com/",
        "post_browse_action": "scroll",
    },
    {
        "name": "Medium",
        "url": "https://medium.com/m/signin",
        "btn_selectors": [
            'button:has-text("Sign in with Google")',
            'a:has-text("Sign in with Google")',
        ],
        "post_browse_url": "https://medium.com/",
        "post_browse_action": "scroll",
    },
]


async def oauth_login_simulation(page, platforms: list[dict] = None) -> bool:
    """
    Mô phỏng đăng nhập OAuth với Google trên 1-2 nền tảng ngẫu nhiên.
    Xử lý popup cấp quyền, sau đó duyệt qua trang một chút.
    """
    pool = platforms or _OAUTH_PLATFORMS
    chosen = random.sample(pool, min(2, len(pool)))

    for platform in chosen:
        await _do_oauth(page, platform)
        await random_delay(3.0, 6.0)

    return True


async def _do_oauth(page, platform: dict):
    name = platform["name"]
    loc = await where_am_i(page)
    logger.info("Vị trí hiện tại: %s | → OAuth trên %s", loc, name)

    try:
        await page.goto(platform["url"], wait_until="domcontentloaded", timeout=20000)
        await random_delay(2.0, 4.0)

        # Nếu đã đăng nhập và redirect thẳng vào app — duyệt luôn
        current_url = page.url
        login_indicators = ["login", "signin", "sign-in", "auth", "connect"]
        is_login_page = any(ind in current_url.lower() for ind in login_indicators)
        target_base = platform["url"].rstrip("/").split("?")[0]
        if not is_login_page and target_base not in current_url:
            logger.info("OAuth %s: đã đăng nhập rồi — bỏ qua bước login", name)
            await _browse_after_oauth(page, platform)
            return

        # Cuộn nhìn qua trang trước khi click
        await human_scroll(page, "down", random.randint(100, 300))
        await random_delay(1.0, 2.0)
        await human_scroll(page, "up", random.randint(50, 150))
        await random_delay(0.8, 1.5)

        # Tìm nút "Continue with Google"
        btn = None
        for selector in platform["btn_selectors"]:
            try:
                candidate = page.locator(selector).first
                if await candidate.is_visible(timeout=3000):
                    btn = candidate
                    break
            except Exception:
                continue

        if btn is None:
            logger.debug("Không tìm thấy nút OAuth Google trên %s", name)
            return

        await move_to_locator(page, btn)
        await random_delay(0.8, 1.5)

        # Click nút — Google OAuth có thể mở popup hoặc redirect thẳng
        popup_appeared = False
        try:
            async with page.context.expect_page(timeout=5000) as popup_info:
                await btn.click()
            popup = await popup_info.value
            await popup.wait_for_load_state("domcontentloaded")
            await random_delay(1.5, 3.0)
            logger.info("Popup OAuth đã mở cho %s", name)
            await _handle_google_oauth_popup(popup)
            popup_appeared = True
        except Exception:
            # Không có popup — có thể redirect thẳng trong cùng tab
            pass

        if not popup_appeared:
            # Chờ page điều hướng (redirect flow)
            try:
                await page.wait_for_url(
                    lambda url: "accounts.google.com" in url or
                                platform["url"].split("/")[2] in url,
                    timeout=8000,
                )
            except Exception:
                pass
            await page.wait_for_load_state("domcontentloaded")
            await random_delay(1.5, 3.0)
            # Xử lý Google account picker nếu đang ở accounts.google.com
            if "accounts.google.com" in page.url:
                await _handle_google_oauth_popup(page)

        # Duyệt qua trang sau khi đăng nhập
        await random_delay(2.0, 4.0)
        await _browse_after_oauth(page, platform)
        logger.info("Hoàn thành OAuth simulation trên %s", name)

    except Exception as exc:
        logger.debug("Lỗi OAuth %s: %s", name, exc)


async def _handle_google_oauth_popup(popup_page):
    """Xử lý popup chọn tài khoản Google và cấp quyền."""
    try:
        await popup_page.wait_for_load_state("domcontentloaded")
        await random_delay(1.0, 2.0)

        # Chọn tài khoản — Google account picker (nhiều variant UI)
        account_items = await popup_page.locator(
            # UI mới nhất 2024-2026
            'div[data-authuser], '
            'li[data-identifier], '
            'div[data-email], '
            # jsname variants
            'div[jsname="ik7yyd"], '
            'div[jsname="tJHJj"], '
            # class-based fallback
            'div.account-list-item, '
            'div[class*="account"] [role="link"], '
            # aria-based
            '[role="listitem"] [data-identifier]'
        ).all()

        if account_items:
            chosen_account = account_items[0]
            await move_to_locator(popup_page, chosen_account)
            await random_delay(0.5, 1.2)
            await chosen_account.click()
            await popup_page.wait_for_load_state("domcontentloaded")
            await random_delay(1.5, 3.0)
        else:
            # Thử click vào email text nếu không tìm thấy account item
            email_el = popup_page.locator('[data-email], [aria-label*="@"]').first
            if await email_el.is_visible(timeout=2000):
                await move_to_locator(popup_page, email_el)
                await email_el.click()
                await popup_page.wait_for_load_state("domcontentloaded")
                await random_delay(1.5, 3.0)

        # Xử lý màn hình cấp quyền "Allow" / "Continue"
        for selector, label in [
            ('button:has-text("Continue")',    "Continue"),
            ('button:has-text("Allow")',       "Allow"),
            ('button:has-text("Tiếp tục")',    "Tiếp tục"),
            ('button:has-text("Cho phép")',    "Cho phép"),
            ('[id="submit_approve_access"]',   "approve_access"),
            # nút xanh lá cuối form consent
            ('div[id="submit_approve_access"] button', "approve_access_btn"),
            ('[jsname="LgbsSe"]:not([disabled])', "consent_btn"),
        ]:
            try:
                allow_btn = popup_page.locator(selector).first
                if await allow_btn.is_visible(timeout=3000):
                    await move_to_locator(popup_page, allow_btn)
                    await random_delay(0.8, 1.5)
                    await allow_btn.click()
                    logger.info("Đã cấp quyền OAuth: '%s'", label)
                    await random_delay(1.0, 2.0)
                    break
            except Exception:
                continue

    except Exception as exc:
        logger.debug("Lỗi xử lý popup OAuth: %s", exc)


async def _browse_after_oauth(page, platform: dict):
    """Duyệt qua trang sau khi đăng nhập để tạo session activity."""
    try:
        post_url = platform.get("post_browse_url")
        if post_url and page.url != post_url:
            await page.goto(post_url)
            await page.wait_for_load_state("domcontentloaded")
            await random_delay(2.0, 3.5)

        # Cuộn đọc trang
        await human_read_and_scroll(page, cycles=random.randint(2, 3))

        # Di chuột ngẫu nhiên
        for _ in range(random.randint(2, 4)):
            tx = random.uniform(200, 900)
            ty = random.uniform(200, 600)
            await move_mouse_to(page, tx, ty)
            await random_delay(0.5, 1.5)

    except Exception as exc:
        logger.debug("Lỗi duyệt sau OAuth: %s", exc)
