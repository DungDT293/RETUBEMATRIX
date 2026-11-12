# HANDOVER_TASKS.md — Kế Hoạch Bàn Giao & Nhiệm Vụ Cần Xử Lý (v1.0.3)

> **Dành cho Agent mới trong phiên tiếp theo:**
> Đọc kỹ file này để nắm chính xác hiện trạng mã nguồn, các lỗi đã fix, các việc còn dang dở và nguyên nhân gây lỗi build/run trước khi tiếp tục.

---

## 1. Nguyên nhân gốc rễ lỗi "Build xong mà app vẫn hiện giao diện cũ"

**CỰC KỲ QUAN TRỌNG:**
- Hiện tại máy anh Tiến Dũng đang có bản cài đặt cũ ở đường dẫn:
  `C:\Users\Admin\AppData\Local\RETubeMatrix\RETubeMatrix.exe` (được Windows tự động chạy từ Shortcut desktop / Start menu / Startup).
- Khi lệnh PowerShell chạy `Start-Process "retubematrix.exe"` mà không chỉ định tuyệt đối hoặc khi mở bằng Shortcut, Windows lại mở file exe cũ ở `AppData\Local\RETubeMatrix\` chứ **KHÔNG PHẢI** file dev mới build ở `D:\TOOL DUNG CODE\reupytb\src-tauri\target\debug\retubematrix.exe`!
- Do đó, anh Tiến Dũng luôn nhìn thấy giao diện của bản cài đặt cũ trước đó.

---

## 2. Danh sách nhiệm vụ cụ thể cần hoàn tất ngay

### Task 1: Cài đè bản Build mới nhất vào AppData hoặc Chạy đúng Dev Binary
- Build bản release chính thức:
  1. `bun.cmd run build` (để xuất `dist/` mới nhất có Tab 1 là Kênh Test Bản Quyền).
  2. `bun.cmd run tauri build` hoặc copy file binary mới build vào thư mục cài đặt `C:\Users\Admin\AppData\Local\RETubeMatrix\`.
  3. Hoặc chạy file installer mới xuất xưởng:
     `D:\TOOL DUNG CODE\reupytb\src-tauri\target\release\bundle\nsis\RETubeMatrix_1.0.3_x64-setup.exe` để cài đè trực tiếp lên máy.

---

### Task 2: Kiểm tra lại cấu trúc Tabs trong `src/pages/ReupBktPage.tsx`
- Đảm bảo thứ tự 4 Tab con của Chức năng 5 (Reup & Test Bản Quyền) phải là:
  - **Tab 1:** `bkt_channels` — Nhãn: `1. Kênh Test Bản Quyền` (Render `<BktChannelManagerTab />`)
  - **Tab 2:** `pipeline` — Nhãn: `2. Xử Lý Reup`
  - **Tab 3:** `bkt_upload` — Nhãn: `3. Đăng Test Bản Quyền`
  - **Tab 4:** `ai_optimization` — Nhãn: `4. AI Tiêu Đề & Thumb`
- `activeTab` mặc định khởi tạo là `'bkt_channels'` để khi người dùng bấm vào trang số 5 thì thấy ngay danh sách Kênh Test.
- Khối `<TabsContent value="bkt_channels">` phải nằm ở vị trí đầu tiên trong danh sách TabsContent.

---

### Task 3: Xóa bỏ triệt để từ "BKT" trên toàn bộ giao diện
- Đổi từ "BKT" thành "Test Bản Quyền" hoặc "Kênh Test Bản Quyền":
  - Sidebar: `Reup & Test Bản Quyền` (đã cập nhật trong `src/i18n/locales/{vi,en,zh-CN}/common.json`).
  - Tiêu đề trang: `Reup Pipeline & Test Bản Quyền`.
  - Không để từ viết tắt gây khó hiểu trên UI.

---

### Task 4: Kiểm tra sự độc lập của Pool Kênh Test Bản Quyền (Feature 5) vs Hồ Sơ Kênh Đích (Feature 2)
1. **Modal "Thêm Kênh Test":**
   - Đã bỏ dropdown chọn Profile của Chức năng 2 trong `src/components/bkt/BktChannelManagerTab.tsx`.
   - Backend `src-tauri/src/commands/bkt_channels.rs` tự động cấp phát Chromium Profile riêng biệt mang tên `[BKT Test] {name}`.
2. **Thẻ Kênh Test:**
   - Đảm bảo hiển thị đúng tên hồ sơ Chromium độc lập, không báo "Mất kết nối hồ sơ" hay "Hồ sơ: thất lạc".
   - (Đã xóa các bản ghi rác cũ `a82cd01c`, `a453fcb2` trong sqlite database `retubematrix.db`).

---

### Task 5: Kiểm tra cơ chế cào và Auto Reup Top 5
1. **Cào video:**
   - Trong `src-tauri/src/services/polling.rs`: Giữ nguyên `youtube_content_type`, không tự ý ép sang `all`.
   - Trong `src/contexts/channels/useChannelsController.ts`: Bộ lọc `isShortVideo` phải chặn tuyệt đối video Shorts khi kênh cấu hình là video dài.
2. **Auto Reup tuần tự Top 5:**
   - Trong `src/pages/ChannelsPage.tsx`: Khi gạt bật Auto Reup, chỉ lấy Top 5 video dài mới nhất, chạy tuần tự 1-by-1 (FIFO).
   - Tải 1 -> Reup 1 -> Đưa vào Kênh Test kiểm tra Content ID -> Đạt chuẩn Sạch thì đăng lên Kênh Đích đã liên kết ở Chức năng 2 -> Xóa sạch file tải gốc, file reup, thumbnail để giải phóng 100% dung lượng đĩa -> Mới chuyển sang video tiếp theo.

---

## 3. Checklist nghiệm thu trước khi bàn giao cho anh Tiến Dũng

- [ ] Chạy `bun.cmd run biome check --write .`
- [ ] Chạy `bun.cmd run tsc -b` (Exit code 0, không lỗi type)
- [ ] Chạy `cargo check --manifest-path src-tauri/Cargo.toml` (Exit code 0)
- [ ] Build lại installer NSIS 1.0.3 hoặc chạy file nhị phân dev mới, đảm bảo process chạy từ đúng thư mục build chứ không chạy exe cũ ở `AppData\Local`.
- [ ] Chụp lại ảnh màn hình hoặc xác nhận giao diện hiển thị đúng Tab 1 là Kênh Test Bản Quyền.
- [ ] TUYỆT ĐỐI KHÔNG commit hoặc push khi chưa có yêu cầu trực tiếp từ anh Tiến Dũng.
