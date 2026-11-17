# NHẬT KÝ VÁ LỖI HỆ THỐNG: TIẾN ĐỘ TUẦN TỰ FIFO, TIMEOUT VÀ CRASH CHROMIUM (V1.2.3)

Tệp này ghi nhận chi tiết các thay đổi logic và cấu trúc mã nguồn để giải quyết triệt để 3 nguyên nhân cốt lõi được phát hiện trong `BAO_CAO_LOI_TIEN_DO_BKT_3_5.md`.

---

## 1. Danh Sách Tệp Mã Nguồn Đã Chỉnh Sửa

| STT | Tệp | Thành Phần | Mô Tả Thay Đổi |
|:---:|:---|:---|:---|
| 1 | `src/pages/ChannelsPage.tsx` | Frontend React Controller | Nâng timeout BKT lên 7200s; Thêm Circuit Breaker dừng vòng lặp ngay khi gặp lỗi; Hủy orphan job |
| 2 | `src/pages/channels/ChannelVideoAccordion.tsx` | Frontend Accordion View | Đồng bộ timeout BKT lên 7200s; Dừng vòng lặp khi timeout/lỗi; Thêm hủy orphan job |
| 3 | `src/pages/channels/ChannelCard.tsx` | UI Status Badge | Mở rộng kiểu `ChannelReupProgress.status` hỗ trợ `'failed'`; Hiển thị banner cảnh báo đỏ khi lỗi dừng |
| 4 | `src/contexts/channels/channels-client.ts` | IPC Client Adapter | Nâng default `timeoutSecs` trong `waitBktJobCompletion` từ 1800s lên 7200s |
| 5 | `src-tauri/src/commands/bkt/publish.rs` | Rust Backend IPC | Nâng default `timeout_secs` trong `wait_bkt_job_completion` từ 3600s lên 7200s |
| 6 | `src-tauri/src/commands/bkt/pipeline.rs` | Rust Runner Watchdog | Thêm khoảng đệm 3 giây (Graceful Wait) trước khi cưỡng chế `child.kill().await` tại 4 vị trí |
| 7 | `browser_engine/core/browser.py` | Python CloakSession | Dọn dẹp cờ crash (`exit_type = "Normal"`, `exited_cleanly = True`) trước khi mở và sau khi đóng trình duyệt |
| 8 | `browser_engine/core/engines/browsermulti_engine.py` | Browser Engine Args | Bổ sung cờ `--hide-crash-restore-bubble` |
| 9 | `browser_engine/core/engines/cloakbrowser_engine.py` | Cloak Engine Args | Bổ sung `--disable-session-crashed-bubble` và `--hide-crash-restore-bubble` |
| 10 | `browser_engine/actions/bkt/monitor.py` | Content ID Monitor | Bổ sung hàm `poll_bkt_status` bọc khối `finally` đóng page/browser sạch sẽ |
| 11 | `browser_engine/runner.py` | Unified Runner Lifecycle | Đóng `page` êm đẹp và tự động đồng bộ Preferences `"exit_type": "Normal"` trong `finally` |
| 12-18 | `roots/browsermulti/*` | Engine Runtimes Packaging | Đồng bộ toàn bộ 7 tệp Python sang `roots/browsermulti/` đạt chuẩn SHA-256 parity 100% |

---

## 2. Chi Tiết Các Thay Đổi Kỹ Thuật

### 2.1. Khắc Phục Hiện Tượng Nhảy Cóc Tiến Độ Lên [3/5] (Frontend)
- **Tệp sửa**: `src/pages/ChannelsPage.tsx`
  + **Dòng 20–25**: Import hàm `cancelBktJob` từ `@/contexts/channels/channels-client`.
  + **Dòng 516**: Thay thế `waitBktJobCompletion(jobId, 1850)` bằng `waitBktJobCompletion(jobId, 7200)`. Thời gian chờ tối đa được nâng từ 30.8 phút lên 120 phút (2 giờ), đảm bảo các video dài có độ phân giải HD xử lý mã hóa xong trên YouTube Studio trước khi quét Content ID.
  + **Dòng 589–625**: Trong nhánh `finishedJob.status === 'failed'`, cập nhật trạng thái kênh thành `failed` kèm thông báo: `Auto Reup dừng lại ở video [${stepIndex}/${total}] do lỗi: ${failMsg}`, hiển thị thông báo lỗi qua toast và thực hiện `break;` để ngắt ngay vòng lặp tuần tự.
  + **Dòng 626–640**: Trong khối `catch (waitErr)` khi `waitBktJobCompletion` gặp timeout hoặc lỗi IPC, gọi `await cancelBktJob(jobId).catch(() => {})` để dọn sạch tác vụ treo dưới Rust backend. Cập nhật `status: 'failed'`, `isRunning: false`, thông báo: `Auto Reup dừng lại ở video [${stepIndex}/${total}] do lỗi: ${waitErr}`, và thực thi lệnh `break;` (Circuit Breaker).
