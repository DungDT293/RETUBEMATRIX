"""
Page context awareness — kiểm tra bot đang ở đâu trước mỗi action.

Mỗi hàm ensure_on_* sẽ:
  1. Kiểm tra page.url và page.title
  2. Nếu đúng trang → return True ngay (không navigate thừa)
  3. Nếu sai → goto đúng URL, chờ load, return True
  4. Nếu phát hiện CAPTCHA → chờ người dùng giải thủ công (tối đa 3 phút)
  5. Nếu phát hiện login wall → raise PageContextError
"""

import asyncio
import logging
import random

from actions.human_utils import random_delay, move_mouse_to

logger = logging.getLogger(__name__)

CAPTCHA_WAIT_TIMEOUT = 180


class PageContextError(Exception):
    """Raised khi trang ở trạng thái không thể tiếp tục (bị đăng xuất, CAPTCHA timeout…)."""


# ── URL matchers ──────────────────────────────────────────────────────────────

def _on_google_home(url: str) -> bool:
    return ("google.com" in url and "/search" not in url and "maps" not in url
            and "/sorry" not in url and "accounts.google.com" not in url
            and "mail.google.com" not in url and "drive.google.com" not in url)

def _on_google_search(url: str) -> bool:
    return "google.com/search" in url

def _on_youtube(url: str) -> bool:
    return "youtube.com" in url

def _on_youtube_watch(url: str) -> bool:
    return "youtube.com/watch" in url

def _on_drive(url: str) -> bool:
    return "drive.google.com" in url

def _on_gmail(url: str) -> bool:
    return "mail.google.com" in url

def _on_maps(url: str) -> bool:
    return "google.com/maps" in url

def _on_alerts(url: str) -> bool:
    return "google.com/alerts" in url


# ── CAPTCHA / login wall detection ───────────────────────────────────────────

_CAPTCHA_URL_SIGNALS = [
    "/sorry/index",
    "google.com/sorry",
    "recaptcha",
]

_CAPTCHA_TITLE_SIGNALS = [
    "unusual traffic",
    "captcha",
    "robot",
    "before you continue",
    "just a moment",
    "verify you are human",
    "checking your browser",
]

_CAPTCHA_DOM_SELECTORS = [
    "iframe[src*='recaptcha'], .g-recaptcha, #recaptcha",
    "iframe[src*='hcaptcha'], .h-captcha, #hcaptcha",
    "iframe[src*='turnstile'], .cf-turnstile, input[name='cf-turnstile-response']",
    "#challenge-stage, .challenge-stage, .cf-browser-verification",
    "[class*='geetest'], [id*='geetest'], [class*='gee-test']",
    "[class*='captcha'], [id*='captcha']",
    "[class*='slider'][class*='captcha'], [class*='slide'][class*='verify']",
    "text=/slide.*verify/i, text=/drag.*verify/i, text=/verify.*human/i",
    "text=/trượt.*xác minh/i, text=/kéo.*xác minh/i",
]

_LOGIN_SIGNALS = [
    "accounts.google.com/signin",
    "accounts.google.com/v3/signin",
    "accounts.google.com/ServiceLogin",
]


async def check_page_health(page) -> str:
    """
    Trả về trạng thái trang hiện tại:
      'ok'      — bình thường, tiếp tục
      'captcha' — đang bị chặn bởi CAPTCHA
      'login'   — bị đăng xuất, cần đăng nhập lại
    """
    url   = page.url.lower()
    try:
        title = (await page.title()).lower()
    except Exception:
        title = ""

    for sig in _CAPTCHA_URL_SIGNALS:
        if sig in url:
            logger.warning("⚠ CAPTCHA phát hiện qua URL: %s", page.url)
            return "captcha"

    for sig in _CAPTCHA_TITLE_SIGNALS:
        if sig in title:
            logger.warning("⚠ CAPTCHA phát hiện qua title: '%s'", title)
            return "captcha"

    for selector in _CAPTCHA_DOM_SELECTORS:
        try:
            if await page.locator(selector).first.is_visible(timeout=500):
                logger.warning("⚠ CAPTCHA/challenge phát hiện qua DOM: %s", selector[:80])
                return "captcha"
        except Exception:
            continue

    for sig in _LOGIN_SIGNALS:
        if sig in url:
            logger.warning("⚠ Login wall: profile có thể bị đăng xuất: %s", page.url)
            return "login"

    return "ok"


