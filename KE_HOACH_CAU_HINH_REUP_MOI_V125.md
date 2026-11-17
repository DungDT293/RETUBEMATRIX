# KẾ HOẠCH TRIỂN KHAI: CẤU HÌNH REUP KIỂU MỚI, BATCH REUP TỐI ƯU PHẦN CỨNG & SỬA LỖI UPLOAD (V1.2.5)

- **Mã kế hoạch:** MASTER-PLAN-V125-REUP-WORKFLOW
- **Thời gian lập:** 16/11/2026
- **Trạng thái:** Chờ phê duyệt (Ready for Review)
- **Mục tiêu:** Tinh gọn giao diện, hiện đại hóa chu trình Reup, bảo vệ linh kiện máy tính khi xử lý hàng loạt, và khắc phục triệt để các lỗi upload / luân chuyển kênh test.

---

## I. MỤC TIÊU VÀ PHẠM VI TRIỂN KHAI

Hệ thống sẽ được nâng cấp đồng bộ ở 4 phân hệ chính:
1. **Phân hệ 1 - Sửa lỗi nền tảng (Foundation Fixes)**:
   - Sửa lỗi `Upload Interrupted` trên YouTube Studio (chống điều hướng sớm, sửa chữ ký nhận diện 100%, bảo vệ tệp video cục bộ không bị xóa vội).
   - Sửa lỗi không nhớ kênh test cũ: Tích hợp cơ chế Checkpoint & Channel Affinity trong `dispatch.rs` để không bao giờ upload test lại video đã có ID trên kênh test.
2. **Phân hệ 2 - Tái cấu trúc Modal Cài đặt Kênh Đối thủ thành "Cấu hình Reup Kiểu Mới"**:
   - Loại bỏ các thành phần rườm rà, dư thừa.
   - Khi kênh được đánh dấu là "Kênh Sạch / Tin Cậy": cho phép tải tùy chọn (toàn bộ video hoặc chọn từng video).
   - Tự động trích xuất và lưu trữ Tiêu đề + Mô tả gốc vào cơ sở dữ liệu.
   - Cấu hình Kênh Đích để upload thẳng kèm tùy chọn giãn cách thời gian giữa các video (tùy chỉnh hoặc mặc định 30 - 60 phút có Smart Jitter).
3. **Phân hệ 3 - Xử lý Reup Hàng Loạt & Bộ Điều Tiết Phần Cứng (Batch Reup Load Governor)**:
   - Cho phép chọn nhiều tệp video cùng lúc trên giao diện Reup Pipeline.
   - Preflight Scan tự động đánh giá codec, độ phân giải, bitrate, logo/subtitle để chọn phương án render tối ưu nhất.
   - Quản lý tài nguyên CPU/GPU: giới hạn luồng an toàn (tối đa 2-4 threads), lập hàng đợi tuần tự tránh nghẽn CPU và chống đơ máy.
4. **Phân hệ 4 - Tiện ích Thẻ Kênh (Channel Card Quick Access)**:
   - Bổ sung nút bấm mở trực tiếp thư mục `[DA_EDIT]` chứa các video đã render thành công ngay trên thẻ kênh.

---

## II. THIẾT KẾ CHI TIẾT TỪNG PHÂN HỆ

### PHÂN HỆ 1: KHẮC PHỤC TRIỆT ĐỂ LỖI UPLOAD VÀ XOAY KÊNH TEST

#### 1. Sửa lỗi `Upload Interrupted` trong `browser_engine/actions/upload_actions.py` & `publish.rs`:
- **Chấm dứt điều hướng sớm**:
  - Di chuyển khối lệnh `await goto_channel_videos(page)` từ trước vòng lặp upload xuống **SAU KHI** vòng lặp upload stream đã đạt 100% bytes và hộp thoại xác nhận bắt đầu xử lý backend.
  - Tuyệt đối giữ nguyên trang upload dialog trong suốt quá trình truyền dữ liệu TUS.
- **Làm sạch chữ ký hoàn tất (`is_upload_stream_complete`)**:
  - Xóa bỏ triệt để các cụm từ dự báo tương lai: `"quá trình xử lý sẽ bắt đầu ngay sau đây"`, `"processing will begin shortly"`, `"đang xử lý"`, `"processing"`.
  - Chỉ trả về `True` khi:
    * `percent >= 100`.
    * Hoặc xuất hiện các thông báo dứt khoát: `"đã hoàn tất quá trình tải lên"`, `"100% uploaded"`, `"upload complete"`, `"đang xử lý bản sd"`, `"đang xử lý bản hd"`.
