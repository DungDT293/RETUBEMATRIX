# BÁO CÁO KỸ THUẬT: GIẢI MÃ NGUYÊN NHÂN HIỆN THỊ TIẾN ĐỘ [3/5] VÀ LỖI TIMEOUT BKT

## 1. Hiện Tượng Thực Tế
Trong phiên chạy kiểm tra Top 5 video của kênh đối thủ (`Nistelrooy Movies Review`):
- Người dùng nhận thấy trên giao diện ứng dụng, thanh tiến độ bất ngờ hiển thị:
  `Auto Reup Top 5 (3/5): [3/5] Studio đang quét Content ID & Đăng đích... Tổng: 60%`
- Trong khi đó, trên màn hình YouTube Studio thực tế, video số 1 (*"na niña nacida de un ginseng mágico encontró hierbas valiosas para ayudar a su padre adoptivo"*) vẫn chưa kiểm tra xong và đang hiển thị thông báo:
  + Cột trạng thái: `HD Quá trình xử lý video mất nhiều thời gian hơn dự kiến. Vui lòng đợi giây lát.`
  + Cột hạn chế: `Quá trình kiểm tra sắp bắt đầu...`
- Sau đó, video 1 bị báo lỗi đỏ:
  `BKT: Lỗi (Quá thời gian chờ kiểm tra bản quyền (Timeout))`
- Trình duyệt Chrome khi mở lên hiện thông báo:
  `Bạn có muốn khôi phục trang không? Chromium không tắt đúng cách.`

---

## 2. Dữ Liệu Thanh Tra Thực Tế Trong SQLite Database (`retubematrix.db`)

Dữ liệu trích xuất từ bảng `bkt_test_jobs` ghi nhận toàn bộ 5 tác vụ được tạo ra như sau:

| STT | Job ID | Tiêu đề Video | Trạng thái Job | Thời điểm tạo | Thời điểm cập nhật |
|:---:|:---|:---|:---:|:---:|:---:|
| 1 | `d73c9b46-683f` | na niña nacida de un ginseng mágico... | `failed` | **10:02:32** | **12:05:52** |
| 2 | `9c200273-bdec` | Tras tener 7 hijos, nació una niña... | `reuping` | **10:33:23** | **13:07:46** |
| 3 | `7502ef9e-c293` | Una niña encontrada en la nieve... | `queued` | **11:04:16** | 11:04:16 |
| 4 | `0a838a26-d849` | Un hongo espiritual renació... | `queued` | **11:35:07** | 11:35:07 |
| 5 | `e50cee1e-39b5` | Una raíz de ginseng milenaria... | `queued` | **12:06:00** | 12:06:00 |

### Khoảng cách thời gian tạo các Job:
- Từ Job 1 (10:02:32) đến Job 2 (10:33:23): **Chính xác 30 phút 51 giây (1851 giây)**.
- Từ Job 2 (10:33:23) đến Job 3 (11:04:16): **Chính xác 30 phút 53 giây (1853 giây)**.
- Từ Job 3 (11:04:16) đến Job 4 (11:35:07): **Chính xác 30 phút 51 giây (1851 giây)**.
- Từ Job 4 (11:35:07) đến Job 5 (12:06:00): **Chính xác 30 phút 53 giây (1853 giây)**.

---

## 3. Nguyên Nhân Gốc Rễ

### Nguyên nhân 1: Bẫy Timeout 1850 Giây Trong Frontend React (`ChannelsPage.tsx`)
Tại dòng 516 của `src/pages/ChannelsPage.tsx`:
```typescript
// BƯỚC 4: Chờ hoàn thành BKT & Tự động xuất bản & Dọn sạch đĩa
const jobId = dispatchedJob.jobId;
try {
    const finishedJob = await waitBktJobCompletion(jobId, 1850); // <-- TIMEOUT CỨNG 1850 GIÂY (~30.8 PHÚT)
    ...
} catch (waitErr) {
    console.error(`Lỗi khi chờ BKT video ${v.title}:`, waitErr);
    setReupProgressMap((prev) => ({
        ...prev,
        [channelId]: {
            ...
            progressText: `[${stepIndex}/${total}] Lỗi tác vụ: ${waitErr}`,
            status: 'running',
        },
    }));
}
// KHÔNG CÓ LỆNH BREAK! VÒNG LẶP TIẾP TỤC SANG VIDEO TIẾP THEO (idx++)
```

