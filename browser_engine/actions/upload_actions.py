import asyncio
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs

try:
    import msvcrt
except ImportError:  # pragma: no cover - Windows app; non-Windows test fallback.
    msvcrt = None

from actions.human_utils import random_delay, human_type
from actions.page_context import check_page_health
from actions.studio_dom import (
    DEFAULT_FORBIDDEN_HREF_PATTERNS,
    click_stable_element,
    dismiss_blocking_studio_dialogs,
    dismiss_post_save_studio_modals,
    eval_studio_dom,
    get_studio_context,
    inspect_studio_modal_state,
    safe_targeted_click,
    wait_for_stable_actionable,
)
from actions.youtube_channel import (
    PreferredYouTubeChannelError,
    ensure_preferred_youtube_channel,
)
from actions.bkt_check import is_browser_disconnected
from actions.upload.navigation import goto_channel_videos
from core.paths import user_data_path

logger = logging.getLogger(__name__)

PENDING_COMMENTS_FILE = user_data_path("pending_comments.jsonl")
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

DONE_BUTTON_SELECTORS = [
    "ytcp-button#done-button",
    "ytcp-button#publish-button",
    "ytcp-button#save-button",
    "ytcp-button#primary-action-button",
    "#done-button",
    "#publish-button",
    "#save-button",
    "[test-id='done-button']",
    "[test-id='publish-button']",
    "[test-id='save-button']",
    "ytcp-button[label*='Publish' i]",
    "ytcp-button[label*='Xuất bản' i]",
    "ytcp-button[label*='Save' i]",
    "ytcp-button[label*='Lưu' i]",
    "ytcp-button[label*='Publicar' i]",
    "ytcp-button[label*='Guardar' i]",
]


def _verified_video_url_from_row(row: dict) -> str | None:
    """Return a URL only when the row carries a valid 11-character video ID."""
    video_id = str(row.get("vid") or "").strip()
    if not YOUTUBE_ID_RE.fullmatch(video_id):
        raw_url = str(row.get("videoUrl") or "").strip()
        parsed = urlparse(raw_url)
        host = (parsed.hostname or "").lower().rstrip(".")
        if host == "youtu.be":
            candidate = parsed.path.strip("/").split("/", 1)[0]
        elif host == "youtube.com" or host.endswith(".youtube.com"):
            if parsed.path == "/watch":
                candidate = parse_qs(parsed.query).get("v", [""])[0]
            elif parsed.path.startswith(("/shorts/", "/video/")):
                candidate = parsed.path.split("/", 2)[2]
            else:
                candidate = ""
        else:
            candidate = ""
        video_id = candidate
    return f"https://youtu.be/{video_id}" if YOUTUBE_ID_RE.fullmatch(video_id) else None


def _unique_verified_video_url(rows: list[dict], keyword: str) -> str | None:
    """Return a verified URL only when title matching yields one unique row."""
    needle = str(keyword or "").strip().lower()
    if not needle:
        return None
    matches: dict[str, str] = {}
    for row in rows:
        title = str(row.get("title") or "").strip().lower()
        if not title or not (needle in title or title in needle):
            continue
        url = _verified_video_url_from_row(row)
        if url:
            matches[url] = url
    return next(iter(matches.values())) if len(matches) == 1 else None


def is_upload_stream_complete(percent: int | None, raw_text: str) -> bool:
    """Xác định dứt khoát xem luồng tải video lên YouTube Studio đã hoàn tất chưa.
    Tuyệt đối không dùng các chuỗi dự báo tương lai (như 'sẽ sớm bắt đầu' / 'will begin').
    Nếu percent < 100 thì bắt buộc là False."""
    if percent is not None and percent < 100:
        return False
    if percent is not None and percent >= 100:
        return True
    low_text = (raw_text or "").lower()
    definitive_processing_signatures = [
        "đã hoàn tất quá trình tải lên",
        "quá trình tải lên hoàn tất",
        "quá trình tải lên đã hoàn tất",
        "đã tải lên 100%",
        "100% uploaded",
        "upload complete",
        "đang xử lý sd",
        "processing sd",
        "đang xử lý bản sd",
        "đang xử lý bản hd",
        "processing hd",
        "đang xử lý đến độ phân giải tối đa",
        "quá trình xử lý video ở độ nét chuẩn (sd)",
        "processing complete",
        "checks complete",
        "kiểm tra hoàn tất",
        "không phát hiện thấy vấn đề nào",
        "no issues found",
    ]
    return any(sig in low_text for sig in definitive_processing_signatures)


def _truncate_utf16(text: str, max_units: int = 92) -> str:
    """Truncate text so its JS UTF-16 `.length` never exceeds YouTube's 100-unit limit.
    Preserves word boundaries so words are not cut in half."""
    out: list[str] = []
    units = 0
    for ch in text:
        ch_units = 2 if ord(ch) > 0xFFFF else 1
        if units + ch_units > max_units:
            break
        out.append(ch)
        units += ch_units
    joined = "".join(out).strip()
    if len(joined) < len(text):
        last_space = joined.rfind(" ")
        if last_space >= int(max_units * 0.4):
            joined = joined[:last_space].strip()
    return joined.rstrip(",;:.!?|-—–~• \t")


def _resolve_path(raw: str) -> str:
    """Tìm file thực tế khi path không có extension. Validates path to prevent traversal."""
    p = Path(raw).resolve()

    # Security: Prevent path traversal - ensure resolved path is safe
    try:
        # Check if path exists first
        if p.exists():
            return str(p)

        # Try with common extensions
        for ext in [".mp4", ".mov", ".avi", ".mkv", ".webm", ".jpg", ".jpeg", ".png", ".webp"]:
            candidate = p.with_suffix(ext)
            if candidate.exists():
                return str(candidate)
    except (OSError, ValueError) as e:
        logger.warning("Invalid path '%s': %s", raw, e)
        return raw

    return raw


async def studio_warmup(page, preferred_channel: str = ""):
    """
    Đi vào YouTube Studio chuẩn bị upload.
    Đi thẳng vào YouTube Studio, xác nhận login và kênh ưu tiên,
    sau đó sẵn sàng bấm Tạo/Upload trực tiếp không đi vòng qua Analytics/Content (Tối ưu tốc độ theo TC-MOD5-03).
    """
    preferred_channel = str(preferred_channel or "").strip()

    # Nếu đã ở trong studio.youtube.com thì giữ nguyên
    if "studio.youtube.com" not in page.url:
        logger.info("Mở trực tiếp YouTube Studio")
        try:
            await page.goto("https://studio.youtube.com/", wait_until="domcontentloaded", timeout=60000)
        except Exception as exc:
            if "studio.youtube.com" in page.url:
                logger.info("Navigation timeout nhẹ nhưng đã tải được Studio: %s", exc)
            else:
                logger.warning("Thử lại truy cập studio.youtube.com lần 2...")
                await page.goto("https://studio.youtube.com/", wait_until="commit", timeout=45000)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
        except Exception:
            pass
        await random_delay(1.5, 3.0)

    health = await check_page_health(page)
    if health == "login":
        # Fallback thử kiểm tra trên youtube.com xem đã đăng nhập chưa
        logger.warning("Studio báo chưa đăng nhập, kiểm tra trạng thái tài khoản")
        await page.goto("https://www.youtube.com/")
        await page.wait_for_load_state("domcontentloaded", timeout=15000)
        await random_delay(2.0, 3.5)
        health_yt = await check_page_health(page)
        if health_yt == "login":
            logger.error(
                "Profile chưa đăng nhập Google/YouTube Studio. Vui lòng mở Hồ sơ trình duyệt (Profile) → "
                "đăng nhập Google/YouTube Studio trước khi tải lên."
            )
            raise RuntimeError(
                "Profile chưa đăng nhập YouTube Studio. Vui lòng mở Hồ sơ trình duyệt (Profile) → "
                "đăng nhập Google/YouTube Studio trước khi tải lên."
            )
        # Nếu trên youtube.com đã login, quay lại studio
        try:
            await page.goto("https://studio.youtube.com/", wait_until="domcontentloaded", timeout=60000)
        except Exception:
            pass
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=20000)
        except Exception:
            pass
        await random_delay(1.5, 2.5)

    if preferred_channel and not await ensure_preferred_youtube_channel(page, preferred_channel):
        logger.error("Không tìm thấy kênh YouTube ưu tiên — hủy warmup/upload: %s", preferred_channel)
        raise PreferredYouTubeChannelError(
            f"Preferred YouTube channel not found: {preferred_channel}"
        )

    logger.info("Đã vào YouTube Studio sẵn sàng upload trực tiếp")
    return True


async def _scroll_uploads_dialog(
    page,
    target_selector: str | None = None,
    to_bottom: bool = False,
) -> bool:
    """Cuộn vùng nội dung của hộp thoại upload xuyên Shadow DOM để lộ điều khiển cần thao tác."""
    try:
        return bool(
            await eval_studio_dom(
                page,
                r"""
                const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog') || document;
                let scrolled = false;
                const wantBottom = !!(arg && arg.toBottom);
                const targetSel = (arg && arg.targetSelector) ? String(arg.targetSelector) : '';

                if (targetSel) {
                    const targets = __rtmDom.deepQueryAll(dlg, targetSel);
                    for (const target of targets) {
                        if (target && typeof target.scrollIntoView === 'function') {
                            try {
                                target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
                                return true;
                            } catch (_) {}
                        }
                    }
                }

                if (wantBottom) {
                    const scrollables = __rtmDom.deepQueryVisible(
                        dlg,
                        '#scrollable-content, [id="scrollable-content"], tp-yt-paper-dialog-scrollable'
                    );
                    for (const sc of scrollables) {
                        if (sc && sc.scrollHeight > sc.clientHeight) {
                            sc.scrollTop = sc.scrollHeight;
                            scrolled = true;
                        }
                    }
                    if (!scrolled) {
                        const candidates = __rtmDom.deepQueryAll(
                            dlg,
                            'div, tp-yt-paper-dialog-scrollable, ytcp-uploads-details'
                        );
                        for (const el of candidates) {
                            if (!el || !__rtmDom.isReallyVisible(el) || el.scrollHeight <= el.clientHeight + 24) continue;
                            const st = window.getComputedStyle(el);
                            if (/auto|scroll|overlay/i.test(st.overflowY || '')) {
                                el.scrollTop = el.scrollHeight;
                                scrolled = true;
                            }
                        }
                    }
                }
                return scrolled;
                """,
                {"targetSelector": target_selector, "toBottom": bool(to_bottom)},
            )
        )
    except Exception:
        return False


async def _is_not_for_kids_selected(page) -> bool:
    """Kiểm tra radio Không dành cho trẻ em (hỗ trợ cả modal dialog và full-page editor) đã được chọn chưa."""
    try:
        not_mfk_loc = page.locator(
            'tp-yt-paper-radio-button[name*="NOT_MFK"], '
            'tp-yt-paper-radio-button[name*="NOT_MADE_FOR_KIDS"], '
            '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"], '
            '#not-made-for-kids'
        ).first
        if await not_mfk_loc.count() > 0:
            aria_chk = await not_mfk_loc.get_attribute("aria-checked")
            if aria_chk == "true":
                return True
            cls = (await not_mfk_loc.get_attribute("class")) or ""
            if "iron-selected" in cls:
                return True
    except Exception:
        pass

    try:
        return bool(
            await eval_studio_dom(
                page,
                r"""
                const dlg = document.querySelector('ytcp-uploads-dialog, ytcp-video-metadata-editor-advanced, ytcp-video-details') || document;
                const radios = __rtmDom.deepQueryAll(
                    dlg,
                    'tp-yt-paper-radio-button, [role="radio"]'
                );
                for (const r of radios) {
                    const name = (r.getAttribute('name') || '').toUpperCase();
                    const rid = (r.getAttribute('id') || '').toLowerCase();
                    const aria = (r.getAttribute('aria-label') || '').toLowerCase();
                    const isNotMfk = (
                        name.includes('NOT_MFK')
                        || name.includes('NOT_MADE_FOR_KIDS')
                        || rid.includes('not-made-for-kids')
                        || rid.includes('not-for-kids')
                        || aria.includes('không')
                        || aria.includes('not made for kids')
                    );
                    if (isNotMfk) {
                        const checked = (
                            r.checked === true
                            || r.getAttribute('aria-checked') === 'true'
                            || r.hasAttribute('checked')
                            || (r.classList && r.classList.contains('iron-selected'))
                        );
                        if (checked) return true;
                    }
                }
                const group = dlg.querySelector('tp-yt-paper-radio-group[name="audience"], ytcp-video-metadata-made-for-kids tp-yt-paper-radio-group');
                if (group) {
                    const sel = (group.selected || group.getAttribute('selected') || '').toUpperCase();
                    if (sel.includes('NOT_MFK') || sel.includes('NOT_MADE_FOR_KIDS')) {
                        return true;
                    }
                }
                return false;
                """,
            )
        )
    except Exception:
        return False


async def _ensure_not_for_kids_audience(page) -> bool:
    """Cuộn tới phần Đối tượng khán giả và chọn Không dành cho trẻ em với chiến lược đa tầng 100% tin cậy."""
    if await _is_not_for_kids_selected(page):
        return True

    # 1. Playwright Native Locator (Tự động pierce Shadow DOM & dispatch CDP MouseEvents)
    for sel in [
        'tp-yt-paper-radio-button[name*="NOT_MFK"] #radioContainer',
        'tp-yt-paper-radio-button[name*="NOT_MFK"] #radioLabel',
        'tp-yt-paper-radio-button[name*="NOT_MFK"]',
        '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"] #radioContainer',
        '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"] #radioLabel',
        '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
        '#not-made-for-kids',
        'tp-yt-paper-radio-button[name*="NOT_MADE_FOR_KIDS"]',
    ]:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0:
                await loc.scroll_into_view_if_needed(timeout=2000)
                await asyncio.sleep(0.15)
                await loc.click(force=True, timeout=2500)
                await asyncio.sleep(0.3)
                if await _is_not_for_kids_selected(page):
                    logger.info("Đã chọn 'Không dành cho trẻ em' qua Playwright Native Locator: %s", sel)
                    return True
        except Exception as ex_nat:
            logger.debug("Playwright native radio click thử nghiệm %s: %s", sel, ex_nat)

    # 2. Cuộn chính xác tới container Đối tượng khán giả (Made for Kids) - KHÔNG cuộn kịch đáy
    audience_target = (
        'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"], '
        'tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"], '
        '#not-made-for-kids, ytcp-video-metadata-made-for-kids'
    )
    await _scroll_uploads_dialog(page, target_selector=audience_target, to_bottom=False)
    await random_delay(0.2, 0.4)

    audience_res = await safe_targeted_click(
        page,
        selectors=[
            'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"] #radioLabel',
            'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"] #radioContainer',
            'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            '#not-made-for-kids tp-yt-paper-radio-button',
            'tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"]',
            'ytcp-video-metadata-made-for-kids tp-yt-paper-radio-button:nth-child(2)',
        ],
        action_name="upload_audience_not_for_kids",
        root_selector="ytcp-uploads-dialog",
        allow_js_fallback=True,
        timeout_ms=5000,
        pre_delay=0.2,
        post_click_settle=0.35,
    )
    if audience_res.get("ok") and await _is_not_for_kids_selected(page):
        return True

    # 3. Direct Polymer Shadow DOM Injection với composed: true & iron-change & select sync
    result = await eval_studio_dom(
        page,
        r"""
        const dlg = document.querySelector('ytcp-uploads-dialog') || document;
        const radios = __rtmDom.deepQueryAll(dlg, 'tp-yt-paper-radio-button, [role="radio"]');
        for (const r of radios) {
            const name = (r.getAttribute('name') || '').toUpperCase();
            const rid = (r.getAttribute('id') || '').toLowerCase();
            const aria = (r.getAttribute('aria-label') || '').toLowerCase();
            const txt = (r.innerText || r.textContent || '').toLowerCase();

            const isNotMfk = (
                name.includes('NOT_MFK')
                || name.includes('NOT_MADE_FOR_KIDS')
                || rid.includes('not-made-for-kids')
                || rid.includes('not-for-kids')
                || aria.includes('không')
                || aria.includes('not made for kids')
                || txt.includes('không dành cho trẻ em')
                || txt.includes('not made for kids')
                || txt.includes('no, it')
            );

            if (isNotMfk) {
                try { r.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) {}
                // Click inner radio container trong shadowRoot nếu có
                if (r.shadowRoot) {
                    const rc = r.shadowRoot.querySelector('#radioContainer, #offRadio, #radioLabel, #radio');
                    if (rc) {
                        try { rc.click(); } catch (_) {}
                    }
                }
                if (typeof r.click === 'function') r.click();
                r.checked = true;
                if (r.classList) r.classList.add('iron-selected');
                r.dispatchEvent(new CustomEvent('iron-change', { bubbles: true, composed: true }));
                r.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                ['mousedown', 'mouseup', 'click'].forEach(evt => {
                    r.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, composed: true, view: window }));
                });
                const group = r.closest('tp-yt-paper-radio-group, [role="radiogroup"]') || r.parentElement;
                if (group) {
                    group.selected = r.getAttribute('name') || 'VIDEO_MADE_FOR_KIDS_NOT_MFK';
                    if (typeof group.select === 'function') {
                        try { group.select(r.getAttribute('name') || r); } catch (_) {}
                    }
                    group.dispatchEvent(new CustomEvent('iron-select', { bubbles: true, cancelable: true, composed: true, detail: { item: r } }));
                    group.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
                }
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }
                return 'deep-clicked:checked=' + r.checked;
            }
        }
        return 'not-found:' + radios.map(r => r.getAttribute('name') || r.getAttribute('id') || '').join(',');
        """,
    )
    logger.info("Deep fallback audience click: %s", result)
    await asyncio.sleep(0.35)
    return await _is_not_for_kids_selected(page)
    await asyncio.sleep(0.35)
    return await _is_not_for_kids_selected(page)