- **Bảo vệ tệp video cục bộ (`publish.rs`)**:
  - Không xóa tệp `reup_ready.mp4` ngay lập tức. Chỉ dọn dẹp sau khi video đã được kiểm tra thấy hiển thị an toàn trên danh sách video kênh YouTube Studio với trạng thái hợp lệ.

#### 2. Khắc phục lỗi xoay kênh test trong `src-tauri/src/commands/bkt/dispatch.rs`:
- Thêm hàm `get_existing_bkt_checkpoint_db(source_ref_id, video_path)` trong `database/bkt_channels.rs`.
- Trước khi thực hiện Round-Robin trong `dispatch_batch_bkt_test`:
  * Quét kiểm tra xem video này đã từng được gán cho kênh test nào và đã có `youtube_video_id` hay chưa.
  * Nếu đã có: Kế thừa lại `test_channel_id`, gán lại `youtube_video_id`, **không trừ quota mới**, và kích hoạt cờ `can_reuse_yt_id = true` để Chromium chỉ mở Studio kiểm tra bản quyền, tiết kiệm 100% thời gian upload test lại.

---

### PHÂN HỆ 2: CẤU HÌNH REUP KIỂU MỚI & LẬP LỊCH ĐĂNG KÊNH ĐÍCH

#### 1. Chuyển đổi giao diện `ChannelSettingsDialog.tsx`:
- Loại bỏ các trường thông tin rườm rà (thẻ từ khóa gợi ý trùng lặp, khối SEO trùng ở nhiều tab, thông báo tĩnh rối mắt).
- Cấu trúc lại thành 3 khối điều khiển trực quan:
  - **Khối A: Định danh & Đánh dấu Kênh Sạch**:
    * Switch toggle: `Kênh Sạch / Tin Cậy (Bỏ qua BKT - Tải & Đăng thẳng Kênh Đích)`.
    * Bộ chọn Kênh Đích gắn kết (Target Profile).
  - **Khối B: Tùy chọn Tải Video**:
    * Radio mode: `Tải toàn bộ video mới` hoặc `Chọn lọc từng video thủ công` (tích chọn trên danh sách).
    * Bộ lọc cơ bản: Loại nội dung (Tất cả, Video dài, Shorts) & Khoảng thời lượng (giây).
  - **Khối C: Lập lịch Xuất bản & Giãn cách Thời gian**:
    * Switch toggle: `Tự động Upload lên Kênh Đích sau khi Edit xong`.
    * Khoảng cách giãn cách giữa các video:
      - Ô nhập số phút giãn cách (cho phép nhập từ 15 đến 360 phút).
      - Checkbox mặc định: `Giãn cách ngẫu nhiên an toàn (30 - 60 phút)`.
      - Cơ chế Smart Jitter: Tự động cộng/trừ ngẫu nhiên 5-10 phút để tránh thuật toán YouTube quét tần suất đăng spam máy móc.

#### 2. Trích xuất & Lưu trữ Tiêu đề + Mô tả gốc:
- Bổ sung migration SQLite trong `connection.rs`:
  * Cột `original_title TEXT` và `original_description TEXT` trong bảng `channel_videos`.
  * Cột `direct_upload_target INTEGER NOT NULL DEFAULT 0` trong bảng `followed_channels`.
  * Cột `upload_interval_minutes INTEGER NOT NULL DEFAULT 45` trong bảng `followed_channels`.
  * Cột `download_mode TEXT NOT NULL DEFAULT 'all'` trong bảng `followed_channels`.
- Cập nhật hàm đồng bộ video kênh (`sync_channel_videos_cmd` và `yt-dlp` info extractor) để bóc tách toàn bộ `description` và ghi nhận vào cơ sở dữ liệu.

---

### PHÂN HỆ 3: XỬ LÝ REUP HÀNG LOẠT & BỘ ĐIỀU TIẾT PHẦN CỨNG (BATCH REUP GOVERNOR)

#### 1. Chọn nhiều tệp cùng lúc (Multi-file Picker):
- Cập nhật `ReupPipelineSection.tsx`:
  * Nút "Chọn file từ máy tính" hỗ trợ thuộc tính `multiple: true`.
  * Hỗ trợ kéo thả đồng thời nhiều tệp `.mp4`, `.mkv`, `.mov`.
  * Hiển thị bảng danh sách hàng đợi (Queue Table): Tên video, Dung lượng, Thời lượng, Codec, Trạng thái Preflight, và Tiến độ Render.

