# NHẬT KÝ THỰC THI NÂNG CẤP HỆ THỐNG V1.2.7

- **Thời gian thực hiện**: 2026-11-17
- **Phiên bản phát hành**: v1.2.7
- **Mục tiêu**:
  1. Khắc phục triệt để việc mở YouTube Studio Kênh Test khi bấm "Chỉnh sửa & Đăng ngay".
  2. Xóa bỏ hoàn toàn lỗi "BKT: Sạch, đăng lỗi" (`Auto Reup chưa đăng được lên Kênh Đích: Job BKT đã được đăng hoặc đang được xử lý bởi tác vụ khác`), mở khóa cho phép xuất bản nhiều lần và thử tự đăng an toàn.

---

## 1. NGUYÊN NHÂN SỰ CỐ GỐC (ROOT CAUSES)

### Nguyên nhân 1: "Chỉnh sửa & Đăng ngay" lại chạy Kênh Test Bản Quyền
- **Triệu chứng**: Khi bấm nút "Chỉnh sửa & Đăng ngay" cho video đã tải, hệ thống lại mở trình duyệt Chrome với profile của Kênh Test (ví dụ: Tomorrowland Beats) và tải video Unlisted để kiểm tra bản quyền thay vì đăng lên Kênh Đích.
- **Căn nguyên**:
  - Tại `ChannelVideoAccordion.tsx`, hàm `handleDirectEditAndPublishSingle` và `handleBatchEditAndPublishSelected` gọi `dispatchBatchBktTest` nhưng không gửi cờ báo hiệu bỏ qua kiểm tra bản quyền.
  - Tại `src-tauri/src/commands/bkt/dispatch.rs`, biến `is_fast` chỉ kích hoạt khi kênh đối thủ có cờ `is_trusted_clean == true` trong database. Khi kênh chưa bật cờ này, hệ thống tự động phân bổ vào Kênh Test thông thường qua Load Balancing.
  - Tại `src-tauri/src/commands/bkt/pipeline.rs`, hàm worker kiểm tra lại kênh theo database chứ không kế thừa cờ bỏ qua từ tác vụ.

### Nguyên nhân 2: Lỗi "BKT: Sạch, đăng lỗi" và khóa lịch sử xuất bản
- **Triệu chứng**: Video sau khi test sạch hoặc reup xong xuất hiện huy hiệu `BKT: Sạch, đăng lỗi` kèm nút `Thử tự đăng`. Khi bấm nút này thì gặp lỗi:
  `Auto Reup chưa đăng được lên Kênh Đích: Job BKT đã được đăng hoặc đang được xử lý bởi tác vụ khác`.
- **Căn nguyên**:
  - Tại `src-tauri/src/database/bkt_channels.rs`, hàm `claim_bkt_job_for_publish_with_conn` chứa câu lệnh SQL:
    ```sql
    AND NOT EXISTS (
        SELECT 1 FROM bkt_test_jobs existing
        WHERE existing.id <> candidate.id
          AND existing.source_ref_id = candidate.source_ref_id
          AND existing.status IN ('publishing', 'published')
    )
    ```
  - Do video này trong quá khứ đã từng có một job ghi nhận trạng thái `published`, điều kiện `NOT EXISTS` luôn trả về FALSE, khiến hàm claim thất bại (`changed == 0`).
  - Hệ thống vĩnh viễn khóa không cho phép xuất bản lại bất kỳ video nào đã từng được đăng trong lịch sử database!

---

## 2. CÁC ĐIỂM SỬA ĐỔI ĐÃ TRIỂN KHAI

### A. Triển khai Fast-Track Bypass (`skip_bkt_test`)
1. **Mô hình Dữ liệu (`src-tauri/src/types/bkt_channel.rs` & `src/lib/types.ts`)**:
   - Thêm trường `skip_bkt_test: Option<bool>` vào `BktBatchItemRequest` và `BktTestJob`.
   - Hỗ trợ cả 2 định dạng camelCase (`skipBktTest`) và snake_case (`skip_bkt_test`).
2. **Bộ Điều Phối Tác Vụ (`src-tauri/src/commands/bkt/dispatch.rs`)**:
   - Khi `item.skip_bkt_test == true` hoặc `target_test_channel_id == 'fast_track_direct'`:
     + Đánh dấu `is_fast = true` ngay lập tức, không phụ thuộc vào cờ của kênh trong DB.
     + Tự động tạo kênh định tuyến ảo `fast_track_direct` trỏ thẳng về Target Profile.
     + Không yêu cầu hệ thống phải có sẵn Kênh Test (vẫn hoạt động trơn tru khi danh sách kênh test rỗng).
3. **Pipeline Thực Thi (`src-tauri/src/commands/bkt/pipeline.rs`)**:
   - Nhận diện cờ `job.skip_bkt_test == Some(true)` hoặc `job.test_channel_id == "fast_track_direct"`.
   - Đặt ngay `is_fast_track = true`: Bỏ qua 100% bước upload Unlisted lên kênh test và vòng lặp Playwright Studio kiểm tra bản quyền.
   - Chạy thẳng vào khâu render Reup thích ứng lưu vào thư mục `[DA_EDIT]` và tự động gọi `publish_bkt_job_to_main_cmd` xuất bản lên Kênh Đích.
4. **Giao Diện Người Dùng (`src/pages/channels/ChannelVideoAccordion.tsx`)**:
   - Cả nút "Chỉnh sửa & Đăng ngay" đơn lẻ và nút chạy hàng loạt đều truyền `skipBktTest: true, skip_bkt_test: true` và `targetTestChannelId: 'fast_track_direct'`.

### B. Loại Bỏ Khóa Lịch Sử Đăng Video Cũ
1. **Cập nhật Hàm Claim (`src-tauri/src/database/bkt_channels.rs`)**:
   - Sửa `claim_bkt_job_for_publish_with_conn` và `has_bkt_publish_duplicate_source_with_conn`:
     Thay thế:
     ```sql
     AND existing.status IN ('publishing', 'published')
     ```
     Bằng:
     ```sql
     AND existing.status = 'publishing'
     AND existing.updated_at > datetime('now', '-15 minutes')
     ```
   - Chỉ ngăn chặn tranh chấp khi có một tác vụ khác đang thực sự trong quá trình upload (`publishing`) trong vòng 15 phút.
   - Các job cũ đã `published` trong lịch sử hoàn toàn không còn chặn tác vụ mới. Người dùng có thể chỉnh sửa lại và đăng lại thoải mái.
2. **Cập nhật Unit Tests**:
   - `publish_claim_rejects_duplicate_source_actively_publishing`: Kiểm tra thành công hành vi chỉ chặn khi có job đang active publishing.

---

## 3. KẾT QUẢ KIỂM THỬ CHẤT LƯỢNG

- **Cargo Test (BKT & Database)**: `38 passed; 0 failed`.
- **Cargo Check**: `Finished dev profile in 1m 45s (0 errors, 0 warnings)`.
- **TypeScript**: `cmd /c bun run tsc -b` -> `Code 0 (0 errors)`.
- **Biome Linter**: `cmd /c bun run biome check src/` -> `290 files checked, 0 errors, 0 warnings`.