- **Tệp sửa**: `src/pages/channels/ChannelVideoAccordion.tsx`
  + **Dòng 458**: Nâng timeout từ `3600` lên `7200`.
  + **Dòng 530–546**: Bổ sung `await cancelBktJob(jobId).catch(() => {})`, toast thông báo lỗi và lệnh `break;`.

### 2.2. Khắc Phục Hộp Thoại "Chromium không tắt đúng cách" (Graceful Shutdown)
- **Tệp sửa**: `browser_engine/core/browser.py`
  + Trong hàm `_ensure_browsermulti_startup_preferences`:
    Tự động ghi đè các khóa cấu hình phiên trong `Default/Preferences`:
    ```python
    profile_pref = preferences.setdefault("profile", {})
    if isinstance(profile_pref, dict):
        profile_pref["exit_type"] = "Normal"
        profile_pref["exited_cleanly"] = True

    session["exit_type"] = "Normal"
    session["exited_cleanly"] = True

    if "exit_type" in preferences:
        preferences["exit_type"] = "Normal"
    if "exited_cleanly" in preferences:
        preferences["exited_cleanly"] = True
    ```
  + Trong hàm `CloakSession.start`: Gọi `_ensure_browsermulti_startup_preferences` cho tất cả các engine trước khi khởi động.
  + Trong hàm `CloakSession._close_once`: Trong khối `finally:`, gọi cập nhật lại `Preferences` ngay sau khi đóng trình duyệt.
- **Tệp sửa**: `browser_engine/core/engines/browsermulti_engine.py` và `cloakbrowser_engine.py`:
  + Bổ sung cờ khởi động:
    `--disable-session-crashed-bubble`
    `--hide-crash-restore-bubble`
- **Tệp sửa**: `browser_engine/actions/bkt/monitor.py`:
  + Bổ sung hàm bọc `poll_bkt_status` với khối `finally:` đóng Playwright `page` và `browser` một cách an toàn.
- **Tệp sửa**: `browser_engine/runner.py`:
  + Tại khối `finally:` của `_async_bkt_unified_pipeline` và `_async_check_copyright_status`, đảm bảo gọi đóng `page` và cập nhật `_ensure_browsermulti_startup_preferences`.

### 2.3. Khoảng Đệm 3 Giây Khi Huỷ/Timeout Phía Rust Backend
- **Tệp sửa**: `src-tauri/src/commands/bkt/pipeline.rs`:
  + Tại các điểm xử lý dừng tác vụ:
    1. Khi người dùng huỷ (`is_bkt_job_cancelled`).
    2. Khi watchdog im lặng quá 180s.
    3. Khi upload đứng yên tại 0% quá 15 phút.
    4. Khi upload đứng yên quá 40 phút.
  + Thay vì lập tức gọi `child.kill().await`, hệ thống bổ sung bộ đệm chờ:
    ```rust
    let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
    let _ = child.kill().await;
    ```
    Điều này cho phép tiến trình Python thực thi toàn bộ logic dọn dẹp trong khối `finally:`, đóng kết nối Playwright và lưu file `Preferences` trước khi bị hệ điều hành thu hồi tiến trình.

---

## 3. Kiểm Tra Tính Toàn Vẹn & Đồng Bộ

- **Python Syntax Check**: Đạt 100% (`py_compile` thành công trên toàn bộ 14 tệp trong `browser_engine/` và `roots/browsermulti/`).
- **SHA-256 Parity**: 7 tệp mã nguồn giữa `browser_engine/` và `roots/browsermulti/` có mã băm SHA-256 trùng khớp tuyệt đối.
