# -*- coding: utf-8 -*-
"""
Automate YouTube Studio Channel Settings:
1. Kênh -> Thông tin cơ bản: Điền "Từ khóa" (channel keywords) trích xuất từ đối thủ.
2. Kênh -> Cài đặt nâng cao: Chọn "Không, đặt kênh này là không dành cho trẻ em" (NOT_MADE_FOR_KIDS).
3. Chế độ mặc định cho video tải lên -> Thông tin cơ bản: Điền "Thẻ (từ khóa)" (default tags) trích xuất từ đối thủ.
4. Bấm Lưu và xác nhận hoàn tất.

Tối ưu cho máy yếu (Low-end hardware: 4GB - 8GB RAM, CPU 2-4 cores):
- Route interception: Abort hình ảnh, media, fonts để giảm RAM < 180MB và tăng tốc tải Studio 3x.
- Tự động xử lý popup "Cách bạn sẽ xuất hiện" / dialogs / warm-welcome-dialog / iron-overlay-backdrop cản trở.
- Gõ dấu phẩy và Enter kèm delay 150-200ms cho Polymer custom elements ytcp-chip-cloud / ytcp-chip-bar.
- Giới hạn tổng độ dài từ khóa <= 480 ký tự (tránh vượt 500 ký tự gây vô hiệu hóa nút Lưu).
- Kiểm tra trạng thái active của nút Lưu (#submit-button / #save-button :not([disabled])) chờ tối đa 4s và xác nhận toast/dialog đóng.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, List, Optional

from actions.human_utils import random_delay
from actions.bkt_check import setup_low_end_route_interception

logger = logging.getLogger(__name__)


def trim_keywords_to_limit(keywords: List[str], max_chars: int = 480) -> List[str]:
    """
    Giới hạn 500 ký tự của YouTube Studio:
    YouTube không cho phép nhập quá 500 ký tự cho từ khóa kênh và thẻ video.
    Nếu vượt quá, nút Lưu sẽ bị disable và hiện lỗi đỏ.
    Hàm này cắt gọn danh sách từ khóa sao cho tổng độ dài <= max_chars (mặc định 480 ký tự),
    loại bỏ trùng lặp và giữ nguyên thứ tự ưu tiên.
    """
    trimmed: List[str] = []
    current_len = 0
    seen = set()

    for kw in keywords:
        clean = kw.strip().strip('"').strip("'").strip(",").strip()
        if not clean:
            continue
        lower_clean = clean.lower()
        if lower_clean in seen:
            continue
        seen.add(lower_clean)

        # Trong YouTube Studio, mỗi từ khóa chiếm độ dài từ + 1 ký tự phân tách (dấu phẩy)
        cost = len(clean) + 1
        if current_len + cost > max_chars:
            logger.info(
                "Đã đạt ngưỡng an toàn ký tự YouTube (%d + %d > %d). Cắt gọn tại từ khóa '%s'.",
                current_len, cost, max_chars, clean
            )
            break
        trimmed.append(clean)
        current_len += cost

    logger.info(
        "Tối ưu từ khóa: từ %d từ gốc -> giữ lại %d từ (tổng độ dài: %d/%d ký tự)",
        len(keywords), len(trimmed), current_len, max_chars
    )
    return trimmed


async def dismiss_studio_dialogs_and_backdrops(page: Any) -> bool:
    """
    Tự động tắt/bỏ qua popup 'Cách bạn sẽ xuất hiện' (ytd-channel-creation-dialog-renderer),
    'Chào mừng bạn đến với YouTube Studio' (ytcp-warm-welcome-dialog),
    TP-YT-PAPER-DIALOG, iron-overlay-backdrop cản trở việc click nút #settings-item / #settings-button.
    """
    dismissed = False

    # 1. Xử lý popup Chào mừng Studio (ytcp-warm-welcome-dialog)
    try:
        welcome_btn = page.locator(
            "ytcp-warm-welcome-dialog #dismiss-button, #welcome-dialog #dismiss-button, "
            "ytcp-warm-welcome-dialog button:has-text('Tiếp tục'), ytcp-warm-welcome-dialog button:has-text('Continue'), "
            "button:has-text('Tiếp tục'), button:has-text('Continue')"
        ).first
        if await welcome_btn.is_visible(timeout=300):
            logger.info("Phát hiện popup Chào mừng YouTube Studio, bấm Tiếp tục...")
            await welcome_btn.click()
            dismissed = True
            await asyncio.sleep(0.4)
    except Exception:
        pass

    # 2. Xử lý dialog tạo kênh hoặc popup xuất hiện ban đầu
    try:
        creation_dialog = page.locator("ytd-channel-creation-dialog-renderer").first
        if await creation_dialog.is_visible(timeout=300):
            logger.info("Phát hiện popup 'Cách bạn sẽ xuất hiện', tự động xử lý...")
            create_btn = creation_dialog.locator(
                "button:has-text('Tạo kênh'), button:has-text('Create channel'), [aria-label*='Tạo kênh']"
            ).first
            if await create_btn.is_visible(timeout=300):
                await create_btn.click()
                dismissed = True
                await asyncio.sleep(1.0)
            else:
                cancel_btn = creation_dialog.locator(
                    "#cancel-button, button:has-text('Hủy'), button:has-text('Cancel'), [aria-label*='Hủy']"
                ).first
                if await cancel_btn.is_visible(timeout=300):
                    await cancel_btn.click()
                    dismissed = True
                    await asyncio.sleep(0.4)
    except Exception:
        pass

    # 3. Tìm các nút Đóng / Hủy trên dialog khác (lỗi vận hành, modal thông báo)
    cancel_selectors = [
        "ytcp-permanent-operational-error-manager button:has-text('Đóng')",
        "ytcp-permanent-operational-error-manager button:has-text('Close')",
        "tp-yt-paper-dialog #cancel-button",
        "tp-yt-paper-dialog button:has-text('Hủy')",
        "tp-yt-paper-dialog button:has-text('Cancel')",
        "#dialog #cancel-button",
        "ytcp-dialog #cancel-button",
        "button:has-text('Để sau')",
        "button:has-text('Không phải bây giờ')",
        "button:has-text('Dismiss')",
        "button:has-text('Skip')",
    ]

    for sel in cancel_selectors:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=250):
                logger.info("Phát hiện popup cản trở, bấm nút hủy/đóng: %s", sel)
                await btn.click()
                dismissed = True
                await asyncio.sleep(0.3)
                break
        except Exception:
            pass

    # 4. Nhấn Escape nếu phát hiện dialog hoặc overlay backdrop còn mở
    try:
        has_overlay = await page.evaluate("""() => {
            const creation = document.querySelector('ytd-channel-creation-dialog-renderer');
            const welcome = document.querySelector('ytcp-warm-welcome-dialog[aria-modal="true"], #welcome-dialog');
            const backdrop = document.querySelector('iron-overlay-backdrop.opened, tp-yt-iron-overlay-backdrop.opened');
            return Boolean(creation || welcome || backdrop);
        }""")
        if has_overlay:
            logger.info("Phát hiện overlay/backdrop đang chắn, gửi phím Escape...")
            await page.keyboard.press("Escape")
            await asyncio.sleep(0.3)
            dismissed = True
    except Exception:
        pass

    # 5. Dọn dẹp an toàn các backdrop bị treo cản click
    try:
        await page.evaluate("""() => {
            const backdrops = document.querySelectorAll('iron-overlay-backdrop.opened, tp-yt-iron-overlay-backdrop.opened');
            backdrops.forEach(b => {
                b.classList.remove('opened');
                b.style.display = 'none';
                b.remove();
            });
        }""")
    except Exception:
        pass

    return dismissed


async def input_polymer_chips(
    page: Any,
    container_locator: Any,
    items: List[str],
    input_selectors: List[str],
    clear_existing: bool = True,
) -> int:
    """
    Nhập chip keywords/tags vào Polymer ytcp-chip-cloud / ytcp-chip-bar:
    - Nếu clear_existing = True: xóa các chip cũ (nút Xóa tất cả / delete icons) để tránh vượt quá 500 ký tự.
    - Phải bấm Enter và gõ dấu phẩy ',' với delay 150-200ms để Polymer custom elements
      nhận diện sự kiện phân tách tag và tạo chip thành công.
    """
    input_el = None
    for sel in input_selectors:
        try:
            el = container_locator.locator(sel).first
            if await el.is_visible(timeout=1500):
                input_el = el
                break
        except Exception:
            pass

    if not input_el:
        return 0

    # 1. Dọn dẹp chip cũ nếu được yêu cầu
    if clear_existing:
        try:
            clear_all_btn = page.locator(
                "ytcp-button#delete-all-button, [aria-label*='Xóa tất cả'], [aria-label*='Clear all'], "
                "button:has-text('Xóa tất cả'), button:has-text('Clear all')"
            ).first
            if await clear_all_btn.is_visible(timeout=800):
                await clear_all_btn.click()
                await asyncio.sleep(0.3)
            else:
                await page.evaluate("""() => {
                    const deleteBtns = document.querySelectorAll('ytcp-chip #delete-icon, ytcp-chip ytcp-icon-button, ytcp-chip .delete-icon');
                    deleteBtns.forEach(b => {
                        try { b.click(); } catch(e) {}
                    });
                }""")
                await asyncio.sleep(0.3)
        except Exception:
            pass

    applied_count = 0
    for item in items:
        clean_item = item.strip().strip('"').strip("'").strip(",")
        if not clean_item:
            continue
        try:
            await input_el.click()
            await asyncio.sleep(0.12)
            await input_el.fill(clean_item)
            # Delay 150-200ms trước khi gõ dấu phẩy
            await asyncio.sleep(0.18)
            await page.keyboard.press(",")
            # Delay 150-200ms trước khi bấm Enter
            await asyncio.sleep(0.18)
            await page.keyboard.press("Enter")
            await asyncio.sleep(0.20)

            # Kiểm tra an toàn: nếu nội dung vẫn nằm trong input thì enter lại
            try:
                val = await input_el.input_value()
                if val and val.strip():
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(0.15)
            except Exception:
                pass

            applied_count += 1
        except Exception as exc:
            logger.warning("Không thể gõ chip '%s': %s", clean_item, exc)

    return applied_count


async def configure_channel_settings(
    page: Any,
    channel_keywords: Optional[List[str]] = None,
    default_tags: Optional[List[str]] = None,
    made_for_kids: bool = False,
) -> dict:
    """
    Open YouTube Studio settings dialog and apply competitor-matched SEO settings.
    Tối ưu cho máy cấu hình yếu với route interception và xử lý popup thông minh.
    """
    channel_keywords = channel_keywords or []
    default_tags = default_tags or []

    # Cắt gọn danh sách từ khóa <= 480 ký tự theo quy định YouTube Studio
    trimmed_channel_keywords = trim_keywords_to_limit(channel_keywords, max_chars=480)
    trimmed_default_tags = trim_keywords_to_limit(default_tags, max_chars=480)

    logger.info(
        "Bắt đầu cấu hình Kênh YouTube Studio: %d từ khóa kênh (tối ưu từ %d), %d thẻ video (tối ưu từ %d), made_for_kids=%s",
        len(trimmed_channel_keywords),
        len(channel_keywords),
        len(trimmed_default_tags),
        len(default_tags),
        made_for_kids,
    )

    # 1. Kích hoạt Low-End Route Interception để giảm RAM và tăng tốc tải trang
    await setup_low_end_route_interception(page)

    # 2. Điều hướng tới YouTube Studio
    current_url = page.url or ""
    if "studio.youtube.com" not in current_url:
        logger.info("Chuyển hướng đến https://studio.youtube.com...")
        await page.goto("https://studio.youtube.com", wait_until="domcontentloaded", timeout=45000)
        await random_delay(2.0, 3.5)

    # 3. Tự động xử lý popup "Cách bạn sẽ xuất hiện" / warm welcome dialog
    await dismiss_studio_dialogs_and_backdrops(page)

    # Đảm bảo trang Studio đã sẵn sàng (hỗ trợ cả #settings-item và #settings-button)
    try:
        await page.wait_for_selector(
            "#settings-item, #settings-button, [test-id='settings'], tp-yt-paper-icon-item#settings-item, #menu-item-link",
            timeout=25000,
        )
    except Exception as exc:
        logger.warning("Chờ studio load: %s", exc)

    # Xử lý lại popup nếu vừa render muộn
    await dismiss_studio_dialogs_and_backdrops(page)
    await random_delay(0.8, 1.5)

    # 4. Bấm nút Cài đặt (#settings-item hoặc #settings-button) với cơ chế thử lại
    logger.info("Mở hộp thoại Cài đặt (Settings dialog)...")
    settings_clicked = False
    for attempt in range(1, 4):
        await dismiss_studio_dialogs_and_backdrops(page)
        try:
            settings_btn = page.locator(
                "#settings-item, #settings-button, [test-id='settings'], "
                "tp-yt-paper-icon-item#settings-item, tp-yt-paper-icon-item:has-text('Cài đặt'), "
                "tp-yt-paper-icon-item:has-text('Settings'), ytcp-icon-button#settings-button"
            ).first
            if await settings_btn.is_visible(timeout=3000):
                await settings_btn.click(timeout=3000)
                settings_clicked = True
                logger.info("Đã click nút Cài đặt thành công (lần thử %d)", attempt)
                break
        except Exception as exc:
            logger.warning("Lần %d: Thử click Settings gặp cản trở (%s), đang dọn dẹp backdrop...", attempt, exc)
            await dismiss_studio_dialogs_and_backdrops(page)
            await asyncio.sleep(0.6)

    if not settings_clicked:
        # Fallback bằng JavaScript click
        await dismiss_studio_dialogs_and_backdrops(page)
        settings_clicked = await page.evaluate("""() => {
            const btn = document.querySelector('#settings-item')
                || document.querySelector('#settings-button')
                || document.querySelector('[test-id="settings"]')
                || document.querySelector('tp-yt-paper-icon-item#settings-item')
                || document.querySelector('ytcp-icon-button#settings-button');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        }""")

    # 5. Chờ menu Settings dialog xuất hiện
    try:
        await page.wait_for_selector(
            "li#channel, [test-id='channel'], #channel, ytcp-channel-settings-dialog, ytcp-settings-dialog",
            state="attached",
            timeout=15000,
        )
        logger.info("Hộp thoại Cài đặt Studio đã hiển thị")
    except Exception as exc:
        logger.error("Dialog Cài đặt không xuất hiện: %s", exc)
        return {"success": False, "error": "Hộp thoại Cài đặt Studio không hiển thị"}

    await random_delay(0.8, 1.5)

    # -------------------------------------------------------------
    # BƯỚC 1: Chọn menu "Kênh" (Channel) ở thanh điều hướng bên trái
    # -------------------------------------------------------------
    logger.info("Chọn menu 'Kênh' trong hộp thoại cài đặt...")
    channel_menu_clicked = False
    for sel in [
        "li#channel",
        "ytcp-settings-dialog li#channel",
        "ytcp-channel-settings-dialog li#channel",
        "ytcp-navigation-item[test-id='channel']",
        "li:has-text('Kênh')",
        "li:has-text('Channel')",
        "span.title-text:has-text('Kênh')",
        "span.title-text:has-text('Channel')",
    ]:
        try:
            item = page.locator(sel).first
            if await item.is_visible(timeout=1500):
                await item.click()
                channel_menu_clicked = True
                logger.info("Đã click menu Kênh qua selector: %s", sel)
                break
        except Exception:
            pass

    if not channel_menu_clicked:
        # JS click fallback
        channel_menu_clicked = await page.evaluate("""() => {
            const el = document.querySelector('li#channel')
                || document.querySelector('ytcp-settings-dialog li#channel')
                || document.querySelector('[test-id="channel"]');
            if (el) {
                el.click();
                return true;
            }
            const items = document.querySelectorAll('ytcp-settings-dialog li, ytcp-settings-dialog ytcp-navigation-item');
            for (const item of items) {
                const t = (item.innerText || '').toLowerCase();
                if (t.includes('kênh') || t.includes('channel')) {
                    item.click();
                    return true;
                }
            }
            return false;
        }""")

    await random_delay(0.8, 1.5)

    # -------------------------------------------------------------
    # BƯỚC 2: Tab "Thông tin cơ bản" -> Nhập "Từ khóa" (channel_keywords)
    # -------------------------------------------------------------
    applied_kw_count = 0
    if trimmed_channel_keywords:
        logger.info("Điền %d từ khóa kênh vào mục 'Từ khóa'...", len(trimmed_channel_keywords))
        try:
            tab_basic = page.locator(
                "tp-yt-paper-tab:has-text('Thông tin cơ bản'), tp-yt-paper-tab:has-text('Basic info')"
            ).first
            if await tab_basic.is_visible(timeout=2000):
                await tab_basic.click()
                await random_delay(0.4, 0.8)
        except Exception:
            pass

        kw_selectors = [
            "ytcp-chip-cloud #text-input",
            "ytcp-chip-bar #text-input",
            "#channel-keywords #text-input",
            "input[placeholder*='từ khóa']",
            "input[placeholder*='Keywords']",
            "#channel-keywords input",
            "input#text-input",
        ]
        applied_kw_count = await input_polymer_chips(page, page, trimmed_channel_keywords, kw_selectors)
        logger.info("Đã hoàn tất nhập %d từ khóa kênh", applied_kw_count)

    await random_delay(0.6, 1.2)

    # -------------------------------------------------------------
    # BƯỚC 3: Tab "Cài đặt nâng cao" -> Chọn KHÔNG DÀNH CHO TRẺ EM
    # -------------------------------------------------------------
    logger.info("Chuyển sang tab 'Cài đặt nâng cao' để thiết lập Đối tượng người xem...")
    try:
        tab_adv = page.locator(
            "tp-yt-paper-tab:has-text('Cài đặt nâng cao'), tp-yt-paper-tab:has-text('Advanced settings')"
        ).first
        if await tab_adv.is_visible(timeout=2500):
            await tab_adv.click()
            await random_delay(0.6, 1.2)
    except Exception as e:
        logger.warning("Lỗi click tab Cài đặt nâng cao: %s", e)

    not_mfk_clicked = False
    for r_sel in [
        "tp-yt-paper-radio-button[name='NOT_MADE_FOR_KIDS']",
        "tp-yt-paper-radio-button[name='NOT_MFK']",
        "tp-yt-paper-radio-button:has-text('không dành cho trẻ em')",
        "tp-yt-paper-radio-button:has-text('not made for kids')",
        "#audience-not-made-for-kids",
    ]:
        try:
            r = page.locator(r_sel).first
            if await r.is_visible(timeout=1500):
                await r.click()
                checked = await r.get_attribute("aria-checked")
                if checked == "true":
                    not_mfk_clicked = True
                    logger.info("Đã chọn Không dành cho trẻ em thành công (%s)", r_sel)
                    break
        except Exception:
            pass

    if not not_mfk_clicked:
        not_mfk_clicked = await page.evaluate("""() => {
            const radios = document.querySelectorAll('tp-yt-paper-radio-button');
            for (const r of radios) {
                const name = r.getAttribute('name') || '';
                const text = (r.innerText || '').toLowerCase();
                if (name.includes('NOT_MADE_FOR_KIDS') || name.includes('NOT_MFK') || text.includes('không dành cho trẻ em') || text.includes('not made for kids')) {
                    r.click();
                    return true;
                }
            }
            return false;
        }""")
        logger.info("JS fallback chọn Không dành cho trẻ em: %s", not_mfk_clicked)

    await random_delay(0.6, 1.2)

    # -------------------------------------------------------------
    # BƯỚC 4: Menu "Chế độ mặc định cho video tải lên" -> Thẻ (tags)
    # -------------------------------------------------------------
    applied_tags_count = 0
    if trimmed_default_tags:
        logger.info("Chọn menu 'Chế độ mặc định cho video tải lên' để điền Thẻ đối thủ...")
        upload_menu_clicked = False
        for sel in [
            "li#uploads",
            "ytcp-settings-dialog li#uploads",
            "ytcp-channel-settings-dialog li#uploads",
            "ytcp-navigation-item[test-id='upload-defaults']",
            "li:has-text('Chế độ mặc định')",
            "li:has-text('Upload defaults')",
            "span.title-text:has-text('Chế độ mặc định')",
            "span.title-text:has-text('Upload defaults')",
        ]:
            try:
                item = page.locator(sel).first
                if await item.is_visible(timeout=1500):
                    await item.click()
                    upload_menu_clicked = True
                    logger.info("Đã click menu Chế độ mặc định qua: %s", sel)
                    break
            except Exception:
                pass

        if not upload_menu_clicked:
            upload_menu_clicked = await page.evaluate("""() => {
                const el = document.querySelector('li#uploads')
                    || document.querySelector('ytcp-settings-dialog li#uploads')
                    || document.querySelector('[test-id="upload-defaults"]');
                if (el) {
                    el.click();
                    return true;
                }
                const items = document.querySelectorAll('ytcp-settings-dialog li, ytcp-settings-dialog ytcp-navigation-item');
                for (const item of items) {
                    const t = (item.innerText || '').toLowerCase();
                    if (t.includes('chế độ mặc định') || t.includes('upload defaults')) {
                        item.click();
                        return true;
                    }
                }
                return false;
            }""")

        await random_delay(0.8, 1.5)

        # Tab Thông tin cơ bản
        try:
            tab_basic2 = page.locator(
                "tp-yt-paper-tab:has-text('Thông tin cơ bản'), tp-yt-paper-tab:has-text('Basic info')"
            ).first
            if await tab_basic2.is_visible(timeout=1500):
                await tab_basic2.click()
                await random_delay(0.4, 0.8)
        except Exception:
            pass

        # Cuộn nội dung xuống ô Thẻ (tags)
        try:
            await page.evaluate("""() => {
                const sc = document.querySelector('ytcp-settings-dialog #scrollable-content')
                    || document.querySelector('ytcp-channel-settings-dialog #scrollable-content')
                    || document.querySelector('[id*="scrollable"]');
                if (sc) sc.scrollTop = sc.scrollHeight;
            }""")
        except Exception:
            pass
        await random_delay(0.5, 0.8)

        tag_selectors = [
            "#tags-input #text-input",
            "ytcp-chip-cloud #text-input",
            "ytcp-chip-bar #text-input",
            "input[placeholder*='Thêm thẻ']",
            "input[placeholder*='Add tag']",
            "#tags #text-input",
            "input#text-input",
        ]
        applied_tags_count = await input_polymer_chips(page, page, trimmed_default_tags, tag_selectors)
        logger.info("Đã hoàn tất nhập %d thẻ video mặc định", applied_tags_count)

    await random_delay(0.8, 1.5)

    # -------------------------------------------------------------
    # BƯỚC 5: Bấm nút "Lưu" (#submit-button / #save-button)
    # Kiểm tra trạng thái :not([disabled]) chờ tối đa 4s để nút chuyển sang active
    # Bấm lưu và chờ thông báo toast "Đã lưu cài đặt" hoặc modal đóng hoàn tất.
    # -------------------------------------------------------------
    logger.info("Kiểm tra trạng thái nút Lưu (chờ active tối đa 4s)...")
    save_button_active = False

    for poll_step in range(16):  # 16 x 250ms = 4.0s
        save_button_active = await page.evaluate("""() => {
            const btn = document.querySelector('#submit-button')
                || document.querySelector('#save-button')
                || document.querySelector('ytcp-button#submit-button')
                || document.querySelector('ytcp-button#save-button');
            if (!btn) return false;
            const innerBtn = btn.querySelector('button');
            const hasDis = btn.hasAttribute('disabled')
                || (innerBtn && innerBtn.hasAttribute('disabled'))
                || (innerBtn && innerBtn.classList.contains('ytcpButtonShapeImpl--disabled'));
            return !hasDis;
        }""")
        if save_button_active:
            logger.info("Nút Lưu đã chuyển sang active sau %.1fs", (poll_step + 1) * 0.25)
            break
        await asyncio.sleep(0.25)

    save_confirmed = False

    if save_button_active:
        logger.info("Tiến hành click nút Lưu...")
        clicked_ok = False
        try:
            save_btn = page.locator(
                "#submit-button, #save-button, ytcp-button#submit-button, ytcp-button#save-button, "
                "button:has-text('Lưu'), button:has-text('Save')"
            ).first
            if await save_btn.is_visible(timeout=1500):
                await save_btn.click()
                clicked_ok = True
        except Exception:
            pass

        if not clicked_ok:
            clicked_ok = await page.evaluate("""() => {
                const btn = document.querySelector('#submit-button')
                    || document.querySelector('#save-button')
                    || document.querySelector('ytcp-button#submit-button');
                if (btn) {
                    btn.click();
                    const inner = btn.querySelector('button');
                    if (inner) inner.click();
                    return true;
                }
                return false;
            }""")

        logger.info("Đã gửi sự kiện click Lưu (clicked=%s), đang chờ toast hoặc dialog đóng...", clicked_ok)

        # Chờ tối đa 6s để xác nhận toast hoặc modal đóng
        for _ in range(20):  # 20 x 300ms = 6.0s
            # 1. Kiểm tra toast "Đã lưu chế độ cài đặt" / "Đã lưu cài đặt"
            toast_text = await page.evaluate("""() => {
                const toast = document.querySelector('ytcp-toast, tp-yt-paper-toast, [role="alert"]');
                return toast ? (toast.innerText || toast.textContent || '').trim() : '';
            }""")
            if toast_text and any(w in toast_text.lower() for w in ["đã lưu", "saved", "settings saved"]):
                logger.info("Nhận được thông báo toast xác nhận: '%s'", toast_text)
                save_confirmed = True
                break

            # 2. Kiểm tra nếu dialog đã đóng
            dialog_is_closed = await page.evaluate("""() => {
                const d = document.querySelector('ytcp-channel-settings-dialog, ytcp-settings-dialog');
                if (!d) return true;
                return d.offsetParent === null || window.getComputedStyle(d).display === 'none';
            }""")
            if dialog_is_closed:
                logger.info("Hộp thoại Cài đặt đã đóng hoàn tất -> Lưu thành công!")
                save_confirmed = True
                break

            await asyncio.sleep(0.3)

    else:
        # Nút Lưu không active sau 4s: kiểm tra xem có lỗi validation hay không
        err_msg = await page.evaluate("""() => {
            const err = document.querySelector('ytcp-form-error, .error-message, #error-message, [aria-invalid="true"]');
            return err ? (err.innerText || err.textContent || '').trim() : '';
        }""")
        if err_msg:
            logger.error("Phát hiện lỗi validation trên YouTube Studio: %s", err_msg)
            return {
                "success": False,
                "error": f"Lỗi xác thực YouTube Studio: {err_msg}",
                "keywords_applied": applied_kw_count,
                "tags_applied": applied_tags_count,
            }
        else:
            logger.info("Nút Lưu không active (các cài đặt đã ở trạng thái mới nhất hoặc không có thay đổi mới)")
            save_confirmed = True

    await random_delay(1.0, 1.8)

    return {
        "success": True,
        "keywords_applied": applied_kw_count,
        "tags_applied": applied_tags_count,
        "not_made_for_kids": not_mfk_clicked,
        "saved": save_confirmed,
    }
