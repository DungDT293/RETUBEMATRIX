# NHẬT KÝ THỰC THI NÂNG CẤP HỆ THỐNG V1.2.5

- **Thời gian thực hiện**: 2026-11-16
- **Phiên bản phát hành**: v1.2.5
- **Mục tiêu**: Khắc phục dứt điểm lỗi "Upload Interrupted" trên YouTube Studio, triển khai Cấu hình Reup kiểu mới, hàng đợi Batch Reup tuần tự bảo vệ phần cứng và phím tắt mở thư mục video đã edit trên thẻ kênh.

---

## 1. PHÂN HỆ 1: VÁ NỀN TẢNG VÀ KHẮC PHỤC TRIỆT ĐỂ LỖI UPLOAD INTERRUPTED

### A. Triệt tiêu TCP Reset do điều hướng sớm
- **Tệp chỉnh sửa**:
  + `browser_engine/actions/upload_actions.py`
  + `roots/browsermulti/actions/upload_actions.py` (Đồng bộ nhị phân 100%)
- **Thay đổi logic**:
  + Xóa bỏ hoàn toàn lệnh gọi `goto_channel_videos` trước và trong vòng lặp chờ upload stream TUS. Trước đây, việc chuyển trang khi dữ liệu đang đẩy khiến Chromium phát tín hiệu TCP Reset / ERR_ABORTED làm YouTube Studio báo lỗi "Upload Interrupted".
  + Chỉ cho phép chuyển sang `/videos/upload` khi cờ `upload_stream_finished == True` và tất cả modal hoàn tất đã đóng an toàn.

### B. Loại bỏ chữ ký hoàn tất giả mạo
- Xóa bỏ các chuỗi thông báo mang tính dự đoán tương lai khỏi `definitive_processing_signatures` trong hàm `is_upload_stream_complete`:
  + `"quá trình xử lý sẽ bắt đầu ngay sau đây"`
  + `"processing will begin shortly"`
  + `"đang xử lý"` / `"processing"`
- Đảm bảo hệ thống chỉ xác nhận hoàn tất tải lên khi phần trăm đạt đủ 100% hoặc chữ ký kiểm tra bản quyền Content ID thực tế xuất hiện.

### C. Bảo vệ tệp video đã edit trên đĩa cứng
- **Tệp chỉnh sửa**: `src-tauri/src/commands/bkt/publish.rs`
- **Thay đổi**: Xóa bỏ lệnh `std::fs::remove_file(reup_path).ok()` ngay sau khi upload test hoàn tất. Giữ lại tệp `reup_ready.mp4` trên ổ cứng để YouTube Studio có thể sử dụng nút "Resume upload" và người dùng có thể xem lại trong thư mục `[DA_EDIT]`.

### D. Cơ chế Checkpoint & Kế thừa Kênh Test (Channel Affinity)
- **Tệp chỉnh sửa**:
  + `src-tauri/src/database/bkt_channels.rs`
  + `src-tauri/src/commands/bkt/dispatch.rs`
- **Thay đổi**:
  + Thêm hàm `get_existing_bkt_checkpoint_db` kiểm tra video đã tồn tại trên kênh test nào trong quá khứ.
  + Nếu tìm thấy checkpoint hợp lệ với `youtube_video_id` và video file tồn tại, hệ thống tự động gán lại đúng kênh test cũ thay vì chạy Round-Robin mở kênh mới.
  + Không trừ quota ngày khi kế thừa video cũ (`daily_used` không bị tăng trùng lặp).

---

## 2. PHÂN HỆ 2: CẤU HÌNH REUP KIỂU MỚI & QUẢN LÝ KÊNH UY TÍN

### A. Migration cơ sở dữ liệu SQLite
- **Tệp chỉnh sửa**: `src-tauri/src/database/connection.rs`
- **Bổ sung cột cho bảng `followed_channels`**:
  + `is_trusted_clean`: Cờ đánh dấu kênh sạch đã qua kiểm định.
  + `download_mode`: Chế độ tải (`all` - toàn bộ kênh, `selected` - chỉ tải video được chọn).
  + `direct_upload_target`: ID hồ sơ Kênh Đích để xuất bản video.
  + `upload_interval_mode`: Chế độ giãn cách (`fixed` hoặc `jitter_random`).
  + `upload_interval_minutes`: Số phút giãn cách giữa các lần đăng (30 - 60 phút).
