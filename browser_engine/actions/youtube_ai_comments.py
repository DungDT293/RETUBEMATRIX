"""AI-assisted YouTube comment generation.

Generates a short, natural comment for the video currently open by sending the
video title/description (and a few visible comments) to a local
OpenAI-compatible endpoint. Everything is best-effort: any failure returns an
empty string so the caller can fall back to the manual comment pool.
"""
from __future__ import annotations

import json
import logging
import re

import aiohttp

from core import ai_comment_settings
from core import ai_provider_registry

logger = logging.getLogger(__name__)

_MAX_TITLE = 200
_MAX_DESCRIPTION = 600
_MAX_COMMENTS = 5
_MAX_COMMENT_LEN = 180
_REQUEST_TIMEOUT = 12

_BANNED_SUBSTRINGS = (
    "http://", "https://", "www.", ".com", ".net", "subscribe", "sub for sub",
    "follow me", "check my", "free money", "giveaway", "promo code",
)


def _clip(value: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


async def collect_video_context(page) -> dict:
    """Best-effort scrape of the current watch page metadata."""
    context = {"title": "", "description": "", "comments": []}
    try:
        data = await page.evaluate(
            """
            () => {
                const pick = (selectors) => {
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.textContent && el.textContent.trim()) {
                            return el.textContent.trim();
                        }
                    }
                    return "";
                };
                const title = pick([
                    'h1.ytd-watch-metadata yt-formatted-string',
                    'h1.title yt-formatted-string',
                    'h1.ytd-watch-metadata',
                ]);
                const description = pick([
                    'ytd-text-inline-expander #expanded',
                    'ytd-text-inline-expander #attributed-snippet-text',
                    '#description-inline-expander',
                    '#description',
                ]);
                const comments = Array.from(
                    document.querySelectorAll('ytd-comment-thread-renderer #content-text')
                )
                    .slice(0, 8)
                    .map((node) => (node.textContent || '').trim())
                    .filter(Boolean);
                return { title, description, comments };
            }
            """
        )
        if isinstance(data, dict):
            context["title"] = _clip(data.get("title"), _MAX_TITLE)
            context["description"] = _clip(data.get("description"), _MAX_DESCRIPTION)
            raw_comments = data.get("comments") or []
            cleaned = []
            for item in raw_comments:
                snippet = _clip(item, _MAX_COMMENT_LEN)
                if snippet:
                    cleaned.append(snippet)
                if len(cleaned) >= _MAX_COMMENTS:
                    break
            context["comments"] = cleaned
    except Exception as exc:
        logger.debug("Khong doc duoc ngu canh video cho AI comment: %s", exc)
    return context


def _build_messages(context: dict) -> list[dict]:
    title = context.get("title") or ""
    description = context.get("description") or ""
    comments = context.get("comments") or []
    comment_block = "\n".join(f"- {c}" for c in comments) if comments else "(none)"

    system_prompt = (
        "You write a single short, natural YouTube comment as a casual viewer. "
        "Match the language of the video title. Keep it under 120 characters, "
        "one sentence, friendly and specific to the content. "
        "No links, no hashtags, no emojis spam, no asking to subscribe, "
        "no self-promotion. Return only the comment text."
    )
    user_prompt = (
        f"Video title: {title}\n"
        f"Video description: {description}\n"
        f"Some existing comments:\n{comment_block}\n\n"
        "Write one short comment."
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _sanitize_comment(text: str) -> str:
    cleaned = _clip(text, _MAX_COMMENT_LEN)
    if not cleaned:
        return ""
    # Strip surrounding quotes the model may add.
    cleaned = cleaned.strip().strip('"').strip("'").strip()
    lowered = cleaned.lower()
    for banned in _BANNED_SUBSTRINGS:
        if banned in lowered:
            logger.debug("AI comment bi loai do chua cum cam: %s", banned)
            return ""
    if len(cleaned) < 2 or len(cleaned) > 120:
        return ""
    if "\n" in cleaned:
        cleaned = cleaned.split("\n", 1)[0].strip()
    return cleaned


async def generate_ai_comment(page, settings: dict | None = None) -> str:
    """Return an AI-generated comment, or "" on any failure."""
    cfg = settings or ai_comment_settings.get_settings()
    if not cfg.get("enabled"):
        return ""

    provider_id = str(cfg.get("provider_id") or "custom_openai_compatible").strip().lower()
    context = await collect_video_context(page)
    if not context.get("title") and not context.get("description"):
        logger.debug("Khong co ngu canh video, bo qua AI comment")
        return ""

    try:
        raw_text = await ai_provider_registry.generate_comment(
            provider_id,
            cfg,
            _build_messages(context),
        )
    except Exception as exc:
        logger.debug("Goi AI provider that bai: %s", exc)
        return ""

    comment = _sanitize_comment(raw_text)
    if comment:
        logger.info("AI tao comment YouTube: '%s'", comment)
    return comment