Trong khi đó:
- Video số 1 là video dài có định dạng HD. YouTube Studio bị nghẽn tiến trình xử lý chất lượng cao:
  `HD Quá trình xử lý video mất nhiều thời gian hơn dự kiến. Vui lòng đợi giây lát.`
- YouTube Studio chưa thể hoàn tất mã hóa HD trong vòng 30 phút đầu tiên, nên chưa chuyển sang pha quét Content ID.
- Sau đúng **1850 giây (30 phút 50 giây)**, lệnh `waitBktJobCompletion(jobId, 1850)` bên Rust trả về:
  `Err("Hết thời gian chờ (Timeout) cho tác vụ BKT d73c9b46...")`

### Nguyên nhân 2: Khối `catch (waitErr)` nuốt lỗi và tự động nhảy bước (`idx++`)
Khi Video 1 bị timeout sau 1850 giây (lúc 10:33:23):
1. Vòng lặp `for (let idx = 0; idx < top5.length; idx++)` trong `ChannelsPage.tsx` **không bị dừng lại** (không có lệnh `break`).
2. Mã nguồn tự động chuyển sang `idx = 1` (Video 2: *"Tras tener 7 hijos..."*), tạo ra Job 2 lúc **10:33:23**.
3. Khi Job 2 tiếp tục chờ 1850 giây đến **11:04:16**, vòng lặp lại tiếp tục tăng `idx = 2` (Video 3: *"Una niña encontrada en la nieve..."*).
4. Tại thời điểm `idx = 2` (Step 3/5), giao diện cập nhật:
   `progressText: "[3/5] Studio đang quét Content ID & Đăng đích..."`
   Đây chính là lý do người dùng thấy hiển thị **3/5**!

### Nguyên nhân 3: Xung đột hàng đợi FIFO (Semaphore Max 1 Concurrent Job)
Tại `src-tauri/src/commands/bkt/dispatch.rs:54`:
- Hàng đợi BKT dưới tầng Rust quản lý bằng Semaphore với số luồng song song tối đa là 1:
  `Arc::new(Semaphore::new(1))`
- Khi Frontend React tự ý tăng bước và đẩy tiếp Job 2 và Job 3 xuống Rust, các Job này bị đưa vào trạng thái hàng đợi (`queued`).
- Trong khi đó, tiến trình Chromium/Playwright của Job 1 vẫn đang chạy hoặc đang giữ hồ sơ trình duyệt.
- Người dùng mở Chrome lên kiểm tra thì thấy Video 1 vẫn đang trên màn hình YouTube Studio, tạo cảm giác "Video 1 chưa xong mà app đã chạy đến Video 3".

### Nguyên nhân 4: Cảnh báo "Chromium không tắt đúng cách"
- Khi xảy ra Timeout hoặc khi watchdog hết thời gian chờ, Rust gọi `child.kill().await` để tiêu diệt tiến trình con Python.
- Việc cưỡng chế tắt tiến trình Python khiến Chromium không kịp đóng sạch sẽ (`browser.close()`), để lại cờ `"exit_type": "Crashed"` trong thư mục profile.
- Lần khởi động tiếp theo, Chromium hiển thị thanh thông báo: *"Bạn có muốn khôi phục trang không? Chromium không tắt đúng cách."*

---

## 4. Hành Động Khắc Phục Cần Triển Khai

1. **Đồng bộ Timeout giữa Frontend và Backend**:
   - Backend Rust cấu hình `max_poll_seconds: 7200` (2 giờ) cho các video dài chờ xử lý SD/HD.
   - Frontend `waitBktJobCompletion` bắt buộc phải truyền `timeoutSecs: 7200` (hoặc bỏ trống để lấy mặc định 3600–7200s), không được giới hạn ở mức 1850s khiến video HD bị ngắt oan.
2. **Ngăn chặn nuốt lỗi Timeout trong vòng lặp Tuần Tự**:
   - Trong `ChannelsPage.tsx` và `ChannelVideoAccordion.tsx`, khi một video gặp lỗi Timeout hoặc lỗi nghiêm trọng, phải cập nhật trạng thái thất bại rõ ràng cho video đó và cho phép người dùng quyết định dừng hoặc thử lại, thay vì âm thầm nhảy sang video tiếp theo.
3. **Đóng trình duyệt sạch sẽ (Clean Shutdown)**:
   - Trong `pipeline.rs` và `runner.py`, khi kết thúc phiên quét bản quyền hoặc khi hết thời gian chờ, gọi lệnh đóng `browser.close()` chuẩn qua Playwright trước khi thoát tiến trình để loại bỏ hoàn toàn thông báo crash của Chromium.