- **Bổ sung cột cho bảng `channel_videos`**:
  + `original_title`: Lưu trữ nguyên văn tiêu đề gốc của video đối thủ.
  + `original_description`: Lưu trữ nguyên văn mô tả gốc của video đối thủ.

### B. Cập nhật Model & Layer Truy vấn Database
- **Tệp chỉnh sửa**:
  + `src-tauri/src/types/channel.rs`
  + `src-tauri/src/database/channels.rs`
  + `src-tauri/src/services/polling.rs`
  + `src-tauri/src/commands/channels.rs`
  + `src/lib/types.ts`
- Thêm hàm `update_channel_reup_config_db` và lệnh IPC `update_channel_reup_config_cmd` hỗ trợ tham số kép camelCase/snake_case.

### C. Tái cấu trúc Giao diện Cài đặt Kênh
- **Tệp chỉnh sửa**: `src/pages/channels/ChannelSettingsDialog.tsx`
- Tinh giản giao diện, tập trung vào cấu hình Reup cốt lõi:
  + Công tắc Kênh Sạch Uy Tín.
  + Tùy chọn chế độ tải (Tất cả video vs. Chỉ video được chọn).
  + Lựa chọn Kênh Đích và chế độ xuất bản (Công khai, Riêng tư, Không công khai).
  + Cài đặt thời gian giãn cách với Smart Jitter (30 - 60 phút) giúp kênh phát triển tự nhiên, tránh bị thuật toán YouTube đánh cờ spam.

---

## 3. PHÂN HỆ 3: HÀNG ĐỢI BATCH REUP TUẦN TỰ & BẢO VỆ PHẦN CỨNG

### A. Backend Quét Thư Mục Video
- **Tệp chỉnh sửa**:
  + `src-tauri/src/commands/reup.rs`
  + `src-tauri/src/lib.rs`
- Thêm lệnh IPC `scan_directory_videos_cmd` nhận `dir_path` / `dirPath`, tự động quét và lọc các tệp video hợp lệ (`.mp4`, `.mkv`, `.mov`, `.webm`, `.avi`, `.flv`, `.m4v`).

### B. Giao diện Hàng Đợi Batch Reup Chuyên Biệt
- **Tệp chỉnh sửa**: `src/pages/reup/ReupPipelineSection.tsx`
- Bổ sung thanh chuyển đổi chế độ xem:
  + `Hàng đợi Nhiều tệp (Batch Queue)`: Xử lý hàng loạt video.
  + `Xử lý Đơn tệp (Single File)`: Kiểm tra chi tiết Checksum MD5/SHA256 trên một video đơn lẻ.
- **Tính năng nổi bật của Batch Queue**:
  + Hỗ trợ chọn nhiều file (`open({ multiple: true })`).
  + Nút nạp cả thư mục video.
  + Khu vực kéo thả (Drag & Drop) nhận diện file video.
  + Lựa chọn phương án Reup: Tự động Thích ứng AI (Adaptive Preflight), Cấp độ 1 (95% gốc), Cấp độ 2 (Deep Evasion).
  + Cơ chế **Render tuần tự 1-by-1 (Sequential Queue Execution)**: Không bao giờ chạy song song để bảo vệ CPU/GPU không bị quá nhiệt hay tràn RAM.
  + Tiến độ thời gian thực cho từng tệp (FPS, tốc độ render, thời gian còn lại) kết hợp thanh tiến độ tổng thể của toàn bộ hàng đợi.
  + Nút dừng hàng đợi an toàn bất kỳ lúc nào mà không làm hỏng các video đã render trước đó.

---

## 4. PHÂN HỆ 4: TRUY CẬP NHANH THƯ MỤC VIDEO ĐÃ EDIT TRÊN THẺ KÊNH

### A. Lệnh IPC Backend
- **Tệp chỉnh sửa**:
  + `src-tauri/src/commands/channels.rs`
  + `src-tauri/src/lib.rs`
- Thêm lệnh:
  + `open_channel_edited_folder_cmd`: Tự động tìm thư mục `[DA_EDIT]*` của kênh trong thư mục Downloads và mở trực tiếp bằng Windows Explorer.
  + `get_channel_edited_folder_stats_cmd`: Đếm số lượng video đã xử lý và trả về đường dẫn thư mục.

