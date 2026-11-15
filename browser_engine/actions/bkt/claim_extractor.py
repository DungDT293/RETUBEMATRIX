# -*- coding: utf-8 -*-
"""
Drill-down extractor for copyright claim details and monetization restrictions.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict

from ..dom import (
    DEFAULT_FORBIDDEN_HREF_PATTERNS,
    dismiss_post_save_studio_modals,
    eval_studio_dom,
    get_studio_context,
    safe_targeted_click,
)
from .network import (
    is_browser_disconnected,
    is_target_closed_exception,
    navigate_to_channel_content,
)

logger = logging.getLogger(__name__)

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