#### 2. Bộ kiểm tra Preflight Scan 2.0:
- Quét nhanh siêu dữ liệu qua FFprobe:
  * Nhận diện Codec video (`h264`, `hevc`, `vp9`, `av1`), Độ phân giải (1080p, 2K, 4K), Tỷ lệ khung hình và Bitrate.
  * Lấy mẫu 10 khung hình phát hiện vùng Logo góc và Subtitle viền đáy.
- Lựa chọn giải pháp render tối ưu:
  * Nếu phần cứng hỗ trợ NVENC GPU (`probe_hardware_encoder` trả về `h264_nvenc`): Ưu tiên GPU để thời gian render giảm 70% và không chiếm dụng CPU.
  * Nếu dùng CPU (`libx264`): Giới hạn nghiêm ngặt theo thuật toán `calculate_safe_ffmpeg_threads` (tối đa 2 đến 4 luồng, chừa tối thiểu 2-4 cores cho hệ điều hành và giao diện app).

#### 3. Bộ điều phối hàng đợi tuần tự (Sequential Semaphore Pool):
- Chạy tuần tự từng video một (1-by-1 render) hoặc tối đa 2 video song song nếu máy có trên 16 cores và 32GB RAM.
- Gán cờ độ ưu tiên tiến trình Windows: `BELOW_NORMAL_PRIORITY_CLASS` cho tiến trình FFmpeg để người dùng lướt web, làm việc không bị giật lag chuột hoặc treo ứng dụng.

---

### PHÂN HỆ 4: TIỆN ÍCH TRÊN THẺ KÊNH (CHANNEL CARD QUICK ACCESS)

#### 1. Nút mở nhanh thư mục `[DA_EDIT]` trên `ChannelCard.tsx`:
- Bổ sung nút bấm trực tiếp tại thanh công cụ của thẻ kênh (bên cạnh nút "Quét ngay" / "Cài đặt & Reup"):
  * Icon Lucide đơn sắc: `FolderCheck` (chuẩn phẳng, không emoji).
  * Tiêu đề/Tooltip: `Mở thư mục video đã edit ([DA_EDIT])`.
  * Hiển thị số lượng tệp đã edit: ví dụ `(3 video)`. Nếu chưa có video nào, nút hiển thị mờ.
- Khi người dùng click:
  * Gọi lệnh IPC Rust `open_channel_edited_folder_cmd(channel_id: String)`.

#### 2. Backend Command `open_channel_edited_folder_cmd`:
- Nhận `channel_id`.
- Tìm thư mục tải về của kênh tại `Downloads/{channel_name}/`.
- Quét các thư mục con có tiền tố `[DA_EDIT]_`.
- Sử dụng lệnh `explorer.exe` trên Windows để mở ngay thư mục đích trước mắt người dùng.

---

## III. MA TRẬN TƯƠNG THÍCH IPC VÀ KIỂM TOÁN CHUẨN MỰC

1. **Chuẩn IPC Tauri v2**:
   - Tất cả tham số Backend Rust struct đều derive cả `camelCase` và `snake_case` thông qua serde attribute: `#[serde(rename_all = "camelCase")]` kèm fallback.
2. **Quy chuẩn Giao diện & Mã lệnh (Anti-Gimmick / Clean UI)**:
   - Tuyệt đối không sử dụng emoji trong nhãn nút, tiêu đề, mã lỗi hay giao diện.
   - Sử dụng icon SVG Lucide đơn sắc tối giản.
3. **Quy trình Kiểm tra Chất lượng (Pre-commit / Verification)**:
   - Kiểm tra linter: `bun run biome check --write .`
   - Kiểm tra TypeScript: `bun run tsc -b`
   - Kiểm tra Rust: `cargo check` trong `src-tauri/`
   - Đồng bộ từ điển đa ngôn ngữ (i18n): `en`, `vi`, `zh-CN`.

---

## IV. TRÌNH TỰ BƯỚC THỰC HIỆN TIẾP THEO

1. **Bước 1**: Nhận phản hồi và xác nhận từ người dùng đối với 2 tệp báo cáo kỹ thuật:
   - `BAO_CAO_LOI_UPLOAD_INTERRUPTED_V124.md`
   - `KE_HOACH_CAU_HINH_REUP_MOI_V125.md`
2. **Bước 2**: Tiến hành cập nhật mã nguồn theo từng giai đoạn sau khi người dùng phê duyệt.