async def wait_for_captcha_resolution(page, context_name: str, timeout: int = CAPTCHA_WAIT_TIMEOUT):
    """
    Khi phát hiện CAPTCHA, dừng lại và polling mỗi 5s để xem người dùng
    đã giải xong chưa. Nếu quá timeout → raise PageContextError.
    """
    logger.warning(
        "🔴 [%s] CAPTCHA đang chặn! Vui lòng giải thủ công trên cửa sổ trình duyệt. "
        "Bot sẽ tự tiếp tục sau khi giải xong (tối đa %ds).",
        context_name, timeout,
    )
    elapsed = 0
    poll_interval = 5

    while elapsed < timeout:
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval

        state = await check_page_health(page)
        if state == "ok":
            logger.info("✅ [%s] CAPTCHA đã được giải — tiếp tục tự động", context_name)
            return
        if state == "login":
            raise PageContextError(f"[{context_name}] Bị đăng xuất sau CAPTCHA")

        remaining = timeout - elapsed
        if remaining > 0 and elapsed % 30 == 0:
            logger.warning(
                "⏳ [%s] Vẫn đang chờ giải CAPTCHA… còn %ds",
                context_name, remaining,
            )

    raise PageContextError(
        f"[{context_name}] CAPTCHA không được giải trong {timeout}s — hủy action. "
        f"Kiểm tra proxy: profile cần residential/mobile proxy để tránh bị chặn."
    )


async def _guard(page, context_name: str):
    """Kiểm tra sức khỏe trang. CAPTCHA → chờ người giải. Login wall → raise."""
    state = await check_page_health(page)
    if state == "captcha":
        await wait_for_captcha_resolution(page, context_name)
    elif state == "login":
        raise PageContextError(f"[{context_name}] Profile bị đăng xuất — cần login lại")


async def dismiss_blocking_popups(page, context_name: str = "") -> int:
    """Best-effort cleanup for DOM overlays that block clicks after navigation."""
    try:
        from actions.popup_handler import dismiss_popups

        closed = await dismiss_popups(page)
        if closed:
            logger.info("[%s] Đã xử lý %d popup/overlay chặn thao tác", context_name or "Page", closed)
        return closed
    except Exception as exc:
        logger.debug("[%s] Không xử lý được popup/overlay: %s", context_name or "Page", exc)
        return 0


_YOUTUBE_CONSENT_BUTTON_NAMES = (
    "Accept all",
    "Reject all",
    "I agree",
    "Accept all cookies",
    "Reject all cookies",
    "Chấp nhận tất cả",
    "Từ chối tất cả",
    "Tôi đồng ý",
)


async def dismiss_youtube_consent(page) -> str:
    """Handle consent before generic health checks classify it as CAPTCHA."""
    try:
        title = (await page.title()).casefold()
    except Exception:
        title = ""
    if "before you continue" not in title:
        return ""

    deadline = asyncio.get_running_loop().time() + 8.0
    while asyncio.get_running_loop().time() < deadline:
        for name in _YOUTUBE_CONSENT_BUTTON_NAMES:
            remaining_ms = max(100, min(750, int((deadline - asyncio.get_running_loop().time()) * 1000)))
            try:
                button = page.get_by_role("button", name=name, exact=True).first
                if not await button.is_visible(timeout=remaining_ms):
                    continue
                await button.click(timeout=min(2500, remaining_ms + 1750))
                logger.info("YouTube consent handled | button=%s", name)
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=5000)
                except Exception:
                    pass
                return name
            except Exception:
                continue
        await asyncio.sleep(0.25)
    return ""


async def _guard_youtube(page) -> None:
    """Handle consent first, then retain generic CAPTCHA/login protection."""
    consent = await dismiss_youtube_consent(page)
    if consent:
        logger.info("YouTube consent complete before health guard | button=%s", consent)
    await _guard(page, "YouTube")


