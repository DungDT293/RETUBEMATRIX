# BÁO CÁO KỸ THUẬT: SỬA ĐỔI TOÀN DIỆN BKT & UPLOAD WIZARD V1.2.2

## 1. Tổng Quan Mục Tiêu
Bản vá này giải quyết triệt để 2 nguyên nhân gốc rễ gây lỗi trong chu trình Reup & Kiểm tra bản quyền (BKT):
1. **Lỗi thoát sớm / Sạch bản quyền giả trên Kênh Test**: Cột "Hạn chế" (Restrictions) của YouTube Studio ban đầu hiển thị dấu gạch ngang (`—`) khi chưa bắt đầu quét Content ID. Logic cũ bị bẫy `clean_streak >= 4 and elapsed_check > 20`, nhầm tưởng video đã sạch chỉ sau hơn 20 giây và lập tức thoát vòng lặp, đóng trình duyệt trước khi YouTube kịp quét.
2. **Lỗi kẹt wizard upload trên Kênh Chính / Kênh Đích**: Sau khi chọn "Không có mục nào ở trên" và bấm "Gửi bài đánh giá" (`#submit-questionnaire-button`) ở bước Ad Suitability, YouTube Studio vô hiệu hóa nút `#next-button` trong 2–5 giây để xử lý tính điểm. Nút bị disabled khiến Playwright timeout hoặc click trượt. Đồng thời, việc thiếu bảo đảm chọn radio Audience ("Không dành cho trẻ em") ở bước 1 hoặc kẹt modal xác nhận "Vẫn xuất bản" (Publish anyway) ở bước cuối cũng làm ngắt quãng luồng upload.

---

## 2. Chi Tiết Các Tệp & Hàm Đã Sửa

### A. Tệp `browser_engine/actions/bkt/monitor.py` & `roots/browsermulti/actions/bkt/monitor.py`

#### 1. Bọc bảo vệ chống sập tiến trình do ngoại lệ DOM (Lines 268–275)
- **Hàm sửa**: `poll_bkt_status`
- **Mã nguồn**:
```python
try:
    rows_data = await extract_table_rows()
    logger.info("Quét tab Videos: tìm thấy %d hàng video trên bảng", len(rows_data))
except Exception as dom_err:
    logger.warning("Lỗi DOM / detached frame khi trích xuất bảng video Studio: %s. Thử lại sau 2s...", dom_err)
    await asyncio.sleep(2.0)
    continue
```
- **Tác dụng**: Nếu mạng giật, trang bị F5 hoặc YouTube Studio render lại bảng khiến frame bị detached, tiến trình không bị crash mà chỉ ghi log và tiếp tục vòng lặp chu kỳ tiếp theo.

#### 2. Cơ chế State Machine 2 Pha Anti-Green-Wash (Lines 680–740)
- **Hàm sửa**: `poll_bkt_status`
- **Mã nguồn**:
```python
elif not is_actively_checking_or_processing and not cancel_upload_visible and is_known_clean_text:
    elapsed_check_vid = (now_ts - check_poll_start_time) if check_poll_start_time is not None else 0.0
    is_ready_for_clean = False
    has_seen_processing = saw_checks_active.get(vid, False)

    if is_explicit_clean_text:
        clean_streak[vid] = clean_streak.get(vid, 0) + 1
        if has_seen_processing:
            is_ready_for_clean = clean_streak[vid] >= 3
        else:
            is_ready_for_clean = (clean_streak[vid] >= 4 and elapsed_check_vid >= 60.0)
    elif is_clean_dash:
        # Tuyệt đối không kết luận sạch nếu chưa thấy quét:
        # Nếu has_seen_processing == False: Không bao giờ được phép gán green_clean chỉ sau 20 giây!
        # Dấu gạch ngang — hoặc None trong 120 giây đầu chỉ được coi là trạng thái chờ.
        if has_seen_processing and (estimated_minutes is None):
            # Trường hợp A: Đã từng thấy cờ quét (has_seen_processing == True),
            # trạng thái chuyển sang sạch và duy trì liên tục tối thiểu 3 chu kỳ quét
            clean_streak[vid] = clean_streak.get(vid, 0) + 1
            is_ready_for_clean = clean_streak[vid] >= 3
        elif not has_seen_processing and (estimated_minutes is None):
            # Trường hợp B (Fallback an toàn): Nếu video quá ngắn khiến YouTube bỏ qua hiển thị text "Processing",
            # hệ thống bắt buộc phải chờ tối thiểu 180 giây VÀ duy trì trạng thái sạch liên tục tối thiểu 8 chu kỳ
            if elapsed_check_vid >= 180.0:
                clean_streak[vid] = clean_streak.get(vid, 0) + 1
                is_ready_for_clean = clean_streak[vid] >= 8
            else:
                clean_streak[vid] = 0
                is_ready_for_clean = False
        else:
            clean_streak[vid] = 0
            is_ready_for_clean = False

    if not is_ready_for_clean:
        if not has_seen_processing:
            wait_msg = f"Đang chờ YouTube bắt đầu quét bản quyền Content ID ({int(elapsed_check_vid)}s/180s)..."
        else:
            wait_msg = "Đang chờ YouTube quét bản quyền Content ID (Kiểm tra kỹ lưỡng)..."
        classified[vid] = {
            "bkt_check_status": "pending",
            "bkt_restriction": wait_msg,
            "processing_stage": "checking",
            "estimated_minutes": None,
            "claim_type": "none",
            "monetization": found.get("monetization"),
        }
        all_resolved = False
```
- **Tác dụng**:
  + Loại bỏ hoàn toàn bẫy `clean_streak >= 4 and elapsed_check > 20`.
  + Khi chưa thấy cờ xử lý (`has_seen_processing == False`), dấu gạch ngang trong 180 giây đầu tiên chỉ được hiển thị là đếm ngược chờ YouTube bắt đầu quét.
  + Chỉ cho phép ra kết luận sạch khi có cờ quét thực tế (Trường hợp A) hoặc đã đủ 180s an toàn (Trường hợp B).