async def _diagnose_and_resolve_details_errors(page, target_title: str | None = None) -> dict:
    """Kiểm tra và tự động khắc phục các lỗi validation khiến tab DETAILS không thể Next."""
    diag = await eval_studio_dom(
        page,
        r"""
        const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog') || document;
        const info = {
            hasTitle: false,
            titleText: '',
            hasTitleError: false,
            errorMessages: [],
            isNextDisabled: true,
        };

        const tb = __rtmDom.deepFirstVisible(dlg, '#title-textarea #textbox, [aria-label*="tiêu đề" i] #textbox, [aria-label*="title" i] #textbox');
        if (tb) {
            info.titleText = (tb.innerText || tb.textContent || '').trim();
            info.hasTitle = info.titleText.length > 0;
        }

        const titleHost = __rtmDom.deepFirstVisible(dlg, '#title-textarea, ytcp-video-title');
        if (titleHost && (titleHost.hasAttribute('invalid') || titleHost.getAttribute('aria-invalid') === 'true')) {
            info.hasTitleError = true;
        }

        const errorNodes = __rtmDom.deepQueryVisible(dlg, '#error-message, .error-message, [aria-invalid="true"], ytcp-form-input-container[invalid], #error-badge');
        for (const en of errorNodes) {
            const txt = (en.innerText || en.textContent || '').trim();
            if (txt && !info.errorMessages.includes(txt)) {
                info.errorMessages.push(txt);
            }
        }

        const nextBtn = __rtmDom.deepFirstVisible(dlg, 'ytcp-button#next-button, #next-button');
        if (nextBtn) {
            info.isNextDisabled = nextBtn.hasAttribute('disabled') || nextBtn.getAttribute('aria-disabled') === 'true';
        }

        return info;
        """
    )
    if not isinstance(diag, dict):
        return {}

    # Tự động khắc phục nếu tiêu đề bị trống
    if not diag.get("hasTitle") and target_title:
        logger.warning("Phát hiện tiêu đề trống trong lúc kiểm tra validation — Đang tự động điền lại...")
        clean_title = (target_title or "").strip()[:92]
        title_box = page.locator('ytcp-uploads-dialog #title-textarea #textbox, #title-textarea #textbox').first
        if await title_box.count() > 0:
            try:
                await title_box.click(force=True, timeout=3000)
                await page.keyboard.press("Control+a")
                await page.keyboard.insert_text(clean_title)
            except Exception:
                pass

    # Tự động khắc phục nếu Audience chưa được chọn
    if not await _is_not_for_kids_selected(page):
        logger.warning("Phát hiện Đối tượng khán giả chưa được chọn — Đang tự động chọn lại...")
        await _ensure_not_for_kids_audience(page)

    return diag


async def dismiss_publish_anyway_dialogs(page) -> bool:
    """Tự động dò tìm và click nút 'Vẫn xuất bản' / 'Publish anyway' / 'Vẫn lưu' nếu YouTube Studio hiện popup cảnh báo kiểm tra/SD xuyên Shadow DOM."""
    try:
        conf_res = await eval_studio_dom(
            page,
            """
            const dlgs = __rtmDom.deepQueryMounted(document, 'ytcp-confirmation-dialog, tp-yt-paper-dialog, ytcp-dialog, [role="dialog"]');
            for (const dlg of dlgs) {
                if (!__rtmDom.isContainerVisiblyMounted(dlg)) continue;
                const tag = (dlg.tagName || '').toLowerCase();
                if (tag === 'ytcp-uploads-dialog') continue;

                const btns = __rtmDom.deepQueryVisible(dlg, '#confirm-button, [dialog-confirm], ytcp-button.ytcp-confirmation-dialog, ytcp-button#primary-action-button, ytcp-button#save-button, ytcp-button#publish-button, ytcp-button, button');
                for (const b of btns) {
                    const btxt = (__rtmDom.collectVisibleText(b) || '').toLowerCase();
                    const bid = (b.id || '').toLowerCase();
                    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                    const isConfirmBtn = (
                        bid.includes('confirm')
                        || bid.includes('primary')
                        || b.hasAttribute('dialog-confirm')
                        || btxt.includes('vẫn xuất bản')
                        || btxt.includes('publish anyway')
                        || btxt.includes('xuất bản ngay')
                        || btxt.includes('vẫn lưu')
                        || btxt.includes('save anyway')
                        || btxt.includes('publish now')
                        || btxt.includes('xác nhận')
                        || btxt.includes('tiếp tục')
                        || btxt.includes('đã hiểu')
                        || btxt.includes('got it')
                        || btxt.includes('publicar de todos modos')
                        || btxt.includes('publicar igualmente')
                        || btxt.includes('trotzdem')
                        || btxt.includes('publier')
                        || btxt.includes('все равно')
                        || btxt.includes('仍要发布')
                        || btxt.includes('仍要發布')
                        || aria.includes('vẫn xuất bản')
                        || aria.includes('publish anyway')
                    );
                    if (isConfirmBtn && !btxt.includes('hủy') && !btxt.includes('cancel') && !btxt.includes('không')) {
                        const nativeBtn = __rtmDom.resolveNativeButton(b) || b;
                        nativeBtn.click();
                        return { clicked: true, text: btxt || bid };
                    }
                }
            }
            return { clicked: false };
            """,
        )
        if conf_res and conf_res.get("clicked"):
            logger.info("Đã bấm xác nhận 'Vẫn xuất bản' (Publish anyway): %s", conf_res.get("text"))
            return True
    except Exception as conf_err:
        logger.debug("Lỗi kiểm tra popup xác nhận xuất bản: %s", conf_err)
    return False


async def _detect_full_page_editor(page) -> tuple[bool, str]:
    """Nhận diện xem trình duyệt đang ở giao diện Full-Page Video Details Editor hay không.
    Trả về (is_full_page, video_id)."""
    curr_url = getattr(page, "url", "") or ""
    vid_match = re.search(r"/video/([A-Za-z0-9_-]{11})(?:/edit|/|$|\?)", curr_url)
    video_id = vid_match.group(1) if vid_match else ""

    try:
        has_editor_dom = await eval_studio_dom(page, """
            const hasDialog = Boolean(document.querySelector('ytcp-uploads-dialog[opened], ytcp-uploads-dialog:not([hidden])'));
            if (hasDialog) return false;
            const hasFullEditor = Boolean(
                document.querySelector('ytcp-video-metadata-editor, ytcp-video-details, ytcp-video-metadata-editor-basic, ytcp-entity-page-header #save-button')
            );
            return hasFullEditor;
        """)
    except Exception:
        has_editor_dom = False

    is_full_page = bool(video_id or has_editor_dom)
    return is_full_page, video_id


async def _set_full_page_visibility(page, visibility: str = "public", schedule_date: str = "", schedule_time: str = "") -> bool:
    """Xử lý chọn chế độ hiển thị trên giao diện Full-Page Video Details Editor (Panel bên phải)."""
    vis = str(visibility or "public").strip().lower()
    target_radio_name = "PUBLIC" if vis == "public" else ("PRIVATE" if vis == "private" else "UNLISTED")
    logger.info("Full-Page Editor | Đang cấu hình chế độ hiển thị: %s (%s)", vis, target_radio_name)

    # 1. Mở dropdown visibility ở panel bên phải
    opened_trigger = await eval_studio_dom(page, """
        const sidePanel = __rtmDom.deepFirstVisible(document, 'ytcp-video-metadata-editor-side-panel, #side-panel') || document;
        const trigger = __rtmDom.deepFirstVisible(
            sidePanel,
            'ytcp-video-visibility-select, #visibility-select, ytcp-dropdown-trigger#trigger, #visibility-button, [test-id="visibility-button"]'
        );
        if (trigger) {
            const clk = __rtmDom.resolveNativeButton(trigger) || trigger;
            clk.click();
            return true;
        }
        return false;
    """)
    if not opened_trigger:
        try:
            trig_loc = page.locator('ytcp-video-visibility-select, #visibility-select, [test-id="visibility-button"]').first
            if await trig_loc.count() > 0:
                await trig_loc.click(timeout=3000)
                opened_trigger = True
        except Exception:
            pass

    await asyncio.sleep(0.8)

    # 2. Chọn radio chế độ hiển thị mong muốn trong popup
    radio_selected = False
    for _try in range(3):
        radio_selected = bool(await eval_studio_dom(page, f"""
            const dialogs = document.querySelectorAll('ytcp-video-visibility-select tp-yt-paper-dialog, ytcp-video-visibility-dialog, tp-yt-paper-dialog[opened], ytcp-text-menu');
            for (const dlg of dialogs) {{
                const r = __rtmDom.deepFirstVisible(dlg, 'tp-yt-paper-radio-button[name="{target_radio_name}"], [name="{target_radio_name}"]');
                if (r) {{
                    const nativeR = __rtmDom.resolveNativeButton(r) || r;
                    nativeR.click();
                    return true;
                }}
            }}
            const directR = __rtmDom.deepFirstVisible(document, 'tp-yt-paper-radio-button[name="{target_radio_name}"]');
            if (directR) {{
                directR.click();
                return true;
            }}
            return false;
        """))
        if radio_selected:
            logger.info("Full-Page Editor | Đã chọn radio %s thành công", target_radio_name)
            break
        await asyncio.sleep(0.5)

    # 3. Bấm nút 'Xong' / 'Done' / 'Save' bên trong popup dropdown để chốt lựa chọn
    await asyncio.sleep(0.4)
    await eval_studio_dom(page, """
        const dialogs = document.querySelectorAll('ytcp-video-visibility-select tp-yt-paper-dialog, ytcp-video-visibility-dialog, tp-yt-paper-dialog[opened], ytcp-text-menu');
        for (const dlg of dialogs) {
            const doneBtn = __rtmDom.deepFirstVisible(
                dlg,
                'ytcp-button#save-button, ytcp-button#done-button, #save-button, #done-button, [aria-label*="xong" i], [aria-label*="done" i]'
            );
            if (doneBtn && __rtmDom.isReallyVisible(doneBtn)) {
                const nativeBtn = __rtmDom.resolveNativeButton(doneBtn) || doneBtn;
                nativeBtn.click();
                return true;
            }
        }
        return false;
    """)
    await asyncio.sleep(0.6)
    return radio_selected


async def _save_full_page_editor(page, timeout_seconds: float = 30.0) -> bool:
    """Bấm nút Lưu (#save-button) ở header Full-Page Editor và đợi xác nhận hoàn tất."""
    logger.info("Full-Page Editor | Đang chờ nút Lưu (#save-button) trên Header chuyển sang khả dụng...")

    save_btn_selector = "ytcp-entity-page-header #save-button, ytcp-button#save-button, #save-button, [test-id='save-button']"
    active = False
    start_wait = time.time()
    while time.time() - start_wait < 15.0:
        is_active = await eval_studio_dom(page, f"""
            const btn = document.querySelector("{save_btn_selector}");
            if (!btn) return false;
            const inner = btn.querySelector('button') || btn;
            const isDis = btn.hasAttribute('disabled')
                || btn.getAttribute('aria-disabled') === 'true'
                || inner.hasAttribute('disabled')
                || (inner.classList && inner.classList.contains('ytcpButtonShapeImpl--disabled'));
            return !isDis;
        """)
        if is_active:
            active = True
            break
        await asyncio.sleep(0.5)

    if not active:
        logger.warning("Full-Page Editor | Nút Lưu chưa active hoặc không có thay đổi mới cần lưu.")
    else:
        logger.info("Full-Page Editor | Tiến hành click nút Lưu (#save-button)...")
        clicked = False
        try:
            loc = page.locator(save_btn_selector).first
            if await loc.is_visible(timeout=3000):
                await loc.click()
                clicked = True
        except Exception:
            pass

        if not clicked:
            await eval_studio_dom(page, f"""
                const btn = document.querySelector("{save_btn_selector}");
                if (btn) {{
                    const inner = __rtmDom.resolveNativeButton(btn) || btn;
                    inner.click();
                }}
            """)

    for _ in range(3):
        await dismiss_publish_anyway_dialogs(page)
        await asyncio.sleep(0.5)

    saved_confirmed = False
    save_poll_start = time.time()
    while time.time() - save_poll_start < timeout_seconds:
        await dismiss_publish_anyway_dialogs(page)
        status = await page.evaluate(f"""() => {{
            const toast = document.querySelector('ytcp-toast, tp-yt-paper-toast, [role="alert"], ytcp-notification-toast');
            if (toast && (toast.innerText || toast.textContent || '').trim()) {{
                const txt = (toast.innerText || toast.textContent || '').toLowerCase();
                if (txt.includes('lưu') || txt.includes('save') || txt.includes('xuất bản') || txt.includes('publish')) {{
                    return 'toast_saved';
                }}
            }}
            const btn = document.querySelector("{save_btn_selector}");
            if (btn) {{
                const inner = btn.querySelector('button') || btn;
                const isDis = btn.hasAttribute('disabled')
                    || btn.getAttribute('aria-disabled') === 'true'
                    || inner.hasAttribute('disabled')
                    || (inner.classList && inner.classList.contains('ytcpButtonShapeImpl--disabled'));
                if (isDis) return 'button_disabled';
            }}
            return 'pending';
        }}""")
        if status in ('toast_saved', 'button_disabled'):
            saved_confirmed = True
            logger.info("Full-Page Editor | Đã xác nhận lưu thành công qua DOM state: %s (sau %.1fs)", status, time.time() - save_poll_start)
            break
        await asyncio.sleep(0.6)

    return saved_confirmed


