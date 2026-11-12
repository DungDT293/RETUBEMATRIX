import asyncio
import contextlib
import logging
import random
import re
import time
import unicodedata

from actions.human_utils import (
    human_read_and_scroll, human_type, random_delay,
    move_mouse_to, move_to_locator, human_scroll, YOUTUBE_KEYWORDS,
    try_skip_ad, maybe_fullscreen, maybe_theater_mode,
    maybe_seek_video, maybe_pause_resume, maybe_change_quality,
    maybe_like_video, maybe_comment_video, exit_fullscreen_if_active,
    maybe_switch_tab, maybe_open_new_tab_and_close,
    maybe_handle_notification_popup,
)
from actions.page_context import ensure_on_youtube, where_am_i, PageContextError, dismiss_blocking_popups
from actions.youtube_channel import (
    PreferredYouTubeChannelError,
    ensure_preferred_youtube_channel,
)
try:
    from core.youtube_watch_history import record_youtube_watch
except ImportError:  # pragma: no cover - optional telemetry helper
    def record_youtube_watch(*_args, **_kwargs):
        return None

logger = logging.getLogger(__name__)

_MAX_HUNT_SCROLLS = 5
_MAX_COMPETITOR_FAILURES_PER_SESSION = 2
_MAX_SEARCH_FAILURES_PER_TOPIC = 2
_SPONSORED_CARD_SELECTOR = (
    "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, "
    "ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, "
    "ytd-display-ad-renderer, [aria-label*='Sponsored' i], "
    "[aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], "
    "[class*='sponsored' i], [class*='promoted' i]"
)
_COMMON_TITLE_WORDS = {
    "the", "and", "for", "with", "you", "your", "this", "that", "from", "how",
    "new", "best", "top", "video", "official", "full", "episode", "part", "2024", "2025", "2026",
    "cua", "cho", "voi", "moi", "hay", "nhat", "video", "tap", "phan",
}


class _YouTubeSearchSurfaceUnavailable(RuntimeError):
    """Search input is unavailable; retrying keywords cannot recover the surface."""


_SEARCH_SURFACE_UNAVAILABLE = object()


def _sponsored_card_script() -> str:
    return f"""
        (el, markerSelector) => {{
            const card = el.closest(
                'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, '
                + 'ytd-grid-video-renderer, ytd-rich-grid-media, ytd-ad-slot-renderer, '
                + 'ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, '
                + 'ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer'
            ) || el;
            if (card.matches(markerSelector) || card.querySelector(markerSelector)) return true;
            const text = (card.innerText || card.textContent || '').toLowerCase();
            return ['sponsored', 'promoted', 'advertisement', 'quảng cáo'].some(marker => text.includes(marker));
        }}
    """


async def _is_sponsored_video_link(link) -> bool:
    """Reject feed candidates marked as sponsored/promoted by YouTube."""
    try:
        return bool(await link.evaluate(_sponsored_card_script(), _SPONSORED_CARD_SELECTOR))
    except Exception:
        return True


async def _collect_feed_video_candidates(video_links, limit: int, source: str) -> list[dict]:
    """Collect organic YouTube watch links from a homepage-style feed."""
    candidates = []
    for link in video_links[:limit]:
        href = await link.get_attribute("href")
        if not href or "/watch?v=" not in href or "/shorts/" in href:
            continue
        if await _is_sponsored_video_link(link):
            logger.info("Bỏ qua video sponsored ở %s", source)
            continue
        try:
            title = (await link.inner_text()).strip()
        except Exception:
            title = ""
        candidates.append({"link": link, "title": title})
    return candidates


def _normalize_title_match_text(text: str) -> str:
    """Normalize text for safe local title matching (no DOM injection)."""
    raw = str(text or "").lower()
    no_marks = "".join(
        ch for ch in unicodedata.normalize("NFKD", raw)
        if not unicodedata.combining(ch)
    )
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]+", " ", no_marks)).strip()


def _compact_title_match_text(text: str) -> str:
    """Remove layout whitespace so CJK titles match visual separators."""
    return re.sub(r"\s+", "", _normalize_title_match_text(text))


def _keyword_tokens(keyword: str) -> list[str]:
    norm = _normalize_title_match_text(keyword)
    return [tok for tok in norm.split() if len(tok) >= 2 and tok not in _COMMON_TITLE_WORDS]


def _title_matches_keywords(title: str, keywords: list[str] | None) -> bool:
    """Return True when a YouTube title is relevant to at least one keyword.

    Strong match: title contains the whole keyword phrase. Soft match: title
    contains enough meaningful tokens from one keyword. This avoids clicking
    unrelated sidebar/homepage videos while keeping natural browsing behavior.
    """
    if not keywords:
        return True
    norm_title = _normalize_title_match_text(title)
    compact_title = _compact_title_match_text(title)
    if not norm_title:
        return False
    for keyword in keywords:
        norm_kw = _normalize_title_match_text(keyword)
        compact_kw = _compact_title_match_text(keyword)
        if not norm_kw:
            continue
        if norm_kw in norm_title or compact_kw in compact_title:
            return True
        toks = _keyword_tokens(keyword)
        if not toks:
            continue
        matching_count = sum(1 for tok in toks if tok in norm_title)
        min_required = 2 if len(toks) >= 3 else 1
        if matching_count >= min_required:
            return True
    return False


def _filter_video_candidates_by_keywords(candidates: list[dict], keywords: list[str] | None) -> list[dict]:
    if not keywords:
        return candidates
    kept = [c for c in candidates if _title_matches_keywords(str(c.get("title") or ""), keywords)]
    if candidates and not kept:
        logger.info("Bỏ qua %d video vì tiêu đề không khớp keyword", len(candidates))
    return kept


def _sanitize_competitor_channel_urls(raw) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, str):
        parts = re.split(r"[\n,|]+", raw)
    elif isinstance(raw, (list, tuple)):
        parts = [str(x) for x in raw]
    else:
        parts = []
    urls: list[str] = []
    for part in parts:
        url = str(part or "").strip()
        if not url:
            continue
        if not url.startswith(("http://", "https://")):
            url = "https://www.youtube.com/" + url.lstrip("/")
        if "youtube.com" not in url and "youtu.be" not in url:
            continue
        urls.append(url)
    return urls[:20]


def _choose_watch_seconds(video_duration_seconds: float | None = None) -> float:
    """Pick a less rigid watch time, biased by real video duration when available."""
    try:
        duration = float(video_duration_seconds or 0)
    except (TypeError, ValueError):
        duration = 0.0

    if duration <= 0:
        return random.uniform(60, 180)

    if duration <= 120:
        low = max(12.0, duration * 0.60)
        high = max(low, duration * 0.95)
        return min(duration, random.uniform(low, high))

    if duration <= 600:
        low = min(duration * 0.35, 90.0)
        high = min(duration * 0.75, 240.0)
        high = max(low, high)
        return min(duration, random.uniform(low, high))

    return random.uniform(90, min(420, max(120, duration * 0.35)))


async def _get_video_duration_seconds(page) -> float | None:
    try:
        duration = await page.evaluate(
            """
            () => {
                const video = document.querySelector('video');
                if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return null;
                return video.duration;
            }
            """
        )
        return float(duration) if duration else None
    except Exception:
        return None


async def _record_current_video(page, source: str, planned_seconds: float) -> None:
    try:
        title = await page.title()
    except Exception:
        title = ""
    try:
        url = str(page.url or "")
    except Exception:
        url = ""
    if not title and not url:
        return
    record_youtube_watch(title=title, url=url, source=source, planned_seconds=planned_seconds)

# Filter chips hiển thị dưới thanh tìm kiếm YouTube homepage
_YT_FILTER_CHIPS = [
    "Âm nhạc", "Trò chơi", "Podcast", "Trực tiếp", "Du lịch",
    "Hoạt ảnh", "Bóng đá", "Mới tải lên gần đây", "Đề xuất mới",
    "Music", "Gaming", "News", "Live", "Podcasts", "Sports",
]

# Mục Khám phá trong sidebar
_YT_EXPLORE_ITEMS = ["Âm nhạc", "Trò chơi", "Tin tức", "Music", "Gaming", "News", "Sports"]


_DEFAULT_ENGAGEMENT = {
    "like_rate": 0.20,
    "comment_rate": 0.08,
    "comment_pool": None,
}

_PLAYER_DEFAULT_PROBABILITIES = {
    "skip_ad_rate": 0.80,
    "fullscreen_rate": 0.04,
    "theater_rate": 0.08,
    "seek_rate": 0.10,
    "pause_rate": 0.06,
    "quality_rate": 0.08,
    "comment_scroll_rate": 0.25,
}
_PLAYER_ACTIONS = (
    ("seek", "seek_rate"),
    ("pause", "pause_rate"),
    ("quality", "quality_rate"),
    ("theater", "theater_rate"),
    ("fullscreen", "fullscreen_rate"),
)

# Per-iteration overhead estimate (search/related click + load + interactions
# before/after watch). Used to size watch caps when scheduling multiple keywords.
_PER_ITER_OVERHEAD_SECONDS = 35.0
_MIN_WATCH_PER_ITER = 45.0
_DURATION_FRACTION_TARGET_MIN_SECONDS = 1800.0
_DURATION_FRACTION_TARGET_MAX_SECONDS = 2700.0
_DURATION_MIN_VIDEO_FRACTION = 0.40


def _duration_mode_min_watch_seconds(target_duration_seconds: int | float) -> float:
    """Return a watch floor that scales with the user's selected duration."""
    try:
        target = float(target_duration_seconds or 0)
    except (TypeError, ValueError):
        target = 0.0
    if target <= 0:
        return _MIN_WATCH_PER_ITER
    if target < 90:
        return 15.0
    if target < 180:
        return 25.0
    return _MIN_WATCH_PER_ITER


def _duration_mode_safety_margin_seconds(target_duration_seconds: int | float) -> float:
    try:
        target = float(target_duration_seconds or 0)
    except (TypeError, ValueError):
        target = 0.0
    if target < 120:
        return 10.0
    if target < 300:
        return 18.0
    return 25.0


def _duration_mode_target_video_count(target_duration_seconds: int | float) -> int:
    try:
        target = float(target_duration_seconds or 0)
    except (TypeError, ValueError):
        return 0
    if target >= 2700:
        return 4
    if target >= 1800:
        return 3
    return 0


def _duration_mode_watch_floor_seconds(
    remaining_seconds: float,
    planned_video_count: int,
    videos_opened: int,
    min_watch_seconds: float,
    safety_margin_seconds: float,
) -> float:
    """Plan current watch time so duration mode does not end after short natural watches."""
    try:
        remaining = max(0.0, float(remaining_seconds or 0.0))
    except (TypeError, ValueError):
        remaining = 0.0
    planned_total = max(1, int(planned_video_count or 1))
    completed_before_current = max(0, int(videos_opened or 0) - 1)
    planned_left = max(1, planned_total - completed_before_current)
    future_transitions = max(0, planned_left - 1)
    available = max(
        0.0,
        remaining - float(safety_margin_seconds or 0.0) - (_PER_ITER_OVERHEAD_SECONDS * future_transitions),
    )
    return max(float(min_watch_seconds or 0.0), available / planned_left)


def _search_budget_seconds(
    remaining_seconds: float,
    target_duration_seconds: int | float,
    min_watch_seconds: float,
    safety_margin_seconds: float,
    videos_opened: int = 1,
) -> float:
    """Bound one search so it cannot consume an entire user-selected session."""
    try:
        remaining = max(0.0, float(remaining_seconds or 0.0))
    except (TypeError, ValueError):
        remaining = 0.0
    try:
        target = max(0.0, float(target_duration_seconds or 0.0))
    except (TypeError, ValueError):
        target = 0.0
    available = max(0.0, remaining - float(min_watch_seconds or 0.0) - float(safety_margin_seconds or 0.0))
    if available <= 0:
        if videos_opened <= 0 and remaining >= 18.0:
            # Chưa mở video nào trong phiên: phân bổ ngân sách tối thiểu để chắc chắn tìm và xem được video
            available = min(35.0, remaining - 12.0)
        else:
            return 0.0
    # Short sessions need decisive searches; longer sessions can spend more time
    # browsing results, but never more than about a quarter of the requested run.
    target_cap = max(25.0, target * 0.25) if target else 75.0
    return min(90.0, target_cap, available)


def _remaining_deadline_seconds(deadline: float | None) -> float | None:
    if deadline is None:
        return None
    return max(0.0, float(deadline) - time.monotonic())


def _deadline_expired(deadline: float | None, *, grace: float = 0.0) -> bool:
    remaining = _remaining_deadline_seconds(deadline)
    return remaining is not None and remaining <= grace


def _deadline_timeout_ms(deadline: float | None, fallback_ms: int) -> int:
    remaining = _remaining_deadline_seconds(deadline)
    if remaining is None:
        return fallback_ms
    return max(1, min(int(fallback_ms), int(remaining * 1000)))


def _consume_background_task_result(task: asyncio.Future) -> None:
    with contextlib.suppress(asyncio.CancelledError, Exception):
        task.result()


async def _await_with_deadline(awaitable, deadline: float | None):
    remaining = _remaining_deadline_seconds(deadline)
    if remaining is None:
        return await awaitable
    if remaining <= 0:
        if hasattr(awaitable, "close"):
            awaitable.close()
        raise asyncio.TimeoutError
    task = asyncio.ensure_future(awaitable)
    done, _pending = await asyncio.wait({task}, timeout=remaining)
    if done:
        return task.result()
    task.cancel()
    task.add_done_callback(_consume_background_task_result)
    raise asyncio.TimeoutError


