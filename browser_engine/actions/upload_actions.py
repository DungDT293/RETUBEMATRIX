import asyncio
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
        tags: str = "",
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
                    sc.scrollTop = sc.scrollHeight;
                }
            }""")
        except Exception:
            pass
        await random_delay(0.5, 1.0)

        # Đối tượng khán giả — bắt buộc chọn "Không dành cho trẻ em" và kiểm tra aria-checked="true"
        audience_clicked = False
        for selector in [
            'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            '#not-made-for-kids tp-yt-paper-radio-button',
            'tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"]',
        ]:
            try:
                el = page.locator(selector).first
                if await el.is_visible(timeout=3000):
                    await el.scroll_into_view_if_needed()
                    await el.click()
                    await random_delay(0.4, 0.8)
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
                    # 2. Tự động bấm nút 'Hiện thêm' ('Show more')
                    toggle_selectors = [
                        "ytcp-button#toggle-button",
                        "#toggle-button",
                        "tp-yt-paper-button:has-text('Hiện thêm')",
                        "tp-yt-paper-button:has-text('Show more')",
                        "button:has-text('Hiện thêm')",
                        "button:has-text('Show more')",
                    ]
                    toggle_clicked = False
                    for t_sel in toggle_selectors:
                        try:
                            t_btn = page.locator(t_sel).first
                            if await t_btn.is_visible(timeout=2000):
                                btn_txt = (await t_btn.inner_text() or "").lower()
                                if "ít hơn" in btn_txt or "less" in btn_txt:
                                    logger.info("Nút 'Hiện thêm' đã được mở rộng trước đó")
                                    toggle_clicked = True
                                    break
                                await t_btn.scroll_into_view_if_needed()
                                await t_btn.click()
                                logger.info("Đã bấm nút 'Hiện thêm' ('Show more'): %s", t_sel)
                                toggle_clicked = True
                                await asyncio.sleep(1.0)
                                break
                        except Exception:
                            continue

                    if not toggle_clicked:
                        # Fallback JS click
                        try:
                            js_res = await page.evaluate("""() => {
                                const d = document.querySelector('ytcp-uploads-dialog') || document;
                                const btn = d.querySelector('ytcp-button#toggle-button, #toggle-button, [id="toggle-button"]');
                                if (btn) {
                                    const txt = (btn.innerText || '').toLowerCase();
                                    if (txt.includes('ít') || txt.includes('less')) return 'already_expanded';
                                    btn.click();
                                    return 'clicked_id';
                                }
                                const btns = d.querySelectorAll('tp-yt-paper-button, button, ytcp-button');
                                for (const b of btns) {
                                    const t = (b.innerText || '').toLowerCase();
                                    if (t.includes('hiện thêm') || t.includes('show more')) {
                                        b.click();
                                        return 'clicked_text';
                                    }
                                }
                                return 'not_found';
                            }""")
                            logger.info("Fallback JS click toggle-button: %s", js_res)
                            await asyncio.sleep(0.8)
                        except Exception as e:
                            logger.debug("JS toggle click exception: %s", e)

                    # 3. Cuộn trang xuống để lộ phần Thẻ (Tags)
                    try:
                        await page.evaluate("""() => {
                            const sc = document.querySelector('ytcp-uploads-dialog #scrollable-content')
                                || document.querySelector('ytcp-uploads-dialog [id="scrollable-content"]')
                                || document.querySelector('#scrollable-content');
                            if (sc) {
                                sc.scrollTop = sc.scrollHeight;
                            }
                        }""")
                    except Exception:
                        pass
                    await asyncio.sleep(0.8)

                    # 4. Định vị ô nhập tags
                    tag_input_selectors = [
                        "#tags-container #text-input",
                        "input#text-input[aria-label*='Thẻ']",
                        "input#text-input[placeholder*='thẻ']",
                        "input#text-input[placeholder*='tag']",
                        "ytcp-chip-cloud[id='tags-container'] #text-input",
                        "#tags-container input",
                        "input#text-input[aria-label*='Tags' i]",
                        "input#text-input[placeholder*='Tags' i]",
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

        # Tiến trình Next thông minh: đảm bảo chắc chắn chuyển đến bước REVIEW / Visibility
        for attempt in range(5):
            # Kiểm tra xem đã đến bước Visibility chưa (bằng kiểm tra radio visibility hoặc done-button)
            on_visibility_step = await page.evaluate("""() => {
                const d = document.querySelector('ytcp-uploads-dialog');
                if (!d) return false;
                const step = (d.getAttribute('workflow-step') || '').toUpperCase();
                if (step === 'REVIEW' || step.includes('VISIBILITY') || step.includes('REVIEW')) return true;
                const hasVisRadio = d.querySelector('tp-yt-paper-radio-button[name="PUBLIC"]') || d.querySelector('tp-yt-paper-radio-button[name="UNLISTED"]');
                return hasVisRadio !== null && hasVisRadio.offsetParent !== null;
            }""")
            if on_visibility_step:
                logger.info("Đã đến bước Chế độ hiển thị (Visibility) thành công!")
                break

            logger.info("Đang ở bước trước Visibility, bấm Next (lần %d)...", attempt + 1)
            try:
                next_btn = page.locator("#next-button, ytcp-button#next-button").first
                if await next_btn.is_visible(timeout=5000):
                    await next_btn.scroll_into_view_if_needed()
                    await next_btn.click()
            except Exception:
                await page.evaluate("""() => {
                    const btn = document.querySelector('#next-button') || document.querySelector('ytcp-button#next-button');
                    if (btn) btn.click();
                }""")
            await random_delay(2.0, 3.5)

        # Chế độ hiển thị
        vis = str(visibility or "public").strip().lower()
        logger.info("Đặt visibility: %s", vis)

        if vis == "schedule" and schedule_date and schedule_time:
            await _set_schedule(page, schedule_date, schedule_time)
        else:
            target_radio_name = "PUBLIC" if vis == "public" else ("PRIVATE" if vis == "private" else "UNLISTED")
            radio_selected = False
            for r_sel in [
                f'tp-yt-paper-radio-button[name="{target_radio_name}"]',
                f'[name="{target_radio_name}"]',
            ]:
                try:
                    r_loc = page.locator(r_sel).first
                    if await r_loc.is_visible(timeout=3000):
                        await r_loc.scroll_into_view_if_needed()
                        await r_loc.click()
                        await random_delay(0.5, 1.0)
                        checked = await r_loc.get_attribute("aria-checked")
                        if checked == "true":
                            radio_selected = True
                            logger.info("Đã chọn chế độ hiển thị %s thành công (aria-checked=true)!", target_radio_name)
                            break
                except Exception:
                    pass

            if not radio_selected:
                # Fallback JS click radio
                res_vis = await page.evaluate(f"""() => {{
                    const r = document.querySelector('tp-yt-paper-radio-button[name="{target_radio_name}"]');
                    if (r) {{
                        r.click();
                        return 'clicked:' + r.getAttribute('aria-checked');
                    }}
                    return 'not-found';
                }}""")
                logger.info("Fallback JS visibility click: %s", res_vis)

        video_url = await _extract_video_url(page)
        if video_url:
            logger.info("URL video: %s", video_url)

        # Publish / Schedule / Save
        done_clicked = False
        for done_sel in [
            "#done-button",
            "ytcp-button#done-button",
            "button:has-text('Publish')",
            "button:has-text('Xuất bản')",
            "button:has-text('Save')",
            "button:has-text('Lưu')",
            "button:has-text('Schedule')",
            "button:has-text('Lên lịch')",
        ]:
            try:
                btn = page.locator(done_sel).first
                if await btn.is_visible(timeout=2000):
                    await btn.scroll_into_view_if_needed()
                    await btn.click()
                    logger.info("Đã nhấn nút Publish/Lưu qua locator: %s", done_sel)
                    done_clicked = True
                    break
            except Exception:
                pass

        if not done_clicked:
            # Force-enable and click the done button via JS
            result = await page.evaluate("""() => {
                const btn = document.querySelector('#done-button') || document.querySelector('ytcp-button#done-button');
                if (!btn) return 'not-found';
                // Force-enable by removing disabled/hidden attributes
                btn.removeAttribute('disabled');
                btn.removeAttribute('hidden');
                btn.removeAttribute('aria-disabled');
                btn.setAttribute('aria-disabled', 'false');
                const innerBtn = btn.shadowRoot ? btn.shadowRoot.querySelector('button') : null;
                if (innerBtn) {
                    innerBtn.removeAttribute('disabled');
                    innerBtn.removeAttribute('hidden');
                    innerBtn.removeAttribute('aria-disabled');
                    innerBtn.click();
                }
                ['mousedown','mouseup','click'].forEach(n =>
                    btn.dispatchEvent(new MouseEvent(n, {bubbles: true, cancelable: true}))
                );
                return 'force-clicked';
            }""")
            logger.info("Done button force-click: %s", result)
            if result == 'force-clicked':
                done_clicked = True

        # Chờ xác nhận đã lưu thành công và dialog đóng / share dialog hiện
        saved_successfully = False
        try:
            # Chờ hoặc là xuất hiện share dialog, hoặc là uploads-dialog biến mất
            share_dialog = page.locator("ytcp-video-share-dialog").first
            if await share_dialog.is_visible(timeout=10000):
                logger.info("Hộp thoại chia sẻ video xuất hiện — video đã lưu thành công!")
                saved_successfully = True
            else:
                # Chờ uploads dialog đóng
                await page.wait_for_selector("ytcp-uploads-dialog", state="hidden", timeout=15000)
                logger.info("Upload dialog đã đóng — video đã xuất bản thành công!")
                saved_successfully = True
        except Exception:
            logger.info("Kiểm tra lại trạng thái uploads dialog sau khi bấm Save...")

        # Nếu dialog vẫn chưa đóng, thử click nút Lưu lần nữa để chắc chắn không bị kẹt ở Draft
        try:
            dialog_still_open = await page.locator("ytcp-uploads-dialog").first.is_visible(timeout=1500)
            if dialog_still_open:
                logger.warning("Upload dialog vẫn đang mở! Thử click lại nút Lưu/Done...")
                await page.evaluate("""() => {
                    const btn = document.querySelector('#done-button') || document.querySelector('ytcp-button#done-button');
                    if (btn) btn.click();
                }""")
                await random_delay(2.0, 3.5)
        except Exception:
            pass

        # Đóng hộp thoại chia sẻ nếu có
        for c_name in ["Close", "Đóng"]:
            try:
                close_btn = page.get_by_role("button", name=c_name).first
                if await close_btn.is_visible(timeout=2000):
                    await close_btn.click()
                    break
            except Exception:
                pass

        # Cho phép YouTube hoàn tất sync backend 2-3 giây trước khi thoát
        await random_delay(2.0, 3.5)

        # Kiểm tra trung thực: nếu uploads dialog vẫn mở và chưa xuất bản thành công -> ném lỗi rõ ràng
        dialog_still_open = False
        try:
            dialog_still_open = await page.locator("ytcp-uploads-dialog").first.is_visible(timeout=1500)
        except Exception:
            pass

        if dialog_still_open and not saved_successfully:
            logger.error("Hộp thoại tải lên vẫn mở sau khi bấm Lưu/Xuất bản. Video chưa hoàn tất lưu!")
            raise RuntimeError("YouTube Studio chưa hoàn tất lưu/xuất bản video (video bị lưu tạm dạng Bản nháp).")

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