### B. Nút Hành Động Trên Giao Diện Thẻ Kênh
- **Tệp chỉnh sửa**: `src/pages/channels/ChannelCard.tsx`
- Thêm nút "Thư mục Edit" với icon đơn sắc Lucide `FolderCheck` tại thanh công cụ Action Buttons trên cùng bên phải.
- Hiển thị badge số lượng video đã hoàn tất (ví dụ: `(3)`).
- Bấm vào mở ngay thư mục trên Explorer và hiển thị thông báo toast.

---

## 5. PHÂN HỆ 5: HOÀN THIỆN CƠ CHẾ CHỈNH SỬA & ĐĂNG NGAY (ĐƠN LẺ & HÀNG LOẠT VỚI SMART JITTER)

### A. Sửa Lỗi IPC Lưu Cấu Hình Reup
- **Hiện tượng**: Khi lưu modal "Cấu hình Reup & Kênh Đích", xuất hiện lỗi `invalid args payload for command update_channel_reup_config_cmd: duplicate field channel_id`.
- **Nguyên nhân**: Frontend gửi đồng thời `channelId` và `channel_id` trong cùng một JSON object, trong khi Rust serde có alias trùng lặp khiến deserializer phát hiện 2 key cùng gán vào một trường.
- **Khắc phục**:
  + Frontend `ChannelSettingsDialog.tsx`: Chuẩn hóa gửi duy nhất định dạng `snake_case`.
  + Backend `src-tauri/src/commands/channels.rs`: Dọn dẹp các alias trùng lặp trên struct `UpdateChannelReupConfigPayload`.
  + Database `src-tauri/src/database/channels.rs`: Sửa câu lệnh SQL cập nhật `target_profile_id = ?1, bkt_profile_id = ?1` thay vì dùng `COALESCE` để cho phép người dùng xóa/gỡ bỏ hồ sơ kênh đích khi cần.

### B. Nút "Chỉnh Sửa & Đăng Ngay" Cho Video Đơn Lẻ Đã Tải Về
- **Tệp chỉnh sửa**: `src/pages/channels/ChannelVideoAccordion.tsx`
- Bổ sung nút **"Chỉnh sửa & Đăng ngay"** (icon `Send`, màu purple tinh tế) xuất hiện tại mỗi dòng video đã tải về máy (`isDownloaded === true`).
- Khi click:
  + Tự động trích xuất tiêu đề tối ưu AI (<=95 ký tự, chuẩn word-boundary).
  + Tự động gắn kèm companion thumbnail `.jpg` và mô tả chuẩn hóa có Fair Use Disclaimer.
  + Đưa vào hàng đợi Reup và xuất bản trực tiếp lên Hồ sơ Kênh Đích được gán.
  + Nếu kênh chưa gán Kênh Đích, hiển thị cảnh báo hướng dẫn người dùng vào Cài đặt để chọn Profile.

### C. Nút "Chỉnh Sửa & Đăng Ngay (X)" & Bộ Giãn Cách Smart Jitter Cho Hàng Loạt Video
- **Tệp chỉnh sửa**: `src/pages/channels/ChannelVideoAccordion.tsx`
- Bổ sung nút **"Chỉnh sửa & Đăng ngay ({selectedCount})"** trên thanh công cụ hàng loạt khi tick chọn nhiều video.
- Quy trình tuần tự khép kín (1-by-1):
  1. Kiểm tra video đã có trên ổ cứng hay chưa (nếu chưa thì tự động tải về trước).
  2. Tự động trích xuất Tiêu đề + Thumbnail vào thư mục `[DA_EDIT]`.
  3. Reup và xuất bản lên Kênh Đích.
  4. Áp dụng cơ chế giãn cách Smart Jitter (30 - 60 phút ngẫu nhiên) hoặc số phút cố định đã cấu hình trong Cài đặt Kênh giữa các lần xuất bản.
  5. Có bộ đếm thời gian đếm ngược thời gian thực trên giao diện.
  6. Bổ sung nút **"Dừng lại"** (variant `destructive`) để người dùng có thể ngắt chu trình bất kỳ lúc nào một cách an toàn.

### D. Tối Ưu Thuật Toán Điều Phối Cho Kênh Sạch Uy Tín (Bỏ Qua Kênh Test)
- **Tệp chỉnh sửa**:
  + `src-tauri/src/commands/bkt/dispatch.rs`
  + `src-tauri/src/commands/bkt/pipeline.rs`
  + `src-tauri/src/database/bkt_channels.rs`
- Cho phép video thuộc kênh sạch uy tín (`is_trusted_clean = true`) hoặc Fast-Track được đưa thẳng vào hàng đợi Reup & Đăng mà không yêu cầu phải cấu hình Kênh Test trong hệ thống và không trừ quota của kênh test.

