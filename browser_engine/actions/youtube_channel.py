"""Scan and switch YouTube channels in the account menu."""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any

from actions.human_utils import random_delay

logger = logging.getLogger(__name__)


class PreferredYouTubeChannelError(RuntimeError):
    """Configured YouTube channel cannot be verified or selected."""


_MENU_SELECTOR = "ytd-multi-page-menu-renderer"
_SWITCH_ROW_SELECTOR = ", ".join(
    [
        "ytd-compact-link-renderer",
        "tp-yt-paper-item",
        "[role='menuitem']",
    ]
)
_ACCOUNT_ROW_SELECTOR = ", ".join(
    [
        "ytd-account-item-renderer",
        "[role='option']",
        "[role='menuitemradio']",
    ]
)
_SELECTED_ICON_SELECTOR = ", ".join(
    [
        "yt-icon[icon*='check']",
        "tp-yt-iron-icon[icon*='check']",
        "iron-icon[icon*='check']",
        "[aria-label*='check' i]",
    ]
)
_TICK_CHARS = "✓✔☑"
_IGNORE_ROW_WORDS = {
    "google account",
    "manage your google account",
    "quan ly tai khoan google",
    "sign out",
    "dang xuat",
    "appearance",
    "language",
    "location",
    "settings",
    "purchases",
    "youtube studio",
    "your data in youtube",
    "privacy",
    "help",
    "send feedback",
    "home",
    "trang chu",
    "shorts",
    "subscriptions",
    "kenh dang ky",
    "watch later",
    "xem sau",
    "liked videos",
    "video da thich",
    "downloads",
    "noi dung tai xuong",
    "youtube premium",
    "youtube music",
    "youtube kids",
}
_SWITCH_WORDS = (
    "switch account",
    "view all channels",
    "see all channels",
    "chuyen doi tai khoan",
    "xem tat ca kenh",
    "xem tat ca cac kenh",
)
_SELECTED_WORDS = (
    "current",
    "active",
    "dang dung",
    "dang su dung",
    "tai khoan hien tai",
    "kenh hien tai",
)
_CHANNEL_URL_TAB_SUFFIXES = {"videos", "featured", "shorts", "streams", "community", "about", "playlists"}
_HANDLE_RE = re.compile(r"(?<![\w.+-])@[\w.-]+", re.UNICODE)


def _strip_marks(value: str) -> str:
    raw = str(value or "").casefold().replace("đ", "d")
    return "".join(ch for ch in unicodedata.normalize("NFKD", raw) if not unicodedata.combining(ch))


def clean_youtube_channel_handle(value: str | None) -> str:
    """Clean a YouTube @handle while preserving display casing and accents."""
    raw = str(value or "").strip()
    if not raw.startswith("@"):
        return ""
    return unicodedata.normalize("NFC", "@" + re.sub(r"\s+", "", raw[1:]))


def normalize_youtube_channel_handle(value: str | None) -> str:
    return clean_youtube_channel_handle(value).casefold()


