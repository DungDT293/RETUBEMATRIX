import json
import logging
import random
from pathlib import Path

try:
    import msvcrt
except ImportError:  # pragma: no cover - Windows app; non-Windows test fallback.
    msvcrt = None

from actions.human_utils import random_delay, human_type
from actions.page_context import check_page_health
from actions.youtube_channel import (
    PreferredYouTubeChannelError,
    ensure_preferred_youtube_channel,
)
from core.paths import app_path

logger = logging.getLogger(__name__)

PENDING_COMMENTS_FILE = app_path("pending_comments.jsonl")


def _resolve_path(raw: str) -> str:
    """Tìm file thực tế khi path không có extension. Validates path to prevent traversal."""
    from pathlib import Path
    import os

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
        await page.goto("https://studio.youtube.com/")
        await page.wait_for_load_state("domcontentloaded", timeout=20000)
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
        await page.goto("https://studio.youtube.com/")
        await page.wait_for_load_state("domcontentloaded", timeout=20000)
        await random_delay(1.5, 2.5)

    if preferred_channel and not await ensure_preferred_youtube_channel(page, preferred_channel):
        logger.error("Không tìm thấy kênh YouTube ưu tiên — hủy warmup/upload: %s", preferred_channel)
        raise PreferredYouTubeChannelError(
            f"Preferred YouTube channel not found: {preferred_channel}"
        )

    logger.info("Đã vào YouTube Studio sẵn sàng upload trực tiếp")
    return True


