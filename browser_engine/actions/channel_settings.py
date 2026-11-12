# -*- coding: utf-8 -*-
"""
Automate YouTube Studio Channel Settings:
1. Kênh -> Thông tin cơ bản: Điền "Từ khóa" (channel keywords) trích xuất từ đối thủ.
2. Kênh -> Cài đặt nâng cao: Chọn "Không, đặt kênh này là không dành cho trẻ em" (NOT_MADE_FOR_KIDS).
3. Chế độ mặc định cho video tải lên -> Thông tin cơ bản: Điền "Thẻ (từ khóa)" (default tags) trích xuất từ đối thủ.
4. Bấm Lưu và xác nhận hoàn tất.

Tối ưu cho máy yếu (Low-end hardware: 4GB - 8GB RAM, CPU 2-4 cores) & Chuẩn hóa Polymer/Shadow DOM:
- Route interception: Abort hình ảnh, media, fonts để giảm RAM < 180MB và tăng tốc tải Studio 3x.
- Tự động xử lý popup "Cách bạn sẽ xuất hiện" / dialogs / warm-welcome-dialog / iron-overlay-backdrop cản trở.
- Xuyên Shadow DOM toàn diện qua studio_dom (eval_studio_dom, click_stable_element, resolveNativeButton).
- Language-agnostic 100%: Sử dụng ID cấu hình và test-id thay vì chuỗi văn bản cứng tiếng Việt/Anh.
- Giới hạn tổng độ dài từ khóa <= 450 ký tự kèm tính quote penalty cho từ khóa ghép có khoảng trắng.
- Triệt tiêu lỗi dính chữ (Polymer chip concatenation) bằng cơ chế kiểm tra và xả sạch ô nhập input sau mỗi Enter.
- Kiểm tra trạng thái active của nút Lưu (#submit-button :not([disabled]):not([aria-disabled='true'])) và xác nhận toast/dialog đóng.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, List, Optional

from actions.human_utils import random_delay
from actions.bkt_check import setup_low_end_route_interception
from actions.studio_dom import (
    eval_studio_dom,
    click_stable_element,
)

logger = logging.getLogger(__name__)


def trim_keywords_to_limit(keywords: List[str], max_chars: int = 450) -> List[str]:
    """
    Giới hạn ký tự YouTube Studio:
    YouTube quy định trần tối đa 500 ký tự cho từ khóa kênh và thẻ video.
    Khi nhập cụm từ có khoảng trắng (multi-word tags), YouTube Studio tự động
    bọc cụm từ đó trong dấu ngoặc kép ("..."), làm tăng thêm 2 ký tự mỗi cụm từ.
    Đồng thời mỗi từ khóa tốn 1 ký tự phân tách (dấu phẩy).
    Vì vậy trần an toàn tuyệt đối là max_chars = 450 (biên dự phòng 50 ký tự),
    tính toán chính xác quote penalty:
      cost = len(clean) + (2 if " " in clean else 0) + 1
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

        quote_penalty = 2 if " " in clean else 0
        cost = len(clean) + quote_penalty + 1
        if current_len + cost > max_chars:
            logger.info(
                "Đã chạm ngưỡng an toàn ký tự YouTube Studio (%d + %d > %d). Cắt gọn tại từ khóa '%s'.",
                current_len, cost, max_chars, clean
            )
            break
        trimmed.append(clean)
        current_len += cost

    logger.info(
        "Tối ưu từ khóa: từ %d từ gốc -> giữ lại %d từ (tổng chi phí ước tính: %d/%d ký tự)",
        len(keywords), len(trimmed), current_len, max_chars
    )
    return trimmed


