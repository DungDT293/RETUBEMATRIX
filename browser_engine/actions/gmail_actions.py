"""
Gmail interaction — đọc inbox, gắn sao, reply, soạn email mới.
"""
import logging
import random
import string

from actions.input_human import (
    human_type, random_delay, move_to_locator, human_scroll,
)
from actions.page_context import ensure_on_gmail, where_am_i, dismiss_blocking_popups

logger = logging.getLogger(__name__)

_GMAIL_FALLBACK_SEARCH_KEYWORDS = [
    # Công việc / tài liệu
    "invoice", "receipt", "statement", "meeting notes", "project update",
    "weekly report", "contract", "proposal", "shared document", "deadline",
    "calendar invite", "presentation", "spreadsheet", "follow up", "team update",
    # Tài khoản / bảo mật
    "security alert", "verification code", "password reset", "login attempt",
    "two factor authentication", "account activity", "privacy policy",
    "terms update", "device sign in", "subscription renewal",
    # Mua sắm / dịch vụ
    "order confirmation", "shipping update", "delivery status", "refund",
    "payment receipt", "booking confirmation", "reservation", "support ticket",
    "customer service", "promo code", "discount", "membership",
    # Tin tức / học tập / đời sống
    "newsletter", "technology news", "business news", "travel deals",
    "flight update", "online course", "webinar", "event reminder",
    "fitness", "recipe", "health tips", "weather alert", "community update",
    # Tiếng Việt tự nhiên
    "hóa đơn", "biên lai", "xác nhận đơn hàng", "lịch họp", "tài liệu",
    "báo cáo tuần", "mã xác minh", "đặt lịch", "vé máy bay", "khuyến mãi",
    "cập nhật tài khoản", "thông báo bảo mật", "nhắc lịch", "bản tin",
]

_GMAIL_SEARCH_OPERATORS = [
    "{keyword}",
    "from:({keyword})",
    "subject:({keyword})",
    "{keyword} newer_than:30d",
    "{keyword} older_than:7d",
    "{keyword} has:attachment",
    '"{keyword}"',
]

_EMAIL_SUBJECTS = [
    "Cập nhật dự án tuần này",
    "Tài liệu họp nhóm",
    "Kế hoạch công việc tháng tới",
    "Xác nhận cuộc họp",
    "Chia sẻ tài liệu mới",
    "Thông tin cần trao đổi",
    "Re: Báo cáo tiến độ",
    "Nhắc nhở lịch hẹn",
]

_EMAIL_BODIES = [
    "Chào bạn,\n\nMình muốn trao đổi thêm về nội dung hôm qua. Bạn có rảnh không?\n\nCảm ơn!",
    "Hi,\n\nMình đã cập nhật tài liệu theo yêu cầu. Bạn xem và phản hồi nhé.\n\nTrân trọng.",
    "Chào,\n\nNhắc nhở cuộc họp vào ngày mai lúc 9h sáng. Mọi người nhớ chuẩn bị nhé!\n\nBest regards.",
    "Xin chào,\n\nMình vừa gửi file tài liệu mới. Bạn kiểm tra và cho mình biết ý kiến nhé.\n\nCảm ơn bạn nhiều!",
    "Hello,\n\nTheo như trao đổi trước, mình đã chuẩn bị xong phần của mình. Khi nào tiện thì mình họp nhé.\n\nRegards.",
]

_REPLY_TEMPLATES = [
    "Cảm ơn bạn đã gửi! Mình đã nhận được rồi.",
    "Ok bạn, mình sẽ xem qua và phản hồi sớm nhé.",
    "Cảm ơn! Mình sẽ liên hệ lại sau.",
    "Nhận được rồi, cảm ơn bạn nhiều!",
    "Oki bạn, để mình kiểm tra lại rồi báo.",
]


def _clean_keyword_items(values) -> list[str]:
    if not values:
        return []
    if isinstance(values, str):
        values = [values]
    items: list[str] = []
    seen: set[str] = set()
    for value in values:
        for part in str(value or "").replace("\n", "|").replace(",", "|").replace(";", "|").split("|"):
            item = part.strip()
            key = item.casefold()
            if item and key not in seen:
                seen.add(key)
                items.append(item)
    return items


