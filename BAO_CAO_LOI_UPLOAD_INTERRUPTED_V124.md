# BÁO CÁO KỸ THUẬT: ĐIỀU TRA LỖI "UPLOAD INTERRUPTED" TRÊN YOUTUBE STUDIO VÀ LỖI KHÔNG TÁI SỬ DỤNG KÊNH TEST (V1.2.4)

- **Mã báo cáo:** RTM-BUG-V124-UPLOAD-INTERRUPTED
- **Thời gian lập:** 16/11/2026
- **Trạng thái:** Đã khoanh vùng chính xác 100% nguyên nhân gốc rễ
- **Môi trường ghi nhận:** Windows 10, Tauri v2, Playwright MultiBrowser, SQLite retubematrix.db

---

## 1. TỔNG QUAN HIỆN TƯỢNG TỪ HÌNH ẢNH VÀ LOGS THỰC TẾ

1. **Hiện tượng trên Kênh Đích (Hình 2 - Kênh Cuentos de Amor):**
   - Video `na niña nacida de un ginseng mágico encontró hierbas valiosas para ayudar a su padre adoptivo` (dung lượng thực tế 6.54 GB) hiển thị icon tam giác đỏ cảnh báo cùng thông báo lỗi:
     `Upload Interrupted: Click "resume upload" and select na niña nacida de un ginseng mágico...reup_ready.mp4 to resume`.
   - Video kế tiếp `Tras tener 7 hijos, nació una niña con un sistema divino que trajo lluvia y fortuna a su familia` cũng gặp hiện tượng tương tự: `Upload Interrupted`.
   - Video thứ 4 `Una niña encontrada en la nieve...` bị `Processing abandoned: The video could not be processed`.

2. **Hiện tượng luân chuyển Kênh Test không nhất quán (Hình 1 & Hình 3):**
   - Video 1 đã được upload Unlisted lên kênh `Test: test 2` và đang chờ kiểm tra Content ID.
   - Khi chạy tiếp hoặc khởi động lại Auto Reup, hệ thống không nhận diện được video đã nằm trên `test 2` mà lại mở một kênh test khác (`test 1` hoặc `test ms3`) để upload lại từ đầu, làm lãng phí băng thông và hao hụt hạn ngạch (quota) hàng ngày của các kênh test.

---

## 2. NGUYÊN NHÂN GỐC RỄ LỖI "UPLOAD INTERRUPTED" TRÊN YOUTUBE STUDIO

Qua đối soát chéo mã nguồn tại `browser_engine/actions/upload_actions.py`, `roots/browsermulti/runner.py` và `src-tauri/src/commands/bkt/publish.rs`, chúng tôi xác định được chuỗi lỗi liên hoàn sau:

### Nguyên nhân 2.1: Điều hướng sớm phá hủy luồng upload (Destructive Premature Navigation)
- **Vị trí lỗi:** `browser_engine/actions/upload_actions.py`, dòng 1680–1685.
```python
# LUỒNG UPLOAD (cả standalone và BKT handover):
# Tự động điều hướng ngay sang tab Nội dung (/videos/upload) để giao diện hiển thị danh sách video và tiến trình upload realtime
try:
    from actions.upload.navigation import goto_channel_videos
    await goto_channel_videos(page)
except Exception as nav_err:
    logger.debug("Lỗi nhẹ khi tự động chuyển sang tab Nội dung ngay sau lưu: %s", nav_err)
```
- **Cơ chế gây lỗi:**
  - YouTube Studio sử dụng giao thức TUS (Resumable Upload Protocol) chạy ngầm thông qua JavaScript bên trong hộp thoại tải lên (`ytcp-uploads-dialog` / `ytcp-uploads-still-processing-dialog`).
  - Khi lệnh `await goto_channel_videos(page)` được gọi ngay sau khi bấm nút Lưu/Xuất bản, trình duyệt Chromium bị ép điều hướng (navigate) sang trang URL mới `/videos/upload`.
  - Việc chuyển hướng trang web **ngay lập tức hủy bỏ (abort) toàn bộ các kết nối mạng XMLHttpRequest / Fetch** đang truyền tải dữ liệu của tệp 6.54 GB từ máy người dùng lên máy chủ YouTube.
  - Máy chủ YouTube phát hiện kết nối TCP bị ngắt giữa chừng khi mới nhận được một phần dữ liệu, lập tức đánh dấu video ở trạng thái dở dang và yêu cầu người dùng bấm "Resume upload" để chọn lại tệp cục bộ.

### Nguyên nhân 2.2: Nhận diện sai tín hiệu hoàn tất upload (False Positive Completion Detection)
- **Vị trí lỗi:** `browser_engine/actions/upload_actions.py`, dòng 1757–1818 và định nghĩa hàm `is_upload_stream_complete`.
- Trong danh sách các chuỗi nhận diện `definitive_processing_signatures`, tồn tại chuỗi:
  `"quá trình xử lý sẽ bắt đầu ngay sau đây"` ("Processing will begin shortly").