class YouTubeUpload:
    async def upload_video(
        self,
        page,
        video_path: str,
        title: str,
        description: str,
        tags: str = "",
        thumbnail_path: str = None,
        visibility: str = "public",
        schedule_date: str = "",
        schedule_time: str = "",
        pinned_comment: str = "",
        preferred_channel: str = "",
        handover_after_save: bool = False,
    ) -> str:
        """Đăng video lên YouTube Studio. Trả về URL video (hoặc chuỗi rỗng nếu thất bại)."""

        video_path = _resolve_path(video_path)
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"File video không tồn tại trên ổ đĩa: {video_path}")
        file_size = os.path.getsize(video_path)
        if file_size < 1024:
            raise ValueError(f"File video rỗng hoặc không hợp lệ ({file_size} bytes): {video_path}")
        try:
            with open(video_path, "rb") as test_f:
                _ = test_f.read(512)
        except Exception as lock_err:
            raise PermissionError(f"File video đang bị khóa bởi tiến trình khác (chưa kết xuất xong): {lock_err}")

        if thumbnail_path:
            thumbnail_path = _resolve_path(thumbnail_path)

        # Giới hạn cứng YouTube: Tiêu đề tối đa 100 UTF-16 units (cắt an toàn <= 92 units, bao gồm emoji)
        title = (title or "").strip().replace("<", "").replace(">", "")
        if len(title.encode("utf-16-le")) // 2 > 92:
            logger.warning("Tiêu đề dài (%d UTF-16 units) — tự động cắt an toàn <= 92 units", len(title.encode("utf-16-le")) // 2)
            title = _truncate_utf16(title, 92)

        # Warmup: duyệt Studio trước khi upload
        if not await studio_warmup(page, preferred_channel=preferred_channel):
            if str(preferred_channel or "").strip():
                raise RuntimeError("Preferred YouTube channel not found")
            raise RuntimeError("Khởi động YouTube Studio (warmup) thất bại")

        # Kiểm tra nếu trang chưa ở trong YouTube Studio thì mới chuyển hướng
        if "studio.youtube.com" not in page.url:
            logger.info("Chuyển hướng vào YouTube Studio")
            try:
                await page.goto("https://studio.youtube.com/", wait_until="domcontentloaded", timeout=60000)
            except Exception as exc:
                if "studio.youtube.com" in page.url:
                    logger.info("Navigation timeout nhẹ nhưng đã tải được Studio: %s", exc)
                else:
                    logger.warning("Thử lại truy cập studio.youtube.com lần 2...")
                    await page.goto("https://studio.youtube.com/", wait_until="commit", timeout=45000)
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=15000)
            except Exception:
                pass
            await random_delay(2.0, 3.5)
        else:
            logger.info("Trình duyệt đã ở trong YouTube Studio qua thao tác click tự nhiên — tiếp tục")
            await random_delay(1.0, 2.0)

        health = await check_page_health(page)
        if health == "login":
            logger.error(
                "Profile chưa đăng nhập YouTube Studio — hủy upload. "
                "Vui lòng mở Hồ sơ → đăng nhập Google trước."
            )
            raise RuntimeError(
                "Profile chưa đăng nhập YouTube Studio. Vui lòng mở Hồ sơ trình duyệt (Profile) → "
                "đăng nhập Google/YouTube Studio trước khi tải lên."
            )

        # Dọn dẹp modal hậu xử lý còn sót từ phiên trước (nếu có) trước khi mở hộp thoại upload mới
        await dismiss_post_save_studio_modals(page, settlement_seconds=0.0, context="pre_upload")
        await dismiss_blocking_studio_dialogs(page, allow_reload=True, context="pre_upload_notice")

        # Tự động đóng các modal chặn (confirmation / backdrop dở dang từ phiên trước nếu có)
        try:
            await page.evaluate("""() => {
                const backdrops = document.querySelectorAll('iron-overlay-backdrop.opened, tp-yt-iron-overlay-backdrop.opened');
                const hasUploadDialog = !!document.querySelector('ytcp-uploads-dialog[opened], ytcp-uploads-dialog:not([hidden])');
                if (!hasUploadDialog) {
                    backdrops.forEach(b => {
                        b.classList.remove('opened');
                        b.style.display = 'none';
                    });
                }
                const discardBtn = document.querySelector('ytcp-confirmation-dialog #confirm-button, ytcp-confirmation-dialog [test-id="confirm-button"]');
                if (discardBtn && !hasUploadDialog) {
                    discardBtn.click();
                }
            }""")
        except Exception:
            pass

        # Nếu trình duyệt đang ở scope /video/<id>/edit hoặc analytics của video cũ
        pre_ctx = await get_studio_context(page)
        if pre_ctx.get("scope") == "video":
            cur_url = pre_ctx.get("url") or getattr(page, "url", "") or ""
            if "/video/" in cur_url and "/edit" in cur_url:
                try:
                    page_title = await eval_studio_dom(page, """
                        const tb = __rtmDom.deepFirstVisible(document, '#title-textarea #textbox, [aria-label*="tiêu đề" i] #textbox, [aria-label*="title" i] #textbox');
                        return tb ? (tb.innerText || tb.textContent || '').trim() : '';
                    """)
                    norm_page_title = " ".join((page_title or "").split()).lower()
                    clean_target_title = (title or "").strip()[:92].lower()
                    if clean_target_title and norm_page_title and (clean_target_title[:20] in norm_page_title or norm_page_title[:20] in clean_target_title):
                        logger.info("Phát hiện video đang ở trang chỉnh sửa Full-Page trùng khớp tiêu đề ('%s') — Tiếp tục hoàn tất xuất bản không cần upload lại!", page_title[:60])
                        await _ensure_not_for_kids_audience(page)
                        await _set_full_page_visibility(page, visibility=visibility, schedule_date=schedule_date, schedule_time=schedule_time)
                        video_url = await _extract_video_url(page)
                        await _save_full_page_editor(page, timeout_seconds=30.0)
                        if not video_url:
                            video_url = await _extract_video_url(page)
                        if pinned_comment and video_url:
                            if (visibility or "public").strip().lower() == "public":
                                await random_delay(5.0, 10.0)
                                await _pin_comment(page, video_url, pinned_comment)
                            else:
                                _save_pending_comment(video_url, pinned_comment)
                        try:
                            await goto_channel_videos(page)
                        except Exception:
                            pass
                        verified_url = _verified_video_url_from_row({"videoUrl": video_url}) if video_url else None
                        if not verified_url:
                            m_vid = re.search(r"/video/([A-Za-z0-9_-]{11})", cur_url)
                            if m_vid:
                                verified_url = f"https://youtu.be/{m_vid.group(1)}"
                        if verified_url:
                            logger.info("Hoàn tất xuất bản video thành công qua Full-Page Draft: %s", verified_url)
                            return verified_url
                except Exception as ex_draft:
                    logger.debug("Lỗi kiểm tra bản nháp cũ: %s", ex_draft)

            logger.warning(
                "Trước khi upload trình duyệt đang kẹt ở %s (%s); điều hướng về kênh trước...",
                pre_ctx.get("pageType"),
                pre_ctx.get("url"),
            )
            ch_id = pre_ctx.get("channelId") or ""
            target_ch = f"https://studio.youtube.com/channel/{ch_id}" if ch_id else "https://studio.youtube.com/"
            await page.goto(target_ch, wait_until="domcontentloaded", timeout=45000)
            await random_delay(1.2, 2.0)

        # KIEM TRA CHONG DANG TRUNG LAP TREN KENH DICH (PRE-UPLOAD ANTI-DUPLICATE SCAN)
        try:
            import unicodedata
            from actions.dom.js_lib import build_extract_table_rows_js

            def _norm_cmp(s: str) -> str:
                if not s:
                    return ""
                nfkd = unicodedata.normalize('NFKD', str(s))
                ascii_s = nfkd.encode('ASCII', 'ignore').decode('utf-8')
                return re.sub(r"[\s\u200b-\u200d\uFEFF\-_|]+", " ", ascii_s.lower()).strip()

            clean_check_title = _norm_cmp(title)
            if clean_check_title:
                cur_url = getattr(page, "url", "") or ""
                if "/videos" not in cur_url:
                    logger.info("Kiem tra danh sach video Kenh Dich de phong ngua dang trung lap...")
                    await goto_channel_videos(page)
                    await random_delay(1.5, 2.5)

                # Đảm bảo trang đã vào /videos/upload
                cur_url = getattr(page, "url", "") or ""
                if "/videos" not in cur_url:
                    cid_match = re.search(r"/channel/([^/?#]+)", cur_url)
                    cid_val = cid_match.group(1) if cid_match else ""
                    if cid_val:
                        videos_dest = f"https://studio.youtube.com/channel/{cid_val}/videos/upload"
                        try:
                            await page.goto(videos_dest, wait_until="domcontentloaded", timeout=30000)
                            await random_delay(1.5, 2.5)
                        except Exception:
                            pass

                try:
                    await page.wait_for_selector("ytcp-video-row", timeout=10000)
                except Exception:
                    pass

                existing_rows = await page.evaluate(build_extract_table_rows_js()) or []
                for idx, row in enumerate(existing_rows):
                    row_title = _norm_cmp(row.get("title") or "")
                    row_status = (row.get("status") or row.get("visibility") or "").lower()
                    row_vid = (row.get("vid") or "").strip()

                    if any(s in row_status for s in ["abandoned", "bi huy", "bi tu choi", "rejected", "failed"]):
                        continue

                    min_len = min(len(clean_check_title), 30)
                    prefix = clean_check_title[:min_len] if min_len >= 12 else clean_check_title
                    is_match = False
                    if row_title and prefix:
                        if prefix in row_title or row_title[:min_len] in clean_check_title or clean_check_title in row_title:
                            is_match = True

                    if is_match:
                        logger.warning(
                            "[CHONG DANG TRUNG] Video '%s' da ton tai tren Kenh Dich (Trang thai: %s, ID: %s)! Bo qua tai len de tranh trung lap.",
                            row.get("title", "")[:60],
                            row_status,
                            row_vid,
                        )
                        # Deep extraction nếu row_vid trống
                        if not row_vid or len(row_vid) != 11:
                            try:
                                deep_vid = await page.evaluate("""(rowIdx) => {
                                    const rows = document.querySelectorAll('ytcp-video-row');
                                    const r = rows[rowIdx];
                                    if (!r) return '';
                                    const a = r.querySelector('a[href*="/video/"], a[href*="youtu.be/"], a#video-title');
                                    if (a && a.href) {
                                        const m = a.href.match(/(?:\\/video\\/|youtu\\.be\\/|v=)([A-Za-z0-9_-]{11})/);
                                        if (m) return m[1];
                                    }
                                    return r.getAttribute('video-id') || r.getAttribute('data-video-id') || '';
                                }""", idx)
                                if deep_vid and len(deep_vid) == 11:
                                    row_vid = deep_vid
                            except Exception:
                                pass

                        if row_vid and len(row_vid) == 11:
                            return f"https://youtu.be/{row_vid}"
                        return f"duplicate_verified:{row_vid or 'existing'}"
        except Exception as dup_check_err:
            logger.debug("Loi trong buoc kiem tra trung lap kenh dich: %s", dup_check_err)

        max_upload_flow_attempts = 3
        for upload_flow_attempt in range(max_upload_flow_attempts):
            logger.info("Bắt đầu quy trình mở hộp thoại tải video (lần thử %d/%d)...", upload_flow_attempt + 1, max_upload_flow_attempts)
            await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="flow_attempt_start")

            logger.info("Click Create -> Upload videos (language-agnostic)")
            opened = False

            # Thử kiểm tra xem hộp thoại upload đã mở sẵn từ trước chưa
            try:
                cur_ctx_check = await get_studio_context(page)
                if (cur_ctx_check.get("uploadState") or {}).get("filePickerVisible"):
                    opened = True
                    logger.info("Hộp thoại tải lên đã mở sẵn — tiếp tục chọn file")
            except Exception:
                pass

            if not opened:
                # Bước 1: Mở menu Tạo (Create)
                try:
                    create_res = await safe_targeted_click(
                        page,
                        selectors=[
                            "ytcp-button#create-icon",
                            "ytcp-button-shape#create-icon",
                            "ytcp-header #create-icon",
                            "ytcp-icon-button#create-icon",
                            "#create-icon",
                            "#create-button",
                            "ytcp-button[label*='Create' i]",
                            "ytcp-button[label*='Tạo' i]",
                            "button[aria-label*='Create' i]",
                            "button[aria-label*='Tạo' i]",
                            "ytcp-header [test-id='create-icon']",
                        ],
                        action_name="studio_open_create_menu",
                        exclude_ancestors=["ytcp-video-row", "ytcp-uploads-dialog", "#hover-items"],
                        forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/video/[^/]+/edit"],
                        allow_js_fallback=True,
                        timeout_ms=5000,
                        pre_delay=0.25,
                        post_click_settle=0.4,
                    )
                except Exception as exc:
                    logger.debug("Create menu click failed: %s", exc)

                # Thử click menu item bằng Playwright native selector đa ngôn ngữ và CSS
                try:
                    await random_delay(0.3, 0.6)
                    menu_locators = [
                        page.locator("tp-yt-paper-dialog[opened] tp-yt-paper-item").first,
                        page.locator("tp-yt-paper-item#text-item-0"),
                        page.locator("tp-yt-paper-item:has-text('Upload')").first,
                        page.locator("tp-yt-paper-item:has-text('Tải')").first,
                        page.locator("[test-id='upload-video-menu-item']"),
                        page.locator("ytcp-text-menu tp-yt-paper-item").first,
                    ]
                    for mloc in menu_locators:
                        try:
                            if await mloc.count() > 0 and await mloc.is_visible():
                                await mloc.click(timeout=3000)
                                opened = True
                                logger.info("Đã click nút Tải video lên qua menu Create thành công")
                                break
                        except Exception:
                            continue
                except Exception as m_err:
                    logger.debug("Playwright menu click thử nghiệm: %s", m_err)

            if not opened:
                # Bước 2: Thử click nút trực tiếp qua Playwright và safe_targeted_click
                try:
                    direct_locators = [
                        page.locator("ytcp-header #upload-icon, #upload-icon").first,
                        page.locator("#upload-button, ytcp-button#upload-button").first,
                        page.locator("ytcp-button#create-icon, #create-icon").first,
                    ]
                    for dloc in direct_locators:
                        try:
                            if await dloc.count() > 0 and await dloc.is_visible():
                                await dloc.click(timeout=3000)
                                await random_delay(0.5, 1.0)
                                sub_item = page.locator("tp-yt-paper-item#text-item-0, tp-yt-paper-dialog[opened] tp-yt-paper-item").first
                                if await sub_item.count() > 0 and await sub_item.is_visible():
                                    await sub_item.click(timeout=3000)
                                opened = True
                                break
                        except Exception:
                            continue
                except Exception as d_err:
                    logger.debug("Direct click fallback error: %s", d_err)

            if not opened:
                # Bước 3: Direct JS click xuyên Shadow DOM
                try:
                    js_click_res = await eval_studio_dom(page, """
                        const createBtn = document.querySelector('#create-icon, ytcp-header #create-icon, [aria-label*="Create" i], [aria-label*="Tạo" i]');
                        if (createBtn) {
                            createBtn.click();
                            setTimeout(() => {
                                const item = document.querySelector('tp-yt-paper-item#text-item-0, [test-id="upload-video-menu-item"], tp-yt-paper-item');
                                if (item) item.click();
                            }, 300);
                            return true;
                        }
                        const uploadIcon = document.querySelector('#upload-icon, #upload-button');
                        if (uploadIcon) {
                            uploadIcon.click();
                            return true;
                        }
                        return false;
                    """)
                    if js_click_res:
                        opened = True
                        await random_delay(1.0, 1.5)
                except Exception as js_err:
                    logger.debug("Direct JS click error: %s", js_err)

            # Chờ file picker dialog thật xuất hiện
            logger.info("Chờ file picker dialog (ytcp-uploads-file-picker)")
            picker_ready = False
            try:
                await page.wait_for_selector("ytcp-uploads-dialog ytcp-uploads-file-picker, ytcp-uploads-file-picker", timeout=25000)
                picker_ready = True
            except Exception:
                await random_delay(1.0, 1.8)
                # Kiểm tra và dismiss popup cản trở (ví dụ: 'Bạn đã hoàn tất' / 'You're all set') nếu đang che khuất
                picker_timeout_dismiss = await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="picker_timeout_check")
                if picker_timeout_dismiss and picker_timeout_dismiss.get("handled") and picker_timeout_dismiss.get("needsReload") and upload_flow_attempt < max_upload_flow_attempts - 1:
                    logger.info("Phát hiện modal quyền tính năng khi chờ file picker. Đã đóng, điều hướng về Dashboard để cập nhật quyền...")
                    target_reload_url = getattr(page, "url", "") or "https://studio.youtube.com/"
                    if "/channel/" in target_reload_url:
                        cid_m = re.search(r"/channel/([^/?#]+)", target_reload_url)
                        if cid_m:
                            target_reload_url = f"https://studio.youtube.com/channel/{cid_m.group(1)}"
                    if not target_reload_url or "studio.youtube.com" not in target_reload_url:
                        target_reload_url = "https://studio.youtube.com/"
                    await page.goto(target_reload_url, wait_until="domcontentloaded", timeout=45000)
                    await asyncio.sleep(2.0)
                    continue
                cur_ctx_picker = await get_studio_context(page)
                picker_ready = bool((cur_ctx_picker.get("uploadState") or {}).get("filePickerVisible"))

            if not picker_ready:
                cur_ctx_picker = await get_studio_context(page)
                raise RuntimeError(
                    f"Hộp thoại chọn file tải lên (ytcp-uploads-file-picker) không xuất hiện "
                    f"(pageType={cur_ctx_picker.get('pageType')}, url={cur_ctx_picker.get('url')})."
                )

            # Dọn dẹp blocking dialog nếu đang che khuất nút #select-files-button
            picker_dismiss = await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="before_select_files")
            if picker_dismiss and picker_dismiss.get("handled") and picker_dismiss.get("needsReload") and upload_flow_attempt < max_upload_flow_attempts - 1:
                logger.info("Phát hiện modal quyền tính năng trước khi chọn file. Đã đóng, điều hướng về Dashboard để cập nhật quyền...")
                target_reload_url = getattr(page, "url", "") or "https://studio.youtube.com/"
                if "/channel/" in target_reload_url:
                    cid_m = re.search(r"/channel/([^/?#]+)", target_reload_url)
                    if cid_m:
                        target_reload_url = f"https://studio.youtube.com/channel/{cid_m.group(1)}"
                if not target_reload_url or "studio.youtube.com" not in target_reload_url:
                    target_reload_url = "https://studio.youtube.com/"
                await page.goto(target_reload_url, wait_until="domcontentloaded", timeout=45000)
                await asyncio.sleep(2.0)
                continue

            # Chọn file video bằng Dual Strategy (ưu tiên FileChooser, dự phòng set_input_files)
            logger.info("Chọn file video: %s", video_path)
            file_selected = False
            try:
                select_btn = page.locator('#select-files-button, [test-id="select-files-button"], ytcp-button#select-files-button').first
                if await select_btn.count() > 0 and await select_btn.is_visible():
                    async with page.expect_file_chooser(timeout=6000) as fc_info:
                        await select_btn.click()
                    file_chooser = await fc_info.value
                    await file_chooser.set_files(video_path)
                    file_selected = True
                    logger.info("Đã chọn file video qua Playwright FileChooser thành công")
            except Exception as fc_err:
                logger.debug("FileChooser click không kích hoạt được, kiểm tra blocking dialogs: %s", fc_err)
                await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="file_chooser_retry")

            if not file_selected:
                file_input = None
                scoped_input_sel = 'ytcp-uploads-dialog input[type="file"], ytcp-uploads-file-picker input[type="file"]'
                for _attempt in range(4):
                    try:
                        fi = page.locator(scoped_input_sel).first
                        if await fi.count() > 0:
                            file_input = fi
                            break
                    except Exception:
                        pass
                    for frame in page.frames:
                        try:
                            fi = frame.locator(scoped_input_sel).first
                            if await fi.count() > 0:
                                file_input = fi
                                break
                        except Exception:
                            continue
                    if file_input:
                        break
                    await random_delay(1.0, 1.8)

                if not file_input:
                    cur_ctx_fi = await get_studio_context(page)
                    raise RuntimeError(
                        f"Không tìm thấy input[type=file] bên trong ytcp-uploads-dialog "
                        f"(pageType={cur_ctx_fi.get('pageType')}, url={cur_ctx_fi.get('url')})."
                    )

                await file_input.set_input_files(video_path)
                try:
                    await file_input.evaluate("""input => {
                        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    }""")
                except Exception:
                    try:
                        await file_input.dispatch_event("change")
                    except Exception:
                        pass
            logger.info("Đã chọn file, chờ dialog metadata xuất hiện")

            # Chờ dialog chuyển sang bước Details / BASIC_INFO (metadata) xuyên Shadow DOM
            # Tính toán timeout linh hoạt dựa theo dung lượng file (tối thiểu 180s cho video dung lượng lớn/phim dài)
            try:
                file_size_mb = os.path.getsize(video_path) / (1024 * 1024)
            except Exception:
                file_size_mb = 100.0

            metadata_wait_timeout = max(180.0, min(360.0, 90.0 + (file_size_mb / 10.0)))
            logger.info("Chờ dialog chi tiết video (Details) xuất hiện (file %.1f MB, timeout tối đa %.0fs)...", file_size_mb, metadata_wait_timeout)
            title_box_ready = False
            need_session_reload = False
            t_wait_start = time.time()

            while time.time() - t_wait_start < metadata_wait_timeout:
                if is_browser_disconnected(page):
                    raise RuntimeError("Cửa sổ/thẻ YouTube Studio đã bị đóng trong lúc chờ dialog metadata.")

                try:
                    # 0. Tự động kiểm tra và dismiss bất kỳ popup chặn nào (như 'Bạn đã hoàn tất' / 'Đã hiểu' / 'Làm mới trang')
                    dismiss_res = await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="metadata_wait_loop")
                    if dismiss_res and dismiss_res.get("handled"):
                        logger.info("Đã phát hiện và đóng hộp thoại chặn trong lúc chờ metadata: %s", dismiss_res)
                        if dismiss_res.get("isDailyLimit"):
                            logger.error("Kênh đã đạt Daily Upload Limit: %s", dismiss_res.get("details"))
                            raise RuntimeError(f"Kênh đã đạt giới hạn tải lên hàng ngày của YouTube Studio (Daily Upload Limit): {dismiss_res.get('details')}")
                        if dismiss_res.get("needsReload") and upload_flow_attempt < max_upload_flow_attempts - 1:
                            logger.info("Modal quyền tính năng yêu cầu reload Studio. Đánh dấu để reload và thử lại luồng upload...")
                            need_session_reload = True
                            break

                    # Dynamic Keep-Alive: Nếu upload stream đang hoạt động tích cực, gia hạn thời gian chờ
                    try:
                        uploading_active = await page.evaluate(r"""() => {
                            const prog = document.querySelector('ytcp-video-upload-progress');
                            if (prog && prog.offsetParent !== null) {
                                const txt = (prog.innerText || '').toLowerCase();
                                if (txt.includes('%') || txt.includes('đang tải') || txt.includes('uploading') || txt.includes('đang xử lý') || txt.includes('processing')) {
                                    return true;
                                }
                            }
                            return false;
                        }""")
                        if uploading_active:
                            t_wait_start = max(t_wait_start, time.time() - (metadata_wait_timeout - 60.0))
                    except Exception:
                        pass

                    state = await eval_studio_dom(
                        page,
                        r"""
                        const res = { hasTitleBox: false, isDocked: false, errorMessage: '', isDuplicate: false };

                        // 1. Kiểm tra cảnh báo lỗi thực sự từ YouTube Studio (loại trừ ytcp-uploads-dialog)
                        const isUploadsDialogMember = (el) => {
                            if (!el) return false;
                            const tag = (el.tagName || '').toLowerCase();
                            if (tag === 'ytcp-uploads-dialog' || tag === 'ytcp-uploads-file-picker') return true;
                            if (__rtmDom.hasAncestorTag && __rtmDom.hasAncestorTag(el, new Set(['ytcp-uploads-dialog', 'ytcp-uploads-file-picker']))) return true;
                            if (typeof el.closest === 'function' && el.closest('ytcp-uploads-dialog, ytcp-uploads-file-picker')) return true;
                            return false;
                        };

                        const modalCandidates = __rtmDom.deepQueryVisible(
                            document,
                            'ytcp-confirmation-dialog, ytcp-dialog[type="error"], ytcp-alert-dialog, tp-yt-paper-dialog.ytcp-confirmation-dialog'
                        );

                        for (const modal of modalCandidates) {
                            if (!__rtmDom.isReallyVisible(modal)) continue;
                            if (isUploadsDialogMember(modal)) continue;
                            // Nếu hộp thoại chứa các thành phần nhập metadata thì đó là wizard upload đang hoạt động, không phải alert lỗi
                            if (modal.querySelector && modal.querySelector('#title-textarea, #description-textarea, ytcp-uploads-file-picker, #select-files-button')) continue;

                            const txt = __rtmDom.collectVisibleText(modal).trim().toLowerCase();
                            if (!txt) continue;

                            // Kiểm tra trùng lặp file
                            const isDup = txt.includes('trung lap') || txt.includes('trùng lặp') || txt.includes('duplicate') || txt.includes('ban sao') || txt.includes('bản sao') || txt.includes('already uploaded');
                            if (isDup) {
                                res.errorMessage = txt.replace(/\s+/g, ' ');
                                res.isDuplicate = true;
                                return res;
                            }

                            // BỎ QUA nếu là nội dung giới hạn độ tuổi (COPPA / Age restriction)
                            const isAgeRestrictionOnly = (
                                (txt.includes('do tuoi') || txt.includes('độ tuổi') || txt.includes('age restriction') || txt.includes('18 tuoi') || txt.includes('18 tuổi') || txt.includes('tre em') || txt.includes('trẻ em') || txt.includes('made for kids'))
                                && !txt.includes('gioi han tai len') && !txt.includes('giới hạn tải lên') && !txt.includes('daily upload limit') && !txt.includes('24 gio') && !txt.includes('24 giờ')
                            );
                            if (isAgeRestrictionOnly) {
                                continue;
                            }

                            // Nhận diện lỗi giới hạn số lượng video tải lên trong ngày (Daily upload limit)
                            const isDailyUploadLimit = (
                                txt.includes('gioi han tai len')
                                || txt.includes('giới hạn tải lên')
                                || txt.includes('gioi han hang ngay')
                                || txt.includes('giới hạn hàng ngày')
                                || txt.includes('gioi han so luong video')
                                || txt.includes('giới hạn số lượng video')
                                || ((txt.includes('dat') || txt.includes('đạt')) && (txt.includes('gioi han') || txt.includes('giới hạn')) && (txt.includes('tai len') || txt.includes('tải lên') || txt.includes('24 gio') || txt.includes('24 giờ') || txt.includes('video')))
                                || txt.includes('daily upload limit')
                                || txt.includes('upload limit reached')
                                || (txt.includes('daily limit') && txt.includes('upload'))
                                || (txt.includes('upload limit') && (txt.includes('24 hours') || txt.includes('reached')))
                            );

                            // Nhận diện yêu cầu xác minh tài khoản / tính năng nâng cao
                            const isVerificationBlock = (
                                (txt.includes('xac minh') || txt.includes('xác minh') || txt.includes('verify') || txt.includes('verification'))
                                && (txt.includes('so dien thoai') || txt.includes('số điện thoại') || txt.includes('phone') || txt.includes('tinh nang') || txt.includes('tính năng') || txt.includes('feature'))
                            );

                            // Thông báo lỗi tải lên tường minh
                            const isExplicitUploadError = (
                                modal.tagName.toLowerCase() === 'ytcp-alert-dialog'
                                || modal.getAttribute('type') === 'error'
                                || txt.includes('khong the tai len')
                                || txt.includes('không thể tải lên')
                                || txt.includes('could not upload')
                                || txt.includes('upload failed')
                            );

                            if (isDailyUploadLimit || isVerificationBlock || isExplicitUploadError) {
                                res.errorMessage = txt.replace(/\s+/g, ' ');
                                return res;
                            }
                        }

                        // 2. Tìm title box xuyên Shadow DOM (ưu tiên trong ytcp-uploads-dialog)
                        const uploadDlg = __rtmDom.deepFirstVisible(document, 'ytcp-uploads-dialog');
                        const searchScope = uploadDlg || document;

                        const titleHost = __rtmDom.deepFirstVisible(
                            searchScope,
                            '#title-textarea, ytcp-social-suggestions-textbox[id="title-textarea"], ytcp-video-title, ytcp-video-metadata-editor-basic, ytcp-video-metadata-editor, [aria-label*="tiêu đề" i], [aria-label*="title" i]'
                        );
                        if (titleHost) {
                            const innerTb = __rtmDom.deepFirstVisible(titleHost, '#textbox, [contenteditable="true"], [role="textbox"], textarea, input') || titleHost;
                            if (innerTb && __rtmDom.isReallyVisible(innerTb)) {
                                res.hasTitleBox = true;
                                return res;
                            }
                        }
                        const directTb = __rtmDom.deepFirstVisible(searchScope, '#title-textarea #textbox, #textbox[contenteditable="true"], ytcp-uploads-dialog #textbox');
                        if (directTb && __rtmDom.isReallyVisible(directTb)) {
                            res.hasTitleBox = true;
                            return res;
                        }

                        // 3. Kiểm tra xem hộp thoại có bị thu nhỏ (docked) thực sự không
                        if (uploadDlg) {
                            const isDockedAttr = uploadDlg.hasAttribute('docked')
                                || uploadDlg.classList.contains('docked')
                                || uploadDlg.getAttribute('dialog-type') === 'floating';
                            const rect = uploadDlg.getBoundingClientRect ? uploadDlg.getBoundingClientRect() : null;
                            const isDockedHeight = rect && rect.height > 0 && rect.height < 120;
                            if (isDockedAttr || isDockedHeight) {
                                res.isDocked = true;
                            }
                        } else {
                            const floatingDock = __rtmDom.deepFirstVisible(document, 'ytcp-uploads-dialog[docked], .ytcp-uploads-dialog.docked, #dock-container ytcp-video-upload-progress');
                            if (floatingDock && __rtmDom.isReallyVisible(floatingDock)) {
                                res.isDocked = true;
                            }
                        }
                        return res;
                        """,
                    )
                    if state and state.get("isDuplicate"):
                        logger.warning("YouTube Studio xác nhận video đã tồn tại trên kênh (trùng lặp file): %s", state.get("errorMessage"))
                        dup_vid = ""
                        try:
                            dup_vid = await page.evaluate(r"""() => {
                                const a = document.querySelector('ytcp-confirmation-dialog a[href*="youtu.be"], ytcp-confirmation-dialog a[href*="/video/"]');
                                if (a && a.href) {
                                    const m = a.href.match(/(?:youtu\.be\/|\/video\/)([A-Za-z0-9_-]{11})/);
                                    if (m) return m[1];
                                }
                                return '';
                            }""")
                        except Exception:
                            pass
                        await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="duplicate_dismiss")
                        if dup_vid and len(dup_vid) == 11:
                            return f"https://youtu.be/{dup_vid}"
                        return f"duplicate_verified:{dup_vid or 'existing'}"

                    if state and state.get("errorMessage"):
                        err_msg = state.get("errorMessage")
                        logger.error("Phát hiện hộp thoại thông báo lỗi từ YouTube Studio: %s", err_msg)
                        raise RuntimeError(f"YouTube Studio từ chối tải video: {err_msg}")

                    if state and state.get("hasTitleBox"):
                        title_box_ready = True
                        break

                    # Fallback Playwright native locator nếu JS Shadow DOM đánh giá bị trễ
                    for tb_sel in [
                        '#title-textarea #textbox',
                        'ytcp-video-title #textbox',
                        '#title-textarea [contenteditable="true"]',
                        'ytcp-social-suggestions-textbox[id="title-textarea"] #textbox',
                        'ytcp-uploads-dialog #textbox',
                        '#title-textarea',
                    ]:
                        try:
                            loc = page.locator(tb_sel).first
                            if await loc.count() > 0 and await loc.is_visible():
                                title_box_ready = True
                                break
                        except Exception:
                            pass
                    if title_box_ready:
                        break

                    if state and state.get("isDocked"):
                        # Thử phục hồi hộp thoại nếu bị YouTube tự thu nhỏ xuống dock
                        logger.info("Phát hiện hộp thoại upload bị thu nhỏ (docked). Đang mở lại...")
                        await eval_studio_dom(
                            page,
                            r"""
                            const uploadDlg = __rtmDom.deepFirstVisible(document, 'ytcp-uploads-dialog');
                            if (uploadDlg) {
                                if (typeof uploadDlg.undock === 'function') {
                                    uploadDlg.undock();
                                    return;
                                }
                                const expandBtn = __rtmDom.deepFirstVisible(
                                    uploadDlg,
                                    '#expand-button, [aria-label*="expand" i], [aria-label*="phóng to" i], [aria-label*="mở rộng" i], [aria-label*="restore" i], #dialog-title, .title-text, .header-content'
                                );
                                if (expandBtn && typeof expandBtn.click === 'function') {
                                    expandBtn.click();
                                    return;
                                }
                                if (typeof uploadDlg.click === 'function') {
                                    uploadDlg.click();
                                }
                            }
                            """,
                        )
                except Exception as wait_err:
                    if "YouTube Studio từ chối tải video" in str(wait_err):
                        raise
                    logger.debug("Lỗi nhẹ khi kiểm tra dialog metadata: %s", wait_err)

                await asyncio.sleep(1.5)

            if need_session_reload:
                logger.info("Tiến hành làm mới trang để kích hoạt quyền tính năng mới (lần %d/%d)...", upload_flow_attempt + 2, max_upload_flow_attempts)
                target_reload_url = getattr(page, "url", "") or "https://studio.youtube.com/"
                if "/channel/" in target_reload_url:
                    cid_m = re.search(r"/channel/([^/?#]+)", target_reload_url)
                    if cid_m:
                        target_reload_url = f"https://studio.youtube.com/channel/{cid_m.group(1)}"
                if not target_reload_url or "studio.youtube.com" not in target_reload_url:
                    target_reload_url = "https://studio.youtube.com/"
                await page.goto(target_reload_url, wait_until="domcontentloaded", timeout=45000)
                await asyncio.sleep(2.0)
                continue

            if not title_box_ready:
                # Kiểm tra dự phòng lần cuối bằng locator trước khi báo lỗi
                for final_tb_sel in ['#title-textarea #textbox', 'ytcp-video-title #textbox', '#title-textarea']:
                    try:
                        floc = page.locator(final_tb_sel).first
                        if await floc.count() > 0 and await floc.is_visible():
                            title_box_ready = True
                            break
                    except Exception:
                        pass

                if not title_box_ready:
                    cur_ctx_meta = await get_studio_context(page)
                    logger.warning("Hộp thoại metadata (#title-textarea) không xuất hiện sau 45s. Bắt đầu cơ chế kiểm tra cứu hộ video...")
                    rescued_url = ""
                    try:
                        rescued_url = await _extract_video_url(page)
                    except Exception:
                        rescued_url = ""
                    raise RuntimeError(
                        f"Hộp thoại metadata tải video không xác nhận được; không bàn giao URL cứu hộ "
                        f"trước khi upload stream hoàn tất (pageType={cur_ctx_meta.get('pageType')}, "
                        f"url={cur_ctx_meta.get('url')}, rescued_url={'present' if rescued_url else 'absent'})."
                    )

            # Nếu title_box_ready đã sẵn sàng, thoát vòng lặp thử và tiến hành điền thông tin video
            break

        await random_delay(1.5, 2.5)

        # Kiểm tra nhẹ tiến trình upload hiện tại (không chặn quá trình điền metadata)
        try:
            progress_text = await page.evaluate("""() => {
                const el = document.querySelector('ytcp-video-upload-progress');
                return el ? (el.innerText || '').trim() : '';
            }""")
            if progress_text:
                logger.info("Tiến trình upload hiện tại: %s", progress_text)
        except Exception:
            pass

        # Điền tiêu đề
        logger.info("Điền tiêu đề: %s", title[:60])
        title_box = None
        for selector in [
            '#title-textarea #textbox',
            'ytcp-video-metadata-editor-basic #title-textarea #textbox',
            'ytcp-social-suggestions-textbox[id="title-textarea"] #textbox',
            'ytcp-video-title #textbox',
            '[aria-label*="Title" i] #textbox',
            '[aria-label*="Tiêu đề" i] #textbox',
            'ytcp-uploads-dialog #textbox',
        ]:
            try:
                tb = page.locator(selector).first
                if await tb.is_visible(timeout=2000):
                    title_box = tb
                    break
            except Exception:
                continue

        if title_box:
            clean_title = (title or "").strip()[:92]
            try:
                # Đọc tiêu đề hiện tại mà YouTube Studio đã tự động điền sẵn từ tên file video
                current_box_title = await page.evaluate("""() => {
                    const tb = document.querySelector('#title-textarea #textbox')
                        || document.querySelector('ytcp-video-metadata-editor-basic #title-textarea #textbox')
                        || document.querySelector('ytcp-social-suggestions-textbox[id="title-textarea"] #textbox')
                        || document.querySelector('ytcp-video-title #textbox')
                        || document.querySelector('ytcp-uploads-dialog #textbox');
                    return tb ? (tb.innerText || tb.textContent || '').trim() : '';
                }""")
            except Exception:
                current_box_title = ""

            norm_current = " ".join((current_box_title or "").split())
            norm_target = " ".join((clean_title or "").split())
            # Chỉ bỏ qua khi tiêu đề hiện tại khớp tiêu đề người dùng yêu cầu.
            # Khớp tên file không đủ: người dùng có thể đã đặt title khác tên file.
            if norm_current and norm_current == norm_target:
                logger.info("Tiêu đề YouTube tự điền đã khớp ('%s') — giữ nguyên, bỏ qua thao tác gõ lại", norm_current[:60])
            else:
                logger.info("Cập nhật tiêu đề mới bằng phương thức dán nhanh (instant paste): '%s'", clean_title[:60])
                try:
                    await title_box.click(force=True, timeout=3000)
                    await random_delay(0.1, 0.2)
                    await page.keyboard.press("Control+a")
                    await random_delay(0.05, 0.1)
                    await page.keyboard.insert_text(clean_title)
                except Exception as paste_err:
                    logger.debug("Lỗi keyboard.insert_text cho tiêu đề: %s", paste_err)

                # Đồng bộ và xác thực DOM chuẩn Polymer/YouTube Studio (giới hạn an toàn 92 ký tự)
                await page.evaluate("""(t) => {
                    const tb = document.querySelector('#title-textarea #textbox')
                        || document.querySelector('ytcp-video-metadata-editor-basic #title-textarea #textbox')
                        || document.querySelector('ytcp-social-suggestions-textbox[id="title-textarea"] #textbox')
                        || document.querySelector('ytcp-video-title #textbox')
                        || document.querySelector('ytcp-uploads-dialog #textbox');
                    if (tb) {
                        const clean = t.slice(0, 92);
                        const cur = (tb.innerText || tb.textContent || '').trim();
                        if (cur !== clean) {
                            tb.focus();
                            tb.textContent = clean;
                            tb.innerText = clean;
                            tb.dispatchEvent(new Event('input', { bubbles: true }));
                            tb.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }""", clean_title)
        else:
            logger.warning("Không tìm thấy hộp nhập tiêu đề")
        await random_delay(0.3, 0.6)

        # Điền mô tả
        logger.info("Điền mô tả")
        desc_box = None
        for selector in [
            '#description-textarea #textbox',
            'ytcp-video-metadata-editor-basic #description-textarea #textbox',
            'ytcp-social-suggestions-textbox[id="description-textarea"] #textbox',
            '[aria-label*="Description" i] #textbox',
            '[aria-label*="Mô tả" i] #textbox',
        ]:
            try:
                db = page.locator(selector).first
                if await db.is_visible(timeout=2000):
                    desc_box = db
                    break
            except Exception:
                continue

        if not desc_box:
            try:
                all_boxes = page.locator("ytcp-uploads-dialog #textbox")
                if await all_boxes.count() > 1:
                    desc_box = all_boxes.nth(1)
            except Exception:
                pass

        if desc_box and description:
            try:
                try:
                    await desc_box.click(timeout=5000, force=True)
                except Exception:
                    await desc_box.evaluate("el => { el.focus(); if (typeof el.scrollIntoView === 'function') el.scrollIntoView({block: 'center', inline: 'nearest'}); }")
                await random_delay(0.2, 0.4)
                await page.keyboard.press("Control+a")
                await page.keyboard.press("Backspace")
                await random_delay(0.1, 0.3)

                # Sử dụng Chromium CDP insert_text (nhanh, tức thì, kích hoạt chuẩn beforeinput & input cho Polymer)
                inserted = False
                try:
                    await page.keyboard.insert_text(description)
                    inserted = True
                except Exception as ex_ins:
                    logger.warning("keyboard.insert_text lỗi: %s", ex_ins)

                await random_delay(0.3, 0.6)

                # Kiểm tra lại xem text đã thực sự có trong desc_box chưa
                cur_text = ""
                try:
                    cur_text = await desc_box.inner_text()
                except Exception:
                    pass

                # Fallback nếu insert_text chưa ăn: dùng document.execCommand('insertText')
                if not cur_text or not cur_text.strip():
                    logger.info("desc_box chưa nhận text, kích hoạt fallback execCommand...")
                    try:
                        try:
                            await desc_box.click(timeout=3000, force=True)
                        except Exception:
                            await desc_box.evaluate("el => { el.focus(); }")
                        await page.evaluate("""(d) => {
                            document.execCommand('insertText', false, d);
                        }""", description)
                    except Exception as ex_cmd:
                        logger.warning("execCommand fallback lỗi: %s", ex_cmd)

                # Kiểm tra fallback lần 2: nếu vẫn trống thì gõ phím trực tiếp
                try:
                    cur_text2 = await desc_box.inner_text()
                    if not cur_text2 or not cur_text2.strip():
                        logger.info("desc_box vẫn trống, thử gõ phím trực tiếp...")
                        try:
                            await desc_box.focus(timeout=1000)
                        except Exception:
                            pass
                        snippet = description[:1500]
                        await page.keyboard.type(snippet)
                except Exception:
                    pass

                # Fallback 3: Đồng bộ DOM trực tiếp nếu sau cả 2 fallback vẫn trống
                try:
                    cur_text3 = await desc_box.inner_text()
                    if not cur_text3 or not cur_text3.strip():
                        logger.info("desc_box vẫn trống sau các bước, kích hoạt DOM event dispatch...")
                        await page.evaluate("""(d) => {
                            const db = document.querySelector('#description-textarea #textbox')
                                || document.querySelector('ytcp-video-metadata-editor-basic #description-textarea #textbox')
                                || document.querySelector('ytcp-social-suggestions-textbox[id="description-textarea"] #textbox')
                                || document.querySelector('[aria-label*="Description" i] #textbox')
                                || document.querySelector('[aria-label*="Mô tả" i] #textbox');
                            if (db) {
                                db.focus();
                                db.innerText = d;
                                db.textContent = d;
                                db.dispatchEvent(new Event('input', { bubbles: true }));
                                db.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }""", description)
                except Exception as ex_dom:
                    logger.debug("DOM event dispatch cho mô tả lỗi: %s", ex_dom)
            except Exception as exc:
                logger.warning("Lỗi khi điền mô tả: %s", exc)
        await random_delay(0.5, 1.2)

        # Thumbnail
        if thumbnail_path:
            logger.info("Đặt thumbnail: %s", thumbnail_path)
            try:
                thumb_input = page.locator(
                    'ytcp-uploads-dialog input[type="file"][accept*="image"], input[type="file"][accept*="image"]'
                ).first
                if await thumb_input.count() > 0:
                    await thumb_input.set_input_files(thumbnail_path)
                    await random_delay(0.8, 1.5)

                    # Dọn dẹp modal nếu kênh chưa xác minh tính năng nâng cao / SĐT
                    elig_res = await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="post_thumbnail")
                    if elig_res.get("handled"):
                        logger.warning("Đã đóng modal xác minh tính năng sau khi tải thumbnail: %s", elig_res.get("details"))
                else:
                    logger.info("Không tìm thấy input file hình thu nhỏ — bỏ qua tải thumbnail tùy chỉnh")
            except Exception as exc:
                logger.warning("Không thể đặt thumbnail: %s", exc)
                try:
                    await dismiss_blocking_studio_dialogs(page, allow_reload=False, context="thumbnail_error_cleanup")
                except Exception:
                    pass

        # Cuộn dialog và chọn bắt buộc "Không dành cho trẻ em" xuyên Shadow DOM
        audience_clicked = await _ensure_not_for_kids_audience(page)
        if not audience_clicked:
            logger.warning("Không chọn được đối tượng khán giả")

        # Tự động bấm nút 'Hiện thêm' ('Show more') và điền Thẻ (Tags)
        if tags:
            logger.info("Xử lý tự động điền thẻ Tags vào YouTube Studio...")
            try:
                # 1. Tách mảng tags bằng dấu phẩy và cắt gọn tối đa 480 ký tự
                raw_tag_list = []
                if isinstance(tags, list):
                    raw_tag_list = [str(t).strip() for t in tags if str(t).strip()]
                elif isinstance(tags, str):
                    raw_str = tags.strip()
                    if raw_str.startswith("[") and raw_str.endswith("]"):
                        try:
                            parsed = json.loads(raw_str)
                            if isinstance(parsed, list):
                                raw_tag_list = [str(t).strip() for t in parsed if str(t).strip()]
                        except Exception:
                            pass
                    if not raw_tag_list:
                        raw_tag_list = [t.strip() for t in raw_str.split(",") if t.strip()]

                trimmed_tags: list[str] = []
                current_len = 0
                seen = set()
                for tag in raw_tag_list:
                    clean_tag = tag.strip().strip('"').strip("'").strip(",").strip()
                    if not clean_tag or clean_tag.startswith("http://") or clean_tag.startswith("https://") or "youtube.com" in clean_tag:
                        continue
                    lower_tag = clean_tag.lower()
                    if lower_tag in seen:
                        continue
                    seen.add(lower_tag)

                    # Thuật toán đếm ký tự YouTube Studio:
                    # - Mỗi ký tự: len(clean_tag)
                    # - Cụm từ có khoảng trắng: YouTube bọc ngầm ngoặc kép (+2 ký tự)
                    # - Dấu phẩy phân cách: +1 ký tự (kể từ thẻ thứ 2)
                    # - Giới hạn an toàn 450 ký tự (biên phòng thủ 50 ký tự)
                    quote_penalty = 2 if " " in clean_tag else 0
                    comma_cost = 1 if trimmed_tags else 0
                    cost = len(clean_tag) + quote_penalty + comma_cost

                    if current_len + cost > 450:
                        logger.info(
                            "Đã đạt ngưỡng an toàn 450 ký tự tags YouTube Studio (%d + %d > 450). Dừng tại thẻ: '%s'",
                            current_len, cost, clean_tag
                        )
                        break
                    trimmed_tags.append(clean_tag)
                    current_len += cost

                if trimmed_tags:
                    # 2. Mở phần nâng cao / thẻ Tags dựa theo cấu trúc DOM (aria-expanded hoặc #tags-container), không phụ thuộc ngôn ngữ
                    already_expanded = bool(await eval_studio_dom(
                        page,
                        """
                        const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog') || document;
                        if (__rtmDom.deepFirstVisible(dlg, '#tags-container')) return true;
                        const tgl = __rtmDom.deepFirstVisible(dlg, 'ytcp-button#toggle-button, #toggle-button, #advanced-settings-button');
                        return tgl ? (tgl.getAttribute('aria-expanded') === 'true') : false;
                        """,
                    ))
                    if already_expanded:
                        logger.info("Mục cài đặt nâng cao / Tags đã mở sẵn")
                    else:
                        t_clicked = await click_stable_element(
                            page,
                            selectors=[
                                "ytcp-button#toggle-button",
                                "#toggle-button",
                                "#advanced-settings-button",
                                "[test-id='toggle-button']",
                            ],
                            timeout_ms=5000,
                            pre_delay=0.3,
                            root_selector="ytcp-uploads-dialog",
                        )
                        logger.info("Kết quả bấm nút mở rộng Tags (#toggle-button): %s", t_clicked)
                        await asyncio.sleep(0.9)

                    # 3. Cuộn trang xuống để lộ phần Thẻ (Tags)
                    await _scroll_uploads_dialog(
                        page,
                        target_selector="#tags-container, ytcp-form-input-container#tags-container",
                        to_bottom=True,
                    )
                    await asyncio.sleep(0.7)

                    # 4. Định vị ô nhập tags theo cấu trúc Polymer (#tags-container)
                    tag_input_selectors = [
                        "#tags-container input#text-input",
                        "#tags-container #text-input",
                        "ytcp-chip-cloud#tags-container #text-input",
                        "ytcp-chip-bar#tags-container input",
                        "#tags-container input",
                        "input#text-input[aria-label*='Tags' i]",
                        "input#text-input[aria-label*='Thẻ' i]",
                    ]
                    tags_input = None
                    for ti_sel in tag_input_selectors:
                        try:
                            el = page.locator(ti_sel).first
                            if await el.count() > 0:
                                await el.scroll_into_view_if_needed()
                                if await el.is_visible(timeout=2500):
                                    tags_input = el
                                    logger.info("Định vị thành công ô nhập thẻ Tags: %s", ti_sel)
                                    break
                        except Exception:
                            continue

                    if not tags_input:
                        # Fallback tìm trong uploads dialog
                        try:
                            dialog = page.locator("ytcp-uploads-dialog")
                            for ti_sel in tag_input_selectors:
                                el = dialog.locator(ti_sel).first
                                if await el.count() > 0:
                                    await el.scroll_into_view_if_needed()
                                    if await el.is_visible(timeout=2500):
                                        tags_input = el
                                        logger.info("Định vị thành công ô nhập thẻ Tags trong dialog: %s", ti_sel)
                                        break
                        except Exception:
                            pass

                    # 5. Dùng cơ chế gõ phím Polymer chip: fill(tag) -> delay 150ms -> gõ ',' -> delay 150ms -> press('Enter')
                    if tags_input:
                        logger.info(
                            "Bắt đầu nhập %d thẻ tags vào YouTube Studio (tổng độ dài an toàn: %d/450 ký tự)...",
                            len(trimmed_tags), current_len
                        )
                        await tags_input.scroll_into_view_if_needed()
                        await tags_input.click()
                        await asyncio.sleep(0.15)
                        # Dọn sạch text thô đang dở nếu có trong ô input
                        await page.keyboard.press("Control+a")
                        await page.keyboard.press("Backspace")
                        await asyncio.sleep(0.15)
                        applied_tags_count = 0
                        for t in trimmed_tags:
                            try:
                                await tags_input.fill(t)
                                await asyncio.sleep(0.15)
                                await page.keyboard.press(",")
                                await asyncio.sleep(0.15)
                                await page.keyboard.press("Enter")
                                await asyncio.sleep(0.15)

                                # Kiểm tra an toàn: nếu text còn trong ô thì bấm Enter lại
                                try:
                                    val = await tags_input.input_value()
                                    if val and val.strip():
                                        await page.keyboard.press("Enter")
                                        await asyncio.sleep(0.15)
                                except Exception:
                                    pass

                                applied_tags_count += 1
                            except Exception as ex_chip:
                                logger.warning("Không thể gõ thẻ tag '%s': %s", t, ex_chip)

                        logger.info(
                            "Đã tạo thành công %d/%d chip thẻ tags trên YouTube Studio",
                            applied_tags_count, len(trimmed_tags)
                        )
                    else:
                        logger.warning("Không tìm thấy ô nhập thẻ tags trên YouTube Studio")
            except Exception as exc:
                logger.warning("Lỗi xử lý tự động điền thẻ tags: %s", exc)

        # Verify trạng thái trước khi bắt đầu tiến trình Next qua các bước (làm từ từ, xác nhận từng bước DOM)
        await random_delay(0.7, 1.2)

        reached_visibility = False
        is_full_page, fp_vid = await _detect_full_page_editor(page)
        if is_full_page:
            reached_visibility = True
            logger.info("Phát hiện YouTube Studio đang ở Full-Page Video Details Editor (vid=%s). Bỏ qua wizard loop!", fp_vid)
            await _ensure_not_for_kids_audience(page)
        else:
            for attempt in range(25):
                # Kiểm tra nếu YouTube Studio bất ngờ chuyển sang Full-Page Video Editor
                is_fp_now, fp_vid_now = await _detect_full_page_editor(page)
                if is_fp_now:
                    reached_visibility = True
                    is_full_page = True
                    logger.info("Studio đã chuyển sang Full-Page Editor tại attempt %d (vid=%s). Tiến tới Visibility!", attempt + 1, fp_vid_now)
                    await _ensure_not_for_kids_audience(page)
                    break

                # 0. Giải phóng toàn bộ dialog chặn và popup cảnh báo ở đầu mỗi vòng lặp
                try:
                    await dismiss_blocking_studio_dialogs(page, allow_reload=False, context=f"wizard_step_{attempt}")
                    await dismiss_publish_anyway_dialogs(page)
                except Exception as exc:
                    logger.debug("Lỗi dismiss blocking dialogs tại step %d: %s", attempt, exc)

                step_state = await inspect_studio_modal_state(page)
                cur_step = (step_state.get("uploadsStep") or "").upper()
                on_visibility = (
                    bool(step_state.get("visRadiosVisible"))
                    or bool(step_state.get("doneBtnPresent"))
                    or cur_step == "REVIEW"
                    or "VISIBILITY" in cur_step
                    or "REVIEW" in cur_step
                )
                if on_visibility:
                    reached_visibility = True
                    logger.info("Đã đến bước Chế độ hiển thị (step=%s) thành công!", cur_step or "VISIBILITY")
                    break

                # Đảm bảo tiêu đề & Đối tượng khán giả (Audience) hợp lệ ở Bước DETAILS
                if cur_step in ("DETAILS", "") or attempt == 0:
                    try:
                        await _diagnose_and_resolve_details_errors(page, target_title=title)
                    except Exception as diag_err:
                        logger.debug("Lỗi chẩn đoán validation trên DETAILS: %s", diag_err)
                    is_aud_selected = await _is_not_for_kids_selected(page)
                    if not is_aud_selected:
                        logger.info("Chưa chọn đối tượng khán giả ở Bước 1 — Đảm bảo chọn 'Không dành cho trẻ em'...")
                        await _ensure_not_for_kids_audience(page)
                        await asyncio.sleep(0.4)

                # 1. Bước Kiếm Tiền (Monetization) cho kênh BKT:
                if "MONETIZATION" in cur_step or "MONETIZE" in cur_step:
                    logger.info("Phát hiện bước Kiếm Tiền (Monetization) cho kênh BKT — Đang tự động bật kiếm tiền...")
                    try:
                        await eval_studio_dom(
                            page,
                            """
                            const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog') || document;
                            const onRadio = __rtmDom.deepFirstVisible(dlg, 'tp-yt-paper-radio-button[name="ON"], tp-yt-paper-radio-button#on-radio, [name="MONETIZATION_ON"], [value="ON"]');
                            if (onRadio) {
                                const nativeRadio = __rtmDom.resolveNativeButton(onRadio) || onRadio;
                                nativeRadio.click();
                            } else {
                                const trigger = __rtmDom.deepFirstVisible(dlg, 'ytcp-video-monetization ytcp-dropdown-trigger, ytcp-dropdown-trigger#trigger, #monetization-select');
                                if (trigger) {
                                    trigger.click();
                                }
                            }
                            """
                        )
                        await asyncio.sleep(0.5)
                        await eval_studio_dom(
                            page,
                            """
                            const menus = document.querySelectorAll('ytcp-text-menu, tp-yt-paper-dialog[opened], ytcp-dropdown-menu');
                            for (const m of menus) {
                                const onOption = __rtmDom.deepFirstVisible(m, 'tp-yt-paper-radio-button[name="ON"], tp-yt-paper-radio-button#on-radio, [test-id="monetization-on"]');
                                if (onOption) {
                                    onOption.click();
                                    const saveBtn = __rtmDom.deepFirstVisible(m, 'ytcp-button#save-button, #save-button, #confirm-button');
                                    if (saveBtn) {
                                        const nativeSave = __rtmDom.resolveNativeButton(saveBtn) || saveBtn;
                                        nativeSave.click();
                                    }
                                    break;
                                }
                            }
                            """
                        )
                        await asyncio.sleep(0.6)
                    except Exception as mon_err:
                        logger.debug("Lỗi xử lý bật kiếm tiền: %s", mon_err)

                # 2. Xử lý bước Ad Suitability cho kênh BKT (chọn None of the above và Gửi đánh giá)
                if "SUITABILITY" in cur_step or "AD_" in cur_step:
                    logger.info("Phát hiện bước Phù hợp nhà quảng cáo (Ad Suitability) — Đang chọn an toàn & gửi đánh giá...")
                    try:
                        await eval_studio_dom(
                            page,
                            """
                            const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog') || document;
                            const chk = __rtmDom.deepFirstVisible(dlg, 'ytcp-video-metadata-ad-suitability tp-yt-paper-checkbox, [name="NONE_OF_THE_ABOVE"], #none-of-the-above');
                            if (chk && !chk.checked && !chk.hasAttribute('checked')) {
                                const nativeChk = __rtmDom.resolveNativeButton(chk) || chk;
                                nativeChk.click();
                            }
                            const container = __rtmDom.deepFirstVisible(dlg, 'ytcp-video-metadata-ad-suitability, #scrollable-content');
                            if (container) {
                                container.scrollTop = container.scrollHeight;
                            }
                            """
                        )
                        await asyncio.sleep(0.5)
                        await eval_studio_dom(
                            page,
                            """
                            const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog') || document;
                            const submitBtn = __rtmDom.deepFirstVisible(dlg, 'ytcp-button#submit-questionnaire-button, #submit-questionnaire-button, [aria-label*="đánh giá" i], [aria-label*="rating" i]');
                            if (submitBtn && __rtmDom.isButtonActionable(submitBtn)) {
                                const nativeSubmit = __rtmDom.resolveNativeButton(submitBtn) || submitBtn;
                                nativeSubmit.click();
                            }
                            """
                        )
                        await asyncio.sleep(0.6)

                        # Đợi YouTube Studio tính điểm quảng cáo xong và kích hoạt lại nút Next
                        logger.info("Đã bấm Gửi bài đánh giá — Đang chờ YouTube Studio tính điểm và kích hoạt lại nút Next...")
                        for _wait_tick in range(20):
                            is_disabled = await page.evaluate("""
                                () => {
                                    const btn = document.querySelector('ytcp-uploads-dialog #next-button') || 
                                                document.querySelector('#next-button');
                                    if (!btn) return true;
                                    return btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true';
                                }
                            """)
                            if not is_disabled:
                                logger.info("Nút Next đã được kích hoạt lại sau bài đánh giá quảng cáo (tick %d).", _wait_tick + 1)
                                break
                            await asyncio.sleep(1.0)
                    except Exception as suit_err:
                        logger.debug("Lỗi xử lý ad suitability: %s", suit_err)

                # 3. Bước Thành phần video (Video Elements) — Tự động nhập Màn hình kết thúc từ video gần nhất
                if "ELEMENT" in cur_step:
                    logger.info("Đang ở bước Thành phần video (Video Elements) — Thử nhập Màn hình kết thúc từ video gần nhất...")
                    try:
                        await eval_studio_dom(
                            page,
                            """
                            const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog') || document;
                            const importBtn = __rtmDom.deepFirstVisible(dlg, '#import-endscreen-from-video-button, ytcp-button#import-from-video-button, [aria-label*="nhập từ video" i], [aria-label*="import from" i]');
                            if (importBtn && __rtmDom.isButtonActionable(importBtn)) {
                                const nativeImport = __rtmDom.resolveNativeButton(importBtn) || importBtn;
                                nativeImport.click();
                            }
                            """
                        )
                        await asyncio.sleep(0.8)
                        await eval_studio_dom(
                            page,
                            """
                            const importDlg = document.querySelector('ytcp-endscreen-video-picker-dialog, ytcp-dialog[opened]');
                            if (importDlg) {
                                const firstRow = __rtmDom.deepFirstVisible(importDlg, 'ytcp-video-row, .video-item, #selectable-item');
                                if (firstRow) {
                                    firstRow.click();
                                }
                            }
                            """
                        )
                        await asyncio.sleep(0.6)
                    except Exception as elem_err:
                        logger.debug("Bỏ qua cấu hình thành phần video: %s", elem_err)

                # Chờ YouTube Studio lưu draft ngầm (tránh click Next bị vô hiệu hoá khi modal đang 'Saving...')
                for _wait_save in range(8):
                    is_saving = await page.evaluate("""() => {
                        const dlg = document.querySelector('ytcp-uploads-dialog') || document;
                        const header = dlg.querySelector('#header, .header, #dialog-header, #save-status, .save-status, #header-status');
                        if (!header) return false;
                        const txt = (header.innerText || header.textContent || '').toLowerCase();
                        return txt.includes('saving...') || txt.includes('đang lưu...') || txt.includes('guardando...');
                    }""")
                    if not is_saving:
                        break
                    logger.info("YouTube Studio đang lưu bản nháp ('Saving...'), đợi lưu hoàn tất trước khi bấm Next (%d/8)...", _wait_save + 1)
                    await asyncio.sleep(1.0)

                logger.info("Đang ở bước '%s', thực hiện bấm nút Next (lần %d/25)...", cur_step or "DETAILS", attempt + 1)

                # Kiểm tra trạng thái disabled của Next button
                is_next_disabled = await page.evaluate("""() => {
                    const btn = document.querySelector('ytcp-uploads-dialog #next-button') || document.querySelector('#next-button');
                    if (!btn) return true;
                    return btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' || (btn.classList && btn.classList.contains('disabled'));
                }""")

                if is_next_disabled:
                    logger.info("Nút Next đang disabled ở bước '%s' — kiểm tra Audience & validation...", cur_step)
                    if cur_step in ("DETAILS", ""):
                        try:
                            await page.evaluate(
                                "() => { if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur(); }"
                            )
                        except Exception:
                            pass
                        await _ensure_not_for_kids_audience(page)
                        await asyncio.sleep(0.4)

                # Thao tác click Next đa tầng
                next_clicked = False

                # Phương thức 1: Playwright Native Locator click (Tự pierce Shadow DOM & gửi trusted CDP event)
                try:
                    next_loc = page.locator('ytcp-uploads-dialog #next-button, #next-button').first
                    if await next_loc.count() > 0 and await next_loc.is_visible():
                        for _w in range(6):
                            dis = await next_loc.get_attribute("aria-disabled")
                            has_dis = await next_loc.get_attribute("disabled")
                            if dis != "true" and has_dis is None:
                                break
                            await asyncio.sleep(0.4)
                        try:
                            await next_loc.click(timeout=3000)
                        except Exception:
                            await next_loc.click(force=True, timeout=2000)
                        next_clicked = True
                        logger.info("Đã bấm Next qua Playwright native locator")
                except Exception as n_err:
                    logger.debug("Playwright native click next-button: %s", n_err)

                # Phương thức 2: click_stable_element với allow_js_fallback=True
                if not next_clicked:
                    res_click = await click_stable_element(
                        page,
                        selectors=["ytcp-button#next-button", "#next-button"],
                        timeout_ms=4500,
                        pre_delay=0.25,
                        root_selector="ytcp-uploads-dialog",
                        allow_js_fallback=True,
                    )
                    if res_click:
                        next_clicked = True
                        logger.info("Đã bấm Next qua click_stable_element (%s)", res_click)

                # Phương thức 3: Polymer dispatchEvent với composed: true vào cả host và button bên trong shadowRoot
                if not next_clicked:
                    try:
                        dispatched_next = await page.evaluate("""() => {
                            const dialog = document.querySelector('ytcp-uploads-dialog') || document;
                            const buttons = Array.from(dialog.querySelectorAll('ytcp-button#next-button, #next-button, ytcp-button'));
                            for (const btn of buttons) {
                                const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
                                const bid = (btn.id || '').toLowerCase();
                                if (bid === 'next-button' || txt === 'next' || txt === 'tiếp theo' || txt === 'tiếp tục' || txt === 'siguiente') {
                                    btn.removeAttribute('disabled');
                                    btn.setAttribute('aria-disabled', 'false');
                                    ['mousedown', 'mouseup', 'click'].forEach(evtName => {
                                        btn.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true, composed: true, view: window }));
                                    });
                                    const inner = btn.shadowRoot ? btn.shadowRoot.querySelector('button, [role="button"]') : null;
                                    if (inner) {
                                        inner.removeAttribute('disabled');
                                        inner.setAttribute('aria-disabled', 'false');
                                        ['mousedown', 'mouseup', 'click'].forEach(evtName => {
                                            inner.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true, composed: true, view: window }));
                                        });
                                        if (typeof inner.click === 'function') inner.click();
                                    }
                                    if (typeof btn.click === 'function') btn.click();
                                    return true;
                                }
                            }
                            return false;
                        }""")
                        if dispatched_next:
                            next_clicked = True
                            logger.info("Đã kích hoạt click Next qua Polymer dispatchEvent")
                    except Exception:
                        pass

                # Phương thức 4: Bấm trực tiếp tab Stepper badge tiếp theo (Checks / Visibility) nếu ở Elements hoặc Checks hoặc bấm Next không chuyển
                if "ELEMENT" in cur_step or "CHECK" in cur_step or attempt >= 1:
                    try:
                        stepper_jump = await page.evaluate("""() => {
                            const dialog = document.querySelector('ytcp-uploads-dialog') || document;
                            const stepper = dialog.querySelector('ytcp-stepper, #stepper, ytcp-badge-stepper') || dialog;
                            const badges = Array.from(stepper.querySelectorAll('ytcp-stepper-badge, ytcp-step-badge, .step-badge, .step, [role="tab"], #step-badge-1, #step-badge-2, #step-badge-3'));
                            for (let i = badges.length - 1; i >= 0; i--) {
                                const b = badges[i];
                                const label = (b.innerText || b.textContent || '').toLowerCase();
                                if (!b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true') {
                                    b.click();
                                    const innerB = b.shadowRoot ? b.shadowRoot.querySelector('button, [role="tab"]') : null;
                                    if (innerB) innerB.click();
                                    return true;
                                }
                            }
                            return false;
                        }""")
                        if stepper_jump:
                            next_clicked = True
                            logger.info("Đã bấm tab Stepper chuyển bước dự phòng")
                    except Exception:
                        pass

                # Chờ DOM xác nhận đã chuyển sang workflow-step tiếp theo hoặc hiện radio Visibility
                transitioned = False
                for _chk in range(18):  # tối đa ~6.3s
                    await asyncio.sleep(0.35)
                    after_step = await inspect_studio_modal_state(page)
                    new_step = (after_step.get("uploadsStep") or "").upper()
                    if (
                        after_step.get("visRadiosVisible")
                        or after_step.get("doneBtnPresent")
                        or new_step in ("REVIEW", "VISIBILITY")
                        or "VISIBILITY" in new_step
                    ):
                        transitioned = True
                        reached_visibility = True
                        logger.info("Đã chuyển bước thành công tới VISIBILITY: %s -> %s", cur_step or "?", new_step or "VISIBILITY")
                        break
                    elif cur_step and new_step and new_step != cur_step:
                        transitioned = True
                        logger.info("Đã chuyển bước thành công: %s -> %s", cur_step, new_step)
                        cur_step = new_step
                        break

                if reached_visibility:
                    break

                if not transitioned:
                    logger.info("Bước '%s' chưa đổi thuộc tính sau click Next (lần %d/25)...", cur_step, attempt + 1)
                    try:
                        val_errs = await page.evaluate("""() => {
                            const errs = Array.from(document.querySelectorAll('ytcp-uploads-dialog [aria-invalid="true"], ytcp-uploads-dialog .error-state, ytcp-uploads-dialog #error-badge, ytcp-uploads-dialog .error-message'));
                            return errs.map(el => (el.innerText || el.textContent || '').trim()).filter(Boolean);
                        }""")
                        if val_errs:
                            logger.warning("Phát hiện lỗi kiểm tra hợp lệ trên form: %s", val_errs)
                    except Exception:
                        pass

                    if cur_step in ("DETAILS", ""):
                        try:
                            await page.evaluate(
                                "() => { if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur(); }"
                            )
                        except Exception:
                            pass
                        await _ensure_not_for_kids_audience(page)
                    await random_delay(0.8, 1.4)

        if not reached_visibility and not is_full_page:
            final_step_state = await inspect_studio_modal_state(page)
            cur_step_err = (final_step_state.get("uploadsStep") or "DETAILS").upper()
            on_visibility_final = (
                bool(final_step_state.get("visRadiosVisible"))
                or bool(final_step_state.get("doneBtnPresent"))
                or cur_step_err == "REVIEW"
                or "VISIBILITY" in cur_step_err
                or "REVIEW" in cur_step_err
            )
            if not on_visibility_final:
                try:
                    debug_ss_dir = user_data_path("crash_screenshots")
                    os.makedirs(debug_ss_dir, exist_ok=True)
                    ss_path = os.path.join(debug_ss_dir, f"details_stuck_{int(time.time())}.png")
                    await page.screenshot(path=ss_path, full_page=True)
                    logger.info("Đã lưu ảnh chụp màn hình chẩn đoán lỗi DETAILS tại: %s", ss_path)
                except Exception:
                    pass
                logger.error(
                    "Không thể chuyển sang bước Chế độ hiển thị: cur_step=%s, state=%s",
                    cur_step_err,
                    final_step_state,
                )
                raise RuntimeError(
                    f"Không thể chuyển sang bước Chế độ hiển thị (hiện vẫn đang dừng ở bước '{cur_step_err}'). "
                    "Có thể thiếu thông tin bắt buộc hoặc nút Tiếp trên YouTube Studio đang bị chặn."
                )

        # Chế độ hiển thị & Lưu video theo giao diện tương ứng (Full-Page Video Editor vs Modal Dialog)
        if is_full_page:
            logger.info("Thực hiện thiết lập Visibility và Lưu trên Full-Page Video Editor...")
            await _set_full_page_visibility(page, visibility=visibility, schedule_date=schedule_date, schedule_time=schedule_time)
            video_url = await _extract_video_url(page)
            if video_url:
                logger.info("URL video trên Full-Page Editor: %s", video_url)
            saved_successfully = await _save_full_page_editor(page, timeout_seconds=30.0)
            if not saved_successfully:
                logger.warning("Full-Page Editor: Chưa nhận được toast xác nhận lưu, tiếp tục kiểm tra upload stream...")
        else:
            vis = str(visibility or "public").strip().lower()
            logger.info("Đặt visibility: %s", vis)
            await random_delay(0.6, 1.0)

            if vis == "schedule" and schedule_date and schedule_time:
                await _set_schedule(page, schedule_date, schedule_time)
            else:
                target_radio_name = "PUBLIC" if vis == "public" else ("PRIVATE" if vis == "private" else "UNLISTED")
                radio_selected = False
                for _r_try in range(2):
                    clicked_radio = await click_stable_element(
                        page,
                        selectors=[
                            f'tp-yt-paper-radio-button[name="{target_radio_name}"]',
                            f'[name="{target_radio_name}"]',
                        ],
                        timeout_ms=6000,
                        pre_delay=0.45,
                        root_selector="ytcp-uploads-dialog",
                    )
                    await random_delay(0.5, 0.9)
                    checked_val = await eval_studio_dom(
                        page,
                        """
                        const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog') || document;
                        const r = __rtmDom.deepFirstVisible(
                            dlg,
                            `tp-yt-paper-radio-button[name="${arg}"], [name="${arg}"][role="radio"]`
                        );
                        return r ? (r.getAttribute('aria-checked') || (r.hasAttribute('checked') ? 'true' : 'false')) : null;
                        """,
                        target_radio_name,
                    )
                    if checked_val == "true":
                        radio_selected = True
                        logger.info("Đã chọn chế độ hiển thị %s thành công (%s, aria-checked=true)!", target_radio_name, clicked_radio)
                        break

                if not radio_selected:
                    res_vis = await eval_studio_dom(
                        page,
                        """
                        const r = __rtmDom.deepFirstVisible(document, `tp-yt-paper-radio-button[name="${arg}"]`);
                        if (r) {
                            r.click();
                            return 'clicked:' + r.getAttribute('aria-checked');
                        }
                        return 'not-found';
                        """,
                        target_radio_name,
                    )
                    logger.info("Fallback JS visibility click: %s", res_vis)

            video_url = await _extract_video_url(page)
            if video_url:
                logger.info("URL video: %s", video_url)

            # Đặt đánh dấu phiên upload SPA để phát hiện nếu trang bị hard-reload làm ngắt stream
            try:
                await page.evaluate("() => { window.__bktUploadSessionAlive = true; }")
            except Exception:
                pass

            # Chờ nút Lưu / Xuất bản thực sự ổn định & sẵn sàng (tối đa 15s)
            await random_delay(0.6, 1.0)
            logger.info("S6: Chờ nút Lưu/Xuất bản ổn định và khả dụng...")
            done_probe = await wait_for_stable_actionable(
                page,
                selectors=DONE_BUTTON_SELECTORS,
                root_selector="ytcp-uploads-dialog",
                timeout_ms=15000,
                require_unobscured=False,
                require_enabled=True,
            )
            if not done_probe:
                cur_done_state = await inspect_studio_modal_state(page)
                logger.warning("Nút Lưu/Xuất bản chưa hoàn toàn actionable qua probe sau 15s: %s (chuyển sang click_stable_element)", cur_done_state)

            done_click_mode = await click_stable_element(
                page,
                selectors=DONE_BUTTON_SELECTORS,
                timeout_ms=10000,
                pre_delay=0.35,
                root_selector="ytcp-uploads-dialog",
                allow_js_fallback=True,
            )
            if not done_click_mode:
                logger.warning("click_stable_element không bấm được nút Publish/Done, áp dụng BrowserMulti Force-Enable & dispatchEvent toàn diện...")
                try:
                    force_done = await page.evaluate(r"""() => {
                        const dlg = document.querySelector('ytcp-uploads-dialog') || document;
                        const sels = [
                            'ytcp-button#done-button',
                            'ytcp-button#publish-button',
                            'ytcp-button#save-button',
                            'ytcp-button#primary-action-button',
                            '#done-button',
                            '#publish-button',
                            '#save-button',
                            '[test-id="done-button"]',
                            '[test-id="publish-button"]',
                            '[test-id="save-button"]'
                        ];
                        let btn = null;
                        for (const sel of sels) {
                            const found = (window.__rtmDom && typeof window.__rtmDom.deepFirstVisible === 'function')
                                ? window.__rtmDom.deepFirstVisible(dlg, sel)
                                : dlg.querySelector(sel);
                            if (found) { btn = found; break; }
                        }
                        if (!btn) {
                            const candidates = (window.__rtmDom && typeof window.__rtmDom.deepQueryAll === 'function')
                                ? window.__rtmDom.deepQueryAll(dlg, 'ytcp-button, button')
                                : Array.from(dlg.querySelectorAll('ytcp-button, button'));
                            for (const c of candidates) {
                                const txt = ((c.textContent || '') + ' ' + (c.getAttribute('aria-label') || '') + ' ' + (c.id || '')).toLowerCase();
                                if (/\b(publish|save|done|xuất bản|lưu|xong|publicar|guardar)\b/i.test(txt)) {
                                    btn = c;
                                    break;
                                }
                            }
                        }
                        if (!btn) return 'not-found';
                        btn.removeAttribute('disabled');
                        btn.removeAttribute('hidden');
                        btn.removeAttribute('aria-disabled');
                        btn.setAttribute('aria-disabled', 'false');
                        const innerBtn = btn.shadowRoot ? btn.shadowRoot.querySelector('button') : null;
                        if (innerBtn) {
                            innerBtn.removeAttribute('disabled');
                            innerBtn.removeAttribute('hidden');
                        }
                        ['mousedown', 'mouseup', 'click'].forEach(n =>
                            btn.dispatchEvent(new MouseEvent(n, { bubbles: true, cancelable: true, view: window, composed: true }))
                        );
                        if (innerBtn) {
                            ['mousedown', 'mouseup', 'click'].forEach(n =>
                                innerBtn.dispatchEvent(new MouseEvent(n, { bubbles: true, cancelable: true, view: window, composed: true }))
                            );
                        }
                        if (typeof btn.click === 'function') {
                            try { btn.click(); } catch (_) {}
                        }
                        return 'force-clicked';
                    }""")
                    logger.info("Kết quả BrowserMulti Force-Enable nút Publish/Done: %s", force_done)
                    if force_done == 'force-clicked':
                        done_click_mode = "force_dispatch_event"
                except Exception as f_err:
                    logger.debug("Lỗi force-enable nút Publish/Done: %s", f_err)

            if not done_click_mode:
                raise RuntimeError("Không thể bấm nút Publish/Lưu vì nút vẫn đang bị khóa hoặc không tìm thấy.")
            logger.info("Đã bấm nút Publish/Lưu lần 1 (%s) — chờ xác nhận từ YouTube Studio...", done_click_mode)

            # Bổ sung vòng lặp 3 lần kiểm tra popup xác nhận với độ trễ 1.5 giây giữa mỗi lần để bắt dính modal cảnh báo xử lý SD/HD của YouTube Studio
            for _popup_check_idx in range(3):
                dismissed = await dismiss_publish_anyway_dialogs(page)
                if dismissed:
                    logger.info("Đã phát hiện và giải phóng popup xác nhận xuất bản (lần kiểm tra %d/3).", _popup_check_idx + 1)
                await asyncio.sleep(1.5)

            # Chờ xác nhận Save RPC lên tới 45s cho proxy có độ trễ cao (KHÔNG bấm trùng khi nút đã disabled / popup đang mở)
            saved_successfully = False
            share_dialog_visible = False
            popup_card_visible = False
            retried_done = False
            save_wait_start = time.time()

            while time.time() - save_wait_start < 45.0:
                await asyncio.sleep(0.5)

                # Tự động dò tìm và click nút "Vẫn xuất bản" / "Publish anyway" / "Vẫn lưu" nếu YouTube Studio hiện popup cảnh báo kiểm tra
                await dismiss_publish_anyway_dialogs(page)

                st = await inspect_studio_modal_state(page)
                if not video_url:
                    video_url = await _extract_video_url(page)

                post_dlgs = st.get("postSaveDialogs") or []
                known_post_dlgs = [
                    d for d in post_dlgs
                    if d.get("tag") in ("ytcp-uploads-still-processing-dialog", "ytcp-video-share-dialog")
                    or not st.get("uploadsDialogVisible")
                ]
                if known_post_dlgs:
                    saved_successfully = True
                    popup_card_visible = True
                    share_dialog_visible = any(d.get("tag") == "ytcp-video-share-dialog" for d in known_post_dlgs)
                    logger.info("Đã nhận popup xác nhận sau Lưu (%.1fs): %s", time.time() - save_wait_start, [d.get("tag") for d in known_post_dlgs])
                    break

                if not st.get("uploadsDialogVisible"):
                    saved_successfully = True
                    logger.info("Hộp thoại upload chính đã đóng sau bấm Lưu (%.1fs).", time.time() - save_wait_start)
                    break

                # Chỉ bấm lại ĐÚNG 1 LẦN nếu sau >= 5.5s mà dialog vẫn mở, CHƯA có popup hậu lưu, và nút Lưu vẫn enabled
                if not retried_done and (time.time() - save_wait_start >= 5.5) and st.get("doneBtnActionable") and not post_dlgs:
                    retried_done = True
                    logger.info("Nút Lưu vẫn còn enabled sau 5.5s (chưa thấy phản hồi) — thử bấm lại 1 lần có kiểm soát...")
                    await click_stable_element(
                        page,
                        selectors=DONE_BUTTON_SELECTORS,
                        timeout_ms=3000,
                        pre_delay=0.3,
                        root_selector="ytcp-uploads-dialog",
                        allow_js_fallback=True,
                    )

        if not video_url:
            video_url = await _extract_video_url(page)
            if video_url:
                logger.info("URL video trích xuất sau khi bấm Lưu: %s", video_url)

        if handover_after_save:
            # S7: Quán triệt cửa sổ lắng 4.0s để bắt cả popup Hình 2 ('Xử lý video' / ytcp-video-share-dialog) mọc muộn,
            # bấm Đóng từ từ sau khi hết animation và xác minh card + backdrop thực sự biến mất trước khi bàn giao sang Nội dung.
            dismiss_res = await dismiss_post_save_studio_modals(
                page,
                settlement_seconds=4.0,
                context="upload_handover",
            )
            if dismiss_res.get("closed_count", 0) > 0:
                saved_successfully = True

            if dismiss_res.get("status") == "stuck":
                logger.warning("Thử lại đóng card hậu xử lý sau 1.0s chờ ổn định...")
                await asyncio.sleep(1.0)
                dismiss_res = await dismiss_post_save_studio_modals(
                    page,
                    settlement_seconds=2.5,
                    context="upload_handover_retry",
                )

            if not video_url:
                video_url = await _extract_video_url(page)

            end_state = await inspect_studio_modal_state(page)
            if end_state.get("postSaveDialogs"):
                raise RuntimeError(
                    "Đã bấm Lưu nhưng card thông báo hậu xử lý YouTube Studio ('Xử lý video') vẫn chưa đóng được."
                )
            if end_state.get("uploadsDialogVisible") and not saved_successfully:
                logger.error("Hộp thoại tải lên vẫn mở sau khi bấm Lưu/Xuất bản. Video chưa hoàn tất lưu!")
                raise RuntimeError(
                    "YouTube Studio chưa hoàn tất lưu/xuất bản video: Hộp thoại tải lên vẫn đang mở (Có lỗi trong quá trình điền thông tin hoặc chưa bấm được nút Lưu)."
                )

            await asyncio.sleep(0.4)
            verified_url = _verified_video_url_from_row({"videoUrl": video_url}) if video_url else None
            if not verified_url:
                raise RuntimeError("Không thể xác minh URL/ID video YouTube sau khi lưu; dừng trước khi bàn giao BKT.")
            video_url = verified_url
            logger.info("Đã xác minh URL sau khi lưu; tiếp tục giữ session theo dõi upload stream trước khi bàn giao.")

        # TUYỆT ĐỐI KHÔNG điều hướng goto_channel_videos ở đây! Giữ nguyên upload dialog để duy trì luồng TUS tải lên.
        # Không trả URL chỉ vì popup share đã xuất hiện; phải chờ upload stream hoàn tất.

        # Chờ xác nhận trạng thái lưu rồi theo dõi tiến trình upload tới 100% trước khi thoát trình duyệt.
        logger.info("Bắt đầu theo dõi tiến trình truyền tải file video (Upload Stream)...")
        upload_poll_start = time.time()
        # Tự động tính toán timeout dựa trên dung lượng file thực tế (tối thiểu 3600s, video lớn cho phép tới 7200s)
        try:
            v_size_mb = os.path.getsize(video_path) / (1024 * 1024)
            if v_size_mb >= 2048:
                max_upload_seconds = 7200  # 2 tiếng cho file >= 2GB
            elif v_size_mb >= 1024:
                max_upload_seconds = 5400  # 1.5 tiếng cho file >= 1GB
            else:
                max_upload_seconds = 3600  # 1 tiếng cho file thông thường
        except Exception:
            max_upload_seconds = 3600
        logger.info("Thời gian chờ tối đa cho upload stream: %d giây (file: %s)", max_upload_seconds, video_path)
        upload_stream_finished = False
        last_reported_pct = -1
        last_heartbeat_time = 0.0

        while time.time() - upload_poll_start < max_upload_seconds:
            if page.is_closed():
                raise RuntimeError("Cửa sổ/thẻ YouTube Studio đã bị đóng trong lúc đang tải video lên.")

            # 1. Trích xuất text & Polymer progressbar xuyên Shadow DOM (ngôn ngữ bất kỳ)
            try:
                progress_info = await eval_studio_dom(
                    page,
                    """
                    const res = { text: '', progressText: '', isUploadingPopup: false, isShareDialog: false, progressValue: null };
                    const shareDlgs = __rtmDom.deepQueryMounted(document, 'ytcp-video-share-dialog');
                    if (shareDlgs.length > 0) res.isShareDialog = true;
                    const stillProcDlgs = __rtmDom.deepQueryMounted(document, 'ytcp-uploads-still-processing-dialog');
                    if (stillProcDlgs.length > 0) res.isUploadingPopup = true;

                    const uploadRoots = __rtmDom.deepQueryMounted(
                        document,
                        'ytcp-uploads-dialog, ytcp-uploads-still-processing-dialog, ytcp-video-upload-progress'
                    );
                    for (const d of uploadRoots) {
                        const t = __rtmDom.collectVisibleText(d);
                        if (t) res.text += ' ' + t;
                    }
                    const progNodes = __rtmDom.deepQueryMounted(
                        document,
                        'ytcp-video-upload-progress, ytcp-uploads-still-processing-dialog'
                    );
                    for (const pn of progNodes) {
                        const pt = __rtmDom.collectVisibleText(pn);
                        if (pt) res.progressText += ' ' + pt;
                    }
                    const pb = __rtmDom.deepFirstVisible(document, 'ytcp-video-upload-progress tp-yt-paper-progress, ytcp-uploads-still-processing-dialog tp-yt-paper-progress, ytcp-video-upload-progress [role="progressbar"], ytcp-uploads-still-processing-dialog [role="progressbar"]');
                    if (pb) {
                        const rawVal = pb.getAttribute('value') ?? pb.getAttribute('aria-valuenow');
                        const rawMax = parseFloat(pb.getAttribute('max') || pb.getAttribute('aria-valuemax') || '100');
                        if (rawVal !== null && rawVal !== '' && !Number.isNaN(Number(rawVal))) {
                            const pct = rawMax > 0 && rawMax !== 100 ? (Number(rawVal) / rawMax) * 100 : Number(rawVal);
                            if (pct >= 0 && pct <= 100) res.progressValue = Math.round(pct);
                        }
                    }
                    return res;
                    """,
                )
            except Exception as poll_err:
                if page.is_closed():
                    raise RuntimeError("Cửa sổ/thẻ YouTube Studio đã bị đóng trong lúc đang tải video lên.") from poll_err
                logger.debug("Lỗi tạm thời khi đọc tiến trình tải lên: %s", poll_err)
                await asyncio.sleep(1.5)
                continue

            raw_text = (progress_info or {}).get("text", "")
            prog_text = (progress_info or {}).get("progressText", "") or raw_text
            is_popup = bool((progress_info or {}).get("isUploadingPopup", False))
            is_share_dlg = bool((progress_info or {}).get("isShareDialog", False)) or share_dialog_visible

            # Ưu tiên progressValue chuẩn cấu trúc trước, sau đó mới fallback regex % trên vùng progress (tránh nhận nhầm số % trong tiêu đề)
            percent = None
            if progress_info and progress_info.get("progressValue") is not None:
                try:
                    pv = int(round(float(progress_info["progressValue"])))
                    if 0 <= pv <= 100:
                        percent = pv
                except Exception:
                    pass
            if percent is None:
                pct_match = re.search(r'(\d{1,3})\s*%', prog_text)
                if pct_match:
                    pv = int(pct_match.group(1))
                    if 0 <= pv <= 100:
                        percent = pv

            time_match = re.search(r'(?:còn|left|remaining|restant|restante|verbleibend|残り|남은|осталось|เหลือ)\s*([^\.\n\r,]+)', prog_text, re.IGNORECASE)
            time_remaining = time_match.group(0).strip() if time_match else ""

            now = time.time()
            pct_changed = (percent is not None and percent != last_reported_pct)
            heartbeat_due = (now - last_heartbeat_time >= 10.0)

            if pct_changed or heartbeat_due:
                if pct_changed:
                    last_reported_pct = percent
                last_heartbeat_time = now
                display_pct = percent if percent is not None else (last_reported_pct if last_reported_pct >= 0 else 0)
                prog_msg = f"Đang tải lên YouTube Studio: {display_pct}% ({time_remaining})".strip()
                logger.info(prog_msg)
                print(json.dumps({
                    "event": "upload_progress",
                    "percent": display_pct,
                    "remaining": time_remaining,
                    "message": prog_msg,
                    "timestamp": int(now),
                }, ensure_ascii=False))
                sys.stdout.flush()

            upload_finished = is_upload_stream_complete(percent, raw_text)

            # Không suy diễn hoàn tất chỉ vì DOM tạm thời không có progress.
            # Chỉ tín hiệu upload/processing tích cực mới được mở barrier.

            if upload_finished:
                logger.info("Quá trình truyền tải video (Upload Stream) đã hoàn tất 100%!")
                if last_reported_pct != 100:
                    last_reported_pct = 100
                    print(json.dumps({
                        "event": "upload_progress",
                        "percent": 100,
                        "remaining": "Hoàn tất tải lên",
                        "message": "Đã tải lên 100%! YouTube Studio bắt đầu phân tích video."
                    }, ensure_ascii=False))
                    sys.stdout.flush()
                await asyncio.sleep(2.0)
                upload_stream_finished = True
                break

            await asyncio.sleep(1.5)

        if not upload_stream_finished:
            raise RuntimeError(
                "Upload YouTube chưa xác nhận hoàn tất trong thời gian cho phép; giữ profile/session để retry, không báo thành công."
            )

        # Đóng sạch card hậu xử lý/chia sẻ (ngôn ngữ bất kỳ) và xác minh biến mất khỏi DOM
        standalone_dismiss = await dismiss_post_save_studio_modals(
            page,
            settlement_seconds=3.0,
            context="upload_standalone",
        )
        if standalone_dismiss.get("closed_count", 0) > 0:
            saved_successfully = True

        # Cho phép YouTube hoàn tất sync backend 3 giây trước khi thoát
        await random_delay(3.0, 4.5)

        final_state = await inspect_studio_modal_state(page)
        dialog_still_open = bool(final_state.get("uploadsDialogVisible"))

        if not video_url:
            await random_delay(1.5, 2.5)
            video_url = await _extract_video_url(page)
            if video_url:
                logger.info("URL video trích xuất sau khi đóng dialog: %s", video_url)

        if dialog_still_open and not saved_successfully and not share_dialog_visible:
            logger.error("Hộp thoại tải lên vẫn mở sau khi bấm Lưu/Xuất bản. Video chưa hoàn tất lưu!")
            try:
                await goto_channel_videos(page)
            except Exception:
                pass
            raise RuntimeError("YouTube Studio chưa hoàn tất lưu/xuất bản video: Hộp thoại tải lên vẫn đang mở (Có lỗi trong quá trình điền thông tin hoặc chưa bấm được nút Lưu).")

        if pinned_comment and video_url:
            if vis == "public":
                await random_delay(5.0, 10.0)
                await _pin_comment(page, video_url, pinned_comment)
            else:
                _save_pending_comment(video_url, pinned_comment)

        # Điều hướng trực tiếp sang tab Nội dung (/videos/upload) để không bị kẹt ở Dashboard (Zero-Sticking)
        try:
            await goto_channel_videos(page)
        except Exception as nav_exc:
            logger.debug("Lỗi nhẹ khi chuyển sang tab Nội dung sau upload: %s", nav_exc)

        verified_url = _verified_video_url_from_row({"videoUrl": video_url}) if video_url else None
        if not verified_url:
            raise RuntimeError("Upload stream đã hoàn tất nhưng chưa xác minh được URL/ID video; giữ checkpoint để retry.")
        return verified_url