def get_gmail_search_keyword_pool(seed_keywords=None) -> list[str]:
    """Return user keywords first, then a broad offline fallback pool for Gmail search."""
    pool = _clean_keyword_items(seed_keywords)
    seen = {item.casefold() for item in pool}
    pool.extend(keyword for keyword in _GMAIL_FALLBACK_SEARCH_KEYWORDS if keyword.casefold() not in seen)
    return pool


def build_gmail_search_query(seed_keywords=None) -> str:
    keyword = random.choice(get_gmail_search_keyword_pool(seed_keywords))
    template = random.choice(_GMAIL_SEARCH_OPERATORS)
    return template.format(keyword=keyword)


async def gmail_interaction(page, bait_emails: list[str] | None = None, search_keywords=None) -> bool:
    if page.is_closed():
        logger.debug("Gmail: page đã đóng, bỏ qua")
        return False
    loc = await where_am_i(page)
    logger.info("Vị trí hiện tại: %s", loc)
    await ensure_on_gmail(page)
    await dismiss_blocking_popups(page, "Gmail")
    await random_delay(2.0, 4.0)

    if random.random() < 0.85:
        await _search_mail(page, build_gmail_search_query(search_keywords))

    read_count = await _read_inbox(page)
    if not read_count:
        logger.info("Gmail: chưa mở được thư nào, thử fallback đọc inbox một lần nữa")
        await _open_gmail_inbox(page)
        await random_delay(1.0, 2.0)
        read_count = await _read_inbox(page, require_search_fallback=False)

    composed = False
    if bait_emails:
        target = random.choice(bait_emails)
        composed = await _compose_email(page, target)

    if read_count or composed:
        logger.info("Hoàn thành tương tác Gmail")
        return True
    logger.info("Gmail: chưa hoàn thành vì không mở/đọc được thư nào")
    return False


async def _search_mail(page, query: str):
    """Search Gmail before reading inbox so empty Excel data still creates varied mail behavior."""
    try:
        search_box = page.locator(
            'input[aria-label*="Search mail"], input[aria-label*="Tìm kiếm trong thư"], '
            'input[name="q"], input[placeholder*="Search mail"], input[placeholder*="Tìm kiếm"]'
        ).first
        await search_box.wait_for(state="visible", timeout=8000)
        await move_to_locator(page, search_box)
        await random_delay(0.4, 1.0)

        if random.random() < 0.35:
            await search_box.click(click_count=3)
            await random_delay(0.2, 0.5)
        else:
            await search_box.click()

        await human_type(page, search_box, query, typo_rate=0.01)
        await random_delay(0.4, 1.2)
        await page.keyboard.press("Enter")
        logger.info("Gmail search: %s", query)
        await random_delay(2.0, 4.0)
        await dismiss_blocking_popups(page, "Gmail search")

        if random.random() < 0.45:
            await human_scroll(page, "down", random.randint(150, 420))
            await random_delay(1.0, 2.5)
    except Exception as exc:
        logger.debug("Không thể tìm kiếm trong Gmail: %s", exc)


async def _read_inbox(page, require_search_fallback: bool = True):
    """Open and read visible Gmail messages; fallback to Inbox if search is empty."""
    try:
        await random_delay(1.0, 2.0)
        await dismiss_blocking_popups(page, "Gmail inbox")
        rows = await _visible_mail_rows(page)
        if not rows:
            logger.info("Gmail: no visible mail rows after search, returning to Inbox")
            await _open_gmail_inbox(page)
            rows = await _visible_mail_rows(page)
        if not rows and require_search_fallback:
            await _open_gmail_primary_tab(page)
            await human_scroll(page, "up", random.randint(150, 350))
            await random_delay(0.8, 1.5)
            rows = await _visible_mail_rows(page)

        if not rows:
            logger.info("Gmail: no readable mail rows found, skipping mail read")
            return 0

        max_to_open = min(random.randint(1, 3), len(rows))
        to_open = random.sample(rows[:10], max_to_open)
        logger.info("Gmail: found %d visible mail rows, opening %d", len(rows), len(to_open))

        opened = 0
        for email_row in to_open:
            try:
                if page.is_closed():
                    break
                subject = await _open_mail_row(page, email_row)
                if not subject:
                    logger.debug("Gmail: row did not open a readable message")
                    continue
                logger.info("Gmail: reading mail%s", f" | subject={subject[:80]}" if subject else "")

                await human_scroll(page, "down", random.randint(200, 500))
                await random_delay(2.0, 4.0)

                if random.random() < 0.60:
                    await _star_email(page)
                if random.random() < 0.30:
                    await _reply_email(page)

                opened += 1
                await _return_to_mail_list(page)
                rows = await _visible_mail_rows(page)
                if not rows:
                    await _open_gmail_inbox(page)
                    rows = await _visible_mail_rows(page)
            except Exception as exc:
                logger.debug("Gmail: error while reading mail: %s", exc)
                await _return_to_mail_list(page)
        logger.info("Gmail: opened/read %d mail(s)", opened)
        return opened
    except Exception as exc:
        logger.debug("Gmail: inbox read failed: %s", exc)
        return 0


