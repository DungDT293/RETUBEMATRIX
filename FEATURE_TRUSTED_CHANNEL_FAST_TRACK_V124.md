# BÁO CÁO KỸ THUẬT: TÍNH NĂNG "TRUSTED CHANNEL FAST-TRACK" (V1.2.4)
**RETubeMatrix — Tối ưu hóa chu trình Tải -> Reup -> Đăng thẳng Kênh Đích cho Kênh Đối Thủ Uy Tín**
*Ngày lập: 16/11/2026*

---

## 1. TỔNG QUAN TÍNH NĂNG & MỤC TIÊU NGHIỆP VỤ

Trong các phiên bản trước (v1.2.0 – v1.2.3), mọi video trong luồng Auto Reup tuần tự bắt buộc phải trải qua chu trình Kiểm Tra Bản Quyền Kênh Test (BKT):
1. Tải video gốc từ kênh đối thủ.
2. Tải video lên Kênh Test ở chế độ Không Công Khai (Unlisted).
3. Chờ YouTube Studio mã hóa video (SD/HD) và quét Content ID (thường mất từ 15 đến 30 phút/video).
4. Khi có kết quả "Sạch Bản Quyền", hệ thống mới tiến hành Reup Lv.1 và xuất bản lên Kênh Đích.

Đối với những kênh đối thủ có độ uy tín cao (nội dung tự sản xuất, nhạc bản quyền đã clear hoặc tỷ lệ sạch bản quyền 100%), việc phải chờ đợi vòng lặp BKT cho từng video gây lãng phí tài nguyên và làm chậm tiến độ đăng bài.

Tính năng **"Trusted Channel Fast-Track" (v1.2.4)** ra đời nhằm giải quyết vấn đề trên:
- **Tiết kiệm 15–30 phút cho mỗi video**: Bỏ qua hoàn toàn công đoạn upload Unlisted lên Kênh Test và vòng lặp Playwright Studio Polling.
- **Quy trình siêu tốc**: Video tải về -> Reup thích ứng / Reup Lv.1 (xóa metadata, dynamic audio resampling bằng FFprobe) -> Sinh tiêu đề AI 95/5, mô tả, canvas thumbnail -> Cổng kiểm tra tính toàn vẹn (Pre-Upload File Integrity Gate) -> Đăng thẳng Kênh Đích.
- **An toàn tuyệt đối với Phanh Khẩn Cấp (Circuit Breaker)**: Tự động ngắt Fast-Track và reset chuỗi uy tín về 0 ngay khi phát hiện bất kỳ dấu hiệu vi phạm hoặc lỗi hệ thống.

---

## 2. QUY TẮC NGHIỆP VỤ & ĐIỀU KIỆN KÍCH HOẠT

### 2.1. Điều kiện Kích Hoạt Fast-Track
Hệ thống chỉ cho phép một kênh đối thủ vận hành ở chế độ Fast-Track khi thỏa mãn đồng thời cả 2 điều kiện:
1. **Đạt chuỗi tối thiểu 5 video liên tiếp sạch bản quyền**: `consecutive_green_count >= 5` được ghi nhận qua các lần quét BKT thực tế trên Kênh Test.
2. **Người dùng chủ động bật công tắc**: Người dùng gạt bật công tắc `Bỏ qua BKT (Đăng thẳng)` trên giao diện thẻ kênh. Hệ thống **tuyệt đối không tự ý bật ngầm** nếu chưa có sự xác nhận của người dùng.

### 2.2. Cơ chế Phanh Khẩn Cấp (Circuit Breaker)
Để bảo vệ an toàn cho Kênh Đích (tránh nguy cơ bị gậy bản quyền hoặc cảnh báo nguyên tắc cộng đồng):
- Khi bất kỳ video nào trong quá trình xử lý gặp lỗi vi phạm bản quyền (`red_matched`, `red_strike`, `yellow_claim`) hoặc lỗi nghiêm trọng (timeout, crash, watchdog, lỗi render...):
  + Chuỗi `consecutive_green_count` lập tức reset về `0`.
  + Cờ `enable_fast_track` tự động tắt về `0` (`false`).
  + Toàn bộ các video tiếp theo của kênh đó bắt buộc phải quay lại quy trình BKT tiêu chuẩn trên Kênh Test và tích lũy lại đủ 5 video sạch mới có thể mở lại tính năng.