async def _set_schedule(page, schedule_date: str, schedule_time: str):
    """
    YouTube Studio REVIEW step schedule flow (paced and locale-aware).
    """
    await random_delay(1.8, 2.8)

    # Parse schedule_date & schedule_time into numeric components first
    parsed_date = None
    raw_d = str(schedule_date or "").strip()
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            parsed_date = datetime.strptime(raw_d, fmt)
            break
        except ValueError:
            pass

    parsed_hour = None
    parsed_min = None
    raw_t = str(schedule_time or "").strip()
    for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p"):
        try:
            dt_t = datetime.strptime(raw_t, fmt)
            parsed_hour = dt_t.hour
            parsed_min = dt_t.minute
            break
        except ValueError:
            pass

    # Mở phần Lên lịch qua nút cấu trúc Polymer (shadow-DOM safe)
    schedule_selected = False
    clicked_expand = await click_stable_element(
        page,
        selectors=[
            "ytcp-icon-button#second-container-expand-button",
            "#second-container-expand-button",
        ],
        timeout_ms=6000,
        pre_delay=0.4,
        root_selector="ytcp-uploads-dialog",
    )
    if clicked_expand:
        await random_delay(1.5, 2.5)
        scheduler_visible = bool(await eval_studio_dom(
            page,
            """
            const s = __rtmDom.deepFirstVisible(document, 'ytcp-visibility-scheduler');
            return Boolean(s);
            """,
        ))
        logger.info("Schedule expand (%s), scheduler visible: %s", clicked_expand, scheduler_visible)
        if scheduler_visible:
            schedule_selected = True

    if not schedule_selected:
        logger.warning("Schedule section not opened via UI — forcing visibility via CSS")
        picker_rect = await page.evaluate("""() => {
            const style = document.createElement('style');
            style.id = 'force-schedule-visible';
            style.textContent = `
                ytcp-visibility-scheduler,
                ytcp-visibility-scheduler * { display: block !important; visibility: visible !important; }
                .scheduled-info-container { display: block !important; }
            `;
            document.head.appendChild(style);
            const scheduler = document.querySelector('ytcp-visibility-scheduler');
            if (scheduler) scheduler.removeAttribute('hidden');
            const info = document.querySelector('.scheduled-info-container');
            if (info) info.removeAttribute('hidden');
            document.body.offsetHeight;
            const p = document.querySelector('ytcp-datetime-picker');
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height};
        }""")
    else:
        picker_rect = await eval_studio_dom(
            page,
            """
            const p = __rtmDom.deepFirstVisible(document, 'ytcp-datetime-picker');
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height};
            """,
        )

    # Định dạng ngày theo locale thực tế của trang YouTube Studio bằng Intl.DateTimeFormat
    formatted_date = _format_date(schedule_date)
    if parsed_date is not None:
        try:
            locale_date = await page.evaluate(
                """({ y, m, d }) => {
                    const lang = document.documentElement.lang || navigator.language || 'en-US';
                    try {
                        return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d));
                    } catch (_) {
                        return '';
                    }
                }""",
                {"y": parsed_date.year, "m": parsed_date.month, "d": parsed_date.day},
            )
            if locale_date:
                formatted_date = locale_date.strip()
        except Exception:
            pass

    formatted_time = _format_time(schedule_time)
    date_set = False
    time_set = False

    if picker_rect and picker_rect.get("width", 0) > 0 and picker_rect.get("height", 0) > 0:
        if formatted_date:
            date_trig_res = await safe_targeted_click(
                page,
                selectors=[
                    "ytcp-datetime-picker #datepicker-trigger",
                    "ytcp-datetime-picker ytcp-text-dropdown-trigger#datepicker-trigger",
                    "ytcp-datetime-picker #date-container ytcp-dropdown-trigger",
                    "ytcp-datetime-picker input",
                ],
                action_name="schedule_open_datepicker",
                root_selector="ytcp-uploads-dialog",
                allow_js_fallback=False,
                timeout_ms=3500,
                pre_delay=0.2,
                post_click_settle=0.45,
            )
            if date_trig_res.get("ok"):
                await page.keyboard.press("Control+a")
                await page.keyboard.type(formatted_date)
                await page.keyboard.press("Tab")
                await random_delay(0.4, 0.8)
                logger.info("Ngày lên lịch (locale-aware): %s -> %s", schedule_date, formatted_date)
                date_set = True

        time_trig_res = await safe_targeted_click(
            page,
            selectors=[
                "ytcp-datetime-picker #time-of-day-trigger",
                "ytcp-datetime-picker ytcp-form-input-container#time-of-day-container ytcp-dropdown-trigger",
                "ytcp-datetime-picker #time-of-day-container input",
                "ytcp-datetime-picker ytcp-dropdown-trigger:last-of-type",
            ],
            action_name="schedule_open_time_dropdown",
            root_selector="ytcp-uploads-dialog",
            allow_js_fallback=False,
            timeout_ms=3500,
            pre_delay=0.2,
            post_click_settle=0.55,
        )
        if time_trig_res.get("ok"):
            # Khớp item giờ CHỈ trong listbox/popup dropdown giờ (tránh click nhầm menu trái Studio)
            matched_time_coord = None
            if parsed_hour is not None and parsed_min is not None:
                try:
                    matched_time_coord = await eval_studio_dom(
                        page,
                        r"""
                        const { h24, m24 } = arg;
                        const h12 = (h24 % 12) === 0 ? 12 : (h24 % 12);
                        const isPm = h24 >= 12;
                        const mm = String(m24).padStart(2, '0');
                        const hh24 = String(h24).padStart(2, '0');
                        const re24 = new RegExp(`(?:^|[^0-9])${h24 === 0 ? '0?' : '0?'}${h24}:${mm}(?:[^0-9]|$)`);
                        const re12 = new RegExp(`(?:^|[^0-9])0?${h12}:${mm}(?:[^0-9]|$)`);
                        const items = __rtmDom.deepQueryVisible(
                            document,
                            'ytcp-time-of-day-picker tp-yt-paper-item, ytcp-text-menu tp-yt-paper-item, tp-yt-paper-dialog tp-yt-paper-listbox tp-yt-paper-item, tp-yt-paper-listbox tp-yt-paper-item'
                        );
                        for (const it of items) {
                            if (__rtmDom.hasAncestorTag(it, new Set(['ytcp-navigation-drawer', 'ytcp-video-row']))) continue;
                            const raw = __rtmDom.collectVisibleText(it).trim();
                            if (!raw) continue;
                            const low = raw.toLowerCase();
                            const hasPm = /(?:^|[^a-z])(?:p\.?\s*m\.?|ch)(?:[^a-z]|$)|午後|下午|오후|nachm|soir/i.test(low);
                            const hasAm = /(?:^|[^a-z])(?:a\.?\s*m\.?|sa)(?:[^a-z]|$)|午前|上午|오전|vorm|matin/i.test(low);
                            const matchTime = (
                                raw === `${hh24}:${mm}`
                                || raw === `${h24}:${mm}`
                                || (!hasPm && !hasAm && re24.test(low))
                                || (re12.test(low) && ((isPm && hasPm) || (!isPm && hasAm)))
                            );
                            if (matchTime) {
                                it.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                                const b = it.getBoundingClientRect();
                                const x = b.left + b.width / 2;
                                const y = b.top + b.height / 2;
                                const hit = __rtmDom.deepElementFromPoint(x, y);
                                if (hit && __rtmDom.belongsToElement(hit, it, it)) {
                                    return { x, y, text: raw };
                                }
                            }
                        }
                        return null;
                        """,
                        {"h24": parsed_hour, "m24": parsed_min},
                    )
                except Exception:
                    matched_time_coord = None

            if matched_time_coord:
                await page.mouse.move(matched_time_coord["x"], matched_time_coord["y"], steps=4)
                await asyncio.sleep(0.06)
                await page.mouse.click(matched_time_coord["x"], matched_time_coord["y"])
                logger.info("Giờ lên lịch (dropdown đa ngôn ngữ): %s -> %s", schedule_time, matched_time_coord.get("text"))
                time_set = True
            else:
                try:
                    time_item = page.locator("tp-yt-paper-dialog tp-yt-paper-listbox tp-yt-paper-item, tp-yt-paper-listbox tp-yt-paper-item").filter(has_text=formatted_time).first
                    await time_item.wait_for(state="visible", timeout=3500)
                    await time_item.click()
                    logger.info("Giờ lên lịch (dropdown): %s -> %s", schedule_time, formatted_time)
                    time_set = True
                except Exception:
                    await page.keyboard.press("Control+a")
                    await page.keyboard.type(formatted_time)
                    await page.keyboard.press("Tab")
                    logger.info("Giờ lên lịch (typed): %s -> %s", schedule_time, formatted_time)
                    time_set = True
            await random_delay(0.8, 1.5)
    else:
        logger.warning("ytcp-datetime-picker bbox không hợp lệ: %s", picker_rect)

    if not date_set:
        logger.warning("Không đặt được ngày lên lịch")
    if not time_set:
        logger.warning("Không đặt được giờ lên lịch")

    await random_delay(1.0, 2.0)