- Khi Chromium vừa chuyển sang bảng danh sách video (/videos/upload), hàng video tương ứng có thể hiển thị văn bản tạm thời "Quá trình kiểm tra sắp bắt đầu..." hoặc "Quá trình xử lý sẽ bắt đầu ngay sau đây".
- Bộ kiểm tra nhận diện nhầm chuỗi này là upload đã xong 100%, thoát khỏi vòng lặp `while time.time() - upload_poll_start < max_upload_seconds` chỉ sau **69 giây** (từ 14:59:21 đến 15:00:30).
- Trên thực tế, một tệp video nặng 6.54 GB trên đường truyền mạng gia đình thông thường cần từ 10 đến 25 phút mới có thể truyền tải hết 100% byte dữ liệu.

### Nguyên nhân 2.3: Xóa vội tệp cục bộ và đóng trình duyệt sớm (Premature File Deletion & Process Teardown)
- **Vị trí lỗi:** `src-tauri/src/commands/bkt/publish.rs`, dòng 182–199.
```rust
// XÓA NGAY FILE VIDEO GỐC, REUP VÀ THUMBNAIL ĐỂ TỐI ƯU Ổ CỨNG
let freed_bytes = cleanup_video_and_reup_files(
    &job.video_path,
    job.reup_path.as_deref(),
    job.thumbnail_path.as_deref(),
);
```
- Ngay khi tiến trình Python trả về `success: true` giả mạo, Backend Rust lập tức:
  1. Đóng phiên trình duyệt Playwright Chromium của Profile Kênh Đích.
  2. Kích hoạt hàm `cleanup_video_and_reup_files`, xóa vĩnh viễn tệp `na niña nacida de un ginseng mágico...reup_ready.mp4` trên ổ cứng `Downloads/.../[DA_EDIT]...`.
- Khi máy chủ YouTube thiếu byte và người dùng bấm vào nút "Resume upload" trên giao diện Studio, tệp video gốc trên đĩa cứng đã bị xóa sạch, biến video thành trạng thái lỗi không thể phục hồi.

---

## 3. NGUYÊN NHÂN GỐC RỄ LỖI KHÔNG TÁI SỬ DỤNG KÊNH TEST VÀ XOAY VÒNG MÙ QUÁNG

### Nguyên nhân 3.1: Hàm `dispatch_batch_bkt_test` luôn tạo Job rỗng không tra cứu lịch sử
- **Vị trí lỗi:** `src-tauri/src/commands/bkt/dispatch.rs`, dòng 295–320.
```rust
let job_id = uuid::Uuid::new_v4().to_string();
let job = BktTestJob {
    id: job_id.clone(),
    test_channel_id: channel.id.clone(),
    ...
    youtube_video_id: None, // Gán cứng giá trị None, không kiểm tra cơ sở dữ liệu!
    ...
};
```
- Khi chạy lại Auto Reup hoặc bấm kiểm tra lại, hệ thống không thực hiện truy vấn `SELECT test_channel_id, youtube_video_id FROM bkt_test_jobs WHERE video_path = ?`.
- Do gán `youtube_video_id = None`, cờ `can_reuse_yt_id = job.youtube_video_id.is_some()` trong `pipeline.rs` luôn trả về `false`, buộc hệ thống phải upload lại từ đầu thay vì chỉ mở Studio kiểm tra trạng thái Content ID.

### Nguyên nhân 3.2: Thuật toán Load Balancing xoay kênh theo Quota còn lại
- **Vị trí lỗi:** `src-tauri/src/commands/bkt/dispatch.rs`, dòng 230–275.
- Khi tham số `target_test_channel_id` để trống, hệ thống sắp xếp danh sách kênh test theo `remaining_quota` giảm dần và phân bổ xoay vòng Round-Robin.
- Khi video 1 được gán cho `test 2`, quota của `test 2` giảm xuống. Khi video 2 gửi vào, `test 1` có quota cao hơn nên được gán cho `test 1`. Khi video 4 gửi vào, `test ms3` được gán.
- Do không có cơ chế gắn kết cố định (Affinity) giữa video và kênh test đã từng tải nó lên, mỗi lần chạy hệ thống lại mở một profile Chromium khác nhau.

---

## 4. KẾT LUẬN VÀ NGUYÊN TẮC KHẮC PHỤC TRIỆT ĐỂ

1. **Tuyệt đối không điều hướng trang (`goto_channel_videos`)** chừng nào upload stream chưa đạt đúng 100% bytes và hộp thoại tải lên chưa xác nhận chuyển sang giai đoạn xử lý backend.
2. **Theo dõi chính xác tiến trình TUS / XHR**: Chỉ dựa vào giá trị số thực tế từ thẻ Polymer progress bar (`aria-valuenow`, `value`) hoặc thông báo chính thức "Đã tải lên 100%", loại bỏ hoàn toàn các chuỗi phỏng đoán mơ hồ.
3. **Chỉ xóa tệp reup khi video đã thực sự xuất bản thành công**: Giữ lại tệp trên ổ cứng cho đến khi YouTube xác nhận video đã ở trạng thái Công khai (`public`) hoặc Không công khai (`unlisted`) an toàn trên kênh.
4. **Áp dụng cơ chế Video Checkpoint & Channel Affinity**: Tra cứu bảng `bkt_test_jobs` trước khi dispatch; nếu video đã có `youtube_video_id` trên một kênh test, cố định gán lại kênh test đó và chỉ chạy lệnh kiểm tra bản quyền, không upload lại.
