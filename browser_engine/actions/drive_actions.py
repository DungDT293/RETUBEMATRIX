"""
Google Drive interaction — tạo thư mục, tạo Google Docs/Sheets, đổi tên, di chuyển.
"""
import logging
import random
import string
from pathlib import Path

from actions.input_human import (
    human_type, random_delay, move_to_locator,
    human_scroll, move_mouse_to,
)
from actions.page_context import ensure_on_drive, where_am_i
from actions.sheet_content_generator import generate_sheet_payload

logger = logging.getLogger(__name__)

_DOC_CONTENTS = [
    "Báo cáo tiến độ dự án tháng này. Các hạng mục đã hoàn thành đúng tiến độ. Cần theo dõi thêm phần kiểm thử.",
    "Ghi chú cuộc họp nhóm. Thảo luận về kế hoạch quý tới. Phân công nhiệm vụ cho từng thành viên.",
    "Tổng hợp phản hồi khách hàng. Điểm mạnh: giao diện thân thiện. Cần cải thiện: tốc độ tải trang.",
    "Kế hoạch marketing tháng 6. Tập trung vào kênh mạng xã hội. Ngân sách dự kiến 50 triệu đồng.",
    "Phân tích dữ liệu bán hàng Q2. Doanh thu tăng 15% so với cùng kỳ. Sản phẩm A dẫn đầu thị phần.",
]

_SHEET_ROWS = [
    ["STT", "Tên", "Phòng ban", "Doanh thu", "Ghi chú"],
    ["1", "Nguyễn Văn A", "Kinh doanh", "120,000,000", "Đạt KPI"],
    ["2", "Trần Thị B", "Marketing", "95,000,000", "Vượt KPI"],
    ["3", "Lê Văn C", "Kỹ thuật", "80,000,000", "Đang xử lý"],
    ["4", "Phạm Thị D", "Hỗ trợ", "75,000,000", "Hoàn thành"],
]

_DRIVE_FOLDER_NAMES = [
    "Tài liệu công việc",
    "Dự án 2026",
    "Lưu trữ cá nhân",
    "Báo cáo tháng",
    "Hình ảnh sự kiện",
]


def _rand_str(n: int) -> str:
    return "".join(random.choices(string.ascii_lowercase, k=n))


async def drive_interaction(page, drive_upload_path: str = "", keyword_preset: str = "mixed") -> bool:
    loc = await where_am_i(page)
    logger.info("Vị trí hiện tại: %s", loc)
    await ensure_on_drive(page)
    await random_delay(2.0, 4.0)

    await human_scroll(page, "down", random.randint(200, 400))
    await random_delay(1.0, 2.5)
    await human_scroll(page, "up", random.randint(100, 200))
    await random_delay(1.5, 3.0)

    folder_name = random.choice(_DRIVE_FOLDER_NAMES) + f" {random.randint(1, 99)}"
    created = await _create_drive_folder(page, folder_name)

    # Tạo Google Docs hoặc Sheets thay vì upload file
    doc_created = await _create_doc_or_sheet(page, keyword_preset=keyword_preset)

    if doc_created:
        await random_delay(2.0, 4.0)
        await _rename_last_uploaded(page)
        await random_delay(1.5, 3.0)
        if created:
            await _move_to_folder(page, folder_name)

    logger.info("Hoàn thành tương tác Google Drive")
    return True


async def _click_new_button(page):
    """Click nút New trên Google Drive, trả về True nếu thành công."""
    new_btn = page.locator(
        'c-wiz [data-tooltip="New"], '
        'div[data-tooltip="New"], '
        'button[aria-label="New"], '
        'div[jscontroller][data-id="new-button"], '
        'div[role="button"][aria-label*="New"], '
        'div[role="button"][aria-label*="Mới"]'
    ).first
    await new_btn.wait_for(state="visible", timeout=10000)
    await move_to_locator(page, new_btn)
    await random_delay(0.4, 0.8)
    await new_btn.click()
    await random_delay(0.8, 1.5)
    return True