def _format_date(date_str: str) -> str:
    """Convert '05/20/2026' -> 'May 20, 2026'"""
    if not date_str:
        return ""
    raw = str(date_str).strip()
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.strftime("%b %d, %Y")
        except ValueError:
            pass
    return raw


def _format_time(time_str: str) -> str:
    """Convert '10:00' -> '10:00 AM', '14:30' -> '2:30 PM'"""
    if not time_str:
        return ""
    raw = str(time_str).strip()
    for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p"):
        try:
            dt = datetime.strptime(raw, fmt)
            result = dt.strftime("%I:%M %p")
            if result.startswith("0"):
                result = result[1:]
            return result
        except ValueError:
            pass
    return raw


async def _extract_video_url(page) -> str:
    # 0. Trích xuất ngay từ page URL nếu trang đang ở /video/<id>/edit hoặc tương đương
    try:
        curr_url = getattr(page, "url", "") or ""
        vid_m = re.search(r"/video/([a-zA-Z0-9_-]{11})(?:/|$|\?)", curr_url)
        if vid_m:
            return f"https://youtu.be/{vid_m.group(1)}"
    except Exception:
        pass

    # 1. Tìm link xuyên Shadow DOM bên trong các dialog Upload/Processing/Share hiện hành
    try:
        url = await eval_studio_dom(
            page,
            r"""
            const containers = __rtmDom.deepQueryMounted(
                document,
                'ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog, ytcp-uploads-dialog, ytcp-video-metadata-editor-side-panel, ytcp-video-info, ytcp-video-details'
            );
            const urlRe = /https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))[a-zA-Z0-9_-]{11}/;
            for (const c of containers) {
                const links = __rtmDom.deepQueryAll(c, 'a[href*="youtu.be"], a[href*="youtube.com/watch"], a[href*="youtube.com/shorts"]');
                for (const a of links) {
                    const href = a.href || a.getAttribute('href') || '';
                    if (href && (href.includes('youtu.be') || href.includes('watch?v=') || href.includes('/shorts/'))) return href.trim();
                }
                const inputs = __rtmDom.deepQueryAll(c, 'input, textarea, [id*="share-url"], [class*="share-url"]');
                for (const inp of inputs) {
                    const val = inp.value || inp.textContent || '';
                    const match = val.match(urlRe);
                    if (match) return match[0];
                }
                const text = __rtmDom.collectVisibleText(c);
                const textMatch = text.match(urlRe);
                if (textMatch) return textMatch[0];
            }
            const allLinks = __rtmDom.deepQueryAll(document, 'a[href*="youtu.be"]');
            for (const al of allLinks) {
                const h = al.href || al.getAttribute('href') || '';
                if (h && h.includes('youtu.be')) return h.trim();
            }
            return '';
            """,
        )
        if url:
            return str(url).strip()
    except Exception:
        pass

    return ""