async def _visible_mail_rows(page):
    selectors = [
        'tr.zA.zE',
        'tr.zA',
        'tr[role="row"][jsmodel], tr[role="row"][tabindex]',
        'div[role="main"] div[role="listitem"]',
        'div[role="main"] div[role="option"]',
        'div[role="main"] [data-legacy-message-id]',
        'div[role="main"] tr[role="row"]',
        'div[role="main"] table[role="grid"] tr',
    ]
    for selector in selectors:
        try:
            rows = []
            for row in await page.locator(selector).all():
                try:
                    if await row.is_visible(timeout=500):
                        rows.append(row)
                except Exception:
                    continue
            if rows:
                return rows
        except Exception:
            continue
    return []


async def _open_mail_row(page, email_row) -> str:
    try:
        await email_row.scroll_into_view_if_needed(timeout=2000)
    except Exception:
        pass
    try:
        await move_to_locator(page, email_row)
        await random_delay(0.5, 1.0)
        await email_row.click()
        await random_delay(1.2, 2.2)
        subject = await _current_mail_subject(page)
        if subject:
            return subject
    except Exception as exc:
        logger.debug("Gmail: click row failed: %s", exc)

    for action_name in ("Enter", "double-click"):
        try:
            if action_name == "Enter":
                await page.keyboard.press("Enter")
            else:
                await email_row.dblclick(timeout=2500)
            await random_delay(1.2, 2.2)
            subject = await _current_mail_subject(page)
            if subject:
                return subject
        except Exception as exc:
            logger.debug("Gmail: %s row fallback failed: %s", action_name, exc)
    return ""


async def _open_gmail_primary_tab(page):
    try:
        primary = page.locator(
            'div[role="tab"]:has-text("Primary"), div[role="tab"]:has-text("Chính"), '
            'a[aria-label*="Primary"], a[aria-label*="Chính"]'
        ).first
        if await primary.is_visible(timeout=2500):
            await move_to_locator(page, primary)
            await random_delay(0.3, 0.7)
            await primary.click()
            await random_delay(1.0, 2.0)
    except Exception as exc:
        logger.debug("Gmail: could not open Primary tab: %s", exc)


async def _open_gmail_inbox(page):
    try:
        inbox = page.locator(
            'a[title*="Inbox"], a[aria-label*="Inbox"], '
            'div[role="button"]:has-text("Inbox")'
        ).first
        if await inbox.is_visible(timeout=3000):
            await move_to_locator(page, inbox)
            await random_delay(0.3, 0.8)
            await inbox.click()
        else:
            await page.goto("https://mail.google.com/mail/u/0/#inbox", wait_until="domcontentloaded", timeout=15000)
        await random_delay(2.0, 4.0)
    except Exception as exc:
        logger.debug("Gmail: could not open Inbox: %s", exc)


async def _return_to_mail_list(page):
    try:
        back_btn = page.locator(
            'div[aria-label*="Back to Inbox"], div[aria-label*="Back"], [data-tooltip*="Back"]'
        ).first
        if await back_btn.is_visible(timeout=1500):
            await move_to_locator(page, back_btn)
            await random_delay(0.2, 0.6)
            await back_btn.click()
        else:
            await page.go_back(wait_until="domcontentloaded", timeout=12000)
        await random_delay(1.0, 2.0)
    except Exception:
        try:
            await page.goto("https://mail.google.com/mail/u/0/#inbox", wait_until="domcontentloaded", timeout=15000)
            await random_delay(1.0, 2.0)
        except Exception:
            pass