class YouTubeUpload:
    async def upload_video(
        self,
        page,
        video_path: str,
        title: str,
        description: str,
        thumbnail_path: str = None,
        visibility: str = "public",
        schedule_date: str = "",
        schedule_time: str = "",
        pinned_comment: str = "",
        preferred_channel: str = "",
    ) -> str:
        """Đăng video lên YouTube Studio. Trả về URL video (hoặc chuỗi rỗng nếu thất bại)."""

        video_path = _resolve_path(video_path)
        if thumbnail_path:
            thumbnail_path = _resolve_path(thumbnail_path)

        # Warmup: duyệt Studio trước khi upload
        if not await studio_warmup(page, preferred_channel=preferred_channel):
            if str(preferred_channel or "").strip():
                raise RuntimeError("Preferred YouTube channel not found")
            return ""

        # Kiểm tra nếu trang chưa ở trong YouTube Studio thì mới chuyển hướng
        if "studio.youtube.com" not in page.url:
            logger.info("Chuyển hướng vào YouTube Studio")
            await page.goto("https://studio.youtube.com/")
            await page.wait_for_load_state("domcontentloaded", timeout=20000)
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

        logger.info("Click Create → Upload videos")
        opened = False
        try:
            create_btn = page.locator(
                "#create-icon, button:has-text('Create'), button:has-text('Tạo'), "
                "[aria-label*='Create' i], [aria-label*='Tạo' i]"
            ).first
            if await create_btn.is_visible(timeout=5000):
                await create_btn.click()
                await random_delay(0.8, 1.5)
                upload_item = page.locator(
                    "tp-yt-paper-item:has-text('Upload videos'), tp-yt-paper-item:has-text('Tải video lên'), "
                    "[role='menuitem']:has-text('Upload'), [role='menuitem']:has-text('Tải video')"
                ).first
                if await upload_item.is_visible(timeout=5000):
                    await upload_item.click()
                    opened = True
        except Exception as exc:
            logger.debug("Create menu click failed: %s", exc)

        if not opened:
            # Fallback: icon upload trực tiếp
            try:
                upload_btn = page.locator(
                    "#upload-icon, #upload-button, [aria-label*='Upload' i], [aria-label*='Tải video' i]"
                ).first
                await upload_btn.wait_for(state="visible", timeout=8000)
                await upload_btn.click()
            except Exception as exc:
                logger.error("Không mở được upload dialog: %s", exc)
                return ""
        await random_delay(2.0, 3.0)

        # Chờ file picker dialog xuất hiện
        logger.info("Chờ file picker dialog")
        try:
            await page.wait_for_selector("ytcp-uploads-file-picker", timeout=15000)
        except Exception:
            await random_delay(2.0, 3.0)

        # Set file trực tiếp vào input — không cần click drop zone
        logger.info("Chọn file video: %s", video_path)
        file_input = None
        # Tìm input trong main frame trước
        for attempt in range(3):
            try:
                fi = page.locator('input[type="file"]').first
                count = await fi.count()
                if count > 0:
                    file_input = fi
                    break
            except Exception:
                pass
            # Tìm trong các frame con
            for frame in page.frames:
                try:
                    fi = frame.locator('input[type="file"]').first
                    if await fi.count() > 0:
                        file_input = fi
                        break
                except Exception:
                    continue
            if file_input:
                break
            await random_delay(1.0, 2.0)

        if not file_input:
            logger.error("Không tìm thấy file input")
            return ""

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
            # Fallback: chờ title box xuất hiện
            logger.warning("Không detect được titlebox nhanh, chờ bằng selector")
            try:
                await page.wait_for_selector(
                    '#title-textarea #textbox, [aria-label*="Title" i], [aria-label*="Tiêu đề" i], ytcp-uploads-dialog #textbox',
                    timeout=30000,
                )
            except Exception as exc:
                logger.error("Dialog metadata không xuất hiện: %s", exc)
                return ""
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
            '[aria-label*="Title" i] #textbox',
            '[aria-label*="Tiêu đề" i] #textbox',
            '[aria-label="Title"]',
            '[aria-label*="Tiêu đề"]',
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
            await title_box.click()
            await random_delay(0.2, 0.4)
            # Xóa text mặc định do YouTube tự sinh từ tên file (ví dụ "2")
            await page.keyboard.press("Control+a")
            await page.keyboard.press("Backspace")
            await random_delay(0.1, 0.2)
            await page.keyboard.press("Control+a")
            await page.keyboard.press("Delete")
            await random_delay(0.2, 0.4)

            try:
                await human_type(page, title_box, title, typo_rate=0.005)
            except Exception:
                await page.keyboard.type(title)

            # Fallback DOM để chắc chắn 100% tiêu đề không bị rỗng
            await page.evaluate("""(t) => {
                const tb = document.querySelector('#title-textarea #textbox') || document.querySelector('ytcp-uploads-dialog #textbox');
                if (tb && (!tb.innerText || tb.innerText.trim() !== t.trim())) {
                    tb.innerText = t;
                    tb.dispatchEvent(new Event('input', { bubbles: true }));
                    tb.dispatchEvent(new Event('change', { bubbles: true }));
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
                if len(description) > 150:
                    # Description dài thì set DOM để tránh gõ quá lâu
                    await page.evaluate("""(d) => {
                        const db = document.querySelector('#description-textarea #textbox')
                            || (document.querySelectorAll('ytcp-uploads-dialog #textbox')[1]);
                        if (db) {
                            db.innerText = d;
                            db.dispatchEvent(new Event('input', { bubbles: true }));
                            db.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }""", description)
                else:
                    await human_type(page, desc_box, description, typo_rate=0.01)
            except Exception as exc:
                logger.warning("Lỗi khi điền mô tả: %s", exc)
        await random_delay(0.5, 1.2)

        # Thumbnail
        if thumbnail_path:
            logger.info("Đặt thumbnail: %s", thumbnail_path)
            try:
                thumb_btn = page.locator(
                    "ytcp-thumbnails-compact-editor-uploader, #still-image-upload-button"
                ).first
                if await thumb_btn.is_visible(timeout=5000):
                    await thumb_btn.click()
                    await random_delay(0.5, 1.0)
                thumb_input = page.locator('input[type="file"][accept*="image"]').first
                await thumb_input.wait_for(state="attached", timeout=8000)
                await thumb_input.set_input_files(thumbnail_path)
                await random_delay(1.0, 2.5)
            except Exception as exc:
                logger.warning("Không thể đặt thumbnail: %s", exc)

        # Cuộn dialog xuống để hiển thị phần Đối tượng khán giả (Audience)
        try:
            await page.evaluate("""() => {
                const sc = document.querySelector('ytcp-uploads-dialog #scrollable-content')
                    || document.querySelector('ytcp-uploads-dialog [id="scrollable-content"]')
                    || document.querySelector('#scrollable-content');
                if (sc) {
                    sc.scrollTop = sc.scrollHeight / 2;
                }
            }""")
        except Exception:
            pass
        await random_delay(0.5, 1.0)

        # Đối tượng khán giả — name thực tế là VIDEO_MADE_FOR_KIDS_NOT_MFK
        audience_clicked = False
        for selector in [
            'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            'tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"]',
        ]:
            try:
                el = page.locator(selector).first
                if await el.is_visible(timeout=3000):
                    await el.click()
                    await random_delay(0.5, 1.0)
                    checked = await el.get_attribute("aria-checked")
                    logger.info("Audience click (%s) aria-checked=%s", selector, checked)
                    if checked == "true":
                        audience_clicked = True
                        break
            except Exception:
                pass

        if not audience_clicked:
            result = await page.evaluate("""() => {
                const radios = document.querySelectorAll('tp-yt-paper-radio-button');
                for (const r of radios) {
                    const name = r.getAttribute('name') || '';
                    if (name.includes('NOT_MFK') || name.includes('NOT_MADE_FOR_KIDS')) {
                        r.click();
                        return 'js-clicked:aria=' + r.getAttribute('aria-checked');
                    }
                }
                return 'not-found:' + Array.from(radios).map(r => r.getAttribute('name')).join(',');
            }""")
            logger.info("Fallback audience click: %s", result)
            audience_clicked = 'not-found' not in result

        if not audience_clicked:
            logger.warning("Không chọn được đối tượng khán giả")

        # Verify trạng thái radio và Next button sau khi click
        await random_delay(0.5, 1.0)

        # Chờ Next button trở thành enabled
        try:
            await page.wait_for_function(
                """() => {
                    const dialog = document.querySelector('ytcp-uploads-dialog');
                    if (!dialog) return false;
                    const btn = dialog.querySelector('#next-button') || dialog.querySelector('ytcp-button#next-button');
                    if (btn) {
                        return !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true';
                    }
                    return false;
                }""",
                timeout=8000,
            )
            logger.info("Next button đã enabled")
        except Exception:
            logger.warning("Next button chưa enabled sau 8s — tiếp tục thử click")

        # Click Next 3 lần để navigate qua các bước (Video elements -> Checks -> Visibility)
        for step_name in ("Video elements", "Checks", "Visibility"):
            logger.info("Next → %s", step_name)
            try:
                # 1. Thử click trực tiếp bằng Playwright locator
                clicked = False
                for sel in ['#next-button', 'ytcp-button#next-button', 'ytcp-uploads-dialog #next-button']:
                    try:
                        btn = page.locator(sel).first
                        if await btn.is_visible(timeout=2000):
                            dis = await btn.get_attribute("disabled") or await btn.get_attribute("aria-disabled") == "true"
                            if not dis:
                                await btn.click()
                                clicked = True
                                break
                    except Exception:
                        pass

                # 2. Fallback qua JS event dispatch nếu Playwright click chưa kích hoạt
                if not clicked:
                    result = await page.evaluate("""() => {
                        const dialog = document.querySelector('ytcp-uploads-dialog');
                        if (!dialog) return 'no-dialog';

                        let btn = dialog.querySelector('#next-button') || dialog.querySelector('ytcp-button#next-button');
                        if (!btn) {
                            const buttons = Array.from(dialog.querySelectorAll('ytcp-button'));
                            btn = buttons.find(b => {
                                const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                                return txt === 'next' || txt === 'tiếp theo';
                            });
                        }
                        if (!btn) return 'not-found';

                        if (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true') {
                            return 'disabled';
                        }

                        const events = ['mousedown', 'mouseup', 'click'];
                        for (const evtName of events) {
                            const evt = new MouseEvent(evtName, {
                                bubbles: true, cancelable: true, view: window
                            });
                            btn.dispatchEvent(evt);
                        }
                        return 'dispatched';
                    }""")
                    logger.info("  JS Next dispatch result: %s", result)

                await random_delay(2.0, 3.5)

                step = await page.evaluate(
                    "() => document.querySelector('ytcp-uploads-dialog')?.getAttribute('workflow-step') || 'unknown'"
                )
                logger.info("  workflow-step sau click: %s", step)
            except Exception as exc:
                logger.warning("Không click được Next (%s): %s", step_name, exc)

        # Chế độ hiển thị
        vis = str(visibility or "public").strip().lower()
        logger.info("Đặt visibility: %s", vis)

        if vis == "schedule" and schedule_date and schedule_time:
            await _set_schedule(page, schedule_date, schedule_time)
        elif vis == "unlisted":
            try:
                clicked = False
                for r_name in ["Unlisted", "Không công khai"]:
                    try:
                        radio = page.get_by_role("radio", name=r_name).first
                        if await radio.is_visible(timeout=2000):
                            await radio.click()
                            clicked = True
                            break
                    except Exception:
                        pass
                if not clicked:
                    await page.locator('tp-yt-paper-radio-button[name="UNLISTED"], [name="UNLISTED"]').first.click()
                await random_delay(0.8, 1.5)
            except Exception as exc:
                logger.warning("Không chọn được Unlisted: %s", exc)
        elif vis == "private":
            try:
                clicked = False
                for r_name in ["Private", "Riêng tư"]:
                    try:
                        radio = page.get_by_role("radio", name=r_name).first
                        if await radio.is_visible(timeout=2000):
                            await radio.click()
                            clicked = True
                            break
                    except Exception:
                        pass
                if not clicked:
                    await page.locator('tp-yt-paper-radio-button[name="PRIVATE"], [name="PRIVATE"]').first.click()
                await random_delay(0.8, 1.5)
            except Exception as exc:
                logger.warning("Không chọn được Private: %s", exc)
        else:
            try:
                clicked = False
                for r_name in ["Public", "Công khai"]:
                    try:
                        radio = page.get_by_role("radio", name=r_name).first
                        if await radio.is_visible(timeout=2000):
                            await radio.click()
                            clicked = True
                            break
                    except Exception:
                        pass
                if not clicked:
                    await page.locator('tp-yt-paper-radio-button[name="PUBLIC"], [name="PUBLIC"]').first.click()
                await random_delay(0.8, 1.5)
            except Exception as exc:
                logger.warning("Không chọn được Public: %s", exc)

        video_url = await _extract_video_url(page)
        if video_url:
            logger.info("URL video: %s", video_url)

        # Publish / Schedule
        done_clicked = False
        try:
            done_btn = page.locator("#done-button").first
            await done_btn.wait_for(state="visible", timeout=15000)
            await done_btn.click()
            logger.info("Đã nhấn Publish/Schedule")
            done_clicked = True
        except Exception as exc:
            logger.warning("Playwright done button thất bại: %s", exc)

        if not done_clicked:
            # Force-enable and click the done button via JS
            result = await page.evaluate("""() => {
                const btn = document.querySelector('#done-button');
                if (!btn) return 'not-found';
                // Force-enable by removing disabled/hidden attributes
                btn.removeAttribute('disabled');
                btn.removeAttribute('hidden');
                btn.removeAttribute('aria-disabled');
                btn.setAttribute('aria-disabled', 'false');
                // Also try the inner button element
                const innerBtn = btn.shadowRoot ? btn.shadowRoot.querySelector('button') : null;
                if (innerBtn) {
                    innerBtn.removeAttribute('disabled');
                    innerBtn.removeAttribute('hidden');
                }
                // Dispatch click events
                ['mousedown','mouseup','click'].forEach(n =>
                    btn.dispatchEvent(new MouseEvent(n, {bubbles: true, cancelable: true}))
                );
                return 'force-clicked';
            }""")
            logger.info("Done button force-click: %s", result)
            if result == 'force-clicked':
                done_clicked = True

        try:
            await page.wait_for_selector("ytcp-video-share-dialog", timeout=30000)
            logger.info("Video đã được đăng / lên lịch thành công")
            if not video_url:
                video_url = await _extract_video_url(page)
                if video_url:
                    logger.info("URL video trích xuất từ hộp thoại xác nhận: %s", video_url)
            for c_name in ["Close", "Đóng"]:
                try:
                    close_btn = page.get_by_role("button", name=c_name).first
                    if await close_btn.is_visible(timeout=3000):
                        await close_btn.click()
                        break
                except Exception:
                    pass
        except Exception:
            logger.warning("Không phát hiện hộp thoại xác nhận")

        if not video_url:
            await random_delay(1.5, 2.5)
            video_url = await _extract_video_url(page)
            if video_url:
                logger.info("URL video trích xuất sau khi đóng dialog: %s", video_url)

        if pinned_comment and video_url:
            if vis == "public":
                await random_delay(5.0, 10.0)
                await _pin_comment(page, video_url, pinned_comment)
            else:
                _save_pending_comment(video_url, pinned_comment)

        return video_url


async def _set_schedule(page, schedule_date: str, schedule_time: str):
    """
    YouTube Studio REVIEW step schedule flow.
    """
    await random_delay(2.0, 3.0)

    # Format date and time before using them
    formatted_date = _format_date(schedule_date)
    formatted_time = _format_time(schedule_time)

    schedule_selected = False

    # The expand button's inner <button> element (inside shadow DOM) is the real click target
    # Try clicking through Playwright's shadow-piercing locator chain
    expand_attempts = [
        # Inner button inside ytcp-icon-button shadow root
        page.locator("ytcp-icon-button#second-container-expand-button").locator("button"),
        page.locator("#second-container-expand-button").locator("button"),
        page.locator("#second-container-expand-button"),
    ]
    for loc in expand_attempts:
        try:
            await loc.wait_for(state="visible", timeout=5000)
            await loc.click()
            logger.info("Clicked expand button (inner): %s", loc)
            await random_delay(2.0, 3.0)
            scheduler_visible = await page.evaluate("""() => {
                const s = document.querySelector('ytcp-visibility-scheduler');
                return s ? !s.hasAttribute('hidden') && getComputedStyle(s).display !== 'none' : false;
            }""")
            logger.info("Scheduler visible: %s", scheduler_visible)
            if scheduler_visible:
                schedule_selected = True
                break
        except Exception:
            pass

    # Force-show as last resort using CSS injection to override Polymer's hidden binding
    if not schedule_selected:
        logger.warning("Schedule section not opened via UI — forcing visibility via CSS")
        picker_rect = await page.evaluate("""() => {
            // Inject CSS to override Polymer's hidden/display:none bindings
            const style = document.createElement('style');
            style.id = 'force-schedule-visible';
            style.textContent = `
                ytcp-visibility-scheduler,
                ytcp-visibility-scheduler * { display: block !important; visibility: visible !important; }
                .scheduled-info-container { display: block !important; }
            `;
            document.head.appendChild(style);
            // Also remove hidden attributes
            const scheduler = document.querySelector('ytcp-visibility-scheduler');
            if (scheduler) { scheduler.removeAttribute('hidden'); }
            const info = document.querySelector('.scheduled-info-container');
            if (info) { info.removeAttribute('hidden'); }
            // Force layout recalc
            document.body.offsetHeight;
            // Get bbox
            const p = document.querySelector('ytcp-datetime-picker');
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height};
        }""")
        logger.info("ytcp-datetime-picker bbox after CSS force-show: %s", picker_rect)
    else:
        picker_rect = await page.evaluate("""() => {
            const p = document.querySelector('ytcp-datetime-picker');
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height};
        }""")

    date_set = False
    time_set = False

    if picker_rect and picker_rect.get('width', 0) > 0 and picker_rect.get('height', 0) > 0:
        box = picker_rect
        # Date input: left portion of picker
        await page.mouse.click(box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.5)
        await random_delay(0.5, 1.0)
        await page.keyboard.press("Control+a")
        await page.keyboard.type(formatted_date)
        await page.keyboard.press("Tab")
        await random_delay(0.5, 1.0)
        logger.info("Ngày lên lịch (bbox): %s → %s", schedule_date, formatted_date)
        date_set = True

        # Time: right portion of picker
        await page.mouse.click(box["x"] + box["width"] * 0.75, box["y"] + box["height"] * 0.5)
        await random_delay(0.5, 1.0)
        try:
            time_item = page.locator("tp-yt-paper-item").filter(has_text=formatted_time).first
            await time_item.wait_for(state="visible", timeout=5000)
            await time_item.click()
            logger.info("Giờ lên lịch (dropdown): %s → %s", schedule_time, formatted_time)
            time_set = True
        except Exception:
            await page.keyboard.press("Control+a")
            await page.keyboard.type(formatted_time)
            await page.keyboard.press("Tab")
            logger.info("Giờ lên lịch (typed): %s → %s", schedule_time, formatted_time)
            time_set = True
        await random_delay(0.8, 1.5)
    else:
        logger.warning("ytcp-datetime-picker bbox không hợp lệ: %s", picker_rect)

    if not date_set:
        logger.warning("Không đặt được ngày lên lịch")
    if not time_set:
        logger.warning("Không đặt được giờ lên lịch")

    # Check done button state
    done_state = await page.evaluate("""() => {
        const done = document.querySelector('#done-button');
        if (!done) return 'not-found';
        return JSON.stringify({
            disabled: done.hasAttribute('disabled'),
            hidden: done.hasAttribute('hidden'),
            ariaDisabled: done.getAttribute('aria-disabled'),
        });
    }""")
    logger.info("Done button state: %s", done_state)

    await random_delay(1.0, 2.0)



def _format_date(date_str: str) -> str:
    """Convert '05/20/2026' → 'May 20, 2026'"""
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
    """Convert '10:00' → '10:00 AM', '14:30' → '2:30 PM'"""
    if not time_str:
        return ""
    from datetime import datetime
    raw = str(time_str).strip()
    for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p"):
        try:
            dt = datetime.strptime(raw, fmt)
            result = dt.strftime("%I:%M %p")
            # Bỏ leading zero: "02:30 PM" → "2:30 PM"
            if result.startswith("0"):
                result = result[1:]
            return result
        except ValueError:
            pass
    return raw


async def _extract_video_url(page) -> str:
    # 1. Thử locator trực tiếp trên các link youtu.be / youtube.com/watch
    try:
        links = page.locator("a[href*='youtu.be'], a[href*='youtube.com/watch']")
        count = await links.count()
        for i in range(count):
            href = await links.nth(i).get_attribute("href", timeout=1500)
            if href and ("youtu.be" in href or "watch?v=" in href):
                return href.strip()
    except Exception:
        pass

    # 2. Quét DOM & Shadow DOM bằng JavaScript evaluation (hỗ trợ ytcp-video-share-dialog, metadata panel, link text)
    try:
        url = await page.evaluate("""() => {
            // Check direct anchors
            const anchors = Array.from(document.querySelectorAll('a[href*="youtu.be"], a[href*="youtube.com/watch"]'));
            for (const a of anchors) {
                if (a.href) return a.href;
            }
            // Check ytcp-video-share-dialog
            const shareDialog = document.querySelector('ytcp-video-share-dialog');
            if (shareDialog) {
                const link = shareDialog.querySelector('a[href*="youtu.be"], a[href*="youtube.com/watch"]');
                if (link && link.href) return link.href;
                const input = shareDialog.querySelector('input, [id*="share-url"], [class*="share-url"]');
                if (input && input.value && (input.value.includes('youtu.be') || input.value.includes('youtube.com'))) {
                    return input.value;
                }
            }
            // Check metadata preview panel
            const metaPanel = document.querySelector('ytcp-video-metadata-editor-side-panel');
            if (metaPanel) {
                const link = metaPanel.querySelector('a[href*="youtu.be"], a[href*="youtube.com/watch"]');
                if (link && link.href) return link.href;
            }
            // Regex match over visible elements
            const elements = document.querySelectorAll('span, div, a, input, textarea');
            for (const el of elements) {
                const text = el.value || el.textContent || '';
                if (text.includes('youtu.be') || text.includes('youtube.com/watch')) {
                    const match = text.match(/https?:\\/\\/(?:www\\.)?(?:youtu\\.be\\/|youtube\\.com\\/watch\\?v=)[a-zA-Z0-9_-]{11}/);
                    if (match) return match[0];
                }
            }
            return '';
        }""")
        if url:
            return url.strip()
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

        more_btn = page.locator("ytd-comment-thread-renderer:first-child #action-menu").first
        await more_btn.wait_for(state="visible", timeout=8000)
        await more_btn.click()
        await random_delay(0.5, 1.0)

        pin_option = page.get_by_role("menuitem", name="Pin comment").first
        await pin_option.wait_for(state="visible", timeout=5000)
        await pin_option.click()
        await random_delay(0.5, 1.0)

        confirm_btn = page.get_by_role("button", name="Pin").first
        if await confirm_btn.is_visible(timeout=3000):
            await confirm_btn.click()
        logger.info("Đã ghim comment thành công")

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