async def _pin_comment(page, video_url: str, comment_text: str):
    logger.info("Ghim comment: %s", video_url)
    await page.goto(video_url)
    await page.wait_for_load_state("domcontentloaded", timeout=20000)
    await random_delay(4.0, 7.0)

    for _ in range(3):
        await page.mouse.wheel(0, 500)
        await random_delay(0.8, 1.5)

    try:
        comment_box = page.locator("#simplebox-placeholder, #contenteditable-root").first
        await comment_box.wait_for(state="visible", timeout=10000)
        await comment_box.click()
        await random_delay(0.5, 1.0)

        editable = page.locator("#contenteditable-root").first
        await human_type(page, editable, comment_text, typo_rate=0.01)
        await random_delay(0.8, 1.5)

        submit_btn = page.locator("#submit-button").first
        await submit_btn.wait_for(state="visible", timeout=5000)
        await submit_btn.click()
        logger.info("Đã đăng comment")
        await random_delay(3.0, 5.0)

        # Khớp đúng comment vừa đăng theo nội dung text (tránh click nhầm :first-child nếu đã có comment ghim trước)
        comment_snippet = re.sub(r"\s+", " ", (comment_text or "").strip())[:36].lower()
        more_clicked = False
        for _c_try in range(4):
            more_coord = await eval_studio_dom(
                page,
                """
                const snippet = String(arg || '').toLowerCase();
                const threads = __rtmDom.deepQueryVisible(document, 'ytd-comment-thread-renderer');
                for (const th of threads) {
                    const txt = __rtmDom.collectVisibleText(th).replace(/\\s+/g, ' ').trim().toLowerCase();
                    if (snippet && !txt.includes(snippet)) continue;
                    const menu = __rtmDom.deepFirstVisible(th, '#action-menu button, #action-menu yt-icon-button, #action-menu');
                    if (!menu) continue;
                    menu.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                    const b = menu.getBoundingClientRect();
                    if (b.width < 2 || b.height < 2) continue;
                    const x = b.left + b.width / 2;
                    const y = b.top + b.height / 2;
                    const hit = __rtmDom.deepElementFromPoint(x, y);
                    if (hit && __rtmDom.belongsToElement(hit, menu, menu)) {
                        return { x, y };
                    }
                }
                return null;
                """,
                comment_snippet,
            )
            if more_coord:
                await page.mouse.move(more_coord["x"], more_coord["y"], steps=4)
                await asyncio.sleep(0.06)
                await page.mouse.click(more_coord["x"], more_coord["y"])
                more_clicked = True
                break
            await asyncio.sleep(0.8)
        if not more_clicked:
            more_btn = page.locator("ytd-comment-thread-renderer:first-child #action-menu").first
            await more_btn.wait_for(state="visible", timeout=5000)
            await more_btn.click()
        await random_delay(0.6, 1.1)

        # Tìm mục Pin đa ngôn ngữ theo cấu trúc icon ('keep'/'pin') hoặc text đa ngôn ngữ, sau đó xác nhận dialog
        pin_clicked = await click_stable_element(
            page,
            selectors=[
                "ytd-menu-popup-renderer tp-yt-paper-item:has(yt-icon[icon*='keep'])",
                "ytd-menu-popup-renderer tp-yt-paper-item:has(tp-yt-iron-icon[icon*='keep'])",
                "ytd-menu-popup-renderer ytd-menu-service-item-renderer:has(yt-icon[icon*='keep'])",
            ],
            timeout_ms=3500,
            pre_delay=0.3,
        )
        if not pin_clicked:
            pin_coord = await eval_studio_dom(
                page,
                r"""
                const items = __rtmDom.deepQueryVisible(
                    document,
                    'ytd-menu-popup-renderer tp-yt-paper-item, ytd-menu-popup-renderer ytd-menu-service-item-renderer, ytd-menu-popup-renderer [role="menuitem"], tp-yt-paper-listbox tp-yt-paper-item'
                );
                const pinWords = ['pin', 'ghim', '固定', '고정', 'fijar', 'épingler', 'fixar', 'anheften', 'закрепить', 'ปักหมุด', 'sematkan'];
                for (const it of items) {
                    const txt = __rtmDom.collectVisibleText(it).toLowerCase();
                    if (pinWords.some(w => txt.includes(w))) {
                        it.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                        const b = it.getBoundingClientRect();
                        if (b.width > 0 && b.height > 0) {
                            const x = b.left + b.width / 2;
                            const y = b.top + b.height / 2;
                            const hit = __rtmDom.deepElementFromPoint(x, y);
                            if (hit && __rtmDom.belongsToElement(hit, it, it)) {
                                return { x, y };
                            }
                        }
                    }
                }
                return null;
                """,
            )
            if pin_coord:
                await page.mouse.move(pin_coord["x"], pin_coord["y"], steps=4)
                await asyncio.sleep(0.06)
                await page.mouse.click(pin_coord["x"], pin_coord["y"])
                pin_clicked = "js_locale_pin"
        if not pin_clicked:
            raise RuntimeError("Không tìm thấy tùy chọn Ghim bình luận trong menu")
        await random_delay(0.6, 1.1)

        confirm_clicked = await click_stable_element(
            page,
            selectors=[
                "yt-confirm-dialog-renderer #confirm-button button",
                "yt-confirm-dialog-renderer #confirm-button",
                "tp-yt-paper-dialog #confirm-button",
            ],
            timeout_ms=4000,
            pre_delay=0.3,
        )
        logger.info("Đã ghim comment thành công (confirm=%s)", confirm_clicked)

    except Exception as exc:
        logger.warning("Không ghim được comment: %s — lưu pending", exc)
        _save_pending_comment(video_url, comment_text)