- Khi một video được xuất bản qua luồng Fast-Track thành công (bỏ qua BKT), chuỗi `consecutive_green_count` được giữ nguyên mà không cộng dồn ảo, ngăn chặn việc thổi phồng độ uy tín khi không quét thực tế qua YouTube Content ID.

---

## 3. KIẾN TRÚC THỰC THI & CÁC TỆP ĐÃ SỬA ĐỔI

### 3.1. Cơ sở dữ liệu SQLite (`src-tauri/src/database/`)
- **`connection.rs`**:
  + Thêm 2 cột `consecutive_green_count INTEGER NOT NULL DEFAULT 0` và `enable_fast_track INTEGER NOT NULL DEFAULT 0` vào bảng `followed_channels`.
  + Tự động migrate an toàn khi khởi động:
    ```rust
    conn.execute("ALTER TABLE followed_channels ADD COLUMN consecutive_green_count INTEGER NOT NULL DEFAULT 0", []).ok();
    conn.execute("ALTER TABLE followed_channels ADD COLUMN enable_fast_track INTEGER NOT NULL DEFAULT 0", []).ok();
    ```
- **`channels.rs`**:
  + Cập nhật các câu lệnh SELECT trong `get_followed_channels_db` và `get_followed_channel_db` để truy xuất 2 trường mới.
  + Thêm hàm `record_channel_bkt_verdict_db(channel_id: &str, is_clean: bool)`:
    * `is_clean == true`: Tăng `consecutive_green_count` thêm 1.
    * `is_clean == false`: Reset `consecutive_green_count = 0` và `enable_fast_track = 0` (Circuit Breaker).
  + Thêm hàm `set_channel_fast_track_db(channel_id: &str, enabled: bool)`:
    * Kiểm tra điều kiện `consecutive_green_count >= 5` trước khi cho phép kích hoạt `enabled = true`.

### 3.2. Mô hình Rust & Lệnh IPC (`src-tauri/src/types/` & `src-tauri/src/commands/`)
- **`types/channel.rs`**:
  + Bổ sung `pub consecutive_green_count: Option<i64>` và `pub enable_fast_track: Option<bool>` vào `FollowedChannel`.
- **`commands/channels.rs` & `lib.rs`**:
  + Khai báo và đăng ký lệnh IPC Tauri v2: `set_channel_fast_track_cmd(channel_id: String, enabled: bool)`.
  + Hỗ trợ giao thức truyền tham số tương thích cả camelCase (`channelId`) và snake_case (`channel_id`).

### 3.3. Pipeline Xử Lý BKT Backend (`src-tauri/src/commands/bkt/pipeline.rs`)
1. **Phát hiện & Vá Lỗi Đảo Ngược Logic Cũ (Anti-Regression)**:
   - Trong nhánh xử lý `red_matched` (dòng 786–798), mã nguồn trước đây gọi nhầm `record_channel_bkt_verdict_db(c_id, true)`. Lỗi này đã được sửa dứt điểm thành `false` để ngắt Circuit Breaker chuẩn xác.
2. **Nhánh Thực Thi Fast-Track**:
   - Trước khi khởi động trình duyệt và upload test, hệ thống trích xuất `resolved_channel_id` từ `job.channel_id` hoặc `job.source_ref_id`.
   - Kiểm tra `is_fast_track = channel.enable_fast_track && channel.consecutive_green_count >= 5`.
   - Khi `is_fast_track == true`:
     * Bỏ qua toàn bộ block Chromium & Playwright Studio runner (tiết kiệm 15–30 phút).
     * Thiết lập `final_status = "green_clean"`, `final_restriction = "Sạch Bản Quyền (Fast-Track - Kênh Uy Tín)"`.
     * Phát sự kiện IPC thời gian thực: `[Fast-Track] Kênh uy tín: Bỏ qua BKT -> Đang xuất bản Kênh Đích...`.
     * Chạy thẳng xuống quy trình Reup thích ứng / Reup Lv.1 (resampling 48kHz, xóa metadata) -> Pre-Upload File Integrity Gate -> Gọi `publish_bkt_job_to_main_cmd`.

