"""
Popup & notification permission handling.
"""
import asyncio
import logging
import random
import time

from actions.input_human import move_to_locator, random_delay

logger = logging.getLogger(__name__)


# ── Generic popup dismissal ───────────────────────────────────────────────────

_SAFE_DISMISS_TEXTS = [
    "Để sau",
    "Không phải bây giờ",
    "Không, cảm ơn",
    "No thanks",
    "No, thanks",
    "Maybe later",
    "Not now",
    "Skip",
    "Dismiss",
    "Cancel",
    "Close",
]
_DANGEROUS_PERMISSION_TEXTS = [
    "Sử dụng vị trí chính xác",
    "Use precise location",
    "Use your precise location",
    "Use current location",
    "Use my current location",
    "Allow location",
    "Allow",
    "Cho phép",
    "Bật",
    "Turn on",
    "Enable",
    "Continue",
]
_LOCATION_PROMPT_HINTS = [
    "vị trí của mình",
    "vị trí chính xác",
    "Use precise location",
    "Use your precise location",
    "Use current location",
    "Use your location",
    "Improve location accuracy",
    "location accuracy",
]

_SAFE_DISMISS_SELECTORS = [
    'button[aria-label*="Close"], button[aria-label*="close"]',
    'button[title*="Close"], button[title*="close"]',
    'button[aria-label*="Đóng"], button[title*="Đóng"]',
    'button[aria-label="Dismiss"], button[aria-label="dismiss"]',
    '[aria-label*="close"], [aria-label*="Close"], [aria-label*="Đóng"]',
    '[class*="close-button"], [class*="closeButton"], [class*="close_button"]',
    '[class*="modal-close"], [class*="modalClose"]',
    '[id*="close-button"], [id*="closeButton"]',
    'button:has-text("×"), button:has-text("✕"), button:has-text("✖")',
]
for _text in _SAFE_DISMISS_TEXTS:
    _SAFE_DISMISS_SELECTORS.extend([
        f'button:has-text("{_text}")',
        f'[role="button"]:has-text("{_text}")',
        f'a:has-text("{_text}")',
        f'button[aria-label*="{_text}"]',
        f'[role="button"][aria-label*="{_text}"]',
    ])

_RESTORE_PROMPT_SELECTORS = [
    'text=/Restore pages/i',
    'text=/Khôi phục trang/i',
    'text=/Chrome didn.*shut down correctly/i',
]
_BLOCKING_MODAL_SELECTOR = (
    '[role="dialog"], [aria-modal="true"], '
    '[class*="modal"][class*="open"], '
    '[class*="popup"][style*="display: block"], '
    '[class*="overlay"][style*="display: block"], '
    '#lb, .Qe0THe'
)


async def _visible(locator, timeout: int = 350) -> bool:
    try:
        return bool(await locator.is_visible(timeout=timeout))
    except Exception:
        return False


async def _click_safe(page, locator) -> bool:
    try:
        await move_to_locator(page, locator)
    except Exception:
        pass
    try:
        await asyncio.sleep(random.uniform(0.15, 0.35))
        await locator.click(timeout=1500)
        return True
    except Exception:
        try:
            await locator.click(timeout=1500)
            return True
        except Exception:
            return False


async def _first_visible(page, selectors: list[str], timeout: int = 350, deadline: float | None = None):
    for selector in selectors:
        if deadline is not None and time.monotonic() >= deadline:
            break
        try:
            locator = page.locator(selector).first
            if await _visible(locator, timeout=timeout):
                return selector, locator
        except Exception:
            continue
    return "", None


async def _page_has_text(page, texts: list[str], timeout: int = 250, deadline: float | None = None) -> bool:
    for text in texts:
        if deadline is not None and time.monotonic() >= deadline:
            break
        try:
            if await page.locator(f'text="{text}"').first.is_visible(timeout=timeout):
                return True
        except Exception:
            try:
                if deadline is not None and time.monotonic() >= deadline:
                    break
                if await page.locator(f'text=/{text}/i').first.is_visible(timeout=timeout):
                    return True
            except Exception:
                continue
    return False


async def dismiss_google_location_prompt(page, deadline: float | None = None) -> int:
    """Dismiss Google location prompts without granting location permission."""
    selector, locator = await _first_visible(page, _SAFE_DISMISS_SELECTORS, timeout=180, deadline=deadline)
    if locator is not None and await _click_safe(page, locator):
        await asyncio.sleep(random.uniform(0.25, 0.55))
        logger.info("Đã đóng popup an toàn: %s", selector[:80])
        return 1

    has_location_prompt = await _page_has_text(page, _LOCATION_PROMPT_HINTS, timeout=120, deadline=deadline)
    has_dangerous_button = await _page_has_text(page, _DANGEROUS_PERMISSION_TEXTS, timeout=120, deadline=deadline)
    if has_location_prompt or has_dangerous_button:
        try:
            await page.keyboard.press("Escape")
            await asyncio.sleep(0.3)
            logger.info("Đã thoát popup vị trí/quyền bằng Escape")
            return 1
        except Exception:
            return 0
    return 0


