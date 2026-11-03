"""
Google Sheets interaction — tạo spreadsheet mới, gõ nội dung, lưu.
"""
import logging
import random

from actions.input_human import (
    human_type, random_delay, move_to_locator,
    human_scroll, move_mouse_to,
)
from actions.sheet_content_generator import generate_sheet_payload

logger = logging.getLogger(__name__)

async def sheets_interaction(page, keyword_preset: str = "mixed") -> bool:
    """Tạo Google Sheet mới, gõ nội dung, lưu và đóng."""
    try:
        logger.info("Đang mở Google Sheets")
        await page.goto("https://sheets.new", wait_until="domcontentloaded", timeout=20000)
        await random_delay(3.0, 5.0)

        # Chờ spreadsheet load xong — cell A1 phải visible
        cell_a1 = page.locator('.cell-input, .waffle-name-box, [aria-label="Name Box"]').first
        try:
            await cell_a1.wait_for(state="visible", timeout=15000)
        except Exception:
            pass
        await random_delay(1.5, 3.0)

        sheet_payload = generate_sheet_payload(keyword_preset)
        logger.info(
            "Sheets content preset=%s | language=%s | scenario=%s | provider=%s",
            keyword_preset,
            sheet_payload["language"],
            sheet_payload["scenario"],
            sheet_payload.get("provider", "internal"),
        )

        # Đặt tên spreadsheet
        title_input = page.locator(
            'input.docs-title-input, '
            '[aria-label="Rename"], '
            '.docs-title-input-label-inner'
        ).first
        try:
            if await title_input.is_visible(timeout=3000):
                await move_to_locator(page, title_input)
                await title_input.click()
                await random_delay(0.3, 0.6)
                await page.keyboard.press("Control+a")
                await page.keyboard.press("Backspace")
                sheet_title = sheet_payload["title"]
                await human_type(page, title_input, sheet_title, typo_rate=0.0, click_first=False)
                await page.keyboard.press("Enter")
                await random_delay(1.0, 2.0)
                logger.info("Đã đặt tên sheet: '%s'", sheet_title)
        except Exception as exc:
            logger.info("Không đặt được tên sheet, tiếp tục nhập dữ liệu: %s", exc)

        # Click vào cell A1 để bắt đầu nhập. Nếu Name Box chưa sẵn sàng thì fallback click vùng grid.
        if not await _click_cell(page, 0, 0):
            await _click_sheet_grid_fallback(page)
        await random_delay(0.5, 1.0)

        # Gõ header row
        headers = sheet_payload["headers"]
        typed_cells = 0
        for i, header in enumerate(headers):
            if i > 0:
                await page.keyboard.press("Tab")
                await random_delay(0.1, 0.3)
            await page.keyboard.type(header, delay=random.randint(65, 135))
            typed_cells += 1
            await random_delay(0.1, 0.3)

        await page.keyboard.press("Enter")
        await random_delay(0.5, 1.0)

        # Gõ 3-5 hàng dữ liệu
        # Go 3-5 generated data rows for the selected keyword preset
        data_pool = sheet_payload["rows"]
        n_rows = len(data_pool)

        for row_index, row_data in enumerate(data_pool, start=1):
            if not await _click_cell(page, row_index, 0):
                await page.keyboard.press("Home")
                await random_delay(0.1, 0.3)
            for i, cell_val in enumerate(row_data[:len(headers)]):
                if i > 0:
                    await page.keyboard.press("Tab")
                    await random_delay(0.1, 0.3)
                await page.keyboard.type(cell_val, delay=random.randint(70, 145))
                typed_cells += 1
                await random_delay(0.1, 0.4)
            await page.keyboard.press("Enter")
            await random_delay(0.5, 1.5)

        logger.info("Đã gõ %d hàng dữ liệu vào sheet", n_rows)

        # Cuộn xem lại nội dung
        await human_scroll(page, "up", random.randint(200, 400))
        await random_delay(1.5, 3.0)
        await move_mouse_to(page, random.uniform(300, 900), random.uniform(200, 500))
        await random_delay(1.0, 2.0)

        # Ctrl+S để lưu (Google Sheets auto-save nhưng Ctrl+S tạo tín hiệu tự nhiên)
        await page.keyboard.press("Control+s")
        await random_delay(1.0, 2.0)
        logger.info("Đã lưu Google Sheet")

        # Thỉnh thoảng dùng Format menu
        if random.random() < 0.4:
            await _apply_bold_header(page)

        logger.info("Hoàn thành tương tác Google Sheets")
        return typed_cells > 0

    except Exception as exc:
        logger.warning("Lỗi sheets_interaction: %s", exc)
        return False


async def _click_cell(page, row: int, col: int) -> bool:
    """Click vào cell theo tọa độ hàng/cột (0-based) qua Name Box."""
    try:
        col_letter = chr(ord("A") + col)
        cell_ref = f"{col_letter}{row + 1}"
        name_box = page.locator('.waffle-name-box, [aria-label="Name Box"]').first
        if await name_box.is_visible(timeout=3000):
            await name_box.click()
            await random_delay(0.2, 0.4)
            await page.keyboard.press("Control+a")
            await page.keyboard.type(cell_ref)
            await page.keyboard.press("Enter")
            await random_delay(0.3, 0.6)
            return True
    except Exception:
        pass
    return False


async def _click_sheet_grid_fallback(page) -> bool:
    try:
        grid = page.locator('.grid-container, .waffle-grid-container, canvas').first
        box = await grid.bounding_box(timeout=3000)
        if box:
            x = box["x"] + min(120, max(30, box["width"] * 0.08))
            y = box["y"] + min(70, max(30, box["height"] * 0.08))
            await move_mouse_to(page, x, y)
            await page.mouse.click(x, y)
            await random_delay(0.3, 0.7)
            logger.info("Đã chọn ô sheet bằng fallback grid")
            return True
    except Exception as exc:
        logger.debug("Không thể click fallback grid sheet: %s", exc)
    return False


async def _apply_bold_header(page):
    """Chọn hàng đầu và in đậm như người dùng thật."""
    try:
        # Click vào số hàng 1 để chọn cả hàng
        row_header = page.locator('.row-header-wrapper:first-child, [data-row="0"] .row-header').first
        if await row_header.is_visible(timeout=2000):
            await move_to_locator(page, row_header)
            await row_header.click()
            await random_delay(0.3, 0.6)
        else:
            # Fallback: click Name Box gõ 1:1
            await _click_cell(page, 0, 0)
            name_box = page.locator('.waffle-name-box, [aria-label="Name Box"]').first
            if await name_box.is_visible(timeout=2000):
                await name_box.click()
                await page.keyboard.press("Control+a")
                await page.keyboard.type("1:1")
                await page.keyboard.press("Enter")
                await random_delay(0.3, 0.5)

        await page.keyboard.press("Control+b")
        await random_delay(0.5, 1.0)
        logger.info("Đã in đậm hàng tiêu đề")
    except Exception as exc:
        logger.debug("Không thể in đậm header: %s", exc)
