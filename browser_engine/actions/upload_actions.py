import asyncio
import json
import logging
import re
import sys
import time
from pathlib import Path

try:
    import msvcrt
except ImportError:  # pragma: no cover - Windows app; non-Windows test fallback.
    msvcrt = None

from actions.human_utils import random_delay, human_type
from actions.page_context import check_page_health
from actions.studio_dom import (
    DEFAULT_FORBIDDEN_HREF_PATTERNS,
    click_stable_element,
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
from core.paths import app_path

logger = logging.getLogger(__name__)

PENDING_COMMENTS_FILE = app_path("pending_comments.jsonl")


def _truncate_utf16(text: str, max_units: int = 92) -> str:
    """Truncate text so its JS UTF-16 `.length` never exceeds YouTube's 100-unit limit."""
    out: list[str] = []
    units = 0
    for ch in text:
        ch_units = 2 if ord(ch) > 0xFFFF else 1
        if units + ch_units > max_units:
            break
        out.append(ch)
        units += ch_units
    return "".join(out).strip()


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

                if (targetSel) {
                    const target = __rtmDom.deepFirstVisible(dlg, targetSel)
                        || (__rtmDom.deepQueryMounted(dlg, targetSel)[0] || null);
                    if (target && typeof target.scrollIntoView === 'function') {
                        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
                        scrolled = true;
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
    """Kiểm tra radio Không dành cho trẻ em bên trong ytcp-uploads-dialog đã được chọn chưa."""
    try:
        return bool(
            await eval_studio_dom(
                page,
                r"""
                const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog') || document;
                const radios = __rtmDom.deepQueryMounted(
                    dlg,
                    'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"], tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"], [name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]'
                );
                for (const r of radios) {
                    if (r.getAttribute('aria-checked') === 'true' || r.hasAttribute('checked')) {
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
    """Cuộn tới phần Đối tượng khán giả, chọn Không dành cho trẻ em và xác nhận aria-checked."""
    audience_target = (
        'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"], '
        'tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"], '
        '#not-made-for-kids, ytcp-video-metadata-made-for-kids'
    )
    await _scroll_uploads_dialog(page, target_selector=audience_target, to_bottom=True)
    await random_delay(0.35, 0.7)

    if await _is_not_for_kids_selected(page):
        return True

    audience_res = await safe_targeted_click(
        page,
        selectors=[
            'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            '#not-made-for-kids tp-yt-paper-radio-button',
            'tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"]',
        ],
        action_name="upload_audience_not_for_kids",
        root_selector="ytcp-uploads-dialog",
        allow_js_fallback=False,
        timeout_ms=4500,
        pre_delay=0.25,
        post_click_settle=0.45,
    )
    if audience_res.get("ok") and await _is_not_for_kids_selected(page):
        return True

    result = await eval_studio_dom(
        page,
        r"""
        const dlg = __rtmDom.findMountedContainer(document, 'ytcp-uploads-dialog');
        if (!dlg) return 'missing-dialog';
        const radios = __rtmDom.deepQueryMounted(dlg, 'tp-yt-paper-radio-button, [role="radio"]');
        for (const r of radios) {
            if (__rtmDom.isDisabledControl(r)) continue;
            const name = r.getAttribute('name') || '';
            const rid = (r.getAttribute('id') || '').toLowerCase();
            if (name.includes('NOT_MFK') || name.includes('NOT_MADE_FOR_KIDS') || rid.includes('not-for-kids')) {
                try { r.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) {}
                r.click();
                return 'js-clicked:aria=' + r.getAttribute('aria-checked');
            }
        }
        return 'not-found:' + radios.map(r => r.getAttribute('name') || r.getAttribute('id') || '').join(',');
        """,
    )
    logger.info("Fallback audience click: %s", result)
    await asyncio.sleep(0.35)
    return await _is_not_for_kids_selected(page)


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

        # Nếu trình duyệt đang kẹt ở scope /video/<id>/edit hoặc analytics của video cũ, thoát về trang kênh trước
        pre_ctx = await get_studio_context(page)
        if pre_ctx.get("scope") == "video":
            logger.warning(
                "Trước khi upload trình duyệt đang kẹt ở %s (%s); điều hướng về kênh trước...",
                pre_ctx.get("pageType"),
                pre_ctx.get("url"),
            )
            ch_id = pre_ctx.get("channelId") or ""
            target_ch = f"https://studio.youtube.com/channel/{ch_id}" if ch_id else "https://studio.youtube.com/"
            await page.goto(target_ch, wait_until="domcontentloaded", timeout=45000)
            await random_delay(1.2, 2.0)

        logger.info("Click Create -> Upload videos (language-agnostic)")
        opened = False
        try:
            create_res = await safe_targeted_click(
                page,
                selectors=[
                    "ytcp-header #create-icon",
                    "ytcp-icon-button#create-icon",
                    "#create-icon",
                    "ytcp-header [test-id='create-icon']",
                ],
                action_name="studio_open_create_menu",
                exclude_ancestors=["ytcp-video-row", "ytcp-uploads-dialog", "#hover-items"],
                forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/video/[^/]+/edit"],
                allow_js_fallback=False,
                timeout_ms=6000,
                pre_delay=0.35,
                post_click_settle=0.45,
                verify_fn=lambda ctx: bool((ctx.get("headerMenus") or {}).get("menuItems")),
            )
            if create_res.get("ok") or create_res.get("method"):
                await random_delay(0.4, 0.8)
                upload_item_res = await safe_targeted_click(
                    page,
                    selectors=[
                        "tp-yt-paper-item#text-item-0",
                        "[test-id='upload-video-menu-item']",
                        "tp-yt-paper-item:has(tp-yt-iron-icon[icon*='upload'])",
                        "ytcp-ve:has(tp-yt-iron-icon[icon*='upload'])",
                    ],
                    action_name="studio_select_upload_menu_item",
                    root_selector="ytcp-text-menu tp-yt-paper-dialog, tp-yt-paper-dialog[role='menu'], tp-yt-paper-dialog[opened], ytcp-text-menu",
                    exclude_ancestors=["ytcp-video-row", "#recent-videos", "#latest-video-card", "ytcp-uploads-dialog"],
                    forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/video/[^/]+/edit"],
                    allow_js_fallback=False,
                    timeout_ms=5000,
                    pre_delay=0.25,
                    post_click_settle=0.6,
                )
                if upload_item_res.get("ok"):
                    opened = True
        except Exception as exc:
            logger.debug("Create menu click failed: %s", exc)

        if not opened:
            # Fallback chỉ trên header/dashboard (cấm link dẫn sang /video/<id>/... hoặc nằm trong row/card video)
            direct_res = await safe_targeted_click(
                page,
                selectors=[
                    "ytcp-header #upload-icon",
                    "#upload-icon",
                    "#upload-button",
                    "ytcp-icon-button#upload-icon",
                ],
                action_name="studio_direct_upload_icon",
                exclude_ancestors=["ytcp-video-row", "#recent-videos", "#latest-video-card", "#hover-items"],
                forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS + [r"/video/[^/]+/edit"],
                allow_js_fallback=False,
                timeout_ms=7000,
                pre_delay=0.35,
                post_click_settle=0.6,
            )
            if direct_res.get("ok"):
                opened = True
            else:
                cur_ctx = await get_studio_context(page)
                raise RuntimeError(
                    f"Không mở được hộp thoại tải video lên trên YouTube Studio "
                    f"(pageType={cur_ctx.get('pageType')}, url={cur_ctx.get('url')}, reason={direct_res.get('reason')})."
                )
        await random_delay(1.2, 2.0)

        # Chờ file picker dialog thật xuất hiện
        logger.info("Chờ file picker dialog (ytcp-uploads-file-picker)")
        picker_ready = False
        try:
            await page.wait_for_selector("ytcp-uploads-dialog ytcp-uploads-file-picker, ytcp-uploads-file-picker", timeout=15000)
            picker_ready = True
        except Exception:
            await random_delay(1.5, 2.5)
            cur_ctx_picker = await get_studio_context(page)
            picker_ready = bool((cur_ctx_picker.get("uploadState") or {}).get("filePickerVisible"))

        if not picker_ready:
            cur_ctx_picker = await get_studio_context(page)
            raise RuntimeError(
                f"Hộp thoại chọn file tải lên (ytcp-uploads-file-picker) không xuất hiện "
                f"(pageType={cur_ctx_picker.get('pageType')}, url={cur_ctx_picker.get('url')})."
            )

        # Set file trực tiếp vào input scoped trong hộp thoại upload (cấm dính input thumbnail)
        logger.info("Chọn file video: %s", video_path)
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
        logger.info("Đã chọn file, chờ dialog metadata xuất hiện")

        # Chờ dialog chuyển sang bước Details / BASIC_INFO (metadata)
        logger.info("Chờ dialog chi tiết video (Details) xuất hiện...")
        try:
            await page.wait_for_function(
                """() => {
                    const d = document.querySelector('ytcp-uploads-dialog');
                    if (!d) return false;
                    const titleBox = d.querySelector('#title-textarea #textbox')
                        || d.querySelector('ytcp-video-metadata-editor-basic')
                        || d.querySelector('#textbox');
                    return titleBox !== null;
                }""",
                timeout=60000,
            )
        except Exception:
            # Fallback: chờ title box xuất hiện theo cấu trúc DOM đa ngôn ngữ
            logger.warning("Không detect được titlebox nhanh, chờ bằng selector cấu trúc")
            try:
                await page.wait_for_selector(
                    'ytcp-uploads-dialog #title-textarea #textbox, ytcp-uploads-dialog ytcp-video-title #textbox, ytcp-uploads-dialog #textbox',
                    timeout=30000,
                )
            except Exception as exc:
                cur_ctx_meta = await get_studio_context(page)
                raise RuntimeError(
                    f"Hộp thoại metadata tải video không xuất hiện sau 90s "
                    f"(pageType={cur_ctx_meta.get('pageType')}, url={cur_ctx_meta.get('url')}): {exc}"
                ) from exc
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
            try:
                await title_box.click()
                await random_delay(0.25, 0.45)
            except Exception as click_err:
                logger.debug("Lỗi click title_box (thử focus JS): %s", click_err)

            # Xóa triệt để text mặc định (tên file) bằng DOM trước khi gõ
            await page.evaluate("""() => {
                const tb = document.querySelector('#title-textarea #textbox')
                    || document.querySelector('ytcp-video-metadata-editor-basic #title-textarea #textbox')
                    || document.querySelector('ytcp-social-suggestions-textbox[id="title-textarea"] #textbox')
                    || document.querySelector('ytcp-video-title #textbox')
                    || document.querySelector('ytcp-uploads-dialog #textbox');
                if (tb) {
                    tb.focus();
                    tb.textContent = '';
                    tb.innerText = '';
                    tb.dispatchEvent(new Event('input', { bubbles: true }));
                    tb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }""")
            await random_delay(0.15, 0.25)

            try:
                await page.keyboard.press("Control+a")
                await page.keyboard.press("Backspace")
            except Exception:
                pass
            await random_delay(0.15, 0.25)

            try:
                await human_type(page, title_box, title, typo_rate=0.005)
            except Exception as type_err:
                logger.debug("Fallback keyboard.type cho tiêu đề: %s", type_err)
                try:
                    await page.keyboard.type(title)
                except Exception:
                    pass

            # Đảm bảo 100% tiêu đề không vượt quá 92 UTF-16 units trong DOM của YouTube Studio
            await page.evaluate("""(t) => {
                const tb = document.querySelector('#title-textarea #textbox')
                    || document.querySelector('ytcp-video-metadata-editor-basic #title-textarea #textbox')
                    || document.querySelector('ytcp-social-suggestions-textbox[id="title-textarea"] #textbox')
                    || document.querySelector('ytcp-video-title #textbox')
                    || document.querySelector('ytcp-uploads-dialog #textbox');
                if (tb) {
                    const clean = t.slice(0, 92);
                    const current = (tb.innerText || tb.textContent || '').trim();
                    if (!current || current.length > 92 || current !== clean) {
                        tb.textContent = clean;
                        tb.innerText = clean;
                        tb.dispatchEvent(new Event('input', { bubbles: true }));
                        tb.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }""", title)
        else:
            logger.warning("Không tìm thấy hộp nhập tiêu đề")
        await random_delay(0.5, 1.2)

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
                await desc_box.click()
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
                        await desc_box.click()
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
                        snippet = description[:1500]
                        await page.keyboard.type(snippet)
                except Exception:
                    pass
            except Exception as exc:
                logger.warning("Lỗi khi điền mô tả: %s", exc)
        await random_delay(0.5, 1.2)

        # Thumbnail
        if thumbnail_path:
            logger.info("Đặt thumbnail: %s", thumbnail_path)
            try:
                thumb_res = await safe_targeted_click(
                    page,
                    selectors=["ytcp-thumbnails-compact-editor-uploader", "#still-image-upload-button"],
                    action_name="upload_select_thumbnail_btn",
                    root_selector="ytcp-uploads-dialog",
                    allow_js_fallback=False,
                    timeout_ms=5000,
                    pre_delay=0.2,
                )
                if thumb_res.get("ok"):
                    await random_delay(0.4, 0.8)
                thumb_input = page.locator(
                    'ytcp-uploads-dialog input[type="file"][accept*="image"], input[type="file"][accept*="image"]'
                ).first
                await thumb_input.wait_for(state="attached", timeout=8000)
                await thumb_input.set_input_files(thumbnail_path)
                await random_delay(1.0, 2.5)
            except Exception as exc:
                logger.warning("Không thể đặt thumbnail: %s", exc)

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
        for attempt in range(8):
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

            # Xử lý bước Ad Suitability nếu bật (chọn None of the above trước khi bấm Next)
            if "SUITABILITY" in cur_step or "AD_" in cur_step:
                await click_stable_element(
                    page,
                    selectors=[
                        "ytcp-video-metadata-ad-suitability tp-yt-paper-checkbox",
                        "[name='NONE_OF_THE_ABOVE']",
                        "#none-of-the-above",
                    ],
                    timeout_ms=2500,
                    pre_delay=0.4,
                    root_selector="ytcp-uploads-dialog",
                )
                await asyncio.sleep(0.6)

            logger.info("Đang ở bước '%s', chờ nút Next ổn định (lần %d)...", cur_step or "DETAILS", attempt + 1)
            next_clicked = await click_stable_element(
                page,
                selectors=["ytcp-button#next-button", "#next-button"],
                timeout_ms=9000,
                pre_delay=0.55,
                root_selector="ytcp-uploads-dialog",
            )
            if not next_clicked:
                logger.warning(
                    "Nút Next chưa actionable ở bước '%s' (nextPresent=%s, nextActionable=%s, donePresent=%s, vis=%s), kiểm tra lại điều kiện và chờ thêm...",
                    cur_step,
                    step_state.get("nextBtnPresent"),
                    step_state.get("nextBtnActionable"),
                    step_state.get("doneBtnPresent"),
                    step_state.get("visRadiosVisible"),
                )
                if cur_step in ("DETAILS", ""):
                    try:
                        await page.evaluate(
                            "() => { if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur(); }"
                        )
                    except Exception:
                        pass
                    await _ensure_not_for_kids_audience(page)
                await asyncio.sleep(1.5)
                continue

            # Chờ DOM xác nhận đã chuyển sang workflow-step tiếp theo hoặc hiện radio Visibility
            transitioned = False
            for _chk in range(16):  # tối đa ~5.6s
                await asyncio.sleep(0.35)
                after_step = await inspect_studio_modal_state(page)
                new_step = (after_step.get("uploadsStep") or "").upper()
                if (
                    after_step.get("visRadiosVisible")
                    or after_step.get("doneBtnPresent")
                    or new_step in ("REVIEW", "VISIBILITY")
                    or (cur_step and new_step and new_step != cur_step)
                ):
                    transitioned = True
                    logger.info("Đã chuyển bước thành công: %s -> %s", cur_step or "?", new_step or "VISIBILITY")
                    break
            if not transitioned:
                logger.info("Bước '%s' chưa đổi thuộc tính sau click Next, tạm nghỉ trước khi kiểm tra tiếp...", cur_step)
                if cur_step in ("DETAILS", ""):
                    try:
                        await page.evaluate(
                            "() => { if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur(); }"
                        )
                    except Exception:
                        pass
                    await _ensure_not_for_kids_audience(page)
                await random_delay(1.0, 1.8)

        if not reached_visibility:
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
                raise RuntimeError(
                    f"Không thể chuyển sang bước Chế độ hiển thị (hiện vẫn đang dừng ở bước '{cur_step_err}'). "
                    "Có thể thiếu thông tin bắt buộc hoặc nút Tiếp trên YouTube Studio đang bị chặn."
                )

        # Chế độ hiển thị
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

        # Chờ nút Lưu / Xuất bản (#done-button) thực sự ổn định & sẵn sàng (tối đa 12s)
        await random_delay(0.6, 1.0)
        logger.info("S6: Chờ nút Lưu/Xuất bản (#done-button) ổn định và khả dụng...")
        done_probe = await wait_for_stable_actionable(
            page,
            selectors=[
                "ytcp-button#done-button",
                "#done-button",
            ],
            root_selector="ytcp-uploads-dialog",
            timeout_ms=12000,
            require_unobscured=True,
            require_enabled=True,
        )
        if not done_probe:
            cur_done_state = await inspect_studio_modal_state(page)
            logger.warning("Nút Lưu (#done-button) chưa actionable sau 12s: %s", cur_done_state)
            if not cur_done_state.get("doneBtnPresent") and cur_done_state.get("uploadsDialogVisible"):
                raise RuntimeError("Không tìm thấy nút Publish/Lưu (#done-button) trong hộp thoại YouTube Studio.")

        done_click_mode = await click_stable_element(
            page,
            selectors=[
                "ytcp-button#done-button",
                "#done-button",
            ],
            timeout_ms=5000,
            pre_delay=0.35,
            root_selector="ytcp-uploads-dialog",
            allow_js_fallback=True,
        )
        if not done_click_mode:
            raise RuntimeError("Không thể bấm nút Publish/Lưu (#done-button) vì nút vẫn đang bị khóa hoặc bị che khuất.")
        logger.info("Đã bấm nút Publish/Lưu (#done-button) lần 1 (%s) — chờ xác nhận từ YouTube Studio...", done_click_mode)

        # Chờ xác nhận Save RPC lên tới 15s (KHÔNG bấm trùng khi #done-button đã disabled / popup đang mở)
        saved_successfully = False
        share_dialog_visible = False
        popup_card_visible = False
        retried_done = False
        save_wait_start = time.time()

        while time.time() - save_wait_start < 15.0:
            await asyncio.sleep(0.5)
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
                    selectors=[
                        "ytcp-button#done-button",
                        "#done-button",
                    ],
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
            return video_url

        # LUỒNG UPLOAD ĐỘC LẬP (Kênh Chính - không handover sang bkt_check):
        # Chờ xác nhận trạng thái lưu rồi theo dõi tiến trình upload tới 100% trước khi thoát trình duyệt.
        logger.info("Bắt đầu theo dõi tiến trình truyền tải file video (Upload Stream)...")
        upload_poll_start = time.time()
        max_upload_seconds = 1800  # Tối đa 30 phút cho video lớn
        last_reported_pct = -1

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

                    const dlgList = __rtmDom.deepQueryMounted(
                        document,
                        'ytcp-dialog, tp-yt-paper-dialog, ytcp-uploads-dialog, ytcp-uploads-still-processing-dialog, ytcp-video-upload-progress'
                    );
                    for (const d of dlgList) {
                        const t = __rtmDom.collectVisibleText(d);
                        if (t) res.text += ' ' + t;
                    }
                    const progNodes = __rtmDom.deepQueryMounted(
                        document,
                        'ytcp-video-upload-progress, ytcp-uploads-still-processing-dialog, .progress-label, #progress-label'
                    );
                    for (const pn of progNodes) {
                        const pt = __rtmDom.collectVisibleText(pn);
                        if (pt) res.progressText += ' ' + pt;
                    }
                    const pb = __rtmDom.deepFirstVisible(document, 'ytcp-video-upload-progress tp-yt-paper-progress, ytcp-uploads-still-processing-dialog tp-yt-paper-progress, ytcp-video-upload-progress [role="progressbar"]');
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

            if percent is not None and percent != last_reported_pct:
                last_reported_pct = percent
                prog_msg = f"Đang tải lên YouTube Studio: {percent}% ({time_remaining})".strip()
                logger.info(prog_msg)
                print(json.dumps({
                    "event": "upload_progress",
                    "percent": percent,
                    "remaining": time_remaining,
                    "message": prog_msg
                }, ensure_ascii=False))
                sys.stdout.flush()

            low_text = raw_text.lower()
            upload_finished = (
                (percent is not None and percent >= 100) or
                any(sig in low_text for sig in [
                    "quá trình xử lý sẽ sớm bắt đầu", "processing will begin",
                    "đã hoàn tất quá trình tải lên", "upload complete",
                    "đang xử lý đến độ phân giải tối đa", "đang xử lý sd",
                    "processing sd", "đang kiểm tra", "quá trình kiểm tra sẽ sớm bắt đầu",
                    "quá trình xử lý video ở độ nét chuẩn (sd)",
                    "processing complete", "checks complete",
                ]) or
                (is_share_dlg and not is_popup and percent is None and (time.time() - upload_poll_start >= 3))
            )

            if not is_popup and not is_share_dlg and percent is None and (time.time() - upload_poll_start > 45):
                upload_finished = True

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
                break

            await asyncio.sleep(1.5)

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
            raise RuntimeError("YouTube Studio chưa hoàn tất lưu/xuất bản video: Hộp thoại tải lên vẫn đang mở (Có lỗi trong quá trình điền thông tin hoặc chưa bấm được nút Lưu).")

        if pinned_comment and video_url:
            if vis == "public":
                await random_delay(5.0, 10.0)
                await _pin_comment(page, video_url, pinned_comment)
            else:
                _save_pending_comment(video_url, pinned_comment)

        return video_url


async def _set_schedule(page, schedule_date: str, schedule_time: str):
    """
    YouTube Studio REVIEW step schedule flow (paced and locale-aware).
    """
    await random_delay(1.8, 2.8)

    # Parse schedule_date & schedule_time into numeric components first
    from datetime import datetime
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
    from datetime import datetime
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
    from datetime import datetime
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
    # 1. Tìm link xuyên Shadow DOM bên trong các dialog Upload/Processing/Share hiện hành
    try:
        url = await eval_studio_dom(
            page,
            r"""
            const containers = __rtmDom.deepQueryMounted(
                document,
                'ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog, ytcp-uploads-dialog, ytcp-video-metadata-editor-side-panel, ytcp-video-info'
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
    """Xử lý các comment ghim còn tồn đọng."""
    if not PENDING_COMMENTS_FILE.exists():
        return

    lines = PENDING_COMMENTS_FILE.read_text(encoding="utf-8").splitlines()
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

    if remaining:
        PENDING_COMMENTS_FILE.write_text("\n".join(remaining) + "\n", encoding="utf-8")
    else:
        PENDING_COMMENTS_FILE.unlink(missing_ok=True)