async def _find_menu_item(page, keywords: list[str], timeout: int = 5000) -> object | None:
    """Tìm menu item theo danh sách từ khóa — thử từng từ khóa một."""
    for kw in keywords:
        try:
            loc = page.locator(
                f'[role="menuitem"]:has-text("{kw}"), '
                f'li:has-text("{kw}"), '
                f'[role="option"]:has-text("{kw}")'
            ).first
            if await loc.is_visible(timeout=timeout // len(keywords)):
                return loc
        except Exception:
            pass
    # Fallback: duyệt tất cả menuitem và tìm theo text
    try:
        all_items = await page.locator(
            '[role="menuitem"], [role="option"], li[jsaction], '
            'div[jsaction*="click"], span[jsaction*="click"]'
        ).all()
        visible_texts = []
        for item in all_items:
            try:
                if await item.is_visible(timeout=500):
                    text = (await item.inner_text()).strip()
                    if text:
                        visible_texts.append(text[:40])
                    for kw in keywords:
                        if kw.lower() in text.lower():
                            logger.debug("Tìm thấy menu item bằng fallback: '%s'", text[:40])
                            return item
            except Exception:
                pass
        if visible_texts:
            logger.debug("Các menu items visible: %s", visible_texts[:10])
    except Exception:
        pass
    return None


async def _create_drive_folder(page, folder_name: str) -> bool:
    try:
        # Đóng Google Slides nếu bị mở nhầm
        if "presentation" in page.url or "docs.google.com/presentation" in page.url:
            await page.go_back()
            await random_delay(1.0, 2.0)

        await _click_new_button(page)

        folder_opt = await _find_menu_item(page, ["New folder", "Thư mục mới", "Folder", "Thư mục"])
        if not folder_opt:
            logger.debug("Không tìm thấy menu item Folder")
            return False
        await move_to_locator(page, folder_opt)
        await folder_opt.click()
        await random_delay(0.8, 1.5)

        # Chờ dialog xuất hiện trước, rồi mới tìm input bên trong
        dialog = page.locator('div[role="dialog"]:visible, div[role="alertdialog"]:visible').first
        await dialog.wait_for(state="visible", timeout=8000)
        name_input = dialog.locator('input[type="text"]').first
        await name_input.wait_for(state="visible", timeout=5000)
        # Xóa text cũ "Untitled folder" bằng fill rồi gõ tên mới
        await name_input.fill("")
        await random_delay(0.1, 0.2)
        await human_type(page, name_input, folder_name, typo_rate=0.005)
        await random_delay(0.5, 1.0)

        # Click nút Create thay vì Enter — an toàn hơn
        create_btn = page.locator('button:has-text("Create"), button:has-text("Tạo")').first
        if await create_btn.is_visible(timeout=2000):
            await move_to_locator(page, create_btn)
            await create_btn.click()
        else:
            await page.keyboard.press("Enter")
        await random_delay(1.0, 2.0)
        logger.info("Đã tạo thư mục Drive: '%s'", folder_name)
        return True
    except Exception as exc:
        logger.debug("Không thể tạo thư mục Drive: %s", exc)
        return False


async def _create_doc_or_sheet(page, keyword_preset: str = "mixed") -> bool:
    """Tạo Google Docs hoặc Sheets mới từ menu New, gõ nội dung ngẫu nhiên, đóng lại."""
    try:
        await _click_new_button(page)

        # Chọn ngẫu nhiên Docs hoặc Sheets
        use_sheets = random.random() < 0.5
        if use_sheets:
            opt = await _find_menu_item(page, ["Google Sheets", "Sheets", "Bảng tính"])
        else:
            opt = await _find_menu_item(page, ["Google Docs", "Docs", "Tài liệu"])

        if not opt:
            # Fallback: thử cái còn lại
            if use_sheets:
                opt = await _find_menu_item(page, ["Google Docs", "Docs", "Tài liệu"])
            else:
                opt = await _find_menu_item(page, ["Google Sheets", "Sheets", "Bảng tính"])
                use_sheets = True

        if not opt:
            logger.debug("Không tìm thấy menu item Docs/Sheets")
            await page.keyboard.press("Escape")
            return False

        await move_to_locator(page, opt)
        await opt.click()
        await random_delay(3.0, 5.0)

        # Chờ tab mới mở (Docs/Sheets mở trong tab mới)
        context = page.context
        pages = context.pages
        new_page = pages[-1] if len(pages) > 1 else page
        await new_page.bring_to_front()
        await new_page.wait_for_load_state("domcontentloaded", timeout=20000)
        await random_delay(2.0, 3.0)

        if use_sheets:
            # Gõ nội dung vào Sheets
            await _type_sheet_content(new_page, keyword_preset=keyword_preset)
        else:
            # Gõ nội dung vào Docs
            await _type_doc_content(new_page)

        # Lưu (Ctrl+S) rồi đóng tab
        await new_page.keyboard.press("Control+s")
        await random_delay(1.0, 2.0)
        if new_page != page:
            await new_page.close()
            await page.bring_to_front()
        await random_delay(1.0, 2.0)

        logger.info("Đã tạo và gõ nội dung vào Google %s", "Sheets" if use_sheets else "Docs")
        return True
    except Exception as exc:
        logger.debug("Không thể tạo Docs/Sheets: %s", exc)
        return False


async def _type_doc_content(page):
    """Gõ nội dung ngẫu nhiên vào Google Docs."""
    try:
        # Click vào vùng soạn thảo
        body = page.locator('.kix-appview-editor, .docs-texteventtarget-iframe, [contenteditable="true"]').first
        if await body.is_visible(timeout=5000):
            await body.click()
        else:
            await page.mouse.click(600, 400)
        await random_delay(0.5, 1.0)

        content = random.choice(_DOC_CONTENTS)
        title = f"Tài liệu {_rand_str(4).upper()} {random.randint(1, 99)}"

        # Gõ tiêu đề
        await page.keyboard.type(title, delay=50)
        await page.keyboard.press("Enter")
        await random_delay(0.3, 0.6)
        await page.keyboard.press("Enter")
        await random_delay(0.2, 0.4)

        # Gõ nội dung
        await page.keyboard.type(content, delay=30)
        await random_delay(1.0, 2.0)
        logger.debug("Đã gõ nội dung vào Docs")
    except Exception as exc:
        logger.debug("Lỗi gõ Docs: %s", exc)


async def _type_sheet_content(page, keyword_preset: str = "mixed"):
    """Gõ nội dung ngẫu nhiên vào Google Sheets."""
    try:
        # Click vào cell A1
        cell = page.locator('.cell-input, [role="gridcell"]').first
        if await cell.is_visible(timeout=5000):
            await cell.click()
        else:
            await page.mouse.click(200, 200)
        await random_delay(0.5, 1.0)

        payload = generate_sheet_payload(keyword_preset)
        rows = [payload["headers"], *payload["rows"]]
        for i, row in enumerate(rows):
            for j, val in enumerate(row):
                await page.keyboard.type(val, delay=40)
                if j < len(row) - 1:
                    await page.keyboard.press("Tab")
                    await random_delay(0.1, 0.2)
            await page.keyboard.press("Enter")
            await random_delay(0.2, 0.5)

        logger.debug("Đã gõ %d hàng vào Sheets", len(rows))
    except Exception as exc:
        logger.debug("Lỗi gõ Sheets: %s", exc)


async def _find_file_item(page) -> object | None:
    """Tìm file item đầu tiên trong Drive list, bỏ qua folder.
    Folder rows có size column hiển thị '—' (em dash), file rows có size thực như '12 KB'.
    """
    selectors = [
        'tr[role="row"][draggable="true"]',
        'tr[role="row"][data-id]',
    ]
    for sel in selectors:
        try:
            items = await page.locator(sel).all()
            for item in items:
                try:
                    if not await item.is_visible(timeout=500):
                        continue
                    text = (await item.inner_text()).strip()
                    logger.debug("_find_file_item candidate: %s", repr(text[:80]))
                    # Folder rows: size column shows "—" (em dash U+2014)
                    # File rows: size column shows actual size like "12 KB", "1.2 MB"
                    # The em dash appears as a standalone cell value between tabs/newlines
                    if "\n—\n" in text or "\t—\t" in text or text.endswith("\n—"):
                        logger.debug("_find_file_item: bỏ qua folder")
                        continue
                    logger.debug("_find_file_item: tìm thấy file item")
                    return item
                except Exception:
                    pass
        except Exception:
            pass
    logger.debug("_find_file_item: không tìm thấy file item")
    return None


async def _rename_last_uploaded(page):
    """Đổi tên file/doc vừa tạo: dùng JS contextmenu event → click Rename."""
    try:
        await page.goto("https://drive.google.com/drive/my-drive", wait_until="domcontentloaded", timeout=15000)
        await random_delay(2.5, 4.0)

        file_item = await _find_file_item(page)
        if not file_item:
            logger.debug("Không tìm thấy file item để đổi tên")
            return

        box = await file_item.bounding_box()
        if not box:
            return
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2

        _rename_input_sel = (
            'div[role="dialog"] input[type="text"], '
            'div[role="alertdialog"] input[type="text"]'
        )

        # Click để select file trước
        await page.mouse.click(cx, cy)
        await random_delay(0.6, 1.0)

        # Thử shortcut 'n' trước
        await page.keyboard.press("n")
        await random_delay(1.0, 1.8)

        inp = page.locator(_rename_input_sel).first
        if not await inp.is_visible(timeout=2000):
            # Dùng JS dispatchEvent để trigger context menu (Playwright mouse.click không work trên TR)
            await page.evaluate(
                """([x, y]) => {
                    const el = document.elementFromPoint(x, y);
                    if (el) {
                        el.dispatchEvent(new MouseEvent('contextmenu', {
                            bubbles: true, cancelable: true,
                            clientX: x, clientY: y
                        }));
                    }
                }""",
                [cx, cy]
            )
            await random_delay(1.0, 1.5)

            # Log menu items để debug
            try:
                all_items = await page.locator('[role="menuitem"]').all()
                texts = []
                for el in all_items[:20]:
                    try:
                        if await el.is_visible(timeout=200):
                            t = (await el.inner_text()).strip()
                            if t:
                                texts.append(t[:40])
                    except Exception:
                        pass
                logger.debug("Menu items sau JS contextmenu: %s", texts[:10])
            except Exception:
                pass

            rename_opt = await _find_menu_item(page, ["Rename", "Đổi tên"])
            if not rename_opt:
                logger.debug("Không tìm thấy Rename trong context menu")
                await page.keyboard.press("Escape")
                return
            await move_to_locator(page, rename_opt)
            await rename_opt.click()
            await random_delay(0.5, 1.0)
            # Sau khi click Rename, chờ dialog VISIBLE mới xuất hiện
            dialog = page.locator('div[role="dialog"]:visible, div[role="alertdialog"]:visible').first
            await dialog.wait_for(state="visible", timeout=6000)
            inp = dialog.locator('input[type="text"]').first

        await inp.wait_for(state="visible", timeout=5000)
        await inp.fill("")
        await random_delay(0.1, 0.2)
        new_name = f"Tài liệu {_rand_str(4).upper()} {random.randint(1, 99)}"
        await human_type(page, inp, new_name, typo_rate=0.005)
        await page.keyboard.press("Enter")
        await random_delay(0.8, 1.5)
        logger.info("Đã đổi tên file thành: '%s'", new_name)
    except Exception as exc:
        logger.debug("Không thể đổi tên file: %s", exc)


async def _move_to_folder(page, folder_name: str):
    try:
        # Navigate to Drive fresh so file list is up-to-date
        await page.goto("https://drive.google.com/drive/my-drive", wait_until="domcontentloaded", timeout=15000)
        await random_delay(2.5, 4.0)

        file_item = await _find_file_item(page)
        if not file_item:
            logger.debug("Không tìm thấy file item để di chuyển")
            return
        box = await file_item.bounding_box()
        if not box:
            return
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2

        # Click để select file trước
        await page.mouse.click(cx, cy)
        await random_delay(0.4, 0.8)

        # Dùng JS dispatchEvent để trigger context menu
        await page.evaluate(
            """([x, y]) => {
                const el = document.elementFromPoint(x, y);
                if (el) el.dispatchEvent(new MouseEvent('contextmenu', {
                    bubbles: true, cancelable: true, clientX: x, clientY: y
                }));
            }""",
            [cx, cy]
        )
        await random_delay(1.0, 1.5)

        move_opt = await _find_menu_item(page, ["Organize", "Move to", "Di chuyển đến"])
        if not move_opt:
            logger.debug("Không tìm thấy menu item Organize/Move to")
            await page.keyboard.press("Escape")
            return
        await move_to_locator(page, move_opt)
        await move_opt.click()
        await random_delay(1.0, 2.0)

        # Tìm folder trong dialog
        folder_btn = page.locator(f'[data-name="{folder_name}"], div:has-text("{folder_name}")').first
        if await folder_btn.is_visible(timeout=4000):
            await move_to_locator(page, folder_btn)
            await folder_btn.click()
            await random_delay(0.5, 1.0)

        move_here = page.locator(
            'button:has-text("Move here"), button:has-text("Di chuyển vào đây"), '
            'button:has-text("Move"), button:has-text("OK")'
        ).first
        if await move_here.is_visible(timeout=4000):
            await move_to_locator(page, move_here)
            await move_here.click()
            await random_delay(1.0, 2.0)
            logger.info("Đã di chuyển file vào thư mục '%s'", folder_name)
    except Exception as exc:
        logger.debug("Không thể di chuyển file: %s", exc)