async def dismiss_blocking_overlays(page, max_rounds: int = 3, max_seconds: float = 2.5) -> int:
    """Close stacked DOM overlays with a small, safe whitelist and bounded scan time."""
    closed = 0
    deadline = time.monotonic() + max(0.5, max_seconds)
    for _ in range(max(1, max_rounds)):
        if time.monotonic() >= deadline:
            logger.debug("Popup cleanup budget exhausted after closing %d overlays", closed)
            break
        before = closed
        closed += await dismiss_google_location_prompt(page, deadline=deadline)
        if closed > before:
            continue

        selector, locator = await _first_visible(page, _SAFE_DISMISS_SELECTORS, timeout=180, deadline=deadline)
        if locator is not None and await _click_safe(page, locator):
            await asyncio.sleep(random.uniform(0.25, 0.55))
            closed += 1
            logger.info("Đã đóng popup: %s", selector[:80])
            continue

        try:
            modal = page.locator(_BLOCKING_MODAL_SELECTOR).first
            if await _visible(modal, timeout=180):
                await page.keyboard.press("Escape")
                await asyncio.sleep(0.3)
                closed += 1
                logger.info("Đã đóng popup/overlay bằng Escape")
                continue
        except Exception:
            pass
        break
    return closed


async def dismiss_popups(page, max_rounds: int = 3, max_seconds: float = 2.5) -> int:
    """
    Tìm và đóng popup/overlay quảng cáo/quyền đang chặn nội dung.
    Trả về số popup đã đóng.
    """
    started = time.monotonic()
    closed = 0
    closed += await dismiss_restore_prompt(page)
    elapsed = time.monotonic() - started
    if elapsed < max_seconds:
        closed += await dismiss_blocking_overlays(page, max_rounds=max_rounds, max_seconds=max_seconds - elapsed)
    return closed


async def dismiss_restore_prompt(page) -> int:
    """Close Chrome/Chromium restore-page prompts when they are exposed to the page."""
    try:
        for selector in _RESTORE_PROMPT_SELECTORS:
            try:
                if await page.locator(selector).first.is_visible(timeout=250):
                    close_selector, close_btn = await _first_visible(page, _SAFE_DISMISS_SELECTORS, timeout=250)
                    if close_btn is not None and await _click_safe(page, close_btn):
                        logger.info("Đã đóng prompt restore pages: %s", close_selector[:80])
                        return 1
                    await page.keyboard.press("Escape")
                    logger.info("Đã đóng prompt restore pages bằng Escape")
                    return 1
            except Exception:
                continue
    except Exception:
        pass
    return 0


# ── Notification permission ───────────────────────────────────────────────────

async def handle_notification_permission(page, allow_rate: float = 0.30) -> bool:
    """
    Xử lý popup xin quyền thông báo của trình duyệt.
    allow_rate=0.30 → 30% bấm Allow, 70% bấm Block.
    Trả về True nếu đã xử lý popup.
    """
    allow_selectors = [
        'button:has-text("Allow")',
        'button:has-text("Allow notifications")',
        'button[data-action="allow"]',
        '[class*="allow"]:has-text("Allow")',
    ]
    block_selectors = [
        'button:has-text("Block")',
        'button:has-text("Don\'t allow")',
        'button:has-text("No thanks")',
        'button[data-action="block"]',
        '[class*="block"]:has-text("Block")',
    ]

    decision = random.random() < allow_rate
    target_selectors = allow_selectors if decision else block_selectors
    label = "Allow" if decision else "Block"

    for sel in target_selectors:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=600):
                await move_to_locator(page, btn)
                await asyncio.sleep(random.uniform(0.4, 1.0))
                await btn.click()
                logger.info("Đã bấm '%s' trên custom notification dialog", label)
                return True
        except Exception:
            continue

    try:
        cdp = await page.context.new_cdp_session(page)
        setting = "granted" if decision else "denied"
        await cdp.send("Browser.setPermission", {
            "permission": {"name": "notifications"},
            "setting": setting,
            "origin": page.url.split("?")[0].rstrip("/"),
        })
        logger.info("Đã %s quyền thông báo qua CDP cho %s", label, page.url[:60])
        await cdp.detach()
        return True
    except Exception as exc:
        logger.debug("Không thể xử lý notification permission qua CDP: %s", exc)

    return False


async def maybe_handle_notification_popup(page, allow_rate: float = 0.30):
    """Gọi handle_notification_permission nếu phát hiện popup thông báo đang chờ."""
    try:
        has_allow = await page.locator(
            'button:has-text("Allow"), button:has-text("Block")'
        ).first.is_visible(timeout=500)
        if has_allow:
            await asyncio.sleep(random.uniform(0.8, 2.0))
            await handle_notification_permission(page, allow_rate)
    except Exception:
        pass