def normalize_youtube_channel_selector(value: str | None) -> str:
    """Normalize a channel name, @handle, or YouTube channel URL for matching."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    handle = _HANDLE_RE.search(raw)
    if handle:
        return normalize_youtube_channel_handle(handle.group(0))
    urlish = raw.replace("\\", "/")
    if "youtube.com/" in urlish or "youtu.be/" in urlish:
        urlish = urlish.split("?", 1)[0].split("#", 1)[0].rstrip("/")
        parts = [part for part in urlish.split("/") if part]
        if parts and parts[-1].casefold() in _CHANNEL_URL_TAB_SUFFIXES:
            parts.pop()
        if len(parts) >= 2 and parts[-2].casefold() in {"channel", "c", "user"}:
            raw = parts[-1]
        elif parts and parts[-1] not in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
            raw = parts[-1]
    normalized = _strip_marks(raw)
    normalized = re.sub(r"[^a-z0-9@._ -]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def parse_youtube_channel_text(text: str) -> dict[str, Any] | None:
    """Parse one YouTube account-menu row into name/handle metadata."""
    lines = [line.strip() for line in str(text or "").splitlines() if line.strip()]
    if not lines:
        return None
    joined = _strip_marks(" ".join(lines))
    handle = ""
    for line in lines:
        match = _HANDLE_RE.search(line)
        if match:
            handle = clean_youtube_channel_handle(match.group(0))
            break
    if not handle and (any(word in joined for word in _IGNORE_ROW_WORDS) or re.search(r"\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b", joined)):
        return None
    name = ""
    for line in lines:
        clean_line = line.strip(_TICK_CHARS).strip()
        if clean_line.startswith("@"):
            continue
        line_key = _strip_marks(clean_line)
        if not line_key:
            continue
        if any(word in line_key for word in _SWITCH_WORDS) or any(word in line_key for word in _SELECTED_WORDS):
            continue
        name = clean_line
        break
    if not name and handle:
        name = handle
    if not name:
        return None
    return {"name": name, "handle": handle, "selected": any(mark in joined for mark in _TICK_CHARS)}


def _channel_key(channel: dict[str, Any]) -> str:
    return normalize_youtube_channel_selector(channel.get("handle") or channel.get("name") or "")


def _matches(channel: dict[str, Any], target: str) -> bool:
    return target in {
        normalize_youtube_channel_selector(channel.get("handle")),
        normalize_youtube_channel_selector(channel.get("name")),
        _channel_key(channel),
    }


def _partial_matches(channel: dict[str, Any], target: str) -> bool:
    values = [
        normalize_youtube_channel_selector(channel.get("handle")),
        normalize_youtube_channel_selector(channel.get("name")),
    ]
    return any(value and target and (target in value or value in target) for value in values)


def _unique_channel_match(channels: list[dict[str, Any]], target: str) -> dict[str, Any] | None:
    exact = [channel for channel in channels if _matches(channel, target)]
    matches = exact or [channel for channel in channels if _partial_matches(channel, target)]
    if len(matches) != 1:
        return None
    return matches[0]


async def _close_menu(page) -> None:
    try:
        await page.keyboard.press("Escape")
    except Exception:
        pass


async def _open_account_menu(page) -> None:
    try:
        await page.keyboard.press("Escape")
        await random_delay(0.2, 0.4)
    except Exception:
        pass

    # Kiểm tra trạng thái đăng nhập trước khi chờ nút Account
    url = page.url.lower()
    login_signals = ["accounts.google.com/servicelogin", "accounts.google.com/signin",
                     "accounts.google.com/v3/signin", "accounts.google.com/interactivelogin"]
    for sig in login_signals:
        if sig in url:
            raise RuntimeError(
                "Profile chưa đăng nhập YouTube. Vui lòng mở Hồ sơ trình duyệt (Profile) → "
                "đăng nhập Google/YouTube Studio trước, sau đó thử lại."
            )

    avatar = page.locator("#avatar-btn, button[aria-label*='Account'], button[aria-label*='account']").first
    try:
        await avatar.wait_for(state="visible", timeout=25000)
    except Exception:
        # Nếu avatar không hiện sau 25s, kiểm tra lại xem có bị redirect login không
        current_url = page.url.lower()
        for sig in login_signals:
            if sig in current_url:
                raise RuntimeError(
                    "Profile chưa đăng nhập YouTube. Trình duyệt đã chuyển sang trang đăng nhập Google. "
                    "Vui lòng mở Hồ sơ trình duyệt → đăng nhập trước, sau đó thử lại."
                )
        raise RuntimeError(
            f"Không tìm thấy nút tài khoản (avatar) sau 25 giây. "
            f"Trang hiện tại: {page.url[:120]}. "
            f"Có thể profile chưa đăng nhập hoặc YouTube đang tải chậm."
        )
    await avatar.click()
    await random_delay(0.8, 1.4)


async def _visible_menus(page) -> list[Any]:
    visible = []
    for menu in await page.locator(_MENU_SELECTOR).all():
        try:
            if await menu.is_visible(timeout=250):
                visible.append(menu)
        except Exception:
            continue
    return visible


async def _visible_account_panel(page):
    for _ in range(10):
        for menu in reversed(await _visible_menus(page)):
            for row in await menu.locator(_ACCOUNT_ROW_SELECTOR).all():
                try:
                    if await row.is_visible(timeout=250):
                        return menu
                except Exception:
                    continue
        await random_delay(0.2, 0.4)
    return None


async def _click_switcher_if_present(page):
    for menu in reversed(await _visible_menus(page)):
        rows = await menu.locator(_SWITCH_ROW_SELECTOR).all()
        for row in rows:
            try:
                if not await row.is_visible(timeout=250):
                    continue
                text = _strip_marks(await row.inner_text())
            except Exception:
                continue
            if any(word in text for word in _SWITCH_WORDS):
                try:
                    await row.click()
                    await page.locator(_MENU_SELECTOR).wait_for(state="visible", timeout=10000)
                    await random_delay(0.8, 1.4)
                    return await _visible_account_panel(page)
                except Exception as exc:
                    logger.info("Cannot open YouTube channel switcher: %s", exc)
                    return None
    return None


async def _row_is_selected(row, text_key: str) -> bool:
    if any(mark in text_key for mark in _TICK_CHARS):
        return True
    try:
        if await row.locator(_SELECTED_ICON_SELECTOR).first.is_visible(timeout=250):
            return True
    except Exception:
        pass
    return False


async def _collect_channel_rows(panel) -> list[dict[str, Any]]:
    rows = await panel.locator(_ACCOUNT_ROW_SELECTOR).all()
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        try:
            if not await row.is_visible(timeout=250):
                continue
            text = await row.inner_text()
            parsed = parse_youtube_channel_text(text)
            text_key = _strip_marks(text)
        except Exception:
            continue
        if not parsed:
            continue
        parsed["selected"] = await _row_is_selected(row, text_key)
        key = _channel_key(parsed)
        if not key or key in seen:
            continue
        seen.add(key)
        parsed["_locator"] = row
        result.append(parsed)
    return result


async def _collect_channels_from_menu(page) -> list[dict[str, Any]]:
    await _open_account_menu(page)
    panel = await _click_switcher_if_present(page)
    if panel is None:
        logger.info("YouTube Switch account menu not found")
        return []
    return await _collect_channel_rows(panel)


def _public_channel(channel: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": str(channel.get("name") or ""),
        "handle": str(channel.get("handle") or ""),
        "selected": bool(channel.get("selected")),
    }


async def scan_youtube_channels(page) -> list[dict[str, Any]]:
    """Return channels visible in YouTube account/switch-account menu."""
    channels = await _collect_channels_from_menu(page)
    await _close_menu(page)
    return [_public_channel(channel) for channel in channels]


async def ensure_preferred_youtube_channel(page, preferred_channel: str | None) -> bool:
    """Switch to the configured YouTube channel. False means caller must stop."""
    target = normalize_youtube_channel_selector(preferred_channel)
    if not target:
        return True
    channels = await _collect_channels_from_menu(page)
    selected = _unique_channel_match(channels, target)
    if selected is None:
        logger.error("Preferred YouTube channel not found or ambiguous: %s", preferred_channel)
        await _close_menu(page)
        return False
    label = selected.get("handle") or selected.get("name")
    if selected.get("selected"):
        logger.info("Preferred YouTube channel already active: %s", label)
        await _close_menu(page)
        return True
    try:
        await selected["_locator"].click()
        logger.info("Switched YouTube channel to: %s", label)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=20000)
        except Exception:
            pass
        await random_delay(2.0, 4.0)
        verified = _unique_channel_match(await _collect_channels_from_menu(page), target)
        await _close_menu(page)
        if verified and verified.get("selected"):
            return True
        logger.error("YouTube channel switch did not become active: %s", preferred_channel)
        return False
    except Exception as exc:
        logger.error("Cannot switch YouTube channel to %s: %s", preferred_channel, exc)
        await _close_menu(page)
        return False