# ── ensure_on_* helpers ───────────────────────────────────────────────────────



async def ensure_on_google(page) -> bool:
    """Đảm bảo đang ở trang chủ Google."""
    url = page.url
    if _on_google_home(url):
        logger.debug("Đang ở Google Home: %s", url)
        await dismiss_blocking_popups(page, "Google")
        await _guard(page, "Google")
        return True

    logger.info("Không ở Google Home (đang ở: %s) → navigate về google.com", url)
    await page.goto("https://www.google.com/", wait_until="domcontentloaded", timeout=20000)
    await random_delay(1.0, 2.5)
    await dismiss_blocking_popups(page, "Google")
    await _guard(page, "Google")
    return True


def _is_navigation_timeout(exc: BaseException) -> bool:
    return isinstance(exc, asyncio.TimeoutError) or type(exc).__name__ == "TimeoutError"


def _is_closed_navigation_error(exc: BaseException) -> bool:
    message = str(exc).lower()
    return any(
        signal in message
        for signal in (
            "target page, context or browser has been closed",
            "target page has been closed",
            "browser has been closed",
            "context has been closed",
            "page crashed",
            "target closed",
        )
    )


async def _navigate_to_youtube(page, *, max_attempts: int = 2) -> None:
    """Commit YouTube navigation, then treat DOM readiness as a soft wait."""
    target = "https://www.youtube.com/"
    url_before = str(getattr(page, "url", "") or "")
    last_error: BaseException | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            logger.info(
                "YouTube navigation phase | phase=navigation_commit | attempt=%d | url_before=%s | target=%s",
                attempt,
                url_before,
                target,
            )
            await page.goto(target, wait_until="commit", timeout=20000)
            current_url = str(getattr(page, "url", "") or "")
            if _on_youtube(current_url):
                break
            if attempt >= max_attempts:
                raise PageContextError("YouTube navigation did not reach a YouTube URL")
            logger.info(
                "YouTube navigation phase | phase=navigation_recovery | attempt=%d | url=%s | reason=commit_without_youtube_url",
                attempt,
                current_url,
            )
            await asyncio.sleep(0.25)
        except Exception as exc:
            last_error = exc
            current_url = str(getattr(page, "url", "") or "")
            if _is_navigation_timeout(exc) and _on_youtube(current_url):
                logger.warning(
                    "YouTube navigation phase | phase=navigation_soft_timeout | attempt=%d | url=%s | error_type=%s",
                    attempt,
                    current_url,
                    type(exc).__name__,
                )
                break
            if _is_closed_navigation_error(exc) or attempt >= max_attempts:
                logger.warning(
                    "YouTube navigation failed | phase=navigation_commit | attempt=%d | url_before=%s | url=%s | error_type=%s",
                    attempt,
                    url_before,
                    current_url,
                    type(exc).__name__,
                )
                raise
            logger.info(
                "YouTube navigation phase | phase=navigation_recovery | attempt=%d | url=%s | error_type=%s",
                attempt,
                current_url,
                type(exc).__name__,
            )
            await asyncio.sleep(0.25)

    if not _on_youtube(str(getattr(page, "url", "") or "")):
        if last_error is not None:
            raise last_error
        raise PageContextError("YouTube navigation did not reach a YouTube URL")

    try:
        await page.wait_for_load_state("domcontentloaded", timeout=10000)
    except Exception as exc:
        if not _is_navigation_timeout(exc):
            raise
        logger.warning(
            "YouTube navigation phase | phase=navigation_soft_timeout | url=%s | wait_until=domcontentloaded | timeout_ms=10000 | error_type=%s",
            getattr(page, "url", ""),
            type(exc).__name__,
        )
    logger.info("YouTube navigation complete | url=%s", getattr(page, "url", ""))


async def ensure_on_youtube(page) -> bool:
    """Đảm bảo đang ở YouTube (bất kỳ trang nào)."""
    url = page.url
    if _on_youtube(url):
        logger.debug("Đang ở YouTube: %s", url)
        await dismiss_blocking_popups(page, "YouTube")
        await _guard_youtube(page)
        return True

    logger.info("Không ở YouTube (đang ở: %s) → navigate về youtube.com", url)
    await _navigate_to_youtube(page)
    await random_delay(1.5, 3.0)
    await dismiss_blocking_popups(page, "YouTube")
    await _guard_youtube(page)
    return True