def _is_youtube_watch_url(url: str) -> bool:
    raw = str(url or "").lower()
    return "youtube." in raw and "/watch" in raw and re.search(r"[?&]v=[^&]+", raw) is not None


def _is_youtube_home_url(url: str) -> bool:
    raw = str(url or "").strip().lower()
    return re.fullmatch(r"https?://(?:www\.)?youtube\.com/?(?:[?#].*)?", raw) is not None


def _youtube_video_id(value: str | None) -> str:
    try:
        match = re.search(r"[?&]v=([^&]+)", str(value or ""))
        return match.group(1) if match else ""
    except Exception:
        return ""


def _youtube_search_box(page):
    return page.locator(
        "yt-searchbox input#search:visible, "
        "ytd-searchbox input#search:visible, "
        "form#search-form input[name='search_query']:visible, "
        "yt-searchbox input:visible, "
        "ytd-searchbox input:visible, "
        "input#search:visible, "
        "input[name='search_query']:visible, "
        "#center input:visible"
    ).first


def _filter_video_candidates_by_excluded_ids(candidates: list[dict], exclude_video_ids: set[str] | None) -> list[dict]:
    if not exclude_video_ids:
        return candidates
    kept = [
        candidate for candidate in candidates
        if (_youtube_video_id(candidate.get("href")) or str(candidate.get("videoId") or "")) not in exclude_video_ids
    ]
    if candidates and not kept:
        logger.info("Bỏ qua %d video vì đã xem trong phiên", len(candidates))
    return kept


def _choose_search_topic(
    topics: list[str],
    pending_topics: list[str],
    last_topic: str = "",
    exhausted_topics: set[str] | None = None,
) -> str:
    exhausted_topics = exhausted_topics or set()
    if pending_topics:
        for topic in pending_topics:
            if topic not in exhausted_topics:
                return topic
    if topics:
        choices = [topic for topic in topics if topic != last_topic and topic not in exhausted_topics]
        if choices:
            return random.choice(choices)
        choices = [topic for topic in topics if topic not in exhausted_topics]
        return random.choice(choices) if choices else ""
    return ""


def _player_probability(player_behavior: dict | None, key: str) -> float | None:
    if not isinstance(player_behavior, dict):
        return None
    if player_behavior.get("force_low_probability_player_actions"):
        return 1.0
    value = player_behavior.get(key)
    if value is None:
        boost = player_behavior.get("player_probability_boost")
        if boost is None:
            return None
        try:
            return max(0.0, min(1.0, _PLAYER_DEFAULT_PROBABILITIES.get(key, 0.0) * float(boost)))
        except (TypeError, ValueError):
            return None
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return None


def _player_action_probability(player_behavior: dict | None, key: str) -> float:
    override = _player_probability(player_behavior, key)
    if override is None:
        return _PLAYER_DEFAULT_PROBABILITIES.get(key, 0.0)
    return override


def _player_action_budget(player_behavior: dict | None) -> int:
    if isinstance(player_behavior, dict) and player_behavior.get("force_low_probability_player_actions"):
        return len(_PLAYER_ACTIONS)
    return random.randint(0, 2)


def _select_player_actions(player_behavior: dict | None) -> list[str]:
    budget = _player_action_budget(player_behavior)
    actions = list(_PLAYER_ACTIONS)
    random.shuffle(actions)
    selected: list[str] = []
    for action, key in actions:
        if len(selected) >= budget:
            break
        if random.random() < _player_action_probability(player_behavior, key):
            selected.append(action)
    return selected


async def _run_player_action(page, action: str) -> None:
    if action == "seek":
        await maybe_seek_video(page, probability=1.0)
    elif action == "pause":
        await maybe_pause_resume(page, probability=1.0)
    elif action == "quality":
        await maybe_change_quality(page, probability=1.0)
    elif action == "theater":
        await maybe_theater_mode(page, probability=1.0)
    elif action == "fullscreen":
        await maybe_fullscreen(page, probability=1.0)


async def _ensure_youtube_surface_for_search(
    page,
    reason: str = "",
    *,
    force_home: bool = False,
    require_search_box: bool = False,
    deadline: float | None = None,
) -> bool:
    """Ensure YouTube has a usable search or feed surface."""
    started = time.monotonic()
    try:
        if _deadline_expired(deadline):
            return False
        current_url = str(getattr(page, "url", "") or "")
        already_home = force_home and _is_youtube_home_url(current_url)
        already_youtube = "youtube.com" in current_url.lower()
        if not already_youtube:
            await _await_with_deadline(ensure_on_youtube(page), deadline)
            try:
                await _await_with_deadline(
                    page.wait_for_load_state("domcontentloaded", timeout=_deadline_timeout_ms(deadline, 10000)),
                    deadline,
                )
            except Exception as exc:
                logger.info(
                    "YouTube search load wait skipped | reason=%s | error_type=%s | error=%r | url=%s",
                    reason,
                    type(exc).__name__,
                    exc,
                    getattr(page, "url", ""),
                )
        if force_home:
            if already_home:
                logger.info(
                    "YouTube search phase | phase=surface_home_ready | reason=%s | url=%s | skip=duplicate_ensure | remaining=%.1fs",
                    reason,
                    getattr(page, "url", ""),
                    _remaining_deadline_seconds(deadline) or 0.0,
                )
            elif already_youtube:
                logger.info(
                    "YouTube search phase | phase=home_reset | reason=%s | url=%s | skip=duplicate_ensure | remaining=%.1fs",
                    reason,
                    getattr(page, "url", ""),
                    _remaining_deadline_seconds(deadline) or 0.0,
                )
                await _await_with_deadline(page.keyboard.press("Escape"), deadline)
                await _await_with_deadline(random_delay(0.3, 0.7), deadline)
                home_logo = page.locator("a#logo, ytd-topbar-logo-renderer a").first
                try:
                    if await _await_with_deadline(
                        home_logo.is_visible(timeout=_deadline_timeout_ms(deadline, 2000)), deadline
                    ):
                        await _await_with_deadline(move_to_locator(page, home_logo), deadline)
                        await _await_with_deadline(random_delay(0.2, 0.5), deadline)
                        await _await_with_deadline(
                            home_logo.click(timeout=_deadline_timeout_ms(deadline, 3000)), deadline
                        )
                    else:
                        raise RuntimeError("YouTube home logo is not visible")
                except Exception as exc:
                    logger.info(
                        "YouTube home reset failed | reason=%s | error_type=%s | error=%r | url=%s",
                        reason, type(exc).__name__, exc, getattr(page, "url", ""),
                    )
                    await _await_with_deadline(
                        page.goto(
                            "https://www.youtube.com/",
                            wait_until="commit",
                            timeout=_deadline_timeout_ms(deadline, 20000),
                        ),
                        deadline,
                    )
                    try:
                        await _await_with_deadline(
                            page.wait_for_load_state(
                                "domcontentloaded",
                                timeout=_deadline_timeout_ms(deadline, 10000),
                            ),
                            deadline,
                        )
                    except Exception as load_exc:
                        logger.info(
                            "YouTube search load wait skipped | phase=home_reset | reason=%s | error_type=%s | error=%r | url=%s",
                            reason,
                            type(load_exc).__name__,
                            load_exc,
                            getattr(page, "url", ""),
                        )
                await _await_with_deadline(random_delay(1.5, 2.5), deadline)
                await _await_with_deadline(dismiss_blocking_popups(page, "YouTube"), deadline)
            else:
                if _deadline_expired(deadline):
                    return False
                logger.info(
                    "YouTube search phase | phase=home | reason=%s | url=%s",
                    reason,
                    getattr(page, "url", ""),
                )
                await _await_with_deadline(page.keyboard.press("Escape"), deadline)
                await _await_with_deadline(random_delay(0.3, 0.7), deadline)
                home_opened = False
                if _is_youtube_home_url(getattr(page, "url", "")):
                    home_opened = True
                else:
                    try:
                        home_logo = page.locator("a#logo, ytd-topbar-logo-renderer a").first
                        if await _await_with_deadline(
                            home_logo.is_visible(timeout=_deadline_timeout_ms(deadline, 2000)), deadline
                        ):
                            await _await_with_deadline(move_to_locator(page, home_logo), deadline)
                            await _await_with_deadline(random_delay(0.2, 0.5), deadline)
                            await _await_with_deadline(
                                home_logo.click(timeout=_deadline_timeout_ms(deadline, 3000)), deadline
                            )
                            home_opened = True
                    except Exception as exc:
                        logger.info(
                            "YouTube home logo click failed; using Home fallback | reason=%s | error_type=%s | error=%r",
                            reason, type(exc).__name__, exc,
                        )
                    if not home_opened:
                        await _await_with_deadline(
                            page.goto(
                                "https://www.youtube.com/",
                                wait_until="domcontentloaded",
                                timeout=_deadline_timeout_ms(deadline, 20000),
                            ),
                            deadline,
                        )
                await _await_with_deadline(random_delay(1.5, 2.5), deadline)
                await _await_with_deadline(dismiss_blocking_popups(page, "YouTube"), deadline)
        search_box = _youtube_search_box(page)
        if require_search_box:
            logger.info(
                "YouTube search phase | phase=surface_wait | reason=%s | url=%s | remaining=%.1fs",
                reason,
                getattr(page, "url", ""),
                _remaining_deadline_seconds(deadline) or 0.0,
            )
            try:
                await _await_with_deadline(
                    search_box.wait_for(state="visible", timeout=min(_deadline_timeout_ms(deadline, 10000), 10000)),
                    deadline,
                )
                logger.info(
                    "YouTube search phase | phase=surface_ready | reason=%s | url=%s | elapsed=%.1fs | remaining=%.1fs",
                    reason,
                    getattr(page, "url", ""),
                    time.monotonic() - started,
                    _remaining_deadline_seconds(deadline) or 0.0,
                )
                return True
            except Exception as exc:
                logger.info(
                    "YouTube search input unavailable | reason=%s | phase=search_input_wait | url=%s | error_type=%s | error=%r | elapsed=%.1fs | remaining=%.1fs",
                    reason,
                    getattr(page, "url", ""),
                    type(exc).__name__,
                    exc,
                    time.monotonic() - started,
                    _remaining_deadline_seconds(deadline) or 0.0,
                )
                if _deadline_expired(deadline, grace=2.0) or not _is_youtube_home_url(getattr(page, "url", "")):
                    logger.info(
                        "YouTube search phase | phase=surface_unavailable | reason=%s | url=%s | remaining=%.1fs",
                        reason,
                        getattr(page, "url", ""),
                        _remaining_deadline_seconds(deadline) or 0.0,
                    )
                    return False
                try:
                    logger.info(
                        "YouTube search phase | phase=surface_recovery | reason=%s | url=%s | remaining=%.1fs",
                        reason,
                        getattr(page, "url", ""),
                        _remaining_deadline_seconds(deadline) or 0.0,
                    )
                    await _await_with_deadline(
                        page.goto(
                            "https://www.youtube.com/",
                            wait_until="commit",
                            timeout=_deadline_timeout_ms(deadline, 10000),
                        ),
                        deadline,
                    )
                    search_box = _youtube_search_box(page)
                    await _await_with_deadline(
                        search_box.wait_for(
                            state="visible",
                            timeout=min(_deadline_timeout_ms(deadline, 5000), 5000),
                        ),
                        deadline,
                    )
                    logger.info(
                        "YouTube search phase | phase=surface_ready | reason=%s | recovery=true | url=%s | elapsed=%.1fs | remaining=%.1fs",
                        reason,
                        getattr(page, "url", ""),
                        time.monotonic() - started,
                        _remaining_deadline_seconds(deadline) or 0.0,
                    )
                    return True
                except Exception as recovery_exc:
                    logger.info(
                        "YouTube search phase | phase=surface_unavailable | reason=%s | recovery=true | url=%s | error_type=%s | error=%r",
                        reason,
                        getattr(page, "url", ""),
                        type(recovery_exc).__name__,
                        recovery_exc,
                    )
                    return False
        if await _await_with_deadline(
            search_box.is_visible(timeout=_deadline_timeout_ms(deadline, 5000)), deadline
        ):
            return True
        feed = page.locator(
            "ytd-rich-grid-renderer, ytd-browse, ytd-video-renderer, ytd-rich-item-renderer"
        ).first
        if await _await_with_deadline(
            feed.is_visible(timeout=_deadline_timeout_ms(deadline, 3000)), deadline
        ):
            return True
        try:
            await _await_with_deadline(page.keyboard.press("Escape"), deadline)
            await _await_with_deadline(random_delay(0.3, 0.7), deadline)
        except Exception:
            pass
        if await _await_with_deadline(
            search_box.is_visible(timeout=_deadline_timeout_ms(deadline, 3000)), deadline
        ):
            return True
        logger.info("YouTube surface not ready for search | reason=%s | url=%s", reason, getattr(page, "url", ""))
    except Exception as exc:
        logger.info(
            "YouTube surface unavailable | reason=%s | url=%s | error_type=%s | error=%r | elapsed=%.1fs | remaining=%.1fs",
            reason,
            getattr(page, "url", ""),
            type(exc).__name__,
            exc,
            time.monotonic() - started,
            _remaining_deadline_seconds(deadline) or 0.0,
        )
    return False


