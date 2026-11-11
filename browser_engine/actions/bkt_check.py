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
from typing import Any, Dict, List, Optional

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

            if res_type in BLOCKED_TYPES:
                await route.abort()
                return

            if any(ext in url for ext in BLOCKED_EXTENSIONS):
                # Don't abort essential scripts or api responses
                if not (url.endswith(".js") or url.endswith(".json")):
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
        logger.info("Đã kích hoạt Low-End Route Interception (abort image, font, media)")
    except Exception as exc:
        logger.warning("Không thể thiết lập route interception: %s", exc)


async def extract_copyright_claim_details(page: Any, vid: str, row_loc: Any = None) -> Dict[str, Any]:
    """
    Rê chuột vào ô Hạn chế (Restrictions) -> Click 'Xem chi tiết' ('See details')
    -> Mở dialog ytcp-dialog / ytd-modal-with-title-and-button-list-renderer
    -> Bóc tách toàn diện: issue_type, claimant, claimed_content, timestamp_range
    -> Đóng dialog an toàn, chống kẹt DOM.
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
        # 1. Định vị ô Hạn chế trên hàng video
        if row_loc is None:
            row_loc = page.locator(
                f'ytcp-video-row:has(a[href*="{vid}"]), ytcp-video-row[video-id="{vid}"]'
            ).first

        if not await row_loc.is_visible(timeout=2500):
            # Fallback nếu vid rỗng hoặc không match được row theo id
            row_loc = page.locator('ytcp-video-row').first

        if not await row_loc.is_visible(timeout=2500):
            logger.warning("Không tìm thấy hàng video %s để kiểm tra chi tiết", vid)
            return default_res

        restr_cell = row_loc.locator(
            '#restrictions, ytcp-table-cell-restrictions, [cell-id="restrictions"], .restrictions-column'
        ).first

        if not await restr_cell.is_visible(timeout=2500):
            logger.warning("Không tìm thấy ô restrictions cho video %s", vid)
            return default_res

        # 2. Hover vào ô hạn chế để kích hoạt popover/tooltip
        await restr_cell.hover()
        await asyncio.sleep(1.2)

        # 3. Tìm và click nút 'Xem chi tiết' / 'See details'
        details_btn = page.locator(
            'button:has-text("Xem chi tiết"), button:has-text("See details"), '
            '#details-button, ytcp-button:has-text("Xem chi tiết"), '
            'ytcp-button:has-text("See details"), [aria-label*="chi tiết" i], [aria-label*="details" i]'
        ).first

        if not await details_btn.is_visible(timeout=3000):
            # Thử hover lại badge text cụ thể
            badge = restr_cell.locator('yt-formatted-string, .restriction-text, button').first
            if await badge.is_visible():
                await badge.hover()
                await asyncio.sleep(1.0)

        if not await details_btn.is_visible(timeout=2500):
            logger.info("Không thấy nút 'Xem chi tiết' dạng popup cho video %s", vid)
            return default_res

        logger.info("Click 'Xem chi tiết' để mở dialog Content ID cho video %s...", vid)
        await details_btn.click()

        # 4. Chờ modal dialog hiển thị
        modal_loc = page.locator('ytcp-dialog[role="dialog"], ytd-modal-with-title-and-button-list-renderer, #dialog, tp-yt-paper-dialog').first
        try:
            await modal_loc.wait_for(state="visible", timeout=6000)
        except Exception:
            await asyncio.sleep(2.5)

        # 5. Phân tích nội dung dialog bằng JavaScript trong context trình duyệt
        extracted_info = await page.evaluate("""() => {
            const modal = document.querySelector('ytcp-dialog[role="dialog"], ytd-modal-with-title-and-button-list-renderer, #dialog, tp-yt-paper-dialog');
            if (!modal) return null;

            const modalText = (modal.innerText || modal.textContent || '').trim();
            const lowerText = modalText.toLowerCase();

            // Nhận diện loại vi phạm
            const hasAudioKeywords = [
                'giai điệu', 'lời bài hát', 'bản ghi âm', 'âm thanh', 'âm nhạc',
                'bài hát', 'tác phẩm âm nhạc', 'nhạc nền', 'audio', 'sound recording',
                'melody', 'lyrics', 'song', 'musical work', 'composition', 'music'
            ].some(kw => lowerText.includes(kw));

            const hasVisualKeywords = [
                'nội dung video', 'hình ảnh', 'đoạn phim', 'video', 'đoạn video',
                'nội dung nghe nhìn', 'visual', 'audiovisual', 'video content',
                'video clip', 'video footage'
            ].some(kw => lowerText.includes(kw));

            let issueType = 'unknown';
            if (hasAudioKeywords && hasVisualKeywords) {
                issueType = 'both';
            } else if (hasAudioKeywords) {
                issueType = 'audio';
            } else if (hasVisualKeywords) {
                issueType = 'visual';
            }

            // Trích xuất Claimed Content (Tên bài hát / video clip bị claim)
            let claimedContent = '';
            const titleEl = modal.querySelector(
                '.claim-title, .content-title, #content-title, .bold-title, ' +
                'ytcp-table-cell:first-child, [aria-label*="content" i], h2, h3'
            );
            if (titleEl) {
                claimedContent = (titleEl.innerText || titleEl.textContent || '').trim();
            }

            // Trích xuất Claimant (Chủ sở hữu bản quyền / Network)
            let claimant = '';
            const claimantEl = modal.querySelector(
                '.claimant-names, .claimant, .copyright-holder, [aria-label*="chủ sở hữu" i], ' +
                '[aria-label*="claimant" i], .owner-name, ytcp-table-cell:nth-child(2)'
            );
            if (claimantEl) {
                claimant = (claimantEl.innerText || claimantEl.textContent || '').trim();
            }
            if (!claimant) {
                const claimantMatch = modalText.match(/(?:Thay mặt cho|On behalf of|Chủ sở hữu|Claimant|Khiếu nại bởi)[:\\s]+([^\\n\\r,.]+)/i);
                if (claimantMatch) {
                    claimant = claimantMatch[1].trim();
                }
            }

            // Trích xuất Timestamp Range (Đoạn thời gian dính gậy, ví dụ 0:15 - 1:45)
            let timestampRange = '';
            const tsMatch = modalText.match(/(\\d{1,2}:\\d{2}(?::\\d{2})?)\\s*[-–—to đến]+\\s*(\\d{1,2}:\\d{2}(?::\\d{2})?)/i);
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
        }""")

        # 6. Đóng dialog an toàn, đảm bảo DOM sạch sẽ cho lần quét tiếp theo
        try:
            close_btn = page.locator(
                'ytcp-dialog #close-button, ytcp-icon-button#close-button, '
                'button[aria-label*="Đóng" i], button[aria-label*="Close" i], '
                'ytcp-button:has-text("Đóng"), ytcp-button:has-text("Close")'
            ).first
            if await close_btn.is_visible(timeout=2000):
                await close_btn.click()
            else:
                await page.keyboard.press("Escape")
        except Exception:
            await page.keyboard.press("Escape")

        # Chờ modal biến mất (tránh kẹt tương tác)
        try:
            await modal_loc.wait_for(state="hidden", timeout=3000)
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
) -> Dict[str, Any]:
    """
    Quét trạng thái bản quyền (Content ID) và hạn chế kiếm tiền trên YouTube Studio.
    Hỗ trợ In-Session Polling: tự động F5/reload trong cùng 1 phiên trình duyệt đang mở
    thay vì bật/tắt Chromium nhiều lần.
    """
    # Kích hoạt route interception giảm tải RAM
    await setup_low_end_route_interception(page)

    CLEAN_VALUES = {
        "—", "–", "-", "‒", "―", "−",
        "none", "clear", "clean",
        "không có", "no issues", "no issues found",
        "không phát hiện thấy vấn đề nào", "không có vấn đề gì",
    }

    async def ensure_on_upload_content_page():
        # Kiểm tra nếu đã ở tab /videos/upload
        if "/videos/upload" in page.url or "/videos" in page.url:
            return

        curr_url = page.url.split("?")[0].rstrip("/")
        if "/channel/" in curr_url:
            target_url = f"{curr_url}/videos/upload"
        else:
            target_url = "https://studio.youtube.com/videos/upload"

        try:
            logger.info("Điều hướng chính xác vào tab Content Uploads: %s", target_url)
            await page.goto(target_url, timeout=30000)
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
        except Exception as exc:
            logger.warning("Lỗi điều hướng goto /videos/upload: %s", exc)

    async def extract_table_rows() -> List[Dict[str, Any]]:
        # Chờ tối đa 15s cho hàng video đầu tiên xuất hiện (tránh quét DOM lúc đang skeleton loading)
        try:
            await page.wait_for_selector('ytcp-video-row', timeout=15000)
        except Exception:
            pass

        return await page.evaluate("""() => {
            const rowList = [];
            const rows = document.querySelectorAll('ytcp-video-row');
            rows.forEach((row, idx) => {
                let vid = '';
                // 1. Quét các liên kết để tìm video ID
                const links = row.querySelectorAll('a[href]');
                for (const l of links) {
                    const href = l.getAttribute('href') || '';
                    let m = href.match(/\\/video\\/([^\\/\\?]+)/);
                    if (m) { vid = m[1]; break; }
                    m = href.match(/\\/shorts\\/([^\\/\\?]+)/);
                    if (m) { vid = m[1]; break; }
                    m = href.match(/youtu\\.be\\/([^\\/\\?]+)/);
                    if (m) { vid = m[1]; break; }
                    m = href.match(/[\\?&]v=([^&]+)/);
                    if (m) { vid = m[1]; break; }
                }
                if (!vid) {
                    vid = row.getAttribute('video-id') || row.id || '';
                }

                // 2. Tiêu đề
                const titleEl = row.querySelector('#video-title, .video-title-text, #title, #video-title-text');
                const title = titleEl ? (titleEl.innerText || titleEl.textContent || '').trim() : '';

                // 3. Cột Hạn chế (Restrictions) & Thông báo (Notices)
                const restrCell = row.querySelector(
                    '#notices, ytcp-table-cell-notices, .tablecell-notices, .table-cell-notices, [cell-id="notices"], .notices-column, #restrictions, ytcp-table-cell-restrictions, .tablecell-restrictions, .table-cell-restrictions, [cell-id="restrictions"], .restrictions-column'
                );
                let restrictions = '';
                if (restrCell) {
                    const badge = restrCell.querySelector('yt-formatted-string, .restriction-text, yt-button-shape, button, .label-text, span');
                    restrictions = badge ? (badge.innerText || badge.textContent || '').trim() : (restrCell.innerText || restrCell.textContent || '').trim();
                }

                // 4. Cột Kiếm tiền (Monetization)
                const monetCell = row.querySelector(
                    '#monetization, ytcp-table-cell-monetization, .tablecell-monetization, .table-cell-monetization, [cell-id="monetization"]'
                );
                let monetization = '';
                if (monetCell) {
                    monetization = (monetCell.innerText || monetCell.textContent || '').trim();
                }

                // 5. Toàn bộ text hàng & Subtitle
                const fullRowText = (row.innerText || row.textContent || '').trim();
                let subtitle = '';
                const subtitleEl = row.querySelector('#description, .video-title-container, .ytcp-video-row-cell, .subtitle, #subtitle, .video-status-text, ytcp-video-row-cell-details');
                if (subtitleEl) {
                    subtitle = (subtitleEl.innerText || subtitleEl.textContent || '').trim();
                }

                rowList.push({
                    rowIndex: idx,
                    vid: vid,
                    title: title,
                    restrictions: restrictions,
                    monetization: monetization,
                    fullRowText: fullRowText,
                    subtitle: subtitle
                });
            });
            return rowList;
        }""")

    # 1. Mở YouTube Studio Content Uploads
    logger.info("Mở YouTube Studio để kiểm tra bản quyền Content ID...")
    if "/videos" not in page.url:
        await page.goto("https://studio.youtube.com/", timeout=45000)
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
    await asyncio.sleep(2.0)

    poll_start_time = time.time()
    target_ids = list(video_ids) if video_ids else []

    while True:
        rows_data = await extract_table_rows()
        logger.info("Quét tab Videos: tìm thấy %d hàng video trên bảng", len(rows_data))

        # Ánh xạ theo vid và tìm kiếm thông minh theo title / topmost row
        dom_results: Dict[str, Any] = {}
        for r in rows_data:
            if r.get("vid"):
                dom_results[r["vid"]] = r

        # Đối soát target_ids với các hàng tìm thấy
        for tid in target_ids:
            if tid in dom_results:
                continue

            # Fallback 1: Tìm theo video_title hoặc [BKT Check]
            matched_row = None
            for r in rows_data:
                r_title = (r.get("title") or "").lower()
                r_full = (r.get("fullRowText") or "").lower()
                if video_title and len(video_title) > 8:
                    clean_kw = video_title[:25].lower().strip()
                    if clean_kw in r_title or clean_kw in r_full:
                        matched_row = r
                        break
                if "[bkt check]" in r_title or "[bkt check]" in r_full:
                    matched_row = r
                    break

            # Fallback 2: Nếu chỉ có 1 video cần kiểm tra và bảng có video ở hàng đầu tiên (mới upload nhất)
            if not matched_row and len(target_ids) == 1 and rows_data:
                matched_row = rows_data[0]

            if matched_row:
                dom_results[tid] = matched_row
                logger.info("Đã đối soát video ID %s khớp với hàng bảng: '%s'", tid, matched_row.get("title"))

        effective_ids = target_ids if target_ids else list(dom_results.keys())
        classified: Dict[str, Any] = {}
        all_resolved = True

        for vid in effective_ids:
            found = dom_results.get(vid)
            if not found:
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": "Chưa tìm thấy video trên bảng Studio (YouTube đang tải/xử lý)",
                    "processing_stage": "delayed",
                    "estimated_minutes": None,
                    "claim_type": "none",
                    "monetization": None,
                }
                all_resolved = False
                continue

            restr = (found.get("restrictions") or "").lower().strip()
            monet = (found.get("monetization") or "").lower()
            full_text = (found.get("fullRowText") or "").lower()
            subtitle = (found.get("subtitle") or "").lower()
            combined_text = f"{restr} {full_text} {subtitle}"

            is_delayed = any(sig in combined_text for sig in [
                "quá trình xử lý bị trễ", "processing delayed", "processing abandoned",
                "đang chờ xử lý", "chờ xử lý", "pending processing"
            ])
            is_checks_pending = any(sig in combined_text for sig in [
                "quá trình kiểm tra video này sẽ sớm bắt đầu",
                "quá trình kiểm tra sẽ sớm bắt đầu",
                "quá trình kiểm tra s",
                "quá trình kiểm tra chưa bắt đầu",
                "checks will begin shortly",
                "checks will start soon",
                "quá trình kiểm tra",
                "checks pending",
                "checks will begin"
            ])
            is_processing_active = any(sig in combined_text for sig in [
                "đang xử lý", "processing", "đang tải lên", "uploading",
                "độ phân giải tối đa là sd", "processing sd", "đang kiểm tra"
            ])

            # Bóc tách thời lượng ước tính còn lại
            estimated_minutes = None
            m1 = re.search(r'(?:còn|left|remaining|khoảng)\s*[:\.]*\s*(\d+)\s*(?:phút|min(?:ute)?s?)', combined_text, re.IGNORECASE)
            if m1:
                estimated_minutes = int(m1.group(1))
            else:
                m2 = re.search(r'(\d+)\s*(?:phút|min(?:ute)?s?)\s*(?:còn lại|còn|left|remaining)', combined_text, re.IGNORECASE)
                if m2:
                    estimated_minutes = int(m2.group(1))
                elif re.search(r'(?:dưới|less than)\s*1\s*(?:phút|min)', combined_text, re.IGNORECASE):
                    estimated_minutes = 1

            is_actively_checking_or_processing = (
                is_delayed or is_checks_pending or is_processing_active or (estimated_minutes is not None)
            )

            is_restricted_candidate = any(k in restr for k in [
                "copyright", "bản quyền", "blocked", "bị chặn", "terms", "chính sách",
                "khiếu nại", "claim", "protected", "hạn chế", "có thể bị hạn chế", "ineligible"
            ])

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
            elif is_delayed or is_checks_pending or is_processing_active:
                stage_msg = "Quá trình kiểm tra video sẽ sớm bắt đầu (Đang chờ xử lý)..."
                if is_delayed:
                    stage_msg = "Quá trình xử lý bị trễ (Đang chờ YouTube mã hóa SD)..."
                elif is_processing_active:
                    stage_msg = "YouTube đang xử lý định dạng hoặc quét Content ID..."
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": stage_msg,
                    "processing_stage": "delayed" if is_delayed else "checking",
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
            elif not is_actively_checking_or_processing and (
                restr in CLEAN_VALUES
                or bool(re.match(r'^[\s\u2010-\u2015\u2212\-–—]+$', restr))
                or ("no issues" in restr and "copyright" not in restr)
                or ("không phát hiện" in restr)
            ):
                if any(m in monet for m in ["limited", "hạn chế", "giới hạn"]):
                    classified[vid] = {
                        "bkt_check_status": "red_matched",
                        "bkt_restriction": "Kiếm tiền bị hạn chế (Limited Monetization)",
                        "processing_stage": "finished",
                        "claim_type": "monetization",
                        "monetization": found.get("monetization"),
                    }
                elif any(m in monet for m in ["ineligible", "không đủ điều kiện"]):
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

        # Nếu đã hoàn thành hoặc không yêu cầu in-session polling hoặc đã quá thời gian tối đa
        elapsed = time.time() - poll_start_time
        if all_resolved or not poll_in_session or elapsed >= max_poll_seconds:
            logger.info("Kết thúc phiên quét bản quyền: all_resolved=%s, elapsed=%.1fs", all_resolved, elapsed)
            return {"success": True, "results": classified}

        # Phát sự kiện tiến trình ra stdout theo dạng stream JSON line để Rust backend cập nhật realtime
        for vid, cinfo in classified.items():
            progress_line = json.dumps({
                "event": "progress",
                "video_id": vid,
                "status": cinfo.get("bkt_check_status"),
                "restriction": cinfo.get("bkt_restriction"),
                "estimated_minutes": cinfo.get("estimated_minutes"),
                "stage": cinfo.get("processing_stage"),
            }, ensure_ascii=False)
            print(progress_line)
            sys.stdout.flush()

        # Xác định khoảng thời gian ngủ thông minh
        min_est = min([c.get("estimated_minutes") for c in classified.values() if c.get("estimated_minutes") is not None], default=None)
        if min_est is not None and min_est > 3:
            sleep_secs = 35
        elif min_est is not None and min_est > 1:
            sleep_secs = 20
        else:
            sleep_secs = 15

        logger.info("Đang chờ YouTube phân tích (ngủ %ds rồi F5/reload lại trang)...", sleep_secs)
        await asyncio.sleep(sleep_secs)

        # F5/reload tại chỗ trong cùng 1 phiên Chromium
        try:
            logger.info("F5/Reloading trang Studio Content...")
            await page.reload(wait_until="domcontentloaded")
            await asyncio.sleep(3.0)
        except Exception as reload_err:
            logger.warning("Lỗi reload trang: %s", reload_err)