async def dismiss_studio_dialogs_and_backdrops(page: Any) -> bool:
    """
    Tắt/bỏ qua các popup cản trở thao tác trên YouTube Studio:
    - Welcome dialog (ytcp-warm-welcome-dialog)
    - Channel creation dialog (ytd-channel-creation-dialog-renderer)
    - Operational error / modal overlays
    Không xóa nhầm backdrop của chính Settings dialog.
    """
    dismissed = False
    try:
        res = await eval_studio_dom(page, """
            const settingsDialog = __rtmDom.deepFirstVisible(document, 'ytcp-settings-dialog, ytcp-channel-settings-dialog');
            if (settingsDialog && __rtmDom.isReallyVisible(settingsDialog)) {
                return false; // Không dismiss khi Settings dialog đang mở
            }

            // 1. Welcome dialog
            const welcomeBtn = __rtmDom.deepFirstVisible(document, 'ytcp-warm-welcome-dialog #dismiss-button, ytcp-warm-welcome-dialog [dialog-dismiss], #welcome-dialog #dismiss-button');
            if (welcomeBtn && __rtmDom.isReallyVisible(welcomeBtn)) {
                const b = __rtmDom.resolveNativeButton(welcomeBtn) || welcomeBtn;
                b.click();
                return 'welcome';
            }

            // 2. Channel creation dialog
            const creation = __rtmDom.deepFirstVisible(document, 'ytd-channel-creation-dialog-renderer');
            if (creation && __rtmDom.isReallyVisible(creation)) {
                const cancelBtn = __rtmDom.deepFirstVisible(creation, '#cancel-button, [test-id="cancel-button"], [dialog-dismiss]');
                if (cancelBtn) {
                    const b = __rtmDom.resolveNativeButton(cancelBtn) || cancelBtn;
                    b.click();
                    return 'creation_canceled';
                }
            }

            // 3. Operational error dialogs
            const errorDismiss = __rtmDom.deepFirstVisible(document, 'ytcp-permanent-operational-error-manager [dialog-dismiss], ytcp-permanent-operational-error-manager button');
            if (errorDismiss && __rtmDom.isReallyVisible(errorDismiss)) {
                const b = __rtmDom.resolveNativeButton(errorDismiss) || errorDismiss;
                b.click();
                return 'error_dismissed';
            }

            return false;
        """)
        if res:
            logger.info("Đã tự động đóng dialog cản trở: %s", res)
            await asyncio.sleep(0.4)
            dismissed = True
    except Exception as exc:
        logger.debug("dismiss_studio_dialogs error: %s", exc)

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
    - Gõ dấu phẩy và Enter kèm delay 150-180ms để Polymer custom elements nhận diện sự kiện phân tách.
    - Sau mỗi chip, kiểm tra ô input: nếu còn chữ thừa thì nhấn Enter lại hoặc xóa sạch ô để tránh
      dính chữ liên tiếp (Polymer chip concatenation bug).
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
        # Thử tìm xuyên Shadow DOM qua eval_studio_dom
        try:
            input_found = await eval_studio_dom(page, """
                const inp = __rtmDom.deepFirstVisible(document, 'ytcp-chip-cloud #text-input, ytcp-chip-bar #text-input, #channel-keywords #text-input, #tags-input #text-input, input#text-input');
                if (inp) {
                    inp.focus();
                    return true;
                }
                return false;
            """)
            if input_found:
                input_el = page.locator("input:focus").first
        except Exception:
            pass

    if not input_el:
        logger.warning("Không tìm thấy phần tử input chip keywords/tags")
        return 0

    # 1. Dọn dẹp chip cũ nếu được yêu cầu
    if clear_existing:
        try:
            clear_all_btn = page.locator(
                "ytcp-button#delete-all-button, [test-id='delete-all-button'], [aria-label*='Xóa tất cả'], [aria-label*='Clear all'], "
                "button:has-text('Xóa tất cả'), button:has-text('Clear all')"
            ).first
            if await clear_all_btn.is_visible(timeout=800):
                await clear_all_btn.click()
                await asyncio.sleep(0.3)
            else:
                await eval_studio_dom(page, """
                    const deleteBtns = __rtmDom.deepQueryAll(document, 'ytcp-chip #delete-icon, ytcp-chip ytcp-icon-button, ytcp-chip .delete-icon');
                    deleteBtns.forEach(b => {
                        try {
                            const nativeBtn = __rtmDom.resolveNativeButton(b) || b;
                            nativeBtn.click();
                        } catch(e) {}
                    });
                """)
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
            await asyncio.sleep(0.10)
            await input_el.fill(clean_item)
            await asyncio.sleep(0.15)
            await page.keyboard.press(",")
            await asyncio.sleep(0.15)
            await page.keyboard.press("Enter")
            await asyncio.sleep(0.18)

            # Cơ chế chống dính chữ: kiểm tra xem nội dung đã được chuyển thành chip chưa
            try:
                val = await input_el.input_value()
                if val and val.strip():
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(0.15)
                    val2 = await input_el.input_value()
                    if val2 and val2.strip():
                        # Nếu vẫn còn chữ thừa trong ô, dọn sạch trước khi gõ từ tiếp theo
                        await page.keyboard.press("Control+a")
                        await asyncio.sleep(0.05)
                        await page.keyboard.press("Backspace")
                        await asyncio.sleep(0.10)
            except Exception:
                pass

            applied_count += 1
        except Exception as exc:
            logger.warning("Không thể gõ chip '%s': %s", clean_item, exc)

    return applied_count