### 3.4. Giao Diện Người Dùng & IPC Frontend (`src/`)
- **`src/lib/types.ts`**:
  + Bổ sung các trường `consecutive_green_count`, `enable_fast_track`, `consecutiveGreenCount`, `enableFastTrack` vào `FollowedChannel`.
- **`src/contexts/channels/channels-client.ts`**:
  + Xuất hàm `setChannelFastTrack(channelId: string, enabled: boolean)`.
- **`src/pages/channels/ChannelCard.tsx`**:
  + Khi `consecutiveCount < 5`: Hiển thị chip `BKT: {consecutiveCount}/5 sạch` với icon Lucide `ShieldCheck`.
  + Khi `consecutiveCount >= 5`: Hiển thị badge `Kênh Uy Tín ({consecutiveCount} video sạch)` với icon Lucide `Award`.
  + Khi `consecutiveCount >= 5`: Hiển thị công tắc Switch `Bỏ qua BKT (Đăng thẳng)` với icon Lucide `Zap` ở thanh đáy thẻ kênh.
  + Tuân thủ nghiêm ngặt quy tắc **No-Gimmick / Emoji Ban**: Không sử dụng emoji trang trí, chỉ dùng biểu tượng SVG đơn sắc Lucide.
- **`src/pages/ChannelsPage.tsx`**:
  + Cập nhật thông báo tiến độ Auto Reup: Khi kênh đang chạy ở chế độ Fast-Track, thanh tiến độ hiển thị `[idx/total] [Fast-Track] Bỏ qua BKT -> Đang đẩy sang Kênh Đích...`.

---

## 4. BẢNG TỔNG HỢP KIỂM TRA CHẤT LƯỢNG (VERIFICATION)

| Hạng mục kiểm tra | Công cụ thực hiện | Trạng thái | Chi tiết kết quả |
| :--- | :--- | :---: | :--- |
| **Kiểm tra kiểu dữ liệu TypeScript** | `bun.cmd run tsc -b` | **PASS (0 error)** | Biên dịch sạch sẽ 100%, không xung đột interface |
| **Kiểm tra chuẩn mã nguồn & Lint** | `bun.cmd run biome check` | **PASS (0 error)** | Định dạng chuẩn Biome, không vi phạm style guide |
| **Kiểm tra biên dịch Rust Backend** | `cargo check` | **PASS (0 error)** | Hoàn tất trong 4m 34s, không cảnh báo biên dịch |
| **Quy tắc cấm Emoji (AGENTS.md)** | Regex AST scan | **PASS (0 emoji)** | 100% sử dụng icon đơn sắc Lucide (`Zap`, `Award`, `ShieldCheck`) |
| **Tương thích IPC Tauri v2** | Code Review | **PASS** | Truyền đồng thời cả camelCase và snake_case |

---

## 5. HƯỚNG DẪN KIỂM THỬ THỰC TẾ

1. Mở trang **3. Theo dõi kênh** trên ứng dụng RETubeMatrix.
2. Quan sát thẻ kênh đối thủ:
   - Các kênh mới theo dõi sẽ hiển thị badge `BKT: 0/5 sạch`.
   - Mỗi video từ kênh này sau khi qua Kênh Test và đạt "Sạch Bản Quyền" sẽ tự động tăng bộ đếm lên `1/5`, `2/5`...
3. Khi kênh đạt đủ `5/5 sạch`:
   - Thẻ kênh chuyển sang hiển thị badge `Kênh Uy Tín (5 video sạch)`.
   - Xuất hiện công tắc gạt `Bỏ qua BKT (Đăng thẳng)`.
4. Người dùng gạt bật công tắc:
   - Thông báo toast xác nhận kích hoạt chế độ Fast-Track.
   - Các video tiếp theo khi bấm `Reup Tuần Tự Top 5` hoặc chạy ngầm Auto Reup sẽ bỏ qua hoàn toàn bước upload test, render trực tiếp và xuất bản thẳng lên Kênh Đích.
5. Kiểm thử Circuit Breaker:
   - Nếu có 1 video dính bản quyền hoặc lỗi, hệ thống sẽ tự động tắt công tắc Fast-Track và đưa chuỗi sạch về `0/5 sạch` ngay lập tức.
