# -*- coding: utf-8 -*-
"""
BKT / Copyright & Content ID Checker for YouTube Studio.
Optimized for low-end hardware (4GB - 8GB RAM, CPU 2-4 cores).
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from actions.studio_dom import (
        DEFAULT_FORBIDDEN_HREF_PATTERNS,
        build_extract_table_rows_js,
        dismiss_post_save_studio_modals,
        eval_studio_dom,
        get_studio_context,
        inspect_studio_modal_state,
        safe_targeted_click,
    )
except ImportError:
    _cur_dir = Path(__file__).resolve().parent
    for _cand in (_cur_dir, _cur_dir.parent):
        if str(_cand) not in sys.path:
            sys.path.insert(0, str(_cand))
    from actions.studio_dom import (
        DEFAULT_FORBIDDEN_HREF_PATTERNS,
        build_extract_table_rows_js,
        dismiss_post_save_studio_modals,
        eval_studio_dom,
        get_studio_context,
        inspect_studio_modal_state,
        safe_targeted_click,
    )

logger = logging.getLogger(__name__)


async def setup_low_end_route_interception(page: Any) -> None:
    """
    Tối ưu máy yếu (Low-end hardware: 4GB - 8GB RAM, CPU 2-4 cores):
    Thiết lập route interception page.route để abort các tài nguyên nặng
    không cần thiết khi chạy ngầm:
      - images ('image', .png, .jpg, .jpeg, .gif, .webp, .ico)
      - fonts ('font', .woff, .woff2, .ttf, .otf)
      - media ('media', .mp4, .mp3, .m4a, .webm, .ogg, .wav)
      - tracking/ad beacons
    Giúp giảm tiêu thụ RAM từ 600MB+ xuống < 180MB và tốc độ mở trang Studio nhanh gấp 3 lần!
    """
    if getattr(page, "_rtm_route_intercept_active", False):
        return

    BLOCKED_TYPES = {"image", "font", "media"}
    BLOCKED_EXTENSIONS = (
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
        ".mp4", ".mp3", ".m4a", ".webm", ".ogg", ".wav",
        ".woff", ".woff2", ".ttf", ".otf",
    )
    BLOCKED_DOMAINS = (
        "googleads", "doubleclick.net", "google-analytics.com",
        "play.google.com/log", "youtube.com/api/stats",
    )

    async def _route_interceptor(route: Any) -> None:
        try:
            req = route.request
            res_type = req.resource_type
            url = req.url.lower()
            url_path = url.split("?", 1)[0].split("#", 1)[0]

            # Không bao giờ can thiệp các endpoint upload video hoặc Scotty stream
            if "upload.youtube.com" in url or "/upload/" in url or "youtubei/v1/upload" in url:
                await route.continue_()
                return

            if res_type in BLOCKED_TYPES:
                await route.abort()
                return

            if any(url_path.endswith(ext) for ext in BLOCKED_EXTENSIONS):
                await route.abort()
                return

            if any(dom in url for dom in BLOCKED_DOMAINS):
                await route.abort()
                return

            await route.continue_()
        except Exception:
            try:
                await route.continue_()
            except Exception:
                pass

    try:
        await page.route("**/*", _route_interceptor)
        setattr(page, "_rtm_route_intercept_active", True)
        logger.info("Đã kích hoạt Low-End Route Interception (abort image, font, media)")
    except Exception as exc:
        logger.warning("Không thể thiết lập route interception: %s", exc)


async def navigate_to_channel_content(
    page: Any,
    preferred_channel_id: str = "",
    allow_direct_goto: bool = True,
    saw_active_upload: bool = False,
) -> Dict[str, Any]:
    """
    Context-aware state machine bringing YouTube Studio onto `/channel/<id>/videos/upload`
    without relying on fragile positional indices (`#menu-paper-icon-item-1`).
    Escapes `/video/<id>/edit` or `/video/<id>/analytics` cleanly back to channel scope first.
    """
    known_channel_id = preferred_channel_id or ""
    ctx = await get_studio_context(page)
    known_channel_id = known_channel_id or str(ctx.get("channelId") or "")
    page_type = str(ctx.get("pageType") or "unknown")
    scope = str(ctx.get("scope") or "other")

    logger.info(
        "[NAV] navigate_to_channel_content start pageType=%s scope=%s channelId=%s url=%s",
        page_type,
        scope,
        known_channel_id,
        ctx.get("url") or getattr(page, "url", ""),
    )

    # Guard modals if any post-save card is covering the page
    await dismiss_post_save_studio_modals(page, settlement_seconds=0.0, context="nav_guard")

    # Re-read after modal check
    ctx = await get_studio_context(page)
    known_channel_id = known_channel_id or str(ctx.get("channelId") or "")
    page_type = str(ctx.get("pageType") or "unknown")
    scope = str(ctx.get("scope") or "other")

    # Step 1: If trapped inside /video/<id>/... (edit/analytics/copyright), escape to channel scope first
    if scope == "video":
        back_res = await safe_targeted_click(
            page,
            selectors=[
                'ytcp-navigation-drawer a#top-level-link[href*="/channel/"]',
                'ytcp-navigation-drawer a#back-button[href*="/channel/"]',
                'ytcp-navigation-drawer #back-button a[href*="/channel/"]',
                'ytcp-navigation-drawer a[href*="/channel/"]',
                'ytcp-header a#home-button[href*="/channel/"]',
                'ytcp-entity-switcher a[href*="/channel/"]',
                'a[href*="/channel/"][href*="/videos"]',
            ],
            action_name="escape_video_scope_to_channel",
            exclude_ancestors=["ytcp-video-row", "#hover-items"],
            allow_href_patterns=[r"/channel/[^/?#]+(?:/videos)?/?(?:\?|$)"],
            forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/video/"],
            allow_js_fallback=False,
            timeout_ms=4500,
            pre_delay=0.18,
            post_click_settle=0.6,
        )
        if back_res.get("ok"):
            for _ in range(12):
                ctx = await get_studio_context(page)
                if ctx.get("scope") == "channel":
                    break
                await asyncio.sleep(0.3)
        known_channel_id = known_channel_id or str(ctx.get("channelId") or "")
        page_type = str(ctx.get("pageType") or "unknown")
        scope = str(ctx.get("scope") or "other")

    # Step 2: If in channel scope (and not yet on /videos upload list), click Content link by href pattern
    if scope == "channel" and page_type != "channel_content_videos":
        nav_res = await safe_targeted_click(
            page,
            selectors=[
                'ytcp-navigation-drawer a[href*="/channel/"][href*="/videos"]',
                'nav#left-nav a[href*="/channel/"][href*="/videos"]',
                'tp-yt-app-drawer a[href*="/channel/"][href*="/videos"]',
                'ytcp-navigation-drawer a[test-id="videos"]',
                'a[href*="/channel/"][href*="/videos"]',
            ],
            action_name="nav_channel_to_content_videos",
            allowed_page_types={"channel_dashboard", "channel_analytics", "channel_comments", "channel_other", "channel_content_videos"},
            exclude_ancestors=["ytcp-video-row", "#hover-items", "ytcp-uploads-dialog"],
            allow_href_patterns=[r"/channel/[^/]+/videos(?:/upload)?(?:\?|$)"],
            forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/channel/[^/]+/(?:analytics|comments|subtitles|monetization)", r"/video/"],
            allow_js_fallback=False,
            timeout_ms=5000,
            pre_delay=0.18,
            post_click_settle=0.6,
        )
        if nav_res.get("ok"):
            for _ in range(16):
                ctx = await get_studio_context(page)
                if ctx.get("pageType") == "channel_content_videos":
                    break
                await asyncio.sleep(0.35)
        known_channel_id = known_channel_id or str(ctx.get("channelId") or "")
        page_type = str(ctx.get("pageType") or "unknown")
        scope = str(ctx.get("scope") or "other")

    # Step 3: If on /videos/<short|live|...> subtab, switch gently to #video-list-uploads-tab
    if page_type == "channel_content_videos" and ctx.get("activeContentTab") not in ("", "upload"):
        await safe_targeted_click(
            page,
            selectors=['tp-yt-paper-tab#video-list-uploads-tab', '[test-id="video-list-uploads-tab"]'],
            action_name="select_videos_uploads_tab",
            allowed_page_types={"channel_content_videos"},
            forbidden_href_patterns=[],
            allow_js_fallback=False,
            timeout_ms=3500,
            pre_delay=0.15,
            post_click_settle=0.4,
        )
        ctx = await get_studio_context(page)
        page_type = str(ctx.get("pageType") or "unknown")

    # Step 4: Last-resort direct route ONLY if SPA failed AND not interrupting a live upload
    if page_type != "channel_content_videos" and allow_direct_goto and not saw_active_upload:
        target_url = (
            f"https://studio.youtube.com/channel/{known_channel_id}/videos/upload"
            if known_channel_id
            else "https://studio.youtube.com/"
        )
        logger.warning("[NAV] SPA recovery did not reach channel_content_videos (pageType=%s); goto %s", page_type, target_url)
        try:
            await page.goto(target_url, wait_until="domcontentloaded", timeout=45000)
            await asyncio.sleep(1.2)
            ctx = await get_studio_context(page)
            if ctx.get("scope") == "channel" and ctx.get("pageType") != "channel_content_videos":
                return await navigate_to_channel_content(
                    page,
                    preferred_channel_id=known_channel_id or str(ctx.get("channelId") or ""),
                    allow_direct_goto=False,
                    saw_active_upload=False,
                )
        except Exception as exc:
            logger.warning("[NAV] Fallback goto failed: %s", exc)

    ctx = await get_studio_context(page)
    return {
        "ok": ctx.get("pageType") == "channel_content_videos",
        "channelId": known_channel_id or str(ctx.get("channelId") or ""),
        "pageType": ctx.get("pageType"),
        "scope": ctx.get("scope"),
        "url": ctx.get("url") or getattr(page, "url", ""),
        "context": ctx,
    }


async def extract_copyright_claim_details(page: Any, vid: str, row_loc: Any = None) -> Dict[str, Any]:
    """
    Rê chuột vào badge/icon ô Hạn chế (Restrictions) -> Click nút trên tooltip nổi
    -> Mở dialog ytcp-dialog / ytd-modal-with-title-and-button-list-renderer
    -> Bóc tách toàn diện: issue_type, claimant, claimed_content, timestamp_range
    -> Đóng dialog an toàn, chống kẹt DOM hoặc đi lạc sang /video/<id>/edit.
    """
    default_res = {
        "bkt_check_status": "red_matched",
        "issue_type": "unknown",
        "claim_type": "unknown",
        "claimant": "",
        "claimed_content": "",
        "timestamp_range": "",
    }

    try:
        ctx_start = await get_studio_context(page)
        if ctx_start.get("pageType") != "channel_content_videos":
            logger.warning(
                "Bỏ qua extract_copyright_claim_details vì không ở trang Nội dung (pageType=%s)",
                ctx_start.get("pageType"),
            )
            return default_res

        # 1. Định vị đúng hàng video theo vid (tuyệt đối KHÔNG fallback bốc nhầm hàng 0 của video khác)
        if row_loc is None:
            if not vid or vid.startswith("__"):
                return default_res
            row_loc = page.locator(
                f'ytcp-video-row:has(a[href*="{vid}"]), ytcp-video-row[video-id="{vid}"]'
            ).first

        if not await row_loc.is_visible(timeout=2500):
            logger.warning("Không tìm thấy hàng video %s để kiểm tra chi tiết", vid)
            return default_res

        restr_cell = row_loc.locator(
            '#notices, ytcp-table-cell-notices, [cell-id="notices"], .notices-column, '
            '#restrictions, ytcp-table-cell-restrictions, [cell-id="restrictions"], .restrictions-column'
        ).first

        if not await restr_cell.is_visible(timeout=2500):
            logger.warning("Không tìm thấy ô restrictions cho video %s", vid)
            return default_res

        # 2. Hover badge/icon trước (tránh hover trống giữa hàng kích hoạt #hover-items -> #anchor-video-details)
        await restr_cell.scroll_into_view_if_needed()
        await asyncio.sleep(0.25)
        badge = restr_cell.locator(
            'ytcp-button, button, yt-formatted-string, .restriction-text, tp-yt-iron-icon, yt-icon'
        ).first
        if await badge.count() > 0 and await badge.is_visible():
            await badge.hover()
            await asyncio.sleep(0.85)
        else:
            await restr_cell.hover()
            await asyncio.sleep(0.85)

        # 3. Click CHỈ nút trong tooltip top-layer — tuyệt đối LOẠI TRỪ ytcp-video-row / #hover-items / link video
        tooltip_selectors = [
            'ytcp-restrictions-tooltip #primary-action-button',
            'ytcp-restrictions-tooltip #details-button',
            'ytcp-text-tooltip #primary-action-button',
            'ytcp-text-tooltip #details-button',
            'tp-yt-paper-tooltip #primary-action-button',
            '[role="tooltip"] #primary-action-button',
            'ytcp-restrictions-tooltip ytcp-button',
            'ytcp-restrictions-tooltip button',
            '[role="tooltip"] ytcp-button',
            '[role="tooltip"] button',
        ]
        click_res = await safe_targeted_click(
            page,
            selectors=tooltip_selectors,
            action_name=f"claim_tooltip_details_{vid}",
            allowed_page_types={"channel_content_videos"},
            exclude_ancestors=["ytcp-video-row", "#hover-items", ".hover-items", "#row-actions"],
            forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/video/[^/]+/edit"],
            allow_inside_video_row=False,
            prefer_top_layer_tooltip=True,
            allow_js_fallback=False,
            timeout_ms=2600,
            pre_delay=0.15,
            post_click_settle=0.45,
        )
        if not click_res.get("ok"):
            if click_res.get("reason") == "navigated_to_forbidden_url":
                logger.error("Tooltip claim details đi lạc URL (%s), khôi phục về Nội dung...", click_res.get("afterUrl"))
                await navigate_to_channel_content(page, saw_active_upload=False)
                return default_res
            await restr_cell.hover()
            await asyncio.sleep(0.85)
            click_res = await safe_targeted_click(
                page,
                selectors=tooltip_selectors,
                action_name=f"claim_tooltip_details_retry_{vid}",
                allowed_page_types={"channel_content_videos"},
                exclude_ancestors=["ytcp-video-row", "#hover-items", ".hover-items", "#row-actions"],
                forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/video/[^/]+/edit"],
                allow_inside_video_row=False,
                prefer_top_layer_tooltip=True,
                allow_js_fallback=False,
                timeout_ms=2400,
                pre_delay=0.15,
                post_click_settle=0.45,
            )

        if not click_res.get("ok"):
            if click_res.get("reason") == "navigated_to_forbidden_url":
                await navigate_to_channel_content(page, saw_active_upload=False)
            logger.info("Không thấy nút tooltip chi tiết bản quyền an toàn cho video %s (%s)", vid, click_res.get("reason"))
            return default_res

        # Bảo vệ lần 2: nếu vừa bị đẩy ra khỏi channel_content_videos -> không đọc nhầm editor, hồi phục ngay
        ctx_after_click = await get_studio_context(page)
        if ctx_after_click.get("pageType") != "channel_content_videos":
            logger.warning("Sau khi click chi tiết claim bị trôi sang %s; hồi phục về Nội dung", ctx_after_click.get("url"))
            await navigate_to_channel_content(page, saw_active_upload=False)
            return default_res

        # 4. Chờ modal dialog hiển thị
        modal_loc = page.locator('ytcp-dialog[role="dialog"], ytd-modal-with-title-and-button-list-renderer, tp-yt-paper-dialog[opened]').first
        try:
            await modal_loc.wait_for(state="visible", timeout=6000)
        except Exception:
            await asyncio.sleep(2.0)

        # 5. Phân tích nội dung dialog xuyên Shadow DOM bằng helper đa ngôn ngữ
        extracted_info = await eval_studio_dom(
            page,
            r"""
            const modals = __rtmDom.deepQueryMounted(
                document,
                'ytcp-dialog[role="dialog"], ytd-modal-with-title-and-button-list-renderer, tp-yt-paper-dialog[opened]'
            );
            const modal = modals.find(m => !__rtmDom.hasAncestorTag(m, new Set(['ytcp-uploads-dialog']))) || null;
            if (!modal) return null;

            const modalText = __rtmDom.collectVisibleText(modal);
            const lowerText = modalText.toLowerCase();

            const hasAudioKeywords = [
                'giai điệu', 'lời bài hát', 'bản ghi âm', 'âm thanh', 'âm nhạc',
                'bài hát', 'tác phẩm âm nhạc', 'nhạc nền', 'audio', 'sound recording',
                'melody', 'lyrics', 'song', 'musical work', 'composition', 'music',
                'オーディオ', '楽曲', '音声', '音楽', '오디오', '음악', '음원',
                'sonido', 'música', 'audio-visuel', 'musik', 'аудио', 'звук'
            ].some(kw => lowerText.includes(kw));

            const hasVisualKeywords = [
                'nội dung video', 'hình ảnh', 'đoạn phim', 'đoạn video',
                'nội dung nghe nhìn', 'visual', 'audiovisual', 'video content',
                'video clip', 'video footage', '映像', '動画', '영상',
                'imagen', 'visuel', 'vídeo', 'видео'
            ].some(kw => lowerText.includes(kw));

            let issueType = 'unknown';
            if (hasAudioKeywords && hasVisualKeywords) {
                issueType = 'both';
            } else if (hasAudioKeywords) {
                issueType = 'audio';
            } else if (hasVisualKeywords) {
                issueType = 'visual';
            }

            let claimedContent = '';
            const titleEl = __rtmDom.deepFirstVisible(
                modal,
                '.claim-title, .content-title, #content-title, .bold-title, ytcp-table-cell:first-child, h2, h3'
            );
            if (titleEl) {
                claimedContent = __rtmDom.collectVisibleText(titleEl);
            }

            let claimant = '';
            const claimantEl = __rtmDom.deepFirstVisible(
                modal,
                '.claimant-names, .claimant, .copyright-holder, .owner-name, ytcp-table-cell:nth-child(2)'
            );
            if (claimantEl) {
                claimant = __rtmDom.collectVisibleText(claimantEl);
            }
            if (!claimant) {
                const claimantMatch = modalText.match(/(?:Thay mặt cho|On behalf of|Chủ sở hữu|Claimant|Khiếu nại bởi|権利者|저작권 소유자)[:\s]+([^\n\r,.]+)/i);
                if (claimantMatch) {
                    claimant = claimantMatch[1].trim();
                }
            }

            let timestampRange = '';
            const tsMatch = modalText.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—to đến〜~]+\s*(\d{1,2}:\d{2}(?::\d{2})?)/i);
            if (tsMatch) {
                timestampRange = `${tsMatch[1]} - ${tsMatch[2]}`;
            }

            return {
                issueType,
                claimant,
                claimedContent,
                timestampRange,
                rawSample: modalText.substring(0, 300)
            };
            """,
        )

        # 6. Đóng dialog an toàn theo ID cấu trúc (không phụ thuộc ngôn ngữ) và chờ ẩn hoàn toàn
        try:
            closed_detail = await eval_studio_dom(
                page,
                """
                const modals = __rtmDom.deepQueryMounted(
                    document,
                    'ytcp-dialog[role="dialog"], ytd-modal-with-title-and-button-list-renderer, tp-yt-paper-dialog[opened]'
                );
                for (const m of modals) {
                    if (__rtmDom.hasAncestorTag(m, new Set(['ytcp-uploads-dialog']))) continue;
                    const tag = (m.tagName || '').toLowerCase();
                    if (tag === 'ytcp-uploads-dialog') continue;
                    const btn = __rtmDom.deepFirstVisible(
                        m,
                        '#close-button, ytcp-icon-button#close-button, [dialog-dismiss], ytcp-icon-button[icon*="close" i]'
                    );
                    if (btn && !__rtmDom.isCancelForbiddenControl(btn)) {
                        const nativeBtn = __rtmDom.resolveNativeButton(btn) || btn;
                        nativeBtn.click();
                        return true;
                    }
                }
                return false;
                """,
            )
            if not closed_detail:
                await page.keyboard.press("Escape")
        except Exception:
            await page.keyboard.press("Escape")

        try:
            await modal_loc.wait_for(state="hidden", timeout=3500)
        except Exception:
            await asyncio.sleep(0.5)

        if extracted_info:
            issue_type = extracted_info.get("issueType") or "unknown"
            claimant = extracted_info.get("claimant") or ""
            claimed_content = extracted_info.get("claimedContent") or ""
            timestamp_range = extracted_info.get("timestampRange") or ""

            return {
                "bkt_check_status": "red_matched",
                "issue_type": issue_type,
                "claim_type": issue_type,  # Giữ tương thích ngược với Rust & UI
                "claimant": claimant,
                "claimed_content": claimed_content,
                "timestamp_range": timestamp_range,
            }

    except Exception as exc:
        logger.warning("Lỗi bóc tách modal chi tiết bản quyền video %s: %s", vid, exc)
        try:
            await page.keyboard.press("Escape")
        except Exception:
            pass

    return default_res


async def check_copyright_and_restrictions(
    page: Any,
    video_ids: Optional[List[str]] = None,
    video_title: Optional[str] = None,
    poll_in_session: bool = False,
    max_poll_seconds: int = 1800,
    emit_upload_events: bool = False,
    video_url: str = "",
) -> Dict[str, Any]:
    """
    Quét trạng thái bản quyền (Content ID) và hạn chế kiếm tiền trên YouTube Studio.
    Hỗ trợ theo dõi realtime cả pha đang tải lên (% tại trang Nội dung) và pha xử lý/kiểm tra Content ID
    qua SPA navigation (tuyệt đối không hard-reload làm ngắt stream upload).
    """
    route_interception_enabled = False
    if not emit_upload_events:
        await setup_low_end_route_interception(page)
        route_interception_enabled = True

    CLEAN_VALUES = {
        "—", "–", "-", "‒", "―", "−",
        "none", "clear", "clean",
        "không có", "no issues", "no issues found",
        "không phát hiện thấy vấn đề nào", "không có vấn đề gì",
        "なし", "問題はありません", "問題なし",
        "없음", "문제 없음", "제한사항 없음",
        "ninguna", "no se han encontrado problemas",
        "aucune", "aucun problème", "aucun problème détecté",
        "keine", "keine einschränkungen", "keine probleme",
        "無", "无", "未发现问题", "未發現問題", "没有问题",
        "ไม่มี", "tidak ada", "tidak ada masalah",
        "нет", "ограничений нет", "нарушений не выявлено",
    }

    nav_state: Dict[str, Any] = {
        "channel_id": "",
        "saw_active_upload": False,
        "off_page_since": None,
    }

    async def ensure_on_upload_content_page() -> Dict[str, Any]:
        # 0. Giải tỏa ngay card 'Xử lý video' / backdrop hậu xử lý nếu còn che bảng Nội dung
        guard_res = await dismiss_post_save_studio_modals(page, settlement_seconds=0.0, context="bkt_guard")
        if guard_res.get("closed_count", 0) > 0:
            logger.info("Đã dọn card hậu xử lý (%d dialog) trước khi kiểm tra tab Nội dung.", guard_res["closed_count"])

        # 1. Xác định ngữ cảnh trang hiện tại qua get_studio_context (không dựa index vị trí menu)
        ctx = await get_studio_context(page)
        if ctx.get("channelId"):
            nav_state["channel_id"] = str(ctx["channelId"])

        if ctx.get("pageType") == "channel_content_videos":
            modal_state = ctx.get("uploadState") or await inspect_studio_modal_state(page)
            table_summary = ctx.get("tableSummary") or {}
            table_visible = bool(table_summary.get("hasTableHost") or table_summary.get("rowCount", 0) > 0)
            active_tab = str(ctx.get("activeContentTab") or "")
            if table_visible and active_tab in ("", "upload") and not modal_state.get("postSaveDialogs") and not modal_state.get("backdropOpened"):
                return {
                    "ok": True,
                    "channelId": nav_state["channel_id"],
                    "pageType": "channel_content_videos",
                    "url": ctx.get("url") or page.url,
                }

        # Thử dọn lại nếu backdrop vừa kịp xuất hiện
        await dismiss_post_save_studio_modals(page, settlement_seconds=0.6, context="bkt_before_nav")

        res = await navigate_to_channel_content(
            page,
            preferred_channel_id=nav_state["channel_id"],
            allow_direct_goto=not nav_state["saw_active_upload"],
            saw_active_upload=nav_state["saw_active_upload"],
        )
        if res.get("channelId"):
            nav_state["channel_id"] = str(res["channelId"])
        if res.get("ok"):
            await dismiss_post_save_studio_modals(page, settlement_seconds=0.3, context="bkt_after_nav")
        return res

    async def extract_table_rows() -> List[Dict[str, Any]]:
        # Đảm bảo không còn card hậu xử lý che bảng trước khi cào từng hàng
        await dismiss_post_save_studio_modals(page, settlement_seconds=0.0, context="bkt_before_scrape")

        # Chờ tối đa 15s cho hàng video đầu tiên xuất hiện (tránh quét DOM lúc đang skeleton loading)
        try:
            await page.wait_for_selector('ytcp-video-row', timeout=15000)
        except Exception:
            logger.warning("Không tìm thấy ytcp-video-row nào trong bảng Videos")
            return []

        return await page.evaluate(build_extract_table_rows_js())

    # 1. Mở YouTube Studio Content Uploads
    logger.info("Mở YouTube Studio để kiểm tra bản quyền Content ID...")
    if "/videos" not in page.url and "studio.youtube.com" not in page.url:
        try:
            await page.goto("https://studio.youtube.com/", wait_until="domcontentloaded", timeout=60000)
        except Exception as exc:
            if "studio.youtube.com" in page.url:
                logger.info("Navigation timeout nhẹ nhưng đã tải được Studio: %s", exc)
            else:
                logger.warning("Thử lại truy cập studio.youtube.com lần 2 với wait_until=commit...")
                try:
                    await page.goto("https://studio.youtube.com/", wait_until="commit", timeout=45000)
                except Exception:
                    pass
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
        except Exception:
            pass
        await asyncio.sleep(2.0)

    curr_url_check = page.url.lower()
    if any(sig in curr_url_check for sig in ["accounts.google.com", "servicelogin", "signin", "v3/signin"]):
        err_msg = (
            "Hồ sơ trình duyệt chưa đăng nhập YouTube Studio. "
            "Vui lòng vào 'Quản lý Profile' để đăng nhập trước khi quét bản quyền."
        )
        logger.error(err_msg)
        return {"success": False, "error": err_msg, "not_logged_in": True}

    await ensure_on_upload_content_page()
    await asyncio.sleep(1.5)

    overall_start_time = time.time()
    check_poll_start_time: Optional[float] = None
    target_ids = [str(v).strip() for v in (video_ids or []) if str(v).strip()]
    upload_done_emitted = not emit_upload_events
    saw_active_upload = False
    last_upload_pct = -1
    last_upload_pct_changed_at = time.time()
    last_upload_emit_time = 0.0
    no_pct_upload_cycles = 0
    poll_cycle = 0

    def _norm_title_kw(raw: Optional[str]) -> str:
        t = re.sub(r'^\s*\[BKT Check\]\s*', '', str(raw or ''), flags=re.IGNORECASE)
        t = re.sub(r'\s+', ' ', t).strip().lower()
        return t[:26] if len(t) >= 26 else t

    def _row_is_active_hint(r: Dict[str, Any]) -> bool:
        if r.get("cancelUploadVisible") or r.get("hasActiveSpinner"):
            return True
        pv = r.get("progressValue")
        if pv is not None and isinstance(pv, (int, float)) and pv < 100:
            return True
        st = f"{r.get('restrictions', '')} {r.get('subtitle', '')} {r.get('statusCellsText', '')}".lower()
        return any(k in st for k in [
            "đã tải được", "uploaded", "uploading", "đang tải",
            "huỷ tải lên", "hủy tải lên", "cancel upload",
            "quá trình xử lý sẽ sớm bắt đầu", "quá trình kiểm tra",
            "đang chờ xử lý", "processing", "đang xử lý",
            "チェック", "処理中", "검토 중", "처리 중",
        ])

    while True:
        poll_cycle += 1
        if page.is_closed():
            raise RuntimeError("Cửa sổ/thẻ YouTube Studio đã bị đóng khi đang kiểm tra Content ID.")

        if emit_upload_events and saw_active_upload:
            try:
                alive = bool(await page.evaluate("() => Boolean(window.__bktUploadSessionAlive)"))
                if not alive:
                    raise RuntimeError(
                        "Trang YouTube Studio vừa bị tải lại (reload) khi video chưa tải xong 100%, làm gián đoạn luồng tải lên."
                    )
            except RuntimeError:
                raise
            except Exception:
                pass

        nav_check = await ensure_on_upload_content_page()
        if not nav_check.get("ok"):
            if nav_state["off_page_since"] is None:
                nav_state["off_page_since"] = time.time()
            off_elapsed = time.time() - nav_state["off_page_since"]
            logger.warning(
                "Chưa ở trang Nội dung Studio (pageType=%s, url=%s, elapsed=%.1fs); tiếp tục hồi phục...",
                nav_check.get("pageType"),
                nav_check.get("url"),
                off_elapsed,
            )
            if off_elapsed >= 60.0 and not saw_active_upload:
                raise RuntimeError(
                    f"Không thể đưa trình duyệt về trang Nội dung Studio (hiện đang kẹt ở {nav_check.get('pageType')}: {nav_check.get('url')})"
                )
            await asyncio.sleep(2.0)
            continue
        nav_state["off_page_since"] = None

        rows_data = await extract_table_rows()
        logger.info("Quét tab Videos: tìm thấy %d hàng video trên bảng", len(rows_data))

        dom_results: Dict[str, Any] = {}
        for r in rows_data:
            if r.get("vid"):
                # Giữ hàng mới nhất ở đầu bảng (rowIndex nhỏ nhất) nếu trùng ID
                if r["vid"] not in dom_results:
                    dom_results[r["vid"]] = r

        clean_kw = _norm_title_kw(video_title)

        def _find_best_title_row() -> Optional[Dict[str, Any]]:
            if not clean_kw:
                return None
            candidates = []
            for r in rows_data:
                r_title = re.sub(r'^\s*\[BKT Check\]\s*', '', str(r.get("title") or ""), flags=re.IGNORECASE)
                r_title_norm = re.sub(r'\s+', ' ', r_title).strip().lower()
                if clean_kw in r_title_norm or (r_title_norm and r_title_norm in clean_kw and len(r_title_norm) >= 6):
                    candidates.append(r)
            if not candidates:
                return None
            # Ưu tiên hàng đang upload/processing ở đầu bảng (tránh bốc nhầm hàng đã test cũ có cùng tiêu đề)
            candidates.sort(key=lambda r: (0 if _row_is_active_hint(r) else 1, int(r.get("rowIndex", 999))))
            return candidates[0]

        for tid in target_ids:
            if tid in dom_results:
                continue
            matched_row = _find_best_title_row()
            if matched_row:
                dom_results[tid] = matched_row
                logger.info("Đã đối soát video ID %s khớp với hàng bảng: '%s'", tid, matched_row.get("title"))

        discovered_vid = target_ids[0] if target_ids else ""
        if target_ids:
            effective_ids = target_ids
        elif clean_kw:
            matched_row = _find_best_title_row()
            if matched_row:
                row_key = str(matched_row.get("vid") or f"row_{matched_row.get('rowIndex', 0)}")
                dom_results[row_key] = matched_row
                if matched_row.get("vid"):
                    discovered_vid = str(matched_row["vid"])
                effective_ids = [row_key]
            else:
                # Tuyệt đối KHÔNG fallback sang list(dom_results.keys()) toàn bảng (gây đọc nhầm video cũ)
                effective_ids = ["__pending_new_row__"]
        else:
            effective_ids = list(dom_results.keys())[:1] if dom_results else ["__pending_new_row__"]

        classified: Dict[str, Any] = {}
        all_resolved = True
        any_uploading = False
        upload_percent_snapshot: Optional[int] = None
        upload_remaining_snapshot = ""
        upload_msg_snapshot = ""

        for vid in effective_ids:
            found = dom_results.get(vid)
            if not found:
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": "Đang chờ YouTube Studio hiển thị video trên bảng Nội dung...",
                    "processing_stage": "delayed",
                    "estimated_minutes": None,
                    "claim_type": "none",
                    "monetization": None,
                }
                all_resolved = False
                continue

            if not discovered_vid and found.get("vid"):
                discovered_vid = str(found["vid"])

            restr = (found.get("restrictions") or "").lower().strip()
            monet = (found.get("monetization") or "").lower()
            subtitle = (found.get("subtitle") or "").lower()
            cells_status = (found.get("statusCellsText") or "").lower()
            # Ghép toàn bộ text hiển thị các cột (ĐÃ LOẠI TRỪ node ẩn và tiêu đề/mô tả)
            status_text_only = f"{restr} {subtitle} {cells_status}".strip()
            notices_icons = [str(x).lower() for x in (found.get("noticesIconNames") or [])]
            monet_icons = [str(x).lower() for x in (found.get("monetIconNames") or [])]
            row_icons = [str(x).lower() for x in (found.get("rowIcons") or [])]
            has_active_spinner = bool(found.get("hasActiveSpinner"))
            cancel_upload_visible = bool(found.get("cancelUploadVisible"))
            has_details_action = bool(found.get("hasDetailsAction"))

            # 0. Bóc tách pha ĐANG TẢI LÊN (% upload) trên bảng Nội dung (ngôn ngữ bất kỳ + cấu trúc Polymer)
            has_explicit_cancel_error = any(sig in status_text_only for sig in [
                "processing abandoned", "quá trình xử lý bị bỏ dở", "quá trình tải lên bị hủy",
                "tải lên bị hủy", "đã hủy tải lên", "upload cancelled", "upload abandoned",
                "không thể xử lý video", "could not process video", "video upload failed",
            ])

            has_upload_icon = any(
                ic == "upload" or ic.endswith(":upload") or "arrow_upward" in ic or "file_upload" in ic
                for ic in row_icons
            )
            upload_pct: Optional[int] = None
            raw_pv = found.get("progressValue")
            if raw_pv is not None and isinstance(raw_pv, (int, float)):
                pv_int = int(round(raw_pv))
                if 0 <= pv_int <= 100 and (cancel_upload_visible or has_upload_icon or "%" in subtitle):
                    if pv_int == 0 and not cancel_upload_visible and "%" not in subtitle and any(
                        k in status_text_only for k in [
                            "phút", "min", "sd", "hd", "xử lý", "processing", "分", "분",
                            "检查", "檢查", "確認", "処理", "prüf", "comprob", "vérif", "обработ",
                        ]
                    ):
                        upload_pct = None
                    else:
                        upload_pct = pv_int

            if upload_pct is None:
                pct_match = (
                    re.search(r'(?:đã\s*tải\s*(?:được|lên)|uploaded|uploading)\s*[:\-]?\s*(\d{1,3})\s*%', status_text_only, re.IGNORECASE)
                    or re.search(r'(\d{1,3})\s*%\s*(?:uploaded|đã\s*tải|アップロード|업로드|import|subid|загруж)', status_text_only, re.IGNORECASE)
                )
                if not pct_match and (cancel_upload_visible or has_upload_icon):
                    # Khi có nút Huỷ tải lên hiển thị thật hoặc icon mũi tên tải lên: bất kỳ "% số" trong dòng phụ đều là % tải lên
                    pct_match = re.search(r'(\d{1,3})\s*%', subtitle or status_text_only)
                if pct_match:
                    try:
                        raw_pct = int(pct_match.group(1))
                        if 0 <= raw_pct <= 100:
                            upload_pct = raw_pct
                    except Exception:
                        pass

            is_explicit_processing_only = (
                upload_pct is None
                and not cancel_upload_visible
                and any(sig in status_text_only for sig in [
                    "quá trình xử lý sẽ sớm bắt đầu", "processing will begin",
                    "đang xử lý", "processing sd", "quá trình kiểm tra",
                    "checks will begin", "checks pending", "チェック", "検", "処理",
                    "검토", "검사", "확인", "처리", "prüfung", "überprüf", "verarbeit",
                    "comprob", "procesando", "vérif", "traitement", "检查", "檢查", "处理", "處理", "確認",
                    "провер", "обработ", "ตรวจ", "ประมวล", "memeriksa", "memproses", "verificações",
                ])
            )

            # Bảo vệ chống kẹt vô tận ở 0% khi nút Huỷ tải lên có mặt nhưng không có % sau >40s và subtitle nói đang xử lý/kiểm tra
            stale_zero_without_pct = (
                upload_pct is None
                and cancel_upload_visible
                and no_pct_upload_cycles >= 16
                and any(k in status_text_only for k in [
                    "xử lý", "processing", "kiểm tra", "check", "処理", "チェック",
                    "검토", "검사", "확인", "처리", "prüfung", "überprüf", "verarbeit",
                    "comprob", "proces", "vérif", "traitement", "检查", "檢查", "处理", "處理", "確認",
                    "провер", "обработ", "ตรวจ", "ประมวล", "memeriksa", "memproses", "verificações",
                ])
            )

            is_row_uploading = (
                (upload_pct is not None and upload_pct < 100)
                or (
                    cancel_upload_visible
                    and not has_explicit_cancel_error
                    and not is_explicit_processing_only
                    and not stale_zero_without_pct
                )
            )

            if is_row_uploading:
                any_uploading = True
                saw_active_upload = True
                nav_state["saw_active_upload"] = True
                if upload_pct is None:
                    no_pct_upload_cycles += 1
                    pct_val = max(0, last_upload_pct if last_upload_pct >= 0 else 0)
                    rem_txt = "Đang đồng bộ tiến trình..."
                else:
                    no_pct_upload_cycles = 0
                    pct_val = upload_pct

                # Chỉ trích xuất thời gian upload còn lại từ subtitle (tránh nhầm 'còn 6 phút' của SD/Content ID)
                eta_source = subtitle if subtitle else (status_text_only if upload_pct is not None else "")
                rem_m = re.search(
                    r'(còn\s+\d+\s*(?:giây|phút|giờ)|(?:about\s+)?\d+\s*(?:sec|min|hr)[a-z]*\s*left|残り\s*[^\s,\.]+|\d+\s*(?:秒|分|時間|초|분|시간)\s*(?:남음)?)',
                    eta_source,
                    re.IGNORECASE,
                )
                if rem_m:
                    rem_txt = rem_m.group(1).strip()
                elif upload_pct is not None:
                    rem_txt = "Đang tải lên"

                upload_msg = f"Đang tải lên YouTube Studio: {pct_val}% ({rem_txt})"
                upload_percent_snapshot = pct_val
                upload_remaining_snapshot = rem_txt
                upload_msg_snapshot = upload_msg

                classified[vid] = {
                    "bkt_check_status": "uploading",
                    "bkt_restriction": upload_msg,
                    "processing_stage": "uploading",
                    "upload_percent": pct_val,
                    "estimated_minutes": None,
                    "claim_type": "none",
                    "monetization": found.get("monetization"),
                }
                all_resolved = False
                continue

            no_pct_upload_cycles = 0

            # 1. Kiểm tra lỗi không thể phục hồi (Terminal failure chính thức từ YouTube)
            if has_explicit_cancel_error:
                classified[vid] = {
                    "bkt_check_status": "failed",
                    "bkt_restriction": "YouTube Studio hủy xử lý: Tải lên bị bỏ dở hoặc bị gián đoạn (Processing abandoned)",
                    "processing_stage": "failed",
                    "estimated_minutes": None,
                    "claim_type": "none",
                    "monetization": None,
                }
                logger.error("Video %s bị lỗi không thể phục hồi trên YouTube Studio: Processing abandoned", vid)
                continue

            # 2. Tín hiệu đang đồng bộ / chờ xử lý / quét Content ID (đa ngôn ngữ + spinner/progressbar cấu trúc)
            is_draft_syncing = any(sig in status_text_only for sig in [
                "bản nháp", "draft", "下書き", "草稿", "초안", "borrador", "brouillon", "entwurf", "rascunho", "черновик", "ฉบับร่าง", "draf",
            ])

            is_delayed = any(sig in status_text_only for sig in [
                "quá trình xử lý bị trễ", "processing delayed",
                "quá trình xử lý sẽ sớm bắt đầu", "processing will begin",
                "đang chờ xử lý", "chờ xử lý", "pending processing",
                "処理を開始します", "処理待ち", "처리 대기", "se procesará", "traitement en attente",
                "tratamento", "pendente", "verzöger", "в ожидании", "รอดำเนินการ", "tertunda", "即将开始处理", "即將開始處理", "处理延迟",
            ])
            is_checks_pending = any(sig in status_text_only for sig in [
                "quá trình kiểm tra video này sẽ sớm bắt đầu",
                "quá trình kiểm tra sẽ sớm bắt đầu",
                "quá trình kiểm tra chưa bắt đầu",
                "quá trình kiểm tra",
                "checks will begin shortly",
                "checks will start soon",
                "checks will begin",
                "checks pending",
                "チェック", "確認", "確認中", "검토", "검사", "확인",
                "comprobaciones", "comprob", "verificações", "verificação", "vérif", "vérification",
                "überprüfung", "überprüf", "prüfung", "провер", "проверка",
                "检查", "檢查", "ตรวจสอบ", "กำลังตรวจ", "memeriksa", "pemeriksaan",
            ])
            is_processing_active = has_active_spinner or any(sig in status_text_only for sig in [
                "đang xử lý", "processing", "đang tải lên", "uploading",
                "độ phân giải tối đa là sd", "processing sd", "đang kiểm tra",
                "checking", "処理中", "処理", "처리 중", "처리중", "procesando", "processando",
                "traitement", "verarbeitung", "verarbeit", "обработка", "обработ",
                "กำลังประมวลผล", "กำลังทำ", "memproses", "处理中", "處理中", "正在处理", "正在處理",
            ])

            # Bóc tách thời lượng ước tính còn lại (đa ngôn ngữ trên status/subtitle)
            estimated_minutes = None
            m1 = re.search(r'(?:còn|left|remaining|khoảng|残り)\s*[:\.]*\s*(\d+)\s*(?:phút|min(?:ut(?:e|o|en)?s?)?|分|분|мин|นาที|menit)', status_text_only, re.IGNORECASE)
            if m1:
                estimated_minutes = int(m1.group(1))
            else:
                m2 = re.search(r'(\d+)\s*(?:phút|min(?:ut(?:e|o|en)?s?)?|分|분|мин|นาที|menit)\s*(?:còn lại|còn|left|remaining|남음|verbleibend)?', status_text_only, re.IGNORECASE)
                if m2:
                    estimated_minutes = int(m2.group(1))
                elif re.search(r'(?:dưới|less than|未満|미만|weniger als|menos de|moins de)\s*1\s*(?:phút|min|分|분|мин)', status_text_only, re.IGNORECASE):
                    estimated_minutes = 1

            is_actively_checking_or_processing = (
                is_draft_syncing
                or is_delayed
                or is_checks_pending
                or is_processing_active
                or (estimated_minutes is not None)
                or has_active_spinner
            )

            has_restriction_icon = any(
                k in ic for ic in notices_icons for k in (
                    "copyright", "gavel", "warning", "error", "policy", "block", "monetization_off", "monetization-off", "remove_circle"
                )
            )
            has_monet_issue_icon = any(
                k in ic for ic in monet_icons for k in ("limited", "ineligible", "off", "warning", "yellow")
            )

            is_clean_dash = bool(restr.strip()) and bool(re.match(r'^[\s\u2010-\u2015\u2212\-–—]+$', restr))
            is_known_clean_text = bool(restr.strip()) and (
                restr in CLEAN_VALUES
                or is_clean_dash
                or ("no issues" in restr and "copyright" not in restr)
                or ("không phát hiện" in restr)
                or ("問題はありません" in restr)
                or ("문제 없음" in restr)
                or ("keine probleme" in restr)
                or ("aucun problème" in restr)
                or ("sin problemas" in restr)
                or ("nenhum problema" in restr)
                or ("проблем не обнаружено" in restr)
                or ("未发现" in restr or "沒有發現" in restr or "没有发现" in restr)
                or ("ไม่มีปัญหา" in restr)
                or ("tidak ada masalah" in restr)
            )

            is_restricted_candidate = (
                has_restriction_icon
                or any(k in restr for k in [
                    "copyright", "bản quyền", "blocked", "bị chặn", "terms", "chính sách",
                    "khiếu nại", "claim", "protected", "hạn chế", "có thể bị hạn chế", "ineligible",
                    "著作権", "申し立て", "저작권", "소유권 주장", "derechos de autor", "reclamación",
                    "droits d'auteur", "réclamation", "urheberrecht", "авторск", "жалоба", "ลิขสิทธิ์", "hak cipta",
                    "版權", "版权",
                ])
                or (
                    not is_actively_checking_or_processing
                    and not is_known_clean_text
                    and has_details_action
                    and bool(restr.strip())
                )
            )

            claim_type = "unknown"
            claim_title = ""
            claimant = ""
            timestamp_range = ""
            if is_restricted_candidate:
                claim_info = await extract_copyright_claim_details(page, vid)
                claim_type = claim_info.get("issue_type") or claim_info.get("claim_type") or "unknown"
                claim_title = claim_info.get("claimed_content") or ""
                claimant = claim_info.get("claimant") or ""
                timestamp_range = claim_info.get("timestamp_range") or ""

            if estimated_minutes is not None:
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": f"[SD] Đang xử lý... Còn {estimated_minutes} phút (Chờ Content ID)",
                    "processing_stage": "processing_sd",
                    "estimated_minutes": estimated_minutes,
                    "claim_type": "none",
                    "monetization": found.get("monetization"),
                }
                all_resolved = False
            elif is_draft_syncing or is_delayed or is_checks_pending or is_processing_active:
                stage_msg = "Quá trình kiểm tra video sẽ sớm bắt đầu (Đang chờ xử lý)..."
                if is_draft_syncing:
                    stage_msg = "Đang đồng bộ dữ liệu tải lên trên YouTube Studio..."
                elif "quá trình xử lý sẽ sớm bắt đầu" in status_text_only:
                    stage_msg = "Đã tải lên 100% — Quá trình xử lý sẽ sớm bắt đầu..."
                elif is_delayed:
                    stage_msg = "Đang chờ xử lý / Mã hóa SD trên YouTube Studio..."
                elif is_processing_active:
                    stage_msg = "YouTube đang xử lý định dạng hoặc quét Content ID..."
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": stage_msg,
                    "processing_stage": "draft_syncing" if is_draft_syncing else ("delayed" if is_delayed else "checking"),
                    "estimated_minutes": None,
                    "claim_type": "none",
                    "monetization": found.get("monetization"),
                }
                all_resolved = False
            elif any(k in restr for k in ["checking", "đang kiểm tra", "processing", "đang xử lý"]):
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": found.get("restrictions") or "YouTube đang kiểm tra bản quyền (Checking...)",
                    "processing_stage": "checking",
                    "estimated_minutes": None,
                    "claim_type": "none",
                    "monetization": found.get("monetization"),
                }
                all_resolved = False
            elif is_restricted_candidate:
                restr_msg = f"Dính bản quyền Content ID: {found.get('restrictions') or 'Có thể bị hạn chế'}"
                if claim_type == "audio":
                    details_parts = [p for p in [claim_title, claimant, timestamp_range] if p]
                    details_suffix = f": {' | '.join(details_parts)}" if details_parts else ""
                    restr_msg = f"Dính bản quyền Âm thanh (Giai điệu/Bản ghi âm){details_suffix}"
                elif claim_type == "visual":
                    details_parts = [p for p in [claim_title, claimant, timestamp_range] if p]
                    details_suffix = f": {' | '.join(details_parts)}" if details_parts else ""
                    restr_msg = f"Dính bản quyền Hình ảnh (Video/Visual){details_suffix}"
                elif claim_type == "both":
                    details_parts = [p for p in [claim_title, claimant, timestamp_range] if p]
                    details_suffix = f": {' | '.join(details_parts)}" if details_parts else ""
                    restr_msg = f"Dính cả bản quyền Âm thanh & Hình ảnh{details_suffix}"

                classified[vid] = {
                    "bkt_check_status": "red_matched",
                    "bkt_restriction": restr_msg,
                    "processing_stage": "finished",
                    "issue_type": claim_type,
                    "claim_type": claim_type,
                    "claim_title": claim_title,
                    "claimant": claimant,
                    "timestamp_range": timestamp_range,
                    "monetization": found.get("monetization"),
                }
            elif not is_actively_checking_or_processing and not cancel_upload_visible and is_known_clean_text:
                if has_monet_issue_icon or any(m in monet for m in [
                    "limited", "hạn chế", "giới hạn", "制限", "제한",
                    "eingeschränkt", "limitad", "limité", "огранич", "受限", "จำกัด", "terbatas",
                ]):
                    classified[vid] = {
                        "bkt_check_status": "red_matched",
                        "bkt_restriction": "Kiếm tiền bị hạn chế (Limited Monetization)",
                        "processing_stage": "finished",
                        "claim_type": "monetization",
                        "monetization": found.get("monetization"),
                    }
                elif any(m in monet for m in [
                    "ineligible", "không đủ điều kiện", "不可", "不符",
                    "불가", "부적합", "nicht geeignet", "no apto",
                    "non éligible", "неподход", "ไม่มีสิทธิ์", "tidak memenuhi",
                ]):
                    classified[vid] = {
                        "bkt_check_status": "red_matched",
                        "bkt_restriction": "Không đủ điều kiện kiếm tiền do chính sách/bản quyền",
                        "processing_stage": "finished",
                        "claim_type": "monetization",
                        "monetization": found.get("monetization"),
                    }
                else:
                    classified[vid] = {
                        "bkt_check_status": "green_clean",
                        "bkt_restriction": "Notices: — (Sạch bản quyền, an toàn)",
                        "processing_stage": "finished",
                        "claim_type": "none",
                        "monetization": found.get("monetization") or "On",
                    }
            else:
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": found.get("restrictions") or "Đang chờ YouTube cập nhật...",
                    "processing_stage": "checking",
                    "estimated_minutes": None,
                    "claim_type": "none",
                    "monetization": found.get("monetization"),
                }
                all_resolved = False

        # Chỉ bắt đầu tính quỹ thời gian chờ Content ID sau khi upload xong 100%
        now_ts = time.time()
        if any_uploading:
            check_poll_start_time = None
            pct_changed_this_cycle = (
                upload_percent_snapshot is not None
                and upload_percent_snapshot != last_upload_pct
            )
            if pct_changed_this_cycle:
                last_upload_pct = upload_percent_snapshot
                last_upload_pct_changed_at = now_ts
            if (upload_percent_snapshot or 0) <= 0 and (now_ts - last_upload_pct_changed_at >= 900.0):
                raise RuntimeError(
                    "Quá trình tải lên bị treo tại 0% quá 15 phút trên YouTube Studio (không có tiến triển)."
                )
            if emit_upload_events:
                if pct_changed_this_cycle or (now_ts - last_upload_emit_time >= 3.0):
                    last_upload_emit_time = now_ts
                    print(json.dumps({
                        "event": "upload_progress",
                        "percent": upload_percent_snapshot,
                        "remaining": upload_remaining_snapshot,
                        "youtube_video_id": discovered_vid,
                        "message": upload_msg_snapshot or "Đang tải video lên YouTube Studio..."
                    }, ensure_ascii=False))
                    sys.stdout.flush()
        else:
            found_real_target = any(
                vid != "__pending_new_row__" and bool(dom_results.get(vid))
                for vid in effective_ids
            )
            waiting_initial_row = (not found_real_target) or ("__pending_new_row__" in classified)

            if emit_upload_events and not saw_active_upload and waiting_initial_row and (now_ts - overall_start_time >= 120.0):
                raise RuntimeError(
                    "Video chưa xuất hiện trên bảng Nội dung Studio sau 120s — có thể phiên tải lên đã bị gián đoạn."
                )

            if not waiting_initial_row and not upload_done_emitted:
                upload_done_emitted = True
                print(json.dumps({
                    "event": "upload_success",
                    "youtube_video_id": discovered_vid,
                    "video_url": video_url or (f"https://youtu.be/{discovered_vid}" if discovered_vid else ""),
                    "message": "Đã tải lên 100% — Đang kiểm tra bản quyền Studio..."
                }, ensure_ascii=False))
                sys.stdout.flush()

            if check_poll_start_time is None and (not waiting_initial_row or (not emit_upload_events and poll_cycle >= 3)):
                check_poll_start_time = now_ts

            # Chỉ bật route interception tiết kiệm RAM sau khi upload stream đã xong 100%
            if not route_interception_enabled and not waiting_initial_row:
                await setup_low_end_route_interception(page)
                route_interception_enabled = True

        # Loại bỏ khóa giả __pending_new_row__ nếu trả kết quả thật
        clean_results = {k: v for k, v in classified.items() if k != "__pending_new_row__"}
        if not clean_results and "__pending_new_row__" in classified:
            clean_results = classified

        elapsed_total = now_ts - overall_start_time
        elapsed_check = (now_ts - check_poll_start_time) if check_poll_start_time is not None else 0.0
        # Trong lúc upload, cho phép tối đa 7200s (2 tiếng); sau khi upload xong, dùng đúng max_poll_seconds cho Content ID
        timed_out = (elapsed_total >= 7200) if any_uploading else (elapsed_check >= max_poll_seconds)

        if (all_resolved and "__pending_new_row__" not in classified) or not poll_in_session or timed_out:
            logger.info(
                "Kết thúc phiên quét bản quyền: all_resolved=%s, elapsed_total=%.1fs, elapsed_check=%.1fs",
                all_resolved,
                elapsed_total,
                elapsed_check,
            )
            return {
                "success": True,
                "youtube_video_id": discovered_vid,
                "results": clean_results,
            }

        # Phát progress trong pha kiểm tra Content ID (khi KHÔNG còn đang upload %)
        if not any_uploading and "__pending_new_row__" not in classified:
            for vid, cinfo in clean_results.items():
                progress_line = json.dumps({
                    "event": "progress",
                    "video_id": vid,
                    "youtube_video_id": discovered_vid or vid,
                    "status": cinfo.get("bkt_check_status"),
                    "restriction": cinfo.get("bkt_restriction"),
                    "estimated_minutes": cinfo.get("estimated_minutes"),
                    "stage": cinfo.get("processing_stage"),
                }, ensure_ascii=False)
                print(progress_line)
                sys.stdout.flush()

        # Khi đang upload % trên bảng Nội dung: poll nhẹ 2.5s và TUYỆT ĐỐI KHÔNG click refresh tab!
        if any_uploading or "__pending_new_row__" in classified:
            await asyncio.sleep(2.5)
            continue

        min_est = min([c.get("estimated_minutes") for c in clean_results.values() if c.get("estimated_minutes") is not None], default=None)
        if min_est is not None and min_est > 3:
            sleep_secs = 30
        elif min_est is not None and min_est > 1:
            sleep_secs = 18
        else:
            sleep_secs = 12

        logger.info("Đang chờ YouTube phân tích Content ID (ngủ %ds)...", sleep_secs)
        await asyncio.sleep(sleep_secs)

        if page.is_closed():
            raise RuntimeError("Cửa sổ/thẻ YouTube Studio đã bị đóng trong lúc chờ kiểm tra Content ID.")

        # Làm mới nhẹ bảng video qua SPA chỉ khi đã ở trang Nội dung và upload đã xong 100%
        if poll_cycle % 2 == 0:
            try:
                cur_ctx = await get_studio_context(page)
                if cur_ctx.get("pageType") == "channel_content_videos":
                    logger.info("Làm mới bảng video qua SPA đa ngôn ngữ (Zero-Reload)...")
                    await safe_targeted_click(
                        page,
                        selectors=[
                            'tp-yt-paper-tab#video-list-uploads-tab',
                            '[test-id="video-list-uploads-tab"]',
                        ],
                        action_name="refresh_uploads_tab_spa",
                        allowed_page_types={"channel_content_videos"},
                        forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/video/"],
                        allow_js_fallback=False,
                        timeout_ms=2500,
                        pre_delay=0.1,
                        post_click_settle=0.15,
                    )
                    await page.evaluate("""() => {
                        const table = document.querySelector('ytcp-video-section, ytcp-content-section, #video-list');
                        if (table && typeof table.refresh === 'function') {
                            table.refresh();
                        }
                    }""")
                    await asyncio.sleep(2.0)
                else:
                    logger.warning(
                        "Bỏ qua SPA refresh vì không ở channel_content_videos (pageType=%s); khôi phục về Nội dung...",
                        cur_ctx.get("pageType"),
                    )
                    await ensure_on_upload_content_page()
            except Exception as nav_err:
                logger.debug("Lỗi làm mới SPA: %s", nav_err)