async def _current_mail_subject(page) -> str:
    selectors = ['h2.hP', 'h2[data-thread-perm-id]', 'div[role="main"] h2']
    for selector in selectors:
        try:
            value = (await page.locator(selector).first.inner_text(timeout=1200)).strip()
            if value:
                return value
        except Exception:
            continue
    return ""

async def _star_email(page):
    try:
        star_btn = page.locator(
            'img[aria-label*="Not starred"], img[aria-label*="Chưa gắn sao"], '
            '[data-tooltip*="Star"], [aria-label="Star"]'
        ).first
        if await star_btn.is_visible(timeout=3000):
            await move_to_locator(page, star_btn)
            await random_delay(0.3, 0.7)
            await star_btn.click()
            logger.info("Đã gắn sao email")
            await random_delay(0.5, 1.0)
    except Exception as exc:
        logger.debug("Không gắn được sao: %s", exc)


async def _reply_email(page):
    try:
        reply_btn = page.locator(
            '[data-tooltip*="Reply"], button[aria-label*="Reply"], '
            'div[aria-label*="Reply"], span:has-text("Reply")'
        ).first
        if not await reply_btn.is_visible(timeout=3000):
            return
        await move_to_locator(page, reply_btn)
        await random_delay(0.4, 0.8)
        await reply_btn.click()
        await random_delay(1.0, 2.0)

        compose_area = page.locator(
            'div[aria-label*="Message Body"], div[role="textbox"]'
        ).last
        await compose_area.wait_for(state="visible", timeout=5000)
        reply_text = random.choice(_REPLY_TEMPLATES)
        await human_type(page, compose_area, reply_text, typo_rate=0.01)
        await random_delay(1.0, 2.0)

        if random.random() < 0.70:
            send_btn = page.locator(
                'div[aria-label*="Send"], button[aria-label*="Send"], '
                'div[data-tooltip*="Send"]'
            ).first
            if await send_btn.is_visible(timeout=3000):
                await move_to_locator(page, send_btn)
                await random_delay(0.5, 1.2)
                await send_btn.click()
                logger.info("Đã gửi reply email")
                await random_delay(1.0, 2.0)
        else:
            await page.keyboard.press("Escape")
            logger.debug("Soạn reply xong nhưng không gửi")
    except Exception as exc:
        logger.debug("Không thể reply email: %s", exc)


async def _compose_email(page, to_address: str) -> bool:
    """Soạn và gửi email mới tới to_address."""
    try:
        compose_btn = page.locator(
            'div[gh="cm"], div[role="button"]:has-text("Compose"), '
            'div[role="button"]:has-text("Soạn thư")'
        ).first
        await compose_btn.wait_for(state="visible", timeout=8000)
        await move_to_locator(page, compose_btn)
        await random_delay(0.4, 0.8)
        await compose_btn.click()
        await random_delay(1.0, 2.0)

        to_field = page.locator('input[aria-label*="To"], input[name="to"]').first
        await to_field.wait_for(state="visible", timeout=5000)
        await human_type(page, to_field, to_address, typo_rate=0.005)
        await page.keyboard.press("Tab")
        await random_delay(0.5, 1.0)

        subject_field = page.locator('input[aria-label*="Subject"], input[name="subjectbox"]').first
        await human_type(page, subject_field, random.choice(_EMAIL_SUBJECTS), typo_rate=0.01)
        await page.keyboard.press("Tab")
        await random_delay(0.5, 1.0)

        body = page.locator('div[aria-label*="Message Body"], div[role="textbox"]').last
        await human_type(page, body, random.choice(_EMAIL_BODIES), typo_rate=0.01)
        await random_delay(1.5, 3.0)

        if random.random() < 0.75:
            send_btn = page.locator(
                'div[aria-label*="Send"], button[aria-label*="Send"]'
            ).first
            if await send_btn.is_visible(timeout=3000):
                await move_to_locator(page, send_btn)
                await random_delay(0.5, 1.0)
                await send_btn.click()
                logger.info("Đã soạn và gửi email tới %s", to_address)
                await random_delay(1.5, 3.0)
                return True
        else:
            await page.keyboard.press("Escape")
            logger.debug("Soạn email nhưng không gửi (hành vi tự nhiên)")
            return True
    except Exception as exc:
        logger.debug("Không thể soạn email: %s", exc)
    return False