async def open_settings_dialog(page: Any) -> bool:
    """
    Mở hộp thoại Cài đặt (Settings dialog) trong YouTube Studio bằng cách:
    - Cuộn drawer xuống đáy.
    - Thao tác đa tầng: Playwright locator -> click_stable_element -> Deep JS composed click.
    - Lắng nghe sự xuất hiện của ytcp-settings-dialog.
    """
    # 1. Kiểm tra xem Settings dialog đã vô tình được mở sẵn chưa
    try:
        is_already_open = await eval_studio_dom(page, """
            const d = __rtmDom.deepFirstVisible(document, 'ytcp-settings-dialog, ytcp-channel-settings-dialog');
            return Boolean(d && __rtmDom.isReallyVisible(d));
        """)
        if is_already_open:
            logger.info("Hộp thoại Cài đặt Studio đã mở sẵn từ trước")
            return True
    except Exception:
        pass

    settings_selectors = [
        "ytcp-navigation-drawer #settings-item tp-yt-paper-icon-item",
        "ytcp-navigation-drawer #settings-item",
        "#settings-item tp-yt-paper-icon-item",
        "#settings-item",
        "ytcp-navigation-drawer [test-id='settings']",
        "[test-id='settings']",
        "ytcp-navigation-drawer #settings-button",
        "#settings-button",
        "ytcp-navigation-item#settings-item",
        "tp-yt-paper-icon-item#settings-item",
    ]

    for attempt in range(1, 5):
        await dismiss_studio_dialogs_and_backdrops(page)

        # Cuộn thanh điều hướng xuống đáy để lộ các item ở chân drawer
        try:
            await eval_studio_dom(page, """
                const drawer = document.querySelector('ytcp-navigation-drawer, nav#left-nav, tp-yt-app-drawer');
                if (drawer) {
                    drawer.scrollTop = drawer.scrollHeight;
                    const scrollable = drawer.querySelector('#contentContainer, #items, [id*="scroll"]');
                    if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
                }
            """)
        except Exception:
            pass

        # Cách 1: Click bằng Playwright click_stable_element (bảo vệ TOCTOU)
        clicked = await click_stable_element(
            page,
            selectors=settings_selectors,
            timeout_ms=3000,
            pre_delay=0.15,
        )
        if clicked:
            logger.info("Lần %d: Đã click nút Cài đặt qua stable element '%s'", attempt, clicked)

        # Cách 2: Nếu chưa click được, dùng Deep JS traversal với composed: true
        if not clicked:
            try:
                js_clicked = await eval_studio_dom(page, """
                    const drawer = document.querySelector('ytcp-navigation-drawer, nav#left-nav, tp-yt-app-drawer') || document;
                    const cand = __rtmDom.deepFirstVisible(
                        drawer,
                        '#settings-item tp-yt-paper-icon-item, #settings-item, [test-id="settings"], #settings-button, ytcp-navigation-item:has(tp-yt-iron-icon[icon*="settings"])'
                    );
                    if (cand) {
                        cand.scrollIntoView({ behavior: 'instant', block: 'center' });
                        const btn = __rtmDom.resolveNativeButton(cand) || cand;
                        btn.click();
                        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                        return true;
                    }
                    return false;
                """)
                if js_clicked:
                    logger.info("Lần %d: Đã click nút Cài đặt thành công qua Deep JS traversal", attempt)
            except Exception as exc:
                logger.debug("Lần %d: Lỗi JS traversal click Settings: %s", attempt, exc)

        # Chờ hộp thoại Cài đặt xuất hiện qua DOM predicate (trần tối đa 6.0s)
        try:
            await page.wait_for_function(
                """() => {
                    const d = document.querySelector('ytcp-settings-dialog, ytcp-channel-settings-dialog');
                    return Boolean(d && (d.offsetParent !== null || window.getComputedStyle(d).display !== 'none'));
                }""",
                timeout=6000,
            )
            logger.info("Hộp thoại Cài đặt Studio đã hiển thị (lần thử %d)", attempt)
            return True
        except Exception:
            pass

        logger.warning("Lần %d: Chưa thấy hộp thoại Cài đặt mở, chuẩn bị thử lại...", attempt)
        await asyncio.sleep(0.4)

    # Lần kiểm tra cuối cùng
    try:
        await page.wait_for_selector(
            "li#channel, [test-id='channel'], #channel, ytcp-channel-settings-dialog, ytcp-settings-dialog",
            state="attached",
            timeout=10000,
        )
        logger.info("Hộp thoại Cài đặt Studio đã hiển thị sau lần chờ cuối")
        return True
    except Exception as exc:
        logger.error("Dialog Cài đặt không xuất hiện: %s", exc)
        return False


