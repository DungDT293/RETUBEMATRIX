"""Small tab coordination helpers for browser automation flows."""
from __future__ import annotations

import asyncio
import logging
import random
from typing import Any
from urllib.parse import urlparse

from actions.human_utils import move_to_locator

logger = logging.getLogger(__name__)


def _looks_like_url(text: str) -> bool:
    value = (text or "").strip()
    if not value or any(ch.isspace() for ch in value):
        return False
    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = parsed.netloc or parsed.path.split("/", 1)[0]
    return "." in host and not host.startswith(".") and not host.endswith(".")


def _normalize_url(text: str) -> str:
    value = text.strip()
    if "://" in value:
        return value
    return f"https://{value}"


class TabManager:
    """Track intended active tab and return tab for multi-tab actions.

    Playwright/CloakBrowser does not expose a single reliable "active tab" API,
    so automation should explicitly register every tab it opens or switches to.
    This helper keeps that state local to each workflow and emits clear logs.
    """

    def __init__(self, context: Any, main_page: Any, label: str = "TabManager"):
        self.context = context
        self.main_page = main_page
        self.current_page = main_page
        self.label = label
        self._labels: dict[int, str] = {id(main_page): "main"}

    def live_pages(self) -> list[Any]:
        return [page for page in self.context.pages if not page.is_closed()]

    def label_page(self, page: Any, label: str) -> Any:
        self._labels[id(page)] = label
        return page

    def page_label(self, page: Any) -> str:
        return self._labels.get(id(page), f"tab-{self._index_of(page)}")

    def _index_of(self, page: Any) -> int:
        try:
            return self.live_pages().index(page) + 1
        except ValueError:
            return -1

    def snapshot(self) -> set[Any]:
        return set(self.live_pages())

    def new_pages_since(self, before: set[Any]) -> list[Any]:
        return [page for page in self.live_pages() if page not in before]

    async def bring_to_front(self, page: Any, label: str | None = None) -> Any:
        if page is None or page.is_closed():
            logger.warning("%s: cannot switch because tab is closed", self.label)
            return page
        if label:
            self.label_page(page, label)
        await page.bring_to_front()
        self.current_page = page
        logger.info("%s: active tab=%s | url=%s", self.label, self.page_label(page), getattr(page, "url", ""))
        return page


    async def _type_address_text(self, page: Any, text: str) -> None:
        for char in text:
            await page.keyboard.type(char)
            await asyncio.sleep(random.uniform(0.035, 0.11))

    async def _type_url_in_address_bar(self, page: Any, url: str, *, timeout: int) -> None:
        logger.info("%s: type URL in address bar | url=%s", self.label, url)
        await page.keyboard.press("Control+l")
        await asyncio.sleep(random.uniform(0.2, 0.5))
        await page.keyboard.press("Control+a")
        await asyncio.sleep(random.uniform(0.1, 0.25))
        await self._type_address_text(page, url)
        await asyncio.sleep(random.uniform(0.2, 0.45))
        await page.keyboard.press("Enter")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=timeout)
        except Exception as exc:
            logger.debug("%s: typed URL load wait skipped: %s", self.label, exc)
        if getattr(page, "url", "") == "about:blank":
            logger.warning("%s: typed URL did not navigate, fallback goto url=%s", self.label, url)
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout)

    async def _search_google_from_home(self, page: Any, query: str, *, timeout: int) -> None:
        logger.info("%s: search via Google box | query=%s", self.label, query)
        await self._type_url_in_address_bar(page, "https://www.google.com/", timeout=timeout)
        await asyncio.sleep(random.uniform(1.0, 2.0))
        search_box = page.locator('textarea[name="q"], input[name="q"]').first
        try:
            await search_box.wait_for(state="visible", timeout=timeout)
            await move_to_locator(page, search_box)
            await asyncio.sleep(random.uniform(0.2, 0.5))
            await search_box.click()
            await asyncio.sleep(random.uniform(0.2, 0.5))
            await self._type_address_text(page, query)
            await asyncio.sleep(random.uniform(0.2, 0.45))
            await page.keyboard.press("Enter")
            await page.wait_for_load_state("domcontentloaded", timeout=timeout)
        except Exception as exc:
            logger.warning("%s: Google box search failed, fallback goto search URL: %s", self.label, exc)
            from urllib.parse import quote_plus
            await page.goto(f"https://www.google.com/search?q={quote_plus(query)}", wait_until="domcontentloaded", timeout=timeout)

    async def _wait_for_new_page(self, before: set[Any], timeout: float = 3.0) -> Any | None:
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            created = self.new_pages_since(before)
            if created:
                return created[-1]
            await asyncio.sleep(0.1)
        return None

    async def open_new_tab_human(self, source_page: Any, label: str, url: str | None = None, *, timeout: int = 20000) -> Any:
        before = self.snapshot()
        await self.bring_to_front(source_page, self.page_label(source_page))
        logger.info("%s: open tab by Ctrl+T label=%s", self.label, label)
        await source_page.keyboard.press("Control+t")
        page = await self._wait_for_new_page(before)
        if page is None:
            logger.warning("%s: Ctrl+T did not expose a new tab, fallback to context.new_page", self.label)
            page = await self.context.new_page()
        self.label_page(page, label)
        await self.bring_to_front(page, label)
        if url:
            target = url.strip()
            if _looks_like_url(target):
                await self._type_url_in_address_bar(page, _normalize_url(target), timeout=timeout)
            else:
                await self._search_google_from_home(page, target, timeout=timeout)
        return page

    async def open_new_tab(self, label: str, url: str | None = None, *, wait_until: str = "domcontentloaded", timeout: int = 20000) -> Any:
        page = await self.context.new_page()
        self.label_page(page, label)
        await self.bring_to_front(page)
        if url:
            logger.info("%s: %s open url=%s", self.label, label, url)
            await page.goto(url, wait_until=wait_until, timeout=timeout)
        return page

    async def close_tab(self, page: Any, *, return_to: Any | None = None, reason: str = "") -> None:
        label = self.page_label(page)
        if page is not None and not page.is_closed():
            logger.info("%s: close tab=%s%s", self.label, label, f" ({reason})" if reason else "")
            await page.close()
        if return_to is not None and not return_to.is_closed():
            await self.bring_to_front(return_to, self.page_label(return_to))

    async def close_new_pages_and_return(self, before: set[Any], return_to: Any, reason: str = "cleanup") -> None:
        for page in self.new_pages_since(before):
            if page is not return_to and not page.is_closed():
                await self.close_tab(page, reason=reason)
        if return_to is not None and not return_to.is_closed():
            await self.bring_to_front(return_to, self.page_label(return_to))