---

### B. Tệp `browser_engine/actions/upload_actions.py` & `roots/browsermulti/actions/upload_actions.py`

#### 1. Định nghĩa Hàm Helper `dismiss_publish_anyway_dialogs` (Lines 360–415)
- **Hàm thêm mới**: `dismiss_publish_anyway_dialogs(page) -> bool`
- **Mã nguồn**: Xuyên thấu Polymer Shadow DOM tìm kiếm các modal `ytcp-confirmation-dialog`, `tp-yt-paper-dialog`, `ytcp-dialog`, bấm các nút có nhãn xác nhận: "Vẫn xuất bản", "Publish anyway", "Xuất bản ngay", "Vẫn lưu", "Save anyway", "Publicar de todos modos", "仍要发布", v.v.

#### 2. Đảm bảo chọn Audience ("Không dành cho trẻ em") ở Bước 1 (Lines 1189–1199)
- **Hàm sửa**: `advance_upload_wizard`
- **Mã nguồn**:
```python
# Đảm bảo chọn Đối tượng khán giả (Audience) ở Bước 1 trước khi bấm Next
if cur_step in ("DETAILS", "") or attempt == 0:
    is_aud_selected = await _is_not_for_kids_selected(page)
    if not is_aud_selected:
        logger.info("Chưa chọn đối tượng khán giả ở Bước 1 — Đảm bảo chọn 'Không dành cho trẻ em'...")
        await _ensure_not_for_kids_audience(page)
        await asyncio.sleep(0.5)
```
- **Tác dụng**: Đảm bảo trường bắt buộc Đối tượng khán giả luôn được chọn trước khi rời Bước 1. Tránh việc YouTube Studio khóa nút Next ở các bước tiếp theo.

#### 3. Chờ nút Next sẵn sàng sau khi gửi đánh giá Ad Suitability (Lines 1275–1295)
- **Hàm sửa**: `advance_upload_wizard`
- **Mã nguồn**:
```python
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
```
- **Tác dụng**: Giải quyết dứt điểm hiện tượng nút Next bị disable 2–5 giây sau khi nộp questionnaire Ad Suitability, giúp wizard chuyển tiếp mượt sang bước tiếp theo mà không bị timeout hay kẹt click.

#### 4. Củng cố giải phóng Modal "Vẫn xuất bản" (Publish anyway) 3 Lần (Lines 1570–1585)
- **Hàm sửa**: `upload_video`
- **Mã nguồn**:
```python
logger.info("Đã bấm nút Publish/Lưu (#done-button) lần 1 (%s) — chờ xác nhận từ YouTube Studio...", done_click_mode)

# Bổ sung vòng lặp 3 lần kiểm tra popup xác nhận với độ trễ 1.5 giây giữa mỗi lần để bắt dính modal cảnh báo xử lý SD/HD của YouTube Studio
for _popup_check_idx in range(3):
    dismissed = await dismiss_publish_anyway_dialogs(page)
    if dismissed:
        logger.info("Đã phát hiện và giải phóng popup xác nhận xuất bản (lần kiểm tra %d/3).", _popup_check_idx + 1)
    await asyncio.sleep(1.5)
```
- **Tác dụng**: Bắt dính ngay cả khi YouTube Studio hiển thị modal trễ (sau 1–3 giây tính từ lúc bấm Save), giải phóng hoàn toàn hộp thoại lưu để hoàn tất upload.

---

## 3. Đồng Bộ Sang Thư Mục `roots/browsermulti/`
Hai tệp nguồn sau khi chỉnh sửa tại `browser_engine/` đã được sao chép đồng bộ sang thư mục phân phối `roots/browsermulti/`:
- `roots/browsermulti/actions/bkt/monitor.py`
- `roots/browsermulti/actions/upload_actions.py`

Cả 4 tệp đã được kiểm tra cú pháp Python (`python -m py_compile`) thành công 100% không có lỗi.