async def ensure_on_drive(page) -> bool:
    """Đảm bảo đang ở Google Drive."""
    url = page.url
    if _on_drive(url):
        logger.debug("Đang ở Drive: %s", url)
        await dismiss_blocking_popups(page, "Drive")
        await _guard(page, "Drive")
        return True

    logger.info("Không ở Drive (đang ở: %s) → navigate về drive.google.com", url)
    await page.goto("https://drive.google.com/", wait_until="domcontentloaded", timeout=25000)
    await random_delay(2.0, 4.0)
    await dismiss_blocking_popups(page, "Drive")
    await _guard(page, "Drive")
    return True


async def ensure_on_gmail(page) -> bool:
    """Đảm bảo đang ở Gmail inbox."""
    url = page.url
    if _on_gmail(url):
        logger.debug("Đang ở Gmail: %s", url)
        await dismiss_blocking_popups(page, "Gmail")
        await _guard(page, "Gmail")
        return True

    logger.info("Không ở Gmail (đang ở: %s) → navigate về Gmail", url)
    await page.goto("https://mail.google.com/mail/u/0/#inbox", wait_until="domcontentloaded", timeout=25000)
    await random_delay(2.0, 4.0)
    await dismiss_blocking_popups(page, "Gmail")
    await _guard(page, "Gmail")
    return True


async def ensure_on_maps(page, query: str = "") -> bool:
    """Đảm bảo đang ở Google Maps."""
    url = page.url
    if _on_maps(url):
        logger.debug("Đang ở Maps: %s", url)
        await dismiss_blocking_popups(page, "Maps")
        await _guard(page, "Maps")
        return True

    target = (
        f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
        if query else "https://maps.google.com/"
    )
    logger.info("Không ở Maps (đang ở: %s) → navigate về Maps", url)
    await page.goto(target, wait_until="domcontentloaded", timeout=20000)
    await random_delay(2.0, 4.0)
    await dismiss_blocking_popups(page, "Maps")
    await _guard(page, "Maps")
    return True


async def ensure_on_alerts(page) -> bool:
    """Đảm bảo đang ở Google Alerts."""
    url = page.url
    if _on_alerts(url):
        logger.debug("Đang ở Alerts: %s", url)
        await dismiss_blocking_popups(page, "Alerts")
        await _guard(page, "Alerts")
        return True

    logger.info("Không ở Alerts (đang ở: %s) → navigate về google.com/alerts", url)
    await page.goto("https://www.google.com/alerts", wait_until="domcontentloaded", timeout=20000)
    await random_delay(1.5, 3.0)
    await dismiss_blocking_popups(page, "Alerts")
    await _guard(page, "Alerts")
    return True


# ── where_am_i — dùng trong log / debug ──────────────────────────────────────

async def where_am_i(page) -> str:
    """Trả về mô tả ngắn về trang hiện tại."""
    url = page.url
    try:
        title = await page.title()
    except Exception:
        title = ""

    if _on_youtube_watch(url):
        return f"YouTube Watch | {title[:50]}"
    if _on_youtube(url):
        return f"YouTube | {title[:50]}"
    if _on_google_search(url):
        return f"Google Search | {title[:50]}"
    if _on_gmail(url):
        return f"Gmail | {title[:50]}"
    if _on_drive(url):
        return f"Google Drive | {title[:50]}"
    if _on_maps(url):
        return f"Google Maps | {title[:50]}"
    if _on_alerts(url):
        return f"Google Alerts | {title[:50]}"
    if _on_google_home(url):
        return f"Google Home | {title[:50]}"

    if str(url or "").strip().lower().startswith("about:blank"):
        return f"New browser tab | {url[:60]}"

    health = await check_page_health(page)
    if health == "captcha":
        return f"!!! CAPTCHA | {url[:60]}"
    if health == "login":
        return f"!!! Login Wall | {url[:60]}"

    return f"Unknown | {url[:60]}"