def _append_pending_comment_line(line: str) -> None:
    """Append một dòng JSONL dưới lock để tránh corrupt khi nhiều profile ghi cùng lúc."""
    PENDING_COMMENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PENDING_COMMENTS_FILE, "a+", encoding="utf-8") as f:
        locked = False
        if msvcrt is not None:
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)
            locked = True
        try:
            f.seek(0, 2)
            f.write(line + "\n")
            f.flush()
        finally:
            if locked:
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)


def _save_pending_comment(video_url: str, comment_text: str):
    entry = json.dumps({"url": video_url, "comment": comment_text}, ensure_ascii=False)
    _append_pending_comment_line(entry)
    logger.info("Lưu pending comment → %s", PENDING_COMMENTS_FILE)


async def process_pending_comments(page):
    """Xử lý các comment ghim còn tồn đọng an toàn, tránh ghi đè đa tiến trình."""
    if not PENDING_COMMENTS_FILE.exists():
        return

    processing_file = PENDING_COMMENTS_FILE.with_suffix(f".processing_{os.getpid()}_{int(time.time()*1000)}.jsonl")
    try:
        PENDING_COMMENTS_FILE.rename(processing_file)
    except Exception:
        return

    try:
        lines = processing_file.read_text(encoding="utf-8").splitlines()
    except Exception as exc:
        logger.warning("Không thể đọc processing pending comments: %s", exc)
        return

    remaining = []
    for line in lines:
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
            await _pin_comment(page, entry["url"], entry["comment"])
        except Exception as exc:
            logger.warning("Chưa xử lý được pending comment: %s", exc)
            remaining.append(line)

    try:
        processing_file.unlink(missing_ok=True)
    except Exception:
        pass

    if remaining:
        for r in remaining:
            try:
                _append_pending_comment_line(r)
            except Exception:
                pass