---

## 6. NÂNG CẤP PHIÊN BẢN V1.2.5 & KIỂM TRA HỢP CHUẨN

### A. Đồng bộ phiên bản 1.2.5
- `package.json`: `"version": "1.2.5"`
- `src-tauri/Cargo.toml`: `version = "1.2.5"`
- `src-tauri/tauri.conf.json`: `"version": "1.2.5"`
- `CHANGELOG.md`: Thêm mục `## [1.2.5] - 2026-11-16` kèm mục `## [Unreleased]` trống.
- `docs/CHANGELOG.vi.md`: Cập nhật tiếng Việt chuẩn quy ước.
- `docs/CHANGELOG.zh-CN.md`: Cập nhật tiếng Trung Giản thể chuẩn quy ước.

---

## 7. KHẮC PHỤC TRIỆT ĐỂ LỖI MÀN HÌNH TRẮNG STUDIO ("RẤT TIẾC, ĐÃ XẢY RA LỖI.") & FILE LOCK BUILD

### A. Nguyên nhân gốc rễ lỗi YouTube Studio trắng
- **Hiện tượng**: Khi runner chuyển trang YouTube Studio, màn hình dừng lại ở URL `https://studio.youtube.com/videos/upload` kèm thông báo *"Rất tiếc, đã xảy ra lỗi."*.
- **Nguyên nhân**: YouTube Studio là Single-Page Application (Polymer/Angular) yêu cầu cấu trúc phân cấp bắt buộc phải có Channel ID (`/channel/{cid}/videos/upload`). Route `https://studio.youtube.com/videos/upload` không hề tồn tại độc lập trên YouTube Studio. Khi mã gọi fallback vào URL này mà thiếu Channel ID, router của Studio bị crash runtime và kích hoạt màn hình báo lỗi fatal.
- **Các tệp xử lý**:
  + `browser_engine/actions/upload/navigation.py` & `roots/browsermulti/actions/upload/navigation.py`: Xóa bỏ hoàn toàn URL bare `/videos/upload`. Tự động trích xuất `cid` nhiều lớp hoặc chuyển hướng an toàn bằng click menu drawer SPA (`ytcp-navigation-drawer a[href*="/videos"]`).
  + `browser_engine/actions/bkt/monitor.py` & `roots/browsermulti/actions/bkt/monitor.py`: Loại bỏ fallback `https://studio.youtube.com/videos/upload`. Nếu chưa có `cid`, tự động mở `studio.youtube.com/` và sử dụng click drawer SPA.
  + `browser_engine/actions/bkt/network.py` & `roots/browsermulti/actions/bkt/network.py`: Xóa fallback bare URL, bổ sung quét `cid` từ ytcfg và click drawer an toàn.
  + `browser_engine/runner.py` & `roots/browsermulti/runner.py`: Đảm bảo luôn điều hướng về `https://studio.youtube.com/` trước khi thực hiện kiểm tra BKT kể cả khi không truyền `preferred_channel`.

### B. Giải thích hiện tượng "Blocking waiting for file lock on build directory"
- **Nguyên nhân**: Khi người dùng khởi chạy `bun run tauri dev`, hệ thống đồng thời chạy tiến trình `cargo check` trong nền để kiểm tra kiểm định chất lượng mã nguồn. Do Cargo sử dụng cơ chế file lock độc quyền trên thư mục `target\debug\.cargo-lock` để đảm bảo an toàn tệp nhị phân, tiến trình `tauri dev` phải xếp hàng chờ cho đến khi lệnh `cargo check` hoàn tất.
- **Kết quả**: Ngay khi lệnh kiểm tra hoàn thành, Cargo tự động giải phóng file lock, tiến trình biên dịch `dev` đã hoàn thành và ứng dụng `RETubeMatrix.exe` đã được khởi chạy thành công.
- **Trạng thái kiểm tra cuối cùng**:
  + `bun run biome check --write .`: Đạt chuẩn.
  + `bun run tsc -b`: 0 lỗi (Exit code 0).
  + `cargo check`: 0 lỗi (Exit code 0).
  + `pytest browser_engine/tests`: 31/31 bài kiểm tra vượt qua (Passed 100%).
  + Đồng bộ song song `browser_engine/` <-> `roots/browsermulti/`: Trùng khớp 100% (Diff = 0).