def _rate_to_probability(value, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    if parsed > 1.0:
        parsed = parsed / 100.0
    return max(0.0, min(1.0, parsed))

def _normalize_engagement_config(config: dict | None) -> dict:
    if not isinstance(config, dict):
        return dict(_DEFAULT_ENGAGEMENT)
    comment_pool = config.get("comment_pool")
    if not isinstance(comment_pool, list):
        comment_pool = config.get("commentPool")
    if isinstance(comment_pool, list):
        comment_pool = [str(item).strip() for item in comment_pool if str(item).strip()]
    else:
        comment_pool = None
    ai_comment_settings = config.get("ai_comment_settings")
    if not isinstance(ai_comment_settings, dict):
        ai_comment_settings = config.get("aiCommentSettings")
    if not isinstance(ai_comment_settings, dict):
        ai_comment_settings = None
    player_behavior = config.get("player_behavior")
    if not isinstance(player_behavior, dict):
        player_behavior = config.get("youtubePlayerBehavior")
    if not isinstance(player_behavior, dict):
        player_behavior = None
    return {
        "like_rate": _rate_to_probability(config.get("like_rate", config.get("likeRate")), _DEFAULT_ENGAGEMENT["like_rate"]),
        "comment_rate": _rate_to_probability(config.get("comment_rate", config.get("commentRate")), _DEFAULT_ENGAGEMENT["comment_rate"]),
        "comment_pool": comment_pool or None,
        "ai_comment_settings": ai_comment_settings,
        "competitor_channel_urls": _sanitize_competitor_channel_urls(
            config.get("competitor_channel_urls", config.get("youtubeCompetitorChannelUrls"))
        ),
        "player_behavior": player_behavior,
        "preferred_channel": str(config.get("preferred_channel", config.get("preferredChannel", "")) or "").strip(),
    }

class YouTubeNurture:
    async def watch_and_engage(
        self,
        page,
        search_topic=None,
        target_title: str = "",
        target_duration_seconds: int = 0,
        engagement_config: dict | None = None,
        *,
        search_topics: list[str] | None = None,
        allowed_keywords: list[str] | None = None,
    ):
        target_duration_seconds = max(0, int(target_duration_seconds or 0))
        session_started = time.monotonic()
        session_deadline = session_started + target_duration_seconds if target_duration_seconds > 0 else None
        try:
            loc = await _await_with_deadline(where_am_i(page), session_deadline)
            logger.info("Vị trí hiện tại: %s", loc)
            await _await_with_deadline(ensure_on_youtube(page), session_deadline)
            await _await_with_deadline(
                page.wait_for_load_state(
                    "domcontentloaded",
                    timeout=_deadline_timeout_ms(session_deadline, 15000),
                ),
                session_deadline,
            )
            await _await_with_deadline(random_delay(1.5, 3.0), session_deadline)
            await _await_with_deadline(dismiss_blocking_popups(page, "YouTube"), session_deadline)
        except asyncio.TimeoutError:
            logger.warning(
                "YouTube nurture dừng | giai đoạn=setup | lý do=hết thời lượng | url=%s",
                getattr(page, "url", ""),
            )
            return False
        except Exception as exc:
            logger.warning(
                "YouTube nurture setup failed | phase=setup | url=%s | error=%s",
                getattr(page, "url", ""),
                exc,
            )
            raise

        engagement = _normalize_engagement_config(engagement_config)
        preferred_channel = str(engagement.get("preferred_channel") or "").strip()
        if preferred_channel:
            try:
                preferred_ok = await _await_with_deadline(
                    ensure_preferred_youtube_channel(page, preferred_channel),
                    session_deadline,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "YouTube nurture dừng | giai đoạn=chuyển kênh ưu tiên | lý do=hết thời lượng | url=%s",
                    getattr(page, "url", ""),
                )
                return False
            if not preferred_ok:
                logger.error(
                    "Không tìm thấy hoặc không chuyển được kênh YouTube ưu tiên | kênh=%s | url=%s | gợi ý=kiểm tra đăng nhập và danh sách kênh",
                    preferred_channel,
                    getattr(page, "url", ""),
                )
                raise PreferredYouTubeChannelError(
                    f"Preferred YouTube channel not found: {preferred_channel}"
                )

        # Normalize keyword queue (accept str OR list for backward-compat).
        topics: list[str] = []
        if isinstance(search_topics, list):
            topics = [str(k).strip() for k in search_topics if str(k).strip()]
        if not topics and isinstance(search_topic, list):
            topics = [str(k).strip() for k in search_topic if str(k).strip()]
        elif not topics and search_topic:
            topics = [str(search_topic).strip()]

        title_keywords = [str(k).strip() for k in (allowed_keywords or []) if str(k).strip()]
        if not title_keywords:
            title_keywords = list(topics)
        if not topics:
            logger.info("YouTube nurture skipped | reason=no_primary_keyword")
            return False

        def remaining_seconds() -> float:
            if target_duration_seconds <= 0:
                return 0.0
            return max(0.0, target_duration_seconds - (time.monotonic() - session_started))

        # đóng dialog đồng ý cookie
        for locator in [
            page.get_by_role("button", name="Accept all"),
            page.get_by_role("button", name="Reject all"),
            page.get_by_role("button", name="I agree"),
        ]:
            if _deadline_expired(session_deadline):
                return False
            try:
                visible = await _await_with_deadline(
                    locator.first.is_visible(timeout=_deadline_timeout_ms(session_deadline, 3000)),
                    session_deadline,
                )
                if visible:
                    await _await_with_deadline(
                        locator.first.click(timeout=_deadline_timeout_ms(session_deadline, 3000)),
                        session_deadline,
                    )
                    logger.info("Đã đóng hộp thoại đồng ý của YouTube")
                    await _await_with_deadline(random_delay(0.8, 1.5), session_deadline)
                    break
            except asyncio.TimeoutError:
                return False
            except Exception:
                pass

        if _deadline_expired(session_deadline):
            return False

        # Single-shot mode (no duration target): preserve legacy single-video flow.
        if target_duration_seconds <= 0:
            if not topics:
                logger.info("YouTube nurture skipped | reason=no_primary_keyword")
                return False
            completed = await _search_and_watch(
                page,
                topics[0],
                target_title,
                engagement,
                allowed_keywords=title_keywords,
            )
            if completed:
                logger.info("Hoàn thành phiên tương tác YouTube")
            return completed

        # Duration mode: search every picked keyword before related browsing.
        competitor_urls = list(engagement.get("competitor_channel_urls") or [])
        player_behavior = engagement.get("player_behavior")
        min_watch = _duration_mode_min_watch_seconds(target_duration_seconds)
        safety_margin = _duration_mode_safety_margin_seconds(target_duration_seconds)
        n_topics = len(topics)
        target_video_count = _duration_mode_target_video_count(target_duration_seconds)
        # Long sessions should look like a few real watches, not rapid-fire tabs.
        cycle_seconds = _PER_ITER_OVERHEAD_SECONDS + min_watch
        natural_iters = max(1, int(target_duration_seconds / max(60.0, cycle_seconds)))
        expected_iters = target_video_count or max(n_topics or 1, natural_iters)
        per_iter_cap = max(
            min_watch,
            (target_duration_seconds - _PER_ITER_OVERHEAD_SECONDS * expected_iters - safety_margin) / expected_iters,
        )
        logger.info(
            "YouTube nurture | target=%.1f phút | %d keyword | target_videos=%d | per_iter_cap=%.0fs | min_watch=%.0fs | safety=%.0fs | expected~%d",
            target_duration_seconds / 60.0, n_topics, target_video_count or expected_iters, per_iter_cap, min_watch, safety_margin, expected_iters,
        )

        pending_topics: list[str] = list(topics)
        random.shuffle(pending_topics)
        watched_video_ids: set[str] = set()
        last_search_topic = ""

        iteration = 0
        searches_done = 0
        related_clicks = 0
        related_fail_fallback = 0
        search_timeouts = 0
        competitor_failures = 0
        search_failures_by_topic: dict[str, int] = {}
        exhausted_topics: set[str] = set()
        videos_opened = 0
        loop_guard_max = max(60, min(1200, int(target_duration_seconds / max(30.0, min_watch))))

        def competitor_available() -> bool:
            return bool(competitor_urls) and competitor_failures < _MAX_COMPETITOR_FAILURES_PER_SESSION

        def note_competitor_result(opened: bool, reason: str) -> None:
            nonlocal competitor_failures
            if opened:
                return
            competitor_failures += 1
            if competitor_failures >= _MAX_COMPETITOR_FAILURES_PER_SESSION:
                logger.info(
                    "YouTube nurture | tắt competitor fallback trong phiên vì fail %d lần (%s)",
                    competitor_failures,
                    reason,
                )

        _SEARCH_SKIPPED = object()

        def note_search_result(topic: str, opened: object) -> None:
            if opened is _SEARCH_SKIPPED:
                # Do hết budget thời gian, không coi là lỗi tìm kiếm của keyword
                return
            if opened:
                search_failures_by_topic.pop(topic, None)
                return
            if not topic:
                return
            failures = search_failures_by_topic.get(topic, 0) + 1
            search_failures_by_topic[topic] = failures
            if failures < _MAX_SEARCH_FAILURES_PER_TOPIC:
                return
            exhausted_topics.add(topic)
            pending_topics[:] = [item for item in pending_topics if item != topic]
            logger.info(
                "YouTube nurture | bỏ keyword sau %d lần search fail: %s",
                failures,
                topic,
            )

        async def run_budgeted_search(topic: str, reason: str):
            nonlocal search_timeouts, last_search_topic
            search_id = f"iter-{iteration}:{reason}"
            if not topic:
                logger.info("YouTube search skipped | id=%s | reason=no_available_keyword", search_id)
                return _SEARCH_SKIPPED
            budget = _search_budget_seconds(
                remaining_seconds(),
                target_duration_seconds,
                min_watch,
                safety_margin,
                videos_opened=videos_opened,
            )
            if budget <= 5:
                logger.info(
                    "YouTube search skipped | id=%s | topic=%s | remaining=%.0fs | budget=%.0fs",
                    search_id, topic, remaining_seconds(), budget,
                )
                return _SEARCH_SKIPPED
            started = time.monotonic()
            logger.info(
                "YouTube search start | id=%s | topic=%s | remaining=%.0fs | budget=%.0fs | pending=%d",
                search_id, topic, remaining_seconds(), budget, len(pending_topics),
            )
            try:
                search_deadline = time.monotonic() + budget
                if session_deadline is not None:
                    search_deadline = min(search_deadline, session_deadline)
                opened = await _await_with_deadline(
                    _search_and_pick(
                        page,
                        topic,
                        target_title,
                        allowed_keywords=title_keywords if allowed_keywords else [topic],
                        max_seconds=budget,
                        search_id=search_id,
                        exclude_video_ids=watched_video_ids,
                    ),
                    search_deadline,
                )
            except _YouTubeSearchSurfaceUnavailable:
                logger.warning(
                    "YouTube search stopped | id=%s | reason=search_surface_unavailable | url=%s | remaining=%.0fs",
                    search_id,
                    getattr(page, "url", ""),
                    remaining_seconds(),
                )
                return _SEARCH_SURFACE_UNAVAILABLE
            except asyncio.TimeoutError:
                search_timeouts += 1
                logger.warning(
                    "YouTube search timeout | id=%s | topic=%s | budget=%.0fs | elapsed=%.0fs | remaining=%.0fs",
                    search_id, topic, budget, time.monotonic() - started, remaining_seconds(),
                )
                return False
            logger.info(
                "YouTube search done | id=%s | topic=%s | opened=%s | elapsed=%.0fs | remaining=%.0fs",
                search_id, topic, opened, time.monotonic() - started, remaining_seconds(),
            )
            if opened:
                last_search_topic = topic
            return bool(opened)

        while (
            remaining_seconds() > (safety_margin + 5.0)
            and iteration < loop_guard_max
        ):
            iteration += 1
            pending = len(pending_topics)
            on_watch_page = _is_youtube_watch_url(getattr(page, "url", ""))

            if iteration == 1:
                action = "search" if (topics or not on_watch_page) else "related"
            elif not on_watch_page:
                action = "search"
            elif pending > 0:
                action = "search"
            else:
                action = "related"

            logger.info(
                "YouTube nurture | iter #%d remaining=%.0fs action=%s pending_kw=%d watch_page=%s (s=%d r=%d)",
                iteration, remaining_seconds(), action, pending, on_watch_page, searches_done, related_clicks,
            )

            opened = False
            if action == "search":
                topic = _choose_search_topic(topics, pending_topics, last_search_topic, exhausted_topics)
                if not topic and not on_watch_page:
                    logger.warning("YouTube nurture | stop vi het keyword va chua mo duoc video")
                    break
                opened = await run_budgeted_search(topic, "search")
                if opened is _SEARCH_SURFACE_UNAVAILABLE:
                    logger.warning("YouTube nurture | stop reason=search_surface_unavailable")
                    break
                if opened is _SEARCH_SKIPPED:
                    logger.info("YouTube nurture | dừng tìm kiếm do ngân sách thời gian không đủ")
                    break
                note_search_result(topic, opened)
                if opened:
                    searches_done += 1
                    if pending_topics and pending_topics[0] == topic:
                        pending_topics.pop(0)
            else:
                if not on_watch_page:
                    logger.info("YouTube nurture | skip related vi chua co watch page")
                else:
                    try:
                        opened = await _await_with_deadline(
                            _open_related_only(
                                page,
                                allowed_keywords=title_keywords,
                                exclude_video_ids=watched_video_ids,
                                deadline=session_deadline,
                            ),
                            session_deadline,
                        )
                    except asyncio.TimeoutError:
                        logger.warning("YouTube related dừng | lý do=hết thời lượng | gợi ý=thử lại với thời lượng dài hơn")
                        break
                    if opened:
                        related_clicks += 1
                if not opened and competitor_available():
                    logger.info("YouTube nurture | sidebar fail/no match → thử kênh đối thủ")
                    try:
                        opened = await _await_with_deadline(
                            _open_competitor_channel_video(
                                page,
                                competitor_urls,
                                allowed_keywords=title_keywords,
                                deadline=session_deadline,
                            ),
                            session_deadline,
                        )
                    except asyncio.TimeoutError:
                        logger.warning("YouTube competitor dừng | lý do=hết thời lượng | gợi ý=thử lại với thời lượng dài hơn")
                        break
                    note_competitor_result(opened, "related_fallback")
                    if opened:
                        related_clicks += 1
                if not opened:
                    topic = _choose_search_topic(topics, pending_topics, last_search_topic, exhausted_topics)
                    if not topic:
                        logger.warning("YouTube nurture | stop fallback search vi het keyword kha dung")
                        break
                    logger.info("YouTube nurture | related/competitor fail → về trang chủ rồi tìm keyword '%s'", topic)
                    opened = await run_budgeted_search(topic, "fallback_search")
                    if opened is _SEARCH_SURFACE_UNAVAILABLE:
                        logger.warning("YouTube nurture | stop reason=search_surface_unavailable")
                        break
                    if opened is _SEARCH_SKIPPED:
                        logger.info("YouTube nurture | dừng fallback search do hết ngân sách thời gian")
                        break
                    note_search_result(topic, opened)
                    if opened:
                        searches_done += 1
                        related_fail_fallback += 1
                        if pending_topics and pending_topics[0] == topic:
                            pending_topics.pop(0)

            if not opened:
                logger.warning("YouTube nurture | iter #%d không mở được video, ngủ 5s", iteration)
                try:
                    await _await_with_deadline(
                        asyncio.sleep(min(5.0, _remaining_deadline_seconds(session_deadline) or 0.0)),
                        session_deadline,
                    )
                except asyncio.TimeoutError:
                    break
                continue
            videos_opened += 1
            current_video_id = _youtube_video_id(getattr(page, "url", ""))
            if current_video_id:
                watched_video_ids.add(current_video_id)

            this_cap = min(per_iter_cap, max(0.0, remaining_seconds() - safety_margin))
            if this_cap <= 0:
                logger.info("YouTube nurture | iter #%d skip watch vi het ngan sach thoi gian", iteration)
                break
            video_duration = await _await_with_deadline(
                _get_video_duration_seconds(page), session_deadline
            )
            watch_floor = min(
                this_cap,
                _duration_mode_watch_floor_seconds(
                    remaining_seconds(),
                    target_video_count or expected_iters,
                    videos_opened,
                    min_watch,
                    safety_margin,
                ),
            )
            if (
                video_duration
                and _DURATION_FRACTION_TARGET_MIN_SECONDS <= target_duration_seconds <= _DURATION_FRACTION_TARGET_MAX_SECONDS
            ):
                required_watch = (float(video_duration) * _DURATION_MIN_VIDEO_FRACTION) + 1.0
                available_watch = max(0.0, remaining_seconds() - safety_margin)
                if required_watch <= available_watch and required_watch > watch_floor:
                    old_cap, old_floor = this_cap, watch_floor
                    this_cap = max(this_cap, required_watch)
                    watch_floor = min(this_cap, max(watch_floor, required_watch))
                    logger.info(
                        "YouTube nurture | watch floor 40%% video | duration=%.0fs | required=%.0fs | cap %.0fs→%.0fs | floor %.0fs→%.0fs",
                        video_duration,
                        required_watch,
                        old_cap,
                        this_cap,
                        old_floor,
                        watch_floor,
                    )
            try:
                await _await_with_deadline(
                    _watch_video_capped(
                        page,
                        this_cap,
                        min_watch_seconds=watch_floor,
                        player_behavior=player_behavior,
                        video_duration_seconds=video_duration,
                    ),
                    session_deadline,
                )
                await _await_with_deadline(
                    maybe_like_video(page, like_rate=engagement["like_rate"]),
                    session_deadline,
                )
                await _await_with_deadline(
                    maybe_comment_video(
                        page,
                        comment_pool=engagement["comment_pool"],
                        comment_rate=engagement["comment_rate"],
                        ai_comment_settings=engagement.get("ai_comment_settings"),
                    ),
                    session_deadline,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "YouTube nurture dừng | giai đoạn=tương tác sau xem | lý do=hết thời lượng | video=%s | gợi ý=giảm thời lượng hoặc thử lại",
                    current_video_id or "không xác định",
                )
                break

            comment_scroll_rate = _player_probability(player_behavior, "comment_scroll_rate")
            if comment_scroll_rate is None:
                comment_scroll_rate = _PLAYER_DEFAULT_PROBABILITIES["comment_scroll_rate"]
            if remaining_seconds() > 60 and random.random() < comment_scroll_rate:
                try:
                    await _await_with_deadline(_scroll_to_comments(page, return_to_player=True), session_deadline)
                    if remaining_seconds() > 30:
                        await _await_with_deadline(random_delay(8.0, 18.0), session_deadline)
                    resume_budget = max(0.0, remaining_seconds() - safety_margin)
                    same_video = current_video_id and current_video_id == _youtube_video_id(getattr(page, "url", ""))
                    if same_video and resume_budget >= 10.0:
                        resume_cap = min(resume_budget, random.uniform(20.0, 45.0))
                        if resume_cap >= 10.0:
                            logger.info("YouTube nurture | tiếp tục xem cùng video sau bình luận %.0fs", resume_cap)
                            await _await_with_deadline(
                                _watch_video_capped(
                                    page,
                                    resume_cap,
                                    min_watch_seconds=min(15.0, resume_cap),
                                    player_behavior=player_behavior,
                                    video_duration_seconds=video_duration,
                                ),
                                session_deadline,
                            )
                except asyncio.TimeoutError:
                    logger.warning(
                        "YouTube nurture dừng | giai đoạn=bình luận | lý do=hết thời lượng | video=%s | gợi ý=thử lại với thời lượng dài hơn",
                        current_video_id or "không xác định",
                    )
                    break

        if iteration >= loop_guard_max and remaining_seconds() > safety_margin + 5.0:
            logger.warning(
                "YouTube nurture | stop reason=loop_guard iters=%d max=%d remaining=%.0fs",
                iteration,
                loop_guard_max,
                remaining_seconds(),
            )
        degraded = False
        if videos_opened <= 0:
            degraded = True
            logger.warning(
                "YouTube nurture | failed opened=0 target=%.1f phút search_failures=%s exhausted=%s",
                target_duration_seconds / 60.0,
                search_failures_by_topic,
                sorted(exhausted_topics),
            )
        elif target_duration_seconds >= 900 and videos_opened < max(2, int(target_duration_seconds / 900)):
            degraded = True
            logger.warning(
                "YouTube nurture | degraded opened=%d target=%.1f phút search_failures=%s exhausted=%s",
                videos_opened,
                target_duration_seconds / 60.0,
                search_failures_by_topic,
                sorted(exhausted_topics),
            )
        elif target_duration_seconds >= 900 and remaining_seconds() > max(90.0, target_duration_seconds * 0.20):
            degraded = True
            logger.warning(
                "YouTube nurture | degraded remaining=%.0fs target=%.1f phút opened=%d search_failures=%s exhausted=%s",
                remaining_seconds(),
                target_duration_seconds / 60.0,
                videos_opened,
                search_failures_by_topic,
                sorted(exhausted_topics),
            )
        logger.info(
            "YouTube nurture | done iters=%d opened=%d searches=%d related=%d related_fallback=%d search_timeouts=%d",
            iteration, videos_opened, searches_done, related_clicks, related_fail_fallback, search_timeouts,
        )
        return not degraded


async def _search_and_watch(
    page,
    search_topic: str,
    target_title: str = "",
    engagement: dict | None = None,
    allowed_keywords: list[str] | None = None,
) -> bool:
    """Tìm kiếm theo keyword rồi xem video."""
    logger.info("Đang tìm kiếm trên YouTube: %s", search_topic)
    engagement = _normalize_engagement_config(engagement)
    try:
        opened = await _search_and_pick(
            page,
            search_topic,
            target_title,
            allowed_keywords=allowed_keywords or [search_topic],
            search_id="single-shot",
        )
    except _YouTubeSearchSurfaceUnavailable:
        logger.warning("YouTube search stopped | reason=search_surface_unavailable")
        return False
    if not opened:
        logger.warning("Không tìm thấy video nào khớp keyword — bỏ qua phiên")
        return False

    await _watch_video(page, player_behavior=engagement.get("player_behavior"))
    await maybe_like_video(page, like_rate=engagement["like_rate"])
    await maybe_comment_video(page, comment_pool=engagement["comment_pool"], comment_rate=engagement["comment_rate"], ai_comment_settings=engagement.get("ai_comment_settings"))
    if not await _click_related_video(page, engagement, allowed_keywords=allowed_keywords or [search_topic]):
        logger.info("Single-shot related fail → fallback search '%s'", search_topic)
        fallback_opened = await _search_and_pick(page, search_topic, allowed_keywords=allowed_keywords or [search_topic])
        if fallback_opened:
            await _watch_video(page, player_behavior=engagement.get("player_behavior"))
    await maybe_switch_tab(page.context, page)
    await maybe_open_new_tab_and_close(page.context, page)
    return True


async def _watch_from_homepage(page, engagement: dict | None = None, allowed_keywords: list[str] | None = None):
    """Xem video từ trang chủ YouTube — lướt feed rồi chọn ngẫu nhiên."""
    logger.info("Xem video từ trang chủ YouTube")
    engagement = _normalize_engagement_config(engagement)
    await _ensure_youtube_surface_for_search(page, reason="homepage")
    await human_scroll(page, "down", random.randint(300, 600))
    await random_delay(1.5, 3.0)

    # Di chuột hover qua vài thumbnail
    thumbnails = await page.locator("ytd-rich-item-renderer #thumbnail, ytd-video-renderer #thumbnail").all()
    hover_targets = random.sample(thumbnails, min(3, len(thumbnails)))
    for thumb in hover_targets:
        try:
            box = await thumb.bounding_box(timeout=1000)
            if box:
                await move_mouse_to(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                await random_delay(0.5, 1.5)
        except Exception:
            pass

    await human_scroll(page, "down", random.randint(200, 400))
    await random_delay(1.0, 2.0)

    # Chọn video ngẫu nhiên từ feed
    video_links = await page.locator(
        "ytd-rich-item-renderer #video-title-link, "
        "ytd-rich-item-renderer a#video-title"
    ).all()
    candidates = await _collect_feed_video_candidates(video_links, 20, "homepage")
    if allowed_keywords:
        before = len(candidates)
        candidates = [item for item in candidates if _title_matches_keywords(item.get("title", ""), allowed_keywords)]
        logger.info("Homepage lọc keyword: giữ %d/%d video", len(candidates), before)
    if not candidates:
        fallback_topic = random.choice(allowed_keywords or YOUTUBE_KEYWORDS)
        logger.warning(
            "Không tìm thấy video trên homepage khớp keyword — fallback tìm kiếm: %s",
            fallback_topic,
        )
        if await _ensure_youtube_surface_for_search(page, reason="homepage_fallback_search"):
            await _search_and_watch(page, fallback_topic, engagement=engagement, allowed_keywords=allowed_keywords or [fallback_topic])
        return

    chosen = random.choice(candidates[:10])["link"]
    logger.info("Chọn video ngẫu nhiên từ trang chủ")
    await move_to_locator(page, chosen)
    await random_delay(0.3, 0.8)
    await chosen.click()
    await page.wait_for_load_state("domcontentloaded", timeout=10000)
    await random_delay(2.0, 4.0)

    await maybe_handle_notification_popup(page)
    await dismiss_blocking_popups(page, "YouTube")
    await _watch_video(page, player_behavior=engagement.get("player_behavior"))
    await maybe_like_video(page, like_rate=engagement["like_rate"])
    await maybe_comment_video(page, comment_pool=engagement["comment_pool"], comment_rate=engagement["comment_rate"], ai_comment_settings=engagement.get("ai_comment_settings"))
    await _click_related_video(page, engagement, allowed_keywords=allowed_keywords)


async def _watch_from_explore(page, engagement: dict | None = None, allowed_keywords: list[str] | None = None):
    """Mở sidebar Khám phá, chọn chủ đề ngẫu nhiên rồi xem video."""
    logger.info("Xem video qua mục Khám phá")
    try:
        # Mở sidebar nếu đang thu gọn
        guide_btn = page.locator(
            "button#guide-button, ytd-topbar-logo-renderer button, "
            "tp-yt-app-drawer#guide button[aria-label*='Guide']"
        ).first
        if await guide_btn.is_visible(timeout=3000):
            await move_to_locator(page, guide_btn)
            await guide_btn.click()
            await random_delay(0.8, 1.5)

        # Tìm mục Khám phá trong sidebar
        explore_topic = random.choice(_YT_EXPLORE_ITEMS)
        explore_link = page.locator(
            f'a:has-text("{explore_topic}"), '
            f'ytd-guide-entry-renderer:has-text("{explore_topic}") a'
        ).first
        if not await explore_link.is_visible(timeout=4000):
            logger.debug("Không tìm thấy mục Khám phá '%s' — fallback homepage", explore_topic)
            await _watch_from_homepage(page, engagement, allowed_keywords=allowed_keywords)
            return

        await move_to_locator(page, explore_link)
        await random_delay(0.5, 1.0)
        await explore_link.click()
        await page.wait_for_load_state("domcontentloaded", timeout=10000)
        await random_delay(2.0, 3.5)
        logger.info("Đã vào mục Khám phá: %s", explore_topic)

        # Cuộn lướt rồi chọn video
        await human_scroll(page, "down", random.randint(300, 500))
        await random_delay(1.5, 2.5)

        video_links = await page.locator("ytd-video-renderer #video-title, ytd-rich-item-renderer #video-title-link").all()
        candidates = await _collect_feed_video_candidates(video_links, 15, "Explore")
        if allowed_keywords:
            before = len(candidates)
            candidates = [item for item in candidates if _title_matches_keywords(item.get("title", ""), allowed_keywords)]
            logger.info("Explore lọc keyword: giữ %d/%d video", len(candidates), before)

        if not candidates:
            await _watch_from_homepage(page, engagement, allowed_keywords=allowed_keywords)
            return

        chosen = random.choice(candidates[:8])["link"]
        await move_to_locator(page, chosen)
        await random_delay(0.3, 0.8)
        await chosen.click()
        await page.wait_for_load_state("domcontentloaded", timeout=10000)
        await random_delay(2.0, 4.0)

        await maybe_handle_notification_popup(page)
        await dismiss_blocking_popups(page, "YouTube")
        engagement = _normalize_engagement_config(engagement)
        await _watch_video(page, player_behavior=engagement.get("player_behavior"))
        await maybe_like_video(page, like_rate=engagement["like_rate"])
        await maybe_comment_video(page, comment_pool=engagement["comment_pool"], comment_rate=engagement["comment_rate"], ai_comment_settings=engagement.get("ai_comment_settings"))
        await _click_related_video(page, engagement, allowed_keywords=allowed_keywords)

    except Exception as exc:
        logger.debug("Lỗi watch_from_explore: %s — fallback homepage", exc)
        await _watch_from_homepage(page, engagement, allowed_keywords=allowed_keywords)


async def _watch_from_filter_chip(page, engagement: dict | None = None, allowed_keywords: list[str] | None = None):
    """Click vào filter chip dưới thanh tìm kiếm rồi xem video."""
    logger.info("Xem video qua filter chip")
    try:
        # Tìm các chip hiển thị trên trang chủ
        chips = await page.locator(
            "yt-chip-cloud-chip-renderer, "
            "ytd-feed-filter-chip-bar-renderer yt-chip-cloud-chip-renderer, "
            "#chips yt-chip-cloud-chip-renderer"
        ).all()

        if not chips:
            logger.debug("Không tìm thấy filter chips — fallback homepage")
            await _watch_from_homepage(page, engagement, allowed_keywords=allowed_keywords)
            return

        # Bỏ chip "Tất cả" (index 0), chọn ngẫu nhiên trong các chip còn lại
        target_chips = chips[1:] if len(chips) > 1 else chips
        chosen_chip = random.choice(target_chips[:8])
        chip_text = (await chosen_chip.inner_text()).strip()
        await move_to_locator(page, chosen_chip)
        await random_delay(0.5, 1.0)
        await chosen_chip.click()
        await page.wait_for_load_state("domcontentloaded", timeout=10000)
        await random_delay(2.0, 3.5)
        logger.info("Đã chọn filter chip: %s", chip_text)

        # Cuộn lướt feed sau khi filter
        await human_scroll(page, "down", random.randint(300, 600))
        await random_delay(1.5, 2.5)

        video_links = await page.locator(
            "ytd-rich-item-renderer #video-title-link, "
            "ytd-rich-item-renderer a#video-title"
        ).all()
        candidates = await _collect_feed_video_candidates(video_links, 20, "filter chip")
        if allowed_keywords:
            before = len(candidates)
            candidates = [item for item in candidates if _title_matches_keywords(item.get("title", ""), allowed_keywords)]
            logger.info("Filter chip lọc keyword: giữ %d/%d video", len(candidates), before)

        if not candidates:
            await _watch_from_homepage(page, engagement, allowed_keywords=allowed_keywords)
            return

        chosen = random.choice(candidates[:10])["link"]
        await move_to_locator(page, chosen)
        await random_delay(0.3, 0.8)
        await chosen.click()
        await page.wait_for_load_state("domcontentloaded", timeout=10000)
        await random_delay(2.0, 4.0)

        await maybe_handle_notification_popup(page)
        await dismiss_blocking_popups(page, "YouTube")
        engagement = _normalize_engagement_config(engagement)
        await _watch_video(page, player_behavior=engagement.get("player_behavior"))
        await maybe_like_video(page, like_rate=engagement["like_rate"])
        await maybe_comment_video(page, comment_pool=engagement["comment_pool"], comment_rate=engagement["comment_rate"], ai_comment_settings=engagement.get("ai_comment_settings"))
        await _click_related_video(page, engagement, allowed_keywords=allowed_keywords)

    except Exception as exc:
        logger.debug("Lỗi watch_from_filter_chip: %s — fallback homepage", exc)
        await _watch_from_homepage(page, engagement, allowed_keywords=allowed_keywords)


async def _browse_search_results(page, deadline: float | None = None):
    """Cuộn và di chuột qua danh sách kết quả như người đang lướt chọn video."""
    logger.info("Đang lướt qua danh sách kết quả tìm kiếm")
    scroll_count = random.randint(2, 4)
    for i in range(scroll_count):
        if _deadline_expired(deadline, grace=1.0):
            logger.info("Dừng lướt kết quả vì hết budget search")
            break
        await human_scroll(page, "down", random.randint(300, 600))
        await random_delay(1.5, 3.5)

        thumbnails = await page.locator("ytd-video-renderer #thumbnail").all()
        hover_targets = random.sample(thumbnails, min(2, len(thumbnails)))
        for thumb in hover_targets:
            if _deadline_expired(deadline, grace=0.5):
                break
            try:
                box = await thumb.bounding_box(timeout=1000)
                if box:
                    await move_mouse_to(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                    await random_delay(0.5, 1.5)
            except Exception:
                pass

    if not _deadline_expired(deadline, grace=1.0):
        await human_scroll(page, "up", random.randint(400, 800))
        await random_delay(0.8, 1.5)


async def _watch_video(page, player_behavior: dict | None = None):
    """Xem video với tua, dừng, chỉnh chất lượng, bỏ qua quảng cáo."""
    video_duration = await _get_video_duration_seconds(page)
    watch_seconds = _choose_watch_seconds(video_duration)
    if video_duration:
        logger.info("Đang xem video trong %.0f giây (độ dài video %.0f giây)", watch_seconds, video_duration)
    else:
        logger.info("Đang xem video trong %.0f giây", watch_seconds)

    elapsed = 0.0
    chunk_size = 10.0
    chunk_count = max(1, int((watch_seconds + chunk_size - 1) // chunk_size))
    selected_actions = _select_player_actions(player_behavior)
    action_slots = set(random.sample(range(chunk_count), min(len(selected_actions), chunk_count)))
    action_iter = iter(selected_actions)
    chunk_index = 0

    while elapsed < watch_seconds:
        chunk = min(chunk_size, watch_seconds - elapsed)
        await random_delay(chunk, chunk)
        elapsed += chunk

        await try_skip_ad(page, skip_probability=_player_probability(player_behavior, "skip_ad_rate"))
        if chunk_index in action_slots:
            await _run_player_action(page, next(action_iter))
        await exit_fullscreen_if_active(page)
        chunk_index += 1

    await exit_fullscreen_if_active(page)

    # Cuộn xuống đọc comment
    await _scroll_to_comments(page)


async def _hunt_for_video(
    page,
    target_title: str = "",
    allowed_keywords: list[str] | None = None,
    deadline: float | None = None,
    exclude_video_ids: set[str] | None = None,
):
    """Scan search results and return a video link that matches target/keywords."""
    target_lower = target_title.strip().lower()
    hunting = bool(target_lower)

    if hunting:
        logger.info("Đang săn video mục tiêu: '%s'", target_title)
    if allowed_keywords:
        logger.info("Đang lọc kết quả YouTube theo %d keyword", len(allowed_keywords))

    for scroll_attempt in range(_MAX_HUNT_SCROLLS + 1):
        if _deadline_expired(deadline, grace=1.0):
            logger.info("Dừng săn video vì hết budget search")
            break
        results = await page.locator("ytd-video-renderer #video-title").all()

        for link in results[:20]:
            href = await link.get_attribute("href")
            if not href or "/watch?v=" not in href or "/shorts/" in href:
                continue
            if _youtube_video_id(href) in (exclude_video_ids or set()):
                continue
            if await _is_sponsored_video_link(link):
                logger.info("Bỏ qua video sponsored ở search results")
                continue
            text_raw = (await link.inner_text()).strip()
            text = text_raw.lower()
            if hunting:
                if target_lower in text and (not allowed_keywords or _title_matches_keywords(text_raw, allowed_keywords)):
                    logger.info("Tìm thấy video mục tiêu ở lần cuộn %d: '%s'", scroll_attempt, text_raw)
                    return link
            elif allowed_keywords:
                if _title_matches_keywords(text_raw, allowed_keywords):
                    logger.info("Tìm thấy video khớp keyword ở lần cuộn %d: '%s'", scroll_attempt, text_raw)
                    return link

        if not hunting:
            candidates = []
            for link in results[:15]:
                href = await link.get_attribute("href")
                if not href or "/watch?v=" not in href or "/shorts/" in href:
                    continue
                if _youtube_video_id(href) in (exclude_video_ids or set()):
                    continue
                if await _is_sponsored_video_link(link):
                    logger.info("Bỏ qua video sponsored ở search results")
                    continue
                candidates.append(link)
            if candidates and (not allowed_keywords or scroll_attempt >= 1 or (_remaining_deadline_seconds(deadline) or 0.0) < 8.0):
                chosen = random.choice(candidates[:6])
                logger.info("Chọn video từ kết quả tìm kiếm YouTube (fallback cho search '%s')", target_title or "topic")
                return chosen

        if scroll_attempt < _MAX_HUNT_SCROLLS and not _deadline_expired(deadline, grace=2.0):
            logger.info("Chưa tìm thấy — đang cuộn xuống (%d/%d)", scroll_attempt + 1, _MAX_HUNT_SCROLLS)
            await page.mouse.wheel(0, 800)
            await random_delay(1.5, 2.5)
        else:
            logger.warning("Không tìm thấy video '%s' sau %d lần cuộn", target_title, _MAX_HUNT_SCROLLS)

    if hunting or allowed_keywords:
        logger.info("Không fallback video ngẫu nhiên vì đang lọc mục tiêu/keyword")
        return None

    logger.info("Chuyển sang chọn video ngẫu nhiên để duy trì hành vi tự nhiên")
    results = await page.locator("ytd-video-renderer #video-title").all()
    fallback = []
    for link in results[:10]:
        href = await link.get_attribute("href")
        if not href or "/watch?v=" not in href or "/shorts/" in href:
            continue
        if await _is_sponsored_video_link(link):
            logger.info("Bỏ qua video sponsored ở search results")
            continue
        fallback.append(link)
        if len(fallback) == 5:
            break

    if fallback:
        logger.info("Dự phòng: đang click vào video ngẫu nhiên")
        return random.choice(fallback)

    logger.warning("Không tìm thấy video nào trong kết quả — hủy phiên")
    return None


async def _scroll_back_to_player_slowly(page) -> bool:
    """Scroll back toward the player with wheel steps, not a Home-key jump."""
    for _ in range(8):
        try:
            box = await page.locator("#movie_player, .html5-video-player, ytd-player").first.bounding_box(timeout=1000)
            if box and -80 <= box.get("y", 0) <= 280:
                logger.info("Đã cuộn lên lại vùng video sau khi đọc bình luận")
                return True
        except Exception:
            pass
        await human_scroll(page, "up", random.randint(450, 750))
        await random_delay(0.8, 1.6)
    logger.info("Đã cuộn lên lại gần vùng video sau khi đọc bình luận")
    return False


async def _scroll_to_comments(page, *, return_to_player: bool = False):
    """Cuộn xuống vùng comment YouTube, đọc lướt vài bình luận."""
    should_return = False
    try:
        await exit_fullscreen_if_active(page)
        logger.info("Đang cuộn xuống đọc bình luận")
        # Cuộn xuống vùng comment (thường ở dưới video description)
        for _ in range(random.randint(3, 5)):
            should_return = True
            await human_scroll(page, "down", random.randint(400, 700))
            await random_delay(1.5, 3.0)

        # Kiểm tra xem có comment section không
        comment_section = page.locator("ytd-comments#comments, ytd-comment-thread-renderer").first
        try:
            await comment_section.wait_for(state="visible", timeout=5000)
        except Exception:
            logger.debug("Không tìm thấy vùng bình luận")
            return

        # Di chuột qua vài comment
        comments = await page.locator("ytd-comment-thread-renderer").all()
        hover_count = min(random.randint(2, 4), len(comments))
        for comment in comments[:hover_count]:
            try:
                box = await comment.bounding_box(timeout=2000)
                if box:
                    await move_mouse_to(
                        page,
                        box["x"] + box["width"] * random.uniform(0.2, 0.8),
                        box["y"] + box["height"] * random.uniform(0.3, 0.7),
                    )
                    await random_delay(1.0, 3.0)
            except Exception:
                pass

        # Cuộn thêm 1-2 lần trong vùng comment
        for _ in range(random.randint(1, 2)):
            await human_scroll(page, "down", random.randint(200, 400))
            await random_delay(1.5, 2.5)

        logger.info("Hoàn thành đọc bình luận")
    except Exception as exc:
        logger.debug("Lỗi khi đọc bình luận: %s", exc)
    finally:
        if return_to_player and should_return:
            await _scroll_back_to_player_slowly(page)


async def _watch_video_capped(
    page,
    max_seconds: float,
    *,
    min_watch_seconds: float = _MIN_WATCH_PER_ITER,
    player_behavior: dict | None = None,
    video_duration_seconds: float | None = None,
) -> float:
    """Watch the current video for up to ``max_seconds`` with human-like actions.

    Mirrors :func:`_watch_video` but caps total elapsed time so multi-keyword
    sessions can squeeze in several iterations. Skips the ``_scroll_to_comments``
    tail (the orchestrator decides when/whether to scroll comments per iter)."""
    max_seconds = max(0.0, float(max_seconds or 0.0))
    if max_seconds <= 0:
        return 0.0
    started = time.monotonic()
    deadline = started + max_seconds
    video_duration = video_duration_seconds
    if video_duration is None:
        try:
            video_duration = await _await_with_deadline(_get_video_duration_seconds(page), deadline)
        except asyncio.TimeoutError:
            return 0.0
    natural = _choose_watch_seconds(video_duration)
    min_watch_seconds = max(0.0, min(float(min_watch_seconds or 0.0), max_seconds))
    if video_duration and video_duration < min_watch_seconds:
        min_watch_seconds = min(min_watch_seconds, max(_MIN_WATCH_PER_ITER, video_duration * 0.95))
    watch_seconds = min(max_seconds, max(min_watch_seconds, min(float(natural), max_seconds)))
    if video_duration:
        logger.info(
            "Đang xem video %.0fs (cap=%.0fs, độ dài %.0fs)",
            watch_seconds, max_seconds, video_duration,
        )
    else:
        logger.info("Đang xem video %.0fs (cap=%.0fs)", watch_seconds, max_seconds)

    elapsed = 0.0
    chunk_size = 10.0
    chunk_count = max(1, int((watch_seconds + chunk_size - 1) // chunk_size))
    selected_actions = _select_player_actions(player_behavior)
    action_slots = set(random.sample(range(chunk_count), min(len(selected_actions), chunk_count)))
    action_iter = iter(selected_actions)
    chunk_index = 0
    completed = True
    while elapsed < watch_seconds:
        remaining = _remaining_deadline_seconds(deadline) or 0.0
        if remaining <= 0:
            logger.info("YouTube watch cap reached | phase=chunk | cap=%.0fs", max_seconds)
            completed = False
            break
        chunk = min(chunk_size, watch_seconds - elapsed, remaining)
        try:
            await _await_with_deadline(random_delay(chunk, chunk), deadline)
        except asyncio.TimeoutError:
            completed = False
            break
        elapsed += chunk
        if _deadline_expired(deadline):
            logger.info("YouTube watch cap reached | phase=delay | cap=%.0fs", max_seconds)
            completed = False
            break
        try:
            await _await_with_deadline(
                try_skip_ad(page, skip_probability=_player_probability(player_behavior, "skip_ad_rate")),
                deadline,
            )
            if chunk_index in action_slots and not _deadline_expired(deadline):
                await _await_with_deadline(_run_player_action(page, next(action_iter)), deadline)
            if not _deadline_expired(deadline):
                await _await_with_deadline(exit_fullscreen_if_active(page), deadline)
        except asyncio.TimeoutError:
            logger.info("YouTube watch cap reached | phase=player_action | cap=%.0fs", max_seconds)
            completed = False
            break
        chunk_index += 1
    if not _deadline_expired(deadline):
        with contextlib.suppress(asyncio.TimeoutError, Exception):
            await _await_with_deadline(exit_fullscreen_if_active(page), deadline)
    return min(watch_seconds, elapsed)


async def _open_competitor_channel_video(
    page,
    channel_urls: list[str] | None,
    allowed_keywords: list[str] | None = None,
    deadline: float | None = None,
) -> bool:
    """Open a competitor channel's Videos tab and click a matching video.

    We navigate to the channel page the user configured, but still click the
    chosen watch video through the real DOM; no direct watch URL injection.
    """
    urls = _sanitize_competitor_channel_urls(channel_urls)
    if not urls:
        return False
    url = random.choice(urls).rstrip("/")
    if not any(part in url for part in ("/videos", "/shorts", "/streams")):
        url = url + "/videos"
    try:
        if _deadline_expired(deadline):
            logger.info("YouTube competitor skipped | reason=deadline_expired")
            return False
        logger.info("Mở kênh đối thủ YouTube: %s", url)
        await page.goto(
            url,
            wait_until="domcontentloaded",
            timeout=_deadline_timeout_ms(deadline, 30000),
        )
        try:
            await page.wait_for_selector(
                'a[href*="/watch?v="]',
                timeout=_deadline_timeout_ms(deadline, 12000),
            )
        except Exception:
            pass
        await random_delay(2.0, 4.0)
        await human_scroll(page, "down", random.randint(250, 500))
        await random_delay(1.0, 2.0)
        data = await page.evaluate(
            """
            () => {
                const results = [];
                const anchors = document.querySelectorAll(
                    'ytd-rich-grid-media a#video-title-link, ytd-grid-video-renderer a#video-title, a#video-title-link, a#video-title, a[href*="/watch?v="]'
                );
                for (const a of anchors) {
                    const href = a.getAttribute('href') || '';
                    if (!href.includes('/watch?v=') || href.includes('/shorts/')) continue;
                    const title = (a.getAttribute('title') || a.textContent || '').trim();
                    if (title.length > 3) results.push({href, title: title.substring(0, 180)});
                    if (results.length >= 30) break;
                }
                return results;
            }
            """
        )
        if not isinstance(data, list) or not data:
            logger.info("Kênh đối thủ không có video thường để chọn")
            return False
        candidates = _filter_video_candidates_by_keywords(data, allowed_keywords)
        if not candidates:
            logger.info("Không có video kênh đối thủ khớp keyword")
            return False
        chosen = random.choice(candidates[:10])
        href = str(chosen.get("href") or "")
        logger.info("Click video kênh đối thủ khớp keyword: '%s'", str(chosen.get("title") or "")[:80])
        el = page.locator(f'a[href="{href}"]').first
        await el.scroll_into_view_if_needed(timeout=3000)
        await random_delay(0.3, 0.8)
        await move_to_locator(page, el)
        await random_delay(0.3, 0.8)
        await el.click(timeout=_deadline_timeout_ms(deadline, 5000))
        await page.wait_for_load_state(
            "domcontentloaded",
            timeout=_deadline_timeout_ms(deadline, 10000),
        )
        if _deadline_expired(deadline):
            return False
        await random_delay(2.0, 4.0)
        await maybe_handle_notification_popup(page)
        await dismiss_blocking_popups(page, "YouTube")
        if not _is_youtube_watch_url(getattr(page, "url", "")):
            logger.info("Click kênh đối thủ không mở watch page: %s", getattr(page, "url", ""))
            return False
        return True
    except Exception as exc:
        logger.warning("Không mở được video từ kênh đối thủ: %s", exc)
        return False


async def _search_and_pick(
    page,
    topic: str,
    target_title: str = "",
    allowed_keywords: list[str] | None = None,
    *,
    max_seconds: float | None = None,
    search_id: str = "",
    exclude_video_ids: set[str] | None = None,
) -> bool:
    """Type a keyword into YouTube's real search bar, browse results, click a video.

    Returns True when a video page is opened. Does NOT inject URLs — every
    transition goes through the real DOM (logo click → search box → result link).
    """
    logger.info("Đang tìm kiếm trên YouTube qua thanh search: %s", topic)
    started = time.monotonic()
    deadline = None
    if max_seconds is not None:
        try:
            deadline = started + max(0.0, float(max_seconds))
        except (TypeError, ValueError):
            deadline = None
    log_id = search_id or "search"
    phase = "home"
    try:
        logger.info(
            "YouTube search phase | id=%s | phase=%s | url=%s | elapsed=%.1fs | remaining=%.1fs",
            log_id,
            phase,
            getattr(page, "url", ""),
            time.monotonic() - started,
            _remaining_deadline_seconds(deadline) or 0.0,
        )
        if not await _ensure_youtube_surface_for_search(
            page,
            reason=f"{log_id}:search",
            force_home=True,
            require_search_box=True,
            deadline=deadline,
        ):
            raise _YouTubeSearchSurfaceUnavailable(log_id)

        if _deadline_expired(deadline, grace=2.0):
            logger.info("YouTube search budget expired before typing | id=%s", log_id)
            return False

        phase = "search_focus"
        logger.info(
            "YouTube search phase | id=%s | phase=%s | url=%s | elapsed=%.1fs | remaining=%.1fs",
            log_id,
            phase,
            getattr(page, "url", ""),
            time.monotonic() - started,
            _remaining_deadline_seconds(deadline) or 0.0,
        )
        search_box = _youtube_search_box(page)

        # YouTube header input can keep moving while custom elements hydrate.
        # Avoid locator.wait_for()/humanized click here: both can spend full search
        # budget on actionability stability before keyboard input starts.
        native_focused = False
        try:
            focus_result = await _await_with_deadline(
                asyncio.wait_for(
                    page.evaluate(
                        """
                        () => {
                            const selectors = [
                                'yt-searchbox input#search',
                                'ytd-searchbox input#search',
                                'form#search-form input[name="search_query"]',
                                'input#search',
                                'input[name="search_query"]'
                            ];
                            for (const selector of selectors) {
                                const input = document.querySelector(selector);
                                if (!input || input.disabled) continue;
                                const rect = input.getBoundingClientRect();
                                const style = window.getComputedStyle(input);
                                if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden') continue;
                                input.focus({preventScroll: true});
                                return {
                                    found: true,
                                    focused: document.activeElement === input,
                                    selector,
                                    name: input.getAttribute('name') || '',
                                };
                            }
                            return {found: false, focused: false, selector: '', name: ''};
                        }
                        """
                    ),
                    timeout=_deadline_timeout_ms(deadline, 2000) / 1000,
                ),
                deadline,
            )
            native_focused = bool(isinstance(focus_result, dict) and focus_result.get("focused"))
            if not native_focused:
                raise RuntimeError(f"DOM search input not focused: {focus_result!r}")
            logger.info(
                "YouTube search phase | id=%s | phase=search_input_ready | method=native_dom | selector=%s | url=%s",
                log_id,
                focus_result.get("selector", ""),
                getattr(page, "url", ""),
            )
        except Exception as exc:
            logger.info("YouTube search native focus failed; using locator focus | id=%s | error=%s", log_id, exc)
            await _await_with_deadline(
                search_box.focus(timeout=_deadline_timeout_ms(deadline, 1500)), deadline
            )
            logger.info(
                "YouTube search phase | id=%s | phase=search_input_ready | method=locator_focus | url=%s",
                log_id,
                getattr(page, "url", ""),
            )

        logger.info(
            "YouTube search phase | id=%s | phase=search_focused | method=%s | url=%s | elapsed=%.1fs | remaining=%.1fs",
            log_id,
            "native_dom" if native_focused else "locator_focus",
            getattr(page, "url", ""),
            time.monotonic() - started,
            _remaining_deadline_seconds(deadline) or 0.0,
        )
        await _await_with_deadline(random_delay(0.15, 0.35), deadline)
        try:
            await _await_with_deadline(page.keyboard.press("Control+A"), deadline)
            await _await_with_deadline(random_delay(0.1, 0.3), deadline)
            await _await_with_deadline(page.keyboard.press("Backspace"), deadline)
        except Exception:
            pass
        await _await_with_deadline(
            human_type(page, search_box, topic, typo_rate=0.01, click_first=False), deadline
        )
        await _await_with_deadline(random_delay(0.4, 1.2), deadline)
        logger.info("YouTube search submit | id=%s | topic=%s", log_id, topic)
        await _await_with_deadline(page.keyboard.press("Enter"), deadline)
        try:
            await _await_with_deadline(
                page.wait_for_load_state(
                    "domcontentloaded", timeout=_deadline_timeout_ms(deadline, 10000)
                ),
                deadline,
            )
        except Exception:
            logger.info("YouTube search load wait skipped | id=%s | url=%s", log_id, getattr(page, "url", ""))
        await _await_with_deadline(random_delay(2.0, 3.5), deadline)

        if _deadline_expired(deadline, grace=1.0):
            logger.info("YouTube search budget expired after submit | id=%s", log_id)
            return False

        remaining_for_browse = _remaining_deadline_seconds(deadline) or 0.0
        if remaining_for_browse > 15.0:
            browse_budget = min(5.0, remaining_for_browse - 12.0)
            await _browse_search_results(page, deadline=time.monotonic() + browse_budget)

        chosen = await _hunt_for_video(
            page,
            target_title,
            allowed_keywords,
            deadline=deadline,
            exclude_video_ids=exclude_video_ids,
        )
        if chosen is None:
            return False
        phase = "result_click"
        logger.info("YouTube search phase | id=%s | phase=%s | url=%s", log_id, phase, getattr(page, "url", ""))
        chosen_href = str(await chosen.get_attribute("href") or "")

        url_before_click = str(getattr(page, "url", "") or "")
        chosen_video_id = _youtube_video_id(chosen_href)

        def watch_url_matches() -> bool:
            current_url = str(getattr(page, "url", "") or "")
            current_video_id = _youtube_video_id(current_url)
            return (
                current_url != url_before_click
                and _is_youtube_watch_url(current_url)
                and (not chosen_video_id or current_video_id == chosen_video_id)
            )

        async def wait_for_watch_url(timeout: int) -> bool:
            """Poll URL directly; CloakBrowser can miss navigation in wait_for_function."""
            poll_deadline = time.monotonic() + max(0.0, float(timeout or 0) / 1000.0)
            while True:
                if watch_url_matches():
                    return True
                remaining = poll_deadline - time.monotonic()
                if remaining <= 0:
                    return watch_url_matches()
                try:
                    await _await_with_deadline(asyncio.sleep(min(0.1, remaining)), deadline)
                except asyncio.TimeoutError:
                    return watch_url_matches()

        def log_watch_observed(method: str) -> None:
            current_url = str(getattr(page, "url", "") or "")
            logger.info(
                "YouTube search phase | id=%s | phase=result_click_observed | method=%s | url=%s | expected_video_id=%s | actual_video_id=%s | elapsed=%.1fs | remaining=%.1fs",
                log_id,
                method,
                current_url,
                chosen_video_id,
                _youtube_video_id(current_url),
                time.monotonic() - started,
                _remaining_deadline_seconds(deadline) or 0.0,
            )

        await _await_with_deadline(move_to_locator(page, chosen), deadline)
        await _await_with_deadline(random_delay(0.3, 0.8), deadline)
        opened_watch = False
        try:
            await _await_with_deadline(chosen.click(timeout=_deadline_timeout_ms(deadline, 3000)), deadline)
            opened_watch = watch_url_matches()
            if not opened_watch:
                opened_watch = await _await_with_deadline(
                    wait_for_watch_url(_deadline_timeout_ms(deadline, 1500)), deadline
                )
            if opened_watch:
                log_watch_observed("locator_click")
        except Exception as exc:
            opened_watch = watch_url_matches()
            if opened_watch:
                log_watch_observed("locator_exception_probe")
            else:
                logger.info(
                    "YouTube result locator click failed; using focus/Enter fallback | id=%s | error=%s | url=%s",
                    log_id,
                    exc,
                    getattr(page, "url", ""),
                )
        if not opened_watch:
            try:
                await _await_with_deadline(chosen.focus(timeout=_deadline_timeout_ms(deadline, 2000)), deadline)
                await _await_with_deadline(page.keyboard.press("Enter"), deadline)
                opened_watch = await _await_with_deadline(
                    wait_for_watch_url(_deadline_timeout_ms(deadline, 1500)), deadline
                )
                if opened_watch:
                    log_watch_observed("focus_enter")
            except Exception:
                opened_watch = False
        if not opened_watch and not _deadline_expired(deadline):
            dom_clicked = bool(
                await _await_with_deadline(page.evaluate(
                    """
                    ({href}) => {
                        if (!href) return false;
                        const candidates = Array.from(document.querySelectorAll(
                            'ytd-video-renderer #video-title[href*="/watch?v="], a#video-title[href*="/watch?v="]'
                        ));
                        const selected = candidates.find((link) => (link.getAttribute('href') || '') === href);
                        if (!selected) return false;
                        selected.scrollIntoView({block: 'center', inline: 'center'});
                        selected.click();
                        return true;
                    }
                    """,
                    {"href": chosen_href},
                    ),
                    deadline,
                )
            )
            opened_watch = dom_clicked and await _await_with_deadline(
                wait_for_watch_url(_deadline_timeout_ms(deadline, 1500)), deadline
            )
            if opened_watch:
                log_watch_observed("dom_click")
        if not opened_watch:
            return False
        logger.info(
            "YouTube search phase | id=%s | phase=result_click_confirmed | url=%s | remaining=%.1fs | settle=watch_phase",
            log_id,
            getattr(page, "url", ""),
            _remaining_deadline_seconds(deadline) or 0.0,
        )
        # Preserve the confirmed watch page for the watcher. Settling here can
        # consume the search deadline, then incorrectly retry search on video.
        return True
    except _YouTubeSearchSurfaceUnavailable:
        raise
    except Exception as exc:
        logger.warning("Lỗi search-and-pick '%s' | phase=%s | error=%s", topic, phase, exc)
        return False


async def _open_related_only(
    page,
    allowed_keywords: list[str] | None = None,
    exclude_video_ids: set[str] | None = None,
    deadline: float | None = None,
) -> bool:
    """Open one sidebar suggested video via real DOM click (no URL injection).

    Returns True only when the URL actually changed after clicking. Does NOT
    watch the video — the caller controls watch time."""
    if not _is_youtube_watch_url(getattr(page, "url", "")):
        logger.info("Không mở sidebar related vì trang hiện tại chưa phải video watch: %s", getattr(page, "url", ""))
        return False
    if _deadline_expired(deadline):
        logger.info("YouTube related skipped | reason=deadline_expired")
        return False
    try:
        try:
            is_theater = await page.evaluate(
                """
                () => {
                    const ytdApp = document.querySelector('ytd-app');
                    if (ytdApp && ytdApp.hasAttribute('theater')) return true;
                    if (document.querySelector('#player-theater-container #movie_player')) return true;
                    return document.querySelector('ytd-watch-flexy[theater]') !== null;
                }
                """
            )
            if is_theater:
                await page.keyboard.press("t")
                await random_delay(1.2, 2.0)
                logger.info("Đã tắt theater mode để hiện sidebar")
        except Exception:
            pass

        await page.keyboard.press("Home")
        await random_delay(1.0, 2.0)

        related_data = await page.evaluate(
            """
            () => {
                const results = [];
                let currentVideoId = '';
                try { currentVideoId = new URL(window.location.href).searchParams.get('v') || ''; } catch(e) {}
                const containers = document.querySelectorAll(
                    '#secondary ytd-compact-video-renderer, ' +
                    '#related ytd-compact-video-renderer, ' +
                    'ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer'
                );
                for (const el of containers) {
                    if (el.querySelector('[class*="now-playing"]')) continue;
                    const txt = el.textContent || '';
                    if (txt.includes('Now playing') || txt.includes('Đang phát')) continue;
                    const titleEl = el.querySelector('#video-title');
                    if (!titleEl) continue;
                    const href = titleEl.getAttribute('href');
                    if (!href || !href.includes('/watch?v=') || href.includes('/shorts/')) continue;
                    if (el.matches("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]") || el.querySelector("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]")) continue;
                    const cardText = (el.innerText || el.textContent || '').toLowerCase();
                    if (['sponsored', 'promoted', 'advertisement', 'quảng cáo'].some(marker => cardText.includes(marker))) continue;
                    try {
                        const vid = new URL(href, window.location.origin).searchParams.get('v');
                        if (vid === currentVideoId) continue;
                        const title = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
                        if (title.length > 3 && !title.includes('Now playing') && !title.includes('Đang phát')) {
                            results.push({href, title: title.substring(0, 80), videoId: vid});
                        }
                    } catch (e) {}
                    if (results.length >= 10) break;
                }
                return results;
            }
            """
        )
        if not related_data:
            await human_scroll(page, "down", random.randint(300, 500))
            await random_delay(2.0, 3.0)
            related_data = await page.evaluate(
                """
                () => {
                    const results = [];
                    let currentVideoId = '';
                    try { currentVideoId = new URL(window.location.href).searchParams.get('v') || ''; } catch(e) {}
                    const links = document.querySelectorAll(
                        '#secondary a[href*="/watch?v="], ' +
                        '#related a[href*="/watch?v="], ' +
                        'ytd-watch-next-secondary-results-renderer a[href*="/watch?v="]'
                    );
                    for (const a of links) {
                        const href = a.getAttribute('href');
                        if (!href || href.includes('/shorts/')) continue;
                    const card = a.closest('ytd-compact-video-renderer, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer') || a;
                    const cardText = (card.innerText || card.textContent || '').toLowerCase();
                    if (card.matches("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]") || card.querySelector("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]") || ['sponsored', 'promoted', 'advertisement', 'quảng cáo'].some(marker => cardText.includes(marker))) continue;
                        try {
                            const vid = new URL(href, window.location.origin).searchParams.get('v');
                            if (vid && vid !== currentVideoId) {
                                const title = (a.textContent || '').trim();
                                if (title.length > 3 && title.length < 200 && !title.includes('Now playing') && !title.includes('Đang phát')) {
                                    results.push({href, title: title.substring(0, 80), videoId: vid});
                                }
                            }
                        } catch (e) {}
                        if (results.length >= 10) break;
                    }
                    return results;
                }
                """
            )
        if not related_data:
            logger.info("Không tìm thấy video đề xuất trong sidebar")
            return False
        related_data = _filter_video_candidates_by_excluded_ids(related_data, exclude_video_ids)
        if allowed_keywords:
            before = len(related_data)
            related_data = _filter_video_candidates_by_keywords(related_data, allowed_keywords)
            logger.info("Sidebar lọc keyword: giữ %d/%d video", len(related_data), before)
        if not related_data:
            logger.info("Không có video sidebar nào khớp keyword, bỏ qua related")
            return False
        logger.info("Sidebar có %d video đề xuất phù hợp", len(related_data))

        await move_mouse_to(page, random.uniform(950, 1200), random.uniform(200, 400))
        await random_delay(0.6, 1.2)
        hover_count = min(random.randint(2, 3), len(related_data))
        for item in random.sample(related_data, hover_count):
            try:
                vid = item.get("videoId")
                if not vid:
                    continue
                el = page.locator(
                    f'#secondary a[href*="v={vid}"], '
                    f'#related a[href*="v={vid}"], '
                    f'ytd-watch-next-secondary-results-renderer a[href*="v={vid}"]'
                ).first
                await el.scroll_into_view_if_needed(timeout=2000)
                box = await el.bounding_box(timeout=2000)
                if box:
                    await move_mouse_to(
                        page,
                        box["x"] + box["width"] * random.uniform(0.3, 0.7),
                        box["y"] + box["height"] * random.uniform(0.3, 0.7),
                    )
                    await random_delay(0.6, 1.4)
            except Exception:
                pass

        chosen = random.choice(related_data)
        chosen_vid = chosen.get("videoId") or ""
        logger.info("Đang click video đề xuất: '%s'", chosen.get("title", "")[:60])
        url_before = page.url
        clicked = False
        if chosen_vid:
            try:
                el = page.locator(
                    f'#secondary a[href*="v={chosen_vid}"], '
                    f'#related a[href*="v={chosen_vid}"], '
                    f'ytd-watch-next-secondary-results-renderer a[href*="v={chosen_vid}"]'
                ).first
                await el.scroll_into_view_if_needed(timeout=3000)
                await random_delay(0.3, 0.6)
                await move_to_locator(page, el)
                await random_delay(0.3, 0.8)
                await el.click()
                clicked = True
            except Exception:
                pass
        if not clicked:
            clicked = await page.evaluate(
                """
                ({videoId, href}) => {
                    if (!videoId) return false;
                    const anchors = Array.from(document.querySelectorAll(
                        '#secondary a[href*="/watch?v="], ' +
                        '#related a[href*="/watch?v="], ' +
                        'ytd-watch-next-secondary-results-renderer a[href*="/watch?v="]'
                    ));
                    const link = anchors.find((a) => {
                        const rawHref = a.getAttribute('href') || '';
                        try {
                            return new URL(rawHref, window.location.origin).searchParams.get('v') === videoId;
                        } catch (e) { return href && rawHref === href; }
                    });
                    if (!link) return false;
                    link.scrollIntoView({block: 'center', inline: 'center'});
                    link.click();
                    return true;
                }
                """,
                {"videoId": chosen_vid, "href": chosen.get("href", "")},
            )
        if not clicked:
            logger.info("Không click được video sidebar — không tự điều hướng bằng URL")
            return False
        try:
            await page.wait_for_function(
                "previous => window.location.href !== previous",
                arg=url_before,
                timeout=_deadline_timeout_ms(deadline, 10000),
            )
        except Exception:
            logger.info("Click sidebar không đổi URL — bỏ iter này")
            return False
        await page.wait_for_load_state(
            "domcontentloaded",
            timeout=_deadline_timeout_ms(deadline, 10000),
        )
        if _deadline_expired(deadline):
            return False
        await random_delay(2.0, 3.5)
        await maybe_handle_notification_popup(page)
        await dismiss_blocking_popups(page, "YouTube")
        logger.info("Đã mở video sidebar tại: %s", page.url)
        return True
    except Exception as exc:
        logger.info("Lỗi khi mở video sidebar: %s", exc)
        return False


async def _click_related_video(page, engagement: dict | None = None, allowed_keywords: list[str] | None = None):
    """Lướt sidebar video đề xuất bên phải, hover qua vài video, rồi click xem 1 video."""
    if not _is_youtube_watch_url(getattr(page, "url", "")):
        logger.info("Không mở sidebar related vì trang hiện tại chưa phải video watch: %s", getattr(page, "url", ""))
        return False
    try:
        # Thoát theater mode nếu đang bật (theater mode ẩn sidebar)
        try:
            is_theater = await page.evaluate("""
                () => {
                    const ytdApp = document.querySelector('ytd-app');
                    if (ytdApp && ytdApp.hasAttribute('theater')) return true;
                    const player = document.querySelector('#player-theater-container #movie_player');
                    if (player) return true;
                    return document.querySelector('ytd-watch-flexy[theater]') !== null;
                }
            """)
            if is_theater:
                await page.keyboard.press("t")
                await random_delay(1.5, 2.5)
                logger.info("Đã tắt theater mode để hiện sidebar")
        except Exception:
            pass

        # Cuộn về đầu trang để sidebar hiện rõ
        await page.keyboard.press("Home")
        await random_delay(1.5, 2.5)

        # Dùng JavaScript để tìm video đề xuất — đáng tin cậy hơn CSS selector
        related_data = await page.evaluate("""
            () => {
                const results = [];
                // Lấy video ID hiện tại từ URL
                let currentVideoId = '';
                try {
                    const urlParams = new URL(window.location.href).searchParams;
                    currentVideoId = urlParams.get('v') || '';
                } catch(e) {}

                const containers = document.querySelectorAll(
                    '#secondary ytd-compact-video-renderer, ' +
                    '#related ytd-compact-video-renderer, ' +
                    'ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer'
                );
                for (const el of containers) {
                    // Bỏ qua video đang phát (có badge "Now playing")
                    if (el.querySelector('[class*="now-playing"]') ||
                        el.textContent.includes('Now playing') ||
                        el.textContent.includes('Đang phát')) continue;

                    const titleEl = el.querySelector('#video-title');
                    if (!titleEl) continue;
                    const href = titleEl.getAttribute('href');
                    if (!href || !href.includes('/watch?v=') || href.includes('/shorts/')) continue;
                    if (el.matches("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]") || el.querySelector("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]")) continue;
                    const cardText = (el.innerText || el.textContent || '').toLowerCase();
                    if (['sponsored', 'promoted', 'advertisement', 'quảng cáo'].some(marker => cardText.includes(marker))) continue;

                    // Lọc bỏ video đang phát bằng video ID
                    try {
                        const videoId = new URL(href, window.location.origin).searchParams.get('v');
                        if (videoId === currentVideoId) continue;
                    } catch(e) {}

                    const title = titleEl.getAttribute('title') || titleEl.textContent.trim();
                    if (title.length > 3) {
                        results.push({href, title: title.substring(0, 80), videoId: new URL(href, window.location.origin).searchParams.get('v')});
                    }
                    if (results.length >= 10) break;
                }

                // Fallback: tìm link /watch trong sidebar (không phải video hiện tại)
                if (results.length === 0) {
                    const sidebarLinks = document.querySelectorAll(
                        '#secondary a#video-title[href*="/watch?v="], ' +
                        '#related a#video-title[href*="/watch?v="]'
                    );
                    for (const a of sidebarLinks) {
                        const href = a.getAttribute('href');
                        if (!href || href.includes('/shorts/')) continue;
                    const card = a.closest('ytd-compact-video-renderer, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer') || a;
                    const cardText = (card.innerText || card.textContent || '').toLowerCase();
                    if (card.matches("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]") || card.querySelector("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]") || ['sponsored', 'promoted', 'advertisement', 'quảng cáo'].some(marker => cardText.includes(marker))) continue;
                        try {
                            const videoId = new URL(href, window.location.origin).searchParams.get('v');
                            if (videoId === currentVideoId) continue;
                        } catch(e) {}
                        const title = a.getAttribute('title') || a.textContent.trim();
                        if (title.length > 3) {
                            results.push({href, title: title.substring(0, 80), videoId: new URL(href, window.location.origin).searchParams.get('v')});
                        }
                        if (results.length >= 10) break;
                    }
                }
                return results;
            }
        """)

        if not related_data:
            # Thử cuộn xuống rồi tìm lại (lazy load)
            await human_scroll(page, "down", random.randint(300, 500))
            await random_delay(2.0, 3.0)
            related_data = await page.evaluate("""
                () => {
                    const results = [];
                    const allLinks = document.querySelectorAll(
                        '#secondary a[href*="/watch?v="], ' +
                        '#related a[href*="/watch?v="], ' +
                        'ytd-watch-next-secondary-results-renderer a[href*="/watch?v="]'
                    );
                    const currentUrl = window.location.href;
                    const currentVideoId = new URLSearchParams(new URL(currentUrl).search).get('v');
                    for (const a of allLinks) {
                        const href = a.getAttribute('href');
                        if (!href || href.includes('/shorts/')) continue;
                    const card = a.closest('ytd-compact-video-renderer, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer') || a;
                    const cardText = (card.innerText || card.textContent || '').toLowerCase();
                    if (card.matches("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]") || card.querySelector("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [aria-label*='Sponsored' i], [aria-label*='Advertisement' i], [aria-label*='Quảng cáo' i], [class*='sponsored' i], [class*='promoted' i]") || ['sponsored', 'promoted', 'advertisement', 'quảng cáo'].some(marker => cardText.includes(marker))) continue;
                        const videoId = new URLSearchParams(new URL(href, window.location.origin).search).get('v');
                        if (videoId && videoId !== currentVideoId) {
                            const title = a.textContent.trim();
                            if (title.length > 3 && title.length < 200) {
                                results.push({href, title: title.substring(0, 80), videoId});
                            }
                        }
                        if (results.length >= 10) break;
                    }
                    return results;
                }
            """)

        if not related_data:
            logger.info("Không tìm thấy video đề xuất trong sidebar")
            return False
        if allowed_keywords:
            before = len(related_data)
            related_data = _filter_video_candidates_by_keywords(related_data, allowed_keywords)
            logger.info("Sidebar phụ lọc keyword: giữ %d/%d video", len(related_data), before)
        if not related_data:
            logger.info("Không có video sidebar phụ nào khớp keyword")
            return False

        logger.info("Tìm thấy %d video đề xuất trong sidebar", len(related_data))

        # Di chuột sang vùng sidebar bên phải
        await move_mouse_to(page, random.uniform(950, 1200), random.uniform(200, 400))
        await random_delay(0.8, 1.5)

        # Hover qua vài video đề xuất
        hover_count = min(random.randint(2, 4), len(related_data))
        hover_targets = random.sample(related_data, hover_count)
        for item_data in hover_targets:
            try:
                video_id = item_data["href"].split("v=")[1].split("&")[0] if "v=" in item_data["href"] else ""
                if not video_id:
                    continue
                el = page.locator(
                    f'#secondary a[href*="v={video_id}"], '
                    f'#related a[href*="v={video_id}"], '
                    f'ytd-watch-next-secondary-results-renderer a[href*="v={video_id}"]'
                ).first
                await el.scroll_into_view_if_needed(timeout=2000)
                box = await el.bounding_box(timeout=2000)
                if box:
                    await move_mouse_to(
                        page,
                        box["x"] + box["width"] * random.uniform(0.3, 0.7),
                        box["y"] + box["height"] * random.uniform(0.3, 0.7),
                    )
                    await random_delay(0.8, 2.0)
                    logger.debug("Hover video đề xuất: '%s'", item_data["title"][:40])
            except Exception:
                pass

        # Cuộn sidebar xuống một chút rồi lên lại
        await human_scroll(page, "down", random.randint(200, 400))
        await random_delay(1.0, 2.0)
        await human_scroll(page, "up", random.randint(100, 250))
        await random_delay(0.8, 1.5)

        # Chọn 1 video ngẫu nhiên để click
        chosen = random.choice(related_data)
        chosen_video_id = chosen["href"].split("v=")[1].split("&")[0] if "v=" in chosen["href"] else ""
        logger.info("Đang click video đề xuất sidebar: '%s'", chosen["title"][:50])

        clicked = False
        url_before_click = page.url
        if chosen_video_id:
            try:
                chosen_el = page.locator(
                    f'#secondary a[href*="v={chosen_video_id}"], '
                    f'#related a[href*="v={chosen_video_id}"], '
                    f'ytd-watch-next-secondary-results-renderer a[href*="v={chosen_video_id}"]'
                ).first
                await chosen_el.scroll_into_view_if_needed(timeout=3000)
                await random_delay(0.3, 0.6)
                await move_to_locator(page, chosen_el)
                await random_delay(0.4, 1.0)
                await chosen_el.click()
                clicked = True
            except Exception:
                pass

        if not clicked:
            clicked = await page.evaluate(
                """
                ({videoId, href}) => {
                    if (!videoId) return false;
                    const anchors = Array.from(document.querySelectorAll(
                        '#secondary a[href*="/watch?v="], ' +
                        '#related a[href*="/watch?v="], ' +
                        'ytd-watch-next-secondary-results-renderer a[href*="/watch?v="]'
                    ));
                    const link = anchors.find((anchor) => {
                        const rawHref = anchor.getAttribute('href') || '';
                        try {
                            const foundId = new URL(rawHref, window.location.origin).searchParams.get('v');
                            if (foundId === videoId) return true;
                        } catch(e) {}
                        return href && rawHref === href;
                    });
                    if (!link) return false;
                    link.scrollIntoView({block: 'center', inline: 'center'});
                    link.click();
                    return true;
                }
                """,
                {"videoId": chosen_video_id, "href": chosen.get("href", "")},
            )

        if not clicked:
            logger.info("Không click được video đề xuất sidebar, không tự điều hướng bằng URL")
            return False

        try:
            await page.wait_for_function("previous => window.location.href !== previous", arg=url_before_click, timeout=10000)
        except Exception:
            logger.info("Click video đề xuất sidebar không đổi URL, dừng để tránh tiêm URL")
            return False
        await page.wait_for_load_state("domcontentloaded", timeout=10000)
        await random_delay(2.0, 4.0)

        await maybe_handle_notification_popup(page)
        await dismiss_blocking_popups(page, "YouTube")
        logger.info("Đang xem video đề xuất tại: %s", page.url)

        engagement = _normalize_engagement_config(engagement)
        await _watch_video_capped(
            page,
            random.uniform(40, 90),
            min_watch_seconds=25,
            player_behavior=engagement.get("player_behavior"),
        )

        engagement = _normalize_engagement_config(engagement)
        await maybe_like_video(page, like_rate=engagement["like_rate"])
        await maybe_comment_video(page, comment_pool=engagement["comment_pool"], comment_rate=engagement["comment_rate"], ai_comment_settings=engagement.get("ai_comment_settings"))
        await human_read_and_scroll(page, cycles=random.randint(1, 2))
        logger.info("Hoàn thành xem video đề xuất sidebar")
        return True

    except Exception as exc:
        logger.info("Không thể xem video đề xuất sidebar: %s", exc)
        return False


def build_competitor_nurture_plan(
    competitor_titles: list[str] | None = None,
    competitor_hashtags: list[str] | None = None,
    competitor_keywords: list[str] | None = None,
    competitor_urls: list[str] | None = None,
) -> dict:
    """
    Quy trình Nuôi Kênh Chuẩn Theo Tiêu Đề & Hashtag Đối Thủ:
    1. Tách sạch các Hashtags (#tomtatphim -> tomtatphim / tóm tắt phim).
    2. Rút trích các cụm từ đắt giá từ Tiêu đề video đối thủ (bỏ emoji, dấu ngoặc, ký tự giật gân).
    3. Tuyệt đối loại bỏ URL (http/https/youtube.com) khỏi danh sách tìm kiếm để không tiêm link vào thanh search.
    4. Trả về:
       - search_topics: Hàng đợi từ khóa tìm kiếm tự nhiên trên YouTube.
       - allowed_keywords: Bộ lọc kiểm tra tính liên quan khi click video.
       - competitor_urls: Danh sách URL kênh đối thủ (dùng cho luồng ghé thăm kênh đối thủ).
    """
    import re
    search_topics: list[str] = []
    allowed_keywords: list[str] = []
    valid_channel_urls: list[str] = []

    # 1. Xử lý URLs kênh đối thủ (chỉ lưu vào danh sách duyệt kênh, KHÔNG đưa vào search box)
    for u in (competitor_urls or []):
        raw_u = str(u).strip()
        if not raw_u:
            continue
        if raw_u.startswith("http://") or raw_u.startswith("https://") or "youtube.com" in raw_u:
            if raw_u not in valid_channel_urls:
                valid_channel_urls.append(raw_u)
        else:
            # Nếu người dùng nhập tên kênh (ví dụ: "Review Phim Hay") -> có thể dùng làm từ khóa tìm kiếm
            if raw_u not in search_topics:
                search_topics.append(raw_u)

    # 2. Xử lý Hashtags đối thủ (#reviewphim, #tomtatphim...)
    for h in (competitor_hashtags or []):
        raw_h = str(h).strip().lstrip("#").strip()
        if not raw_h or raw_h.startswith("http"):
            continue
        # Chuyển camelCase hoặc snake_case thành cụm từ tự nhiên nếu cần
        clean_h = re.sub(r"[_\-]+", " ", raw_h).strip()
        if clean_h and clean_h not in search_topics:
            search_topics.append(clean_h)
            allowed_keywords.append(clean_h.lower())

    # 3. Xử lý Tiêu đề video đối thủ
    for t in (competitor_titles or []):
        raw_t = str(t).strip()
        if not raw_t or raw_t.startswith("http"):
            continue
        # Loại bỏ các ký tự đặc biệt giật gân, dấu ngoặc vuông/tròn/nhọn
        clean_t = re.sub(r"[\[\]【】\(\)\{\}\|–—:;\"'!?#*]", " ", raw_t)
        clean_t = re.sub(r"\s+", " ", clean_t).strip()
        if clean_t:
            # Nếu tiêu đề quá dài (> 60 ký tự), lấy 6-8 từ đầu làm cụm từ tìm kiếm tự nhiên
            words = clean_t.split()
            if len(words) > 8:
                short_topic = " ".join(words[:7])
            else:
                short_topic = clean_t
            if short_topic and short_topic not in search_topics:
                search_topics.append(short_topic)

            # Bổ sung các từ khóa cốt lõi vào allowed_keywords
            for w in words:
                w_lower = w.lower()
                if len(w_lower) >= 3 and w_lower not in allowed_keywords:
                    allowed_keywords.append(w_lower)

    # 4. Bổ sung từ khóa kênh thông thường nếu có
    for kw in (competitor_keywords or []):
        raw_kw = str(kw).strip().strip('"').strip("'")
        if not raw_kw or raw_kw.startswith("http"):
            continue
        if raw_kw not in search_topics:
            search_topics.append(raw_kw)
        if raw_kw.lower() not in allowed_keywords:
            allowed_keywords.append(raw_kw.lower())

    # Lọc lại lần cuối đảm bảo 100% search_topics KHÔNG có URL
    search_topics = [
        s for s in search_topics
        if not s.startswith("http://") and not s.startswith("https://") and "youtube.com" not in s
    ]

    return {
        "search_topics": search_topics,
        "allowed_keywords": allowed_keywords[:40],
        "competitor_channel_urls": valid_channel_urls,
    }