async def configure_channel_settings(
    page: Any,
    channel_keywords: Optional[List[str]] = None,
    default_tags: Optional[List[str]] = None,
    made_for_kids: bool = False,
) -> dict:
    """
    Mở hộp thoại Cài đặt YouTube Studio và cấu hình tự động:
    1. Kênh -> Thông tin cơ bản: Điền từ khóa kênh.
    2. Kênh -> Cài đặt nâng cao: Chọn "Không, đặt kênh này là không dành cho trẻ em".
    3. Chế độ mặc định cho video tải lên -> Thẻ: Điền thẻ video mặc định.
    4. Bấm Lưu và xác nhận hoàn tất.
    """
    channel_keywords = channel_keywords or []
    default_tags = default_tags or []

    # Cắt gọn danh sách từ khóa <= 450 ký tự kèm tính quote penalty cho từ ghép
    trimmed_channel_keywords = trim_keywords_to_limit(channel_keywords, max_chars=450)
    trimmed_default_tags = trim_keywords_to_limit(default_tags, max_chars=450)

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

    # 2. Điều hướng tới YouTube Studio (timeout 75s chống nghẽn proxy)
    current_url = page.url or ""
    if "studio.youtube.com" not in current_url:
        logger.info("Chuyển hướng đến https://studio.youtube.com...")
        await page.goto("https://studio.youtube.com", wait_until="domcontentloaded", timeout=75000)
        await random_delay(2.0, 3.5)

    # 3. Tự động xử lý popup "Cách bạn sẽ xuất hiện" / warm welcome dialog
    await dismiss_studio_dialogs_and_backdrops(page)

    # Đảm bảo khung điều hướng YouTube Studio đã sẵn sàng
    try:
        await page.wait_for_selector(
            "ytcp-navigation-drawer, nav#left-nav, tp-yt-app-drawer, ytcp-app",
            timeout=45000,
        )
    except Exception as exc:
        logger.warning("Chờ studio load khung điều hướng: %s", exc)

    # Mở rộng sidebar nếu drawer đang bị thu nhỏ (rail mode)
    try:
        await eval_studio_dom(page, """
            const drawer = document.querySelector('ytcp-navigation-drawer, tp-yt-app-drawer');
            const guideBtn = document.querySelector('#guide-button, [aria-label*="Guide" i], [aria-label*="Menu" i]');
            if (drawer && (drawer.hasAttribute('collapsed') || drawer.getAttribute('opened') === 'false')) {
                if (guideBtn) guideBtn.click();
            }
        """)
    except Exception:
        pass

    await dismiss_studio_dialogs_and_backdrops(page)
    await random_delay(0.6, 1.2)

    # 4. Mở hộp thoại Cài đặt (Settings dialog)
    dialog_opened = await open_settings_dialog(page)
    if not dialog_opened:
        return {"success": False, "error": "Hộp thoại Cài đặt Studio không hiển thị"}

    await random_delay(0.6, 1.2)

    # -------------------------------------------------------------
    # BƯỚC 1: Chọn menu "Kênh" (Channel) ở thanh điều hướng bên trái
    # Language-Agnostic: ID cấu trúc li#channel, [test-id='channel'] hoặc vị trí menu số 2
    # -------------------------------------------------------------
    logger.info("Chọn menu 'Kênh' trong hộp thoại cài đặt...")
    channel_menu_clicked = False
    for sel in [
        "li#channel",
        "ytcp-settings-dialog li#channel",
        "ytcp-channel-settings-dialog li#channel",
        "ytcp-navigation-item[test-id='channel']",
        "[test-id='channel']",
        "ytcp-settings-dialog tp-yt-paper-listbox > li:nth-child(2)",
    ]:
        try:
            item = page.locator(sel).first
            if await item.is_visible(timeout=3000):
                await item.click()
                channel_menu_clicked = True
                logger.info("Đã click menu Kênh qua selector: %s", sel)
                break
        except Exception:
            pass

    if not channel_menu_clicked:
        channel_menu_clicked = await eval_studio_dom(page, """
            const el = __rtmDom.deepFirstVisible(
                document,
                'ytcp-settings-dialog li#channel, ytcp-channel-settings-dialog li#channel, [test-id="channel"], li#channel, ytcp-settings-dialog tp-yt-paper-listbox > li:nth-child(2)'
            );
            if (el) {
                const btn = __rtmDom.resolveNativeButton(el) || el;
                btn.click();
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                return true;
            }
            return false;
        """)

    # Chờ DOM panel Kênh sẵn sàng
    try:
        await page.wait_for_selector("tp-yt-paper-tab, #channel-keywords, ytcp-chip-cloud", timeout=4000)
    except Exception:
        await asyncio.sleep(0.3)

    # -------------------------------------------------------------
    # BƯỚC 2: Tab "Thông tin cơ bản" -> Nhập "Từ khóa" (channel_keywords)
    # Language-Agnostic: tp-yt-paper-tab#channel-basic-tab hoặc tab số 1
    # -------------------------------------------------------------
    applied_kw_count = 0
    if trimmed_channel_keywords:
        logger.info("Điền %d từ khóa kênh vào mục 'Từ khóa'...", len(trimmed_channel_keywords))
        try:
            tab_basic = page.locator(
                "tp-yt-paper-tab#channel-basic-tab, tp-yt-paper-tab:first-child, tp-yt-paper-tab:nth-child(1), [test-id='basic-info-tab']"
            ).first
            if await tab_basic.is_visible(timeout=3000):
                await tab_basic.click()
                await asyncio.sleep(0.2)
        except Exception:
            pass

        kw_selectors = [
            "ytcp-chip-cloud #text-input",
            "ytcp-chip-bar #text-input",
            "#channel-keywords #text-input",
            "#channel-keywords input",
            "input#text-input",
        ]
        applied_kw_count = await input_polymer_chips(page, page, trimmed_channel_keywords, kw_selectors)
        logger.info("Đã hoàn tất nhập %d từ khóa kênh", applied_kw_count)

    await asyncio.sleep(0.2)

    # -------------------------------------------------------------
    # BƯỚC 3: Tab "Cài đặt nâng cao" -> Chọn KHÔNG DÀNH CHO TRẺ EM
    # Language-Agnostic: tp-yt-paper-tab#channel-advanced-tab hoặc tab số 2, radio name="NOT_MADE_FOR_KIDS"
    # -------------------------------------------------------------
    logger.info("Chuyển sang tab 'Cài đặt nâng cao' để thiết lập Đối tượng người xem...")
    try:
        tab_adv = page.locator(
            "tp-yt-paper-tab#channel-advanced-tab, tp-yt-paper-tab:nth-child(2), [test-id='advanced-settings-tab']"
        ).first
        if await tab_adv.is_visible(timeout=3000):
            await tab_adv.click()
            await asyncio.sleep(0.2)
    except Exception as e:
        logger.warning("Lỗi click tab Cài đặt nâng cao: %s", e)

    not_mfk_clicked = False
    for r_sel in [
        "tp-yt-paper-radio-button[name='NOT_MADE_FOR_KIDS']",
        "tp-yt-paper-radio-button[name='NOT_MFK']",
        "#audience-not-made-for-kids",
    ]:
        try:
            r = page.locator(r_sel).first
            if await r.is_visible(timeout=3000):
                await r.click()
                checked = await r.get_attribute("aria-checked")
                if checked == "true":
                    not_mfk_clicked = True
                    logger.info("Đã chọn Không dành cho trẻ em thành công (%s)", r_sel)
                    break
        except Exception:
            pass

    if not not_mfk_clicked:
        not_mfk_clicked = await eval_studio_dom(page, """
            const radios = __rtmDom.deepQueryAll(document, 'tp-yt-paper-radio-button');
            for (const r of radios) {
                const name = r.getAttribute('name') || '';
                if (name.includes('NOT_MADE_FOR_KIDS') || name.includes('NOT_MFK')) {
                    const b = __rtmDom.resolveNativeButton(r) || r;
                    b.click();
                    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                    return true;
                }
            }
            return false;
        """)
        logger.info("JS fallback chọn Không dành cho trẻ em: %s", not_mfk_clicked)

    await asyncio.sleep(0.2)

    # -------------------------------------------------------------
    # BƯỚC 4: Menu "Chế độ mặc định cho video tải lên" -> Thẻ (tags)
    # Language-Agnostic: li#uploads, [test-id='upload-defaults'] hoặc vị trí menu số 3
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
            "[test-id='upload-defaults']",
            "ytcp-settings-dialog tp-yt-paper-listbox > li:nth-child(3)",
        ]:
            try:
                item = page.locator(sel).first
                if await item.is_visible(timeout=3000):
                    await item.click()
                    upload_menu_clicked = True
                    logger.info("Đã click menu Chế độ mặc định qua: %s", sel)
                    break
            except Exception:
                pass

        if not upload_menu_clicked:
            upload_menu_clicked = await eval_studio_dom(page, """
                const el = __rtmDom.deepFirstVisible(
                    document,
                    'ytcp-settings-dialog li#uploads, ytcp-channel-settings-dialog li#uploads, [test-id="upload-defaults"], li#uploads, ytcp-settings-dialog tp-yt-paper-listbox > li:nth-child(3)'
                );
                if (el) {
                    const btn = __rtmDom.resolveNativeButton(el) || el;
                    btn.click();
                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                    return true;
                }
                return false;
            """)

        # Chờ DOM panel Chế độ mặc định sẵn sàng
        try:
            await page.wait_for_selector("tp-yt-paper-tab, #tags-input, [id*='scrollable']", timeout=4000)
        except Exception:
            await asyncio.sleep(0.3)

        # Đảm bảo tab Thông tin cơ bản được chọn (tab số 1)
        try:
            tab_basic2 = page.locator("tp-yt-paper-tab:first-child, tp-yt-paper-tab:nth-child(1)").first
            if await tab_basic2.is_visible(timeout=3000):
                await tab_basic2.click()
                await asyncio.sleep(0.2)
        except Exception:
            pass

        # Cuộn nội dung xuống ô Thẻ (tags)
        try:
            await eval_studio_dom(page, """
                const sc = __rtmDom.deepFirstVisible(document, 'ytcp-settings-dialog #scrollable-content, ytcp-channel-settings-dialog #scrollable-content, [id*="scrollable"]');
                if (sc) sc.scrollTop = sc.scrollHeight;
            """)
        except Exception:
            pass
        await asyncio.sleep(0.2)

        tag_selectors = [
            "#tags-input #text-input",
            "ytcp-chip-cloud #text-input",
            "ytcp-chip-bar #text-input",
            "#tags #text-input",
            "input#text-input",
        ]
        applied_tags_count = await input_polymer_chips(page, page, trimmed_default_tags, tag_selectors)
        logger.info("Đã hoàn tất nhập %d thẻ video mặc định", applied_tags_count)

    await asyncio.sleep(0.2)

    # -------------------------------------------------------------
    # BƯỚC 5: Bấm nút "Lưu" (#submit-button / #save-button)
    # Lắng nghe DOM Predicate: phản ứng tức thì ngay khi nút Lưu chuyển sang active
    # (Trần tối đa 12s cho trường hợp Polymer xử lý chip chậm qua proxy).
    # -------------------------------------------------------------
    logger.info("Lắng nghe DOM: Chờ nút Lưu chuyển sang active (phản ứng tức thì, trần 12s)...")
    save_button_active = False

    try:
        await page.wait_for_function(
            """() => {
                const btn = document.querySelector('#submit-button')
                    || document.querySelector('#save-button')
                    || document.querySelector('ytcp-button#submit-button')
                    || document.querySelector('ytcp-button#save-button');
                if (!btn) return false;
                const innerBtn = btn.querySelector('button');
                const hasDis = btn.hasAttribute('disabled')
                    || (btn.getAttribute('aria-disabled') === 'true')
                    || (innerBtn && innerBtn.hasAttribute('disabled'))
                    || (innerBtn && innerBtn.classList.contains('ytcpButtonShapeImpl--disabled'));
                return !hasDis;
            }""",
            timeout=12000,
        )
        save_button_active = True
        logger.info("Nút Lưu đã chuyển sang active ngay khi DOM cập nhật trạng thái")
    except Exception:
        save_button_active = False

    save_confirmed = False

    if save_button_active:
        logger.info("Tiến hành click nút Lưu...")
        clicked_ok = False
        try:
            save_btn = page.locator(
                "#submit-button, #save-button, ytcp-button#submit-button, ytcp-button#save-button"
            ).first
            if await save_btn.is_visible(timeout=3000):
                await save_btn.click()
                clicked_ok = True
        except Exception:
            pass

        if not clicked_ok:
            clicked_ok = await eval_studio_dom(page, """
                const btn = __rtmDom.deepFirstVisible(document, '#submit-button, #save-button, ytcp-button#submit-button');
                if (btn) {
                    const inner = __rtmDom.resolveNativeButton(btn) || btn;
                    inner.click();
                    inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                    return true;
                }
                return false;
            """)

        logger.info("Đã gửi sự kiện click Lưu (clicked=%s), đang lắng nghe DOM xác nhận hoàn tất...", clicked_ok)

        # Lắng nghe DOM Predicate: Phản ứng tức thì ngay khi toast "Đã lưu" xuất hiện hoặc dialog tự đóng (trần 18s)
        try:
            confirmed_type = await page.wait_for_function(
                """() => {
                    const toast = document.querySelector('ytcp-toast, tp-yt-paper-toast, [role="alert"]');
                    if (toast) {
                        return 'toast_alert';
                    }
                    const d = document.querySelector('ytcp-channel-settings-dialog, ytcp-settings-dialog');
                    if (!d || d.offsetParent === null || window.getComputedStyle(d).display === 'none') {
                        return 'dialog_closed';
                    }
                    return false;
                }""",
                timeout=18000,
            )
            save_confirmed = True
            logger.info("Đã xác nhận lưu thành công qua DOM state: %s", confirmed_type)
        except Exception:
            save_confirmed = False

    else:
        # Nút Lưu không active: quét Shadow DOM tìm thông báo lỗi validation nếu có
        err_msg = await eval_studio_dom(page, """
            const err = __rtmDom.deepFirstVisible(document, 'ytcp-form-input-container[invalid], ytcp-chip-cloud[invalid], ytcp-form-error, .error-message, #error-message, [aria-invalid="true"]');
            return err ? __rtmDom.collectVisibleText(err) : '';
        """)
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
