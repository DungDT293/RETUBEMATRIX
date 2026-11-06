# Test Report — RETubeMatrix 0.20.16

> Người thực hiện: AI agent · Ngày: 2026-11-06 · Môi trường: Windows x64, WebView2
> Phương pháp: chạy tester [TEST_PLAN_CODE_DERIVED.md](TEST_PLAN_CODE_DERIVED.md) ở mức tối đa có thể tự động hoá.

---

## 1. Tổng quan

| Loại                             | Số lượng | Ghi chú                                                                   |
| :------------------------------- | -------: | :------------------------------------------------------------------------ |
| PASS (tự động + smoke thật)      |       30 | Build, unit test, launch, CLI, Python, DB, static audit, UI tour 9 trang  |
| FIXED trong quá trình test       |        2 | Dialog lỗi auto-update; summary deep link/AI Summary chết                 |
| BLOCKED (cần người/tài khoản)    |        5 | Form sâu (upload/proxy/Studio), Content ID, tải thật, Telegram, plugin ký |
| KNOWN ISSUE (ghi nhận, chưa sửa) |        2 | Identifier `.app`, lệch version Tauri                                     |

Bằng chứng smoke: [retubematrix-0.20.16-smoke.png](screenshots/retubematrix-0.20.16-smoke.png).

## 2. Automated suite

| Check           | Lệnh                                                    | Kết quả               |
| :-------------- | :------------------------------------------------------ | :-------------------- |
| Lint/format     | `biome check .`                                         | ✅ 0 lỗi (360 file)   |
| TypeScript      | `tsc -b`                                                | ✅ 0 lỗi              |
| SDK TypeScript  | `tsc -p sdk-js/tsconfig.json`                           | ✅ 0 lỗi              |
| Rust check      | `cargo check`                                           | ✅ 0 lỗi (0.20.16)    |
| Rust tests      | `cargo test --lib`                                      | ✅ 234 passed         |
| Frontend bundle | `vite build`                                            | ✅ build OK           |
| Extension       | `node extensions/retubematrix-webext/scripts/build.mjs` | ✅ chromium + firefox |
| Python syntax   | `python -m py_compile runner.py outlier_hunter.py`      | ✅ OK                 |
| Python import   | `python -c "import runner"`                             | ✅ OK                 |

## 3. Build & launch thật

| Case                                              | Kết quả                                      |
| :------------------------------------------------ | :------------------------------------------- |
| Build release 0.20.16 (`tauri build --no-bundle`) | ✅ `target/release/RETubeMatrix.exe`         |
| Mở app                                            | ✅ cửa sổ `RETubeMatrix` 1116×839            |
| Sidebar                                           | ✅ đúng 9 mục; không còn 6 trang đã xóa      |
| Auto-check update lúc khởi động                   | ✅ **không còn dialog lỗi** (đã fix silent)  |
| Render trang Universal                            | ✅ toolbar, input, empty state, 1.800+ sites |
| Process count                                     | ✅ 1 instance (single-instance)              |
| CLI `--version`                                   | ✅ `RETubeMatrix 0.20.16`                    |
| CLI `--help`                                      | ✅ usage/arguments đúng                      |

### 3.1 UI tour thật (điều khiển chuột + chụp màn hình)

Đã cố định cửa sổ ở `100,100` kích thước `1116×839`, dùng Win32 `SetCursorPos` + `mouse_event` click sidebar, chờ ~3 giây mỗi trang.

| Trang      | Kết quả thực tế                                                            | Ảnh                                                               |
| :--------- | :------------------------------------------------------------------------- | :---------------------------------------------------------------- |
| Dashboard  | ✅ 2 hồ sơ, 2 sẵn sàng, engine sẵn sàng; bảng đối chiếu 1-1 render         | [dashboard](screenshots/retubematrix-0.20.16-dashboard.png)       |
| Profiles   | ✅ 2/2 hồ sơ (`realacc`, `test`), trạng thái "Đã dừng"                     | [profiles](screenshots/retubematrix-0.20.16-profiles.png)         |
| Channels   | ✅ empty state "Chưa có kênh nào được theo dõi", form thêm kênh            | —                                                                 |
| Outliers   | ✅ mô hình Ikigai, 3 nhóm ngách, 4 công cụ kiểm chứng                      | [outliers](screenshots/retubematrix-0.20.16-outliers.png)         |
| Reup & BKT | ✅ 4 tab, Auto-Pilot, Lv1/Lv2, khu vực chọn file                           | [reup](screenshots/retubematrix-0.20.16-reup.png)                 |
| Library    | ✅ mở được, empty state                                                    | —                                                                 |
| Universal  | ✅ input URL, toolbar, empty queue, 1.800+ sites                           | [smoke](screenshots/retubematrix-0.20.16-smoke.png)               |
| Logs       | ✅ empty state, filter 6 loại, export/xóa                                  | —                                                                 |
| Settings   | ✅ 5 section; Dependencies hiển thị yt-dlp `2026.10.26`, FFmpeg `N-126455` | [dependencies](screenshots/retubematrix-0.20.16-dependencies.png) |

> Ghi chú: lần đầu mở Profiles thấy `0/0` do Python runner chưa trả kịp; chờ ~3 giây hiển thị đúng `2/2`. Không phải lỗi dữ liệu.

## 4. Python browser engine

| Case                                         | Kết quả                                 |
| :------------------------------------------- | :-------------------------------------- |
| `runner.py --action list_profiles`           | ✅ 2 profiles, JSON hợp lệ              |
| `runner.py --action get_stats`               | ✅ total_profiles=2, ready=2, running=0 |
| `parse_subscribers('340K' / '3.4M' / '49N')` | ✅ 340000 / 3400000 / 49000             |
| `import runner`                              | ✅ OK                                   |

## 5. Database runtime

DB: `%APPDATA%\com.retubematrix.app\retubematrix.db`

| Kiểm tra       | Kết quả                                              |
| :------------- | :--------------------------------------------------- |
| Bảng chính     | ✅ 21 bảng gồm history, channels, outlier, BKT, FTS5 |
| FTS5           | ✅ `history_search_fts` + 4 bảng phụ                 |
| Dữ liệu mẫu    | outlier_videos=60, bkt_test_channels=3               |
| Bảng queue/log | ✅ tồn tại (0 hàng tại thời điểm test)               |

## 6. Static audit

| Case                  | Kết quả                                              |
| :-------------------- | :--------------------------------------------------- |
| Version 4 nơi         | ✅ package/tauri/Cargo/Cargo.lock = `0.20.16`        |
| i18n parity           | ✅ 13 locale × 6 namespace, không thiếu/thừa         |
| Dangling page refs    | ✅ 0 tham chiếu tới 6 trang đã xóa                   |
| FE gọi command đã xóa | ✅ 0                                                 |
| IPC coverage          | ✅ 147 invoke FE, 154 command đăng ký, **0 missing** |
| Deep link config      | ✅ `retubematrix` + `youwee`                         |
| Updater endpoint      | ✅ `DungDT293/RETUBEMATRIX`                          |
| Extension build       | ✅ manifest 0.20.16, deep link `retubematrix://`     |
| SDK CLI               | ✅ `retubematrix-sdk` build/pack/keygen/verify       |
| Branding tests        | ✅ 2 passed (updater + scheme)                       |
| Deep-link tests       | ✅ 4 passed                                          |

## 7. BLOCKED — cần tester thật

| Case                                         | Lý do                                                                  |
| :------------------------------------------- | :--------------------------------------------------------------------- |
| Form sâu (upload/proxy/Studio)               | Đã click được nav bằng chuột; form phức tạp cần dữ liệu/tài khoản thật |
| Profiles: mở Chromium, proxy, arrange        | Cần thao tác GUI và quan sát cửa sổ                                    |
| Channels: thêm kênh, auto-download thật      | Cần mạng + kênh thật                                                   |
| Reup/BKT: upload, Studio polling, Content ID | Cần profile đã đăng nhập YouTube Studio                                |
| Universal: tải video thật                    | Cần URL/network, sẽ tạo file/history thật                              |
| Telegram/plugin `.ywp` ký                    | Cần bot token và gói plugin thật                                       |

## 8. KNOWN ISSUE ghi nhận

1. **Identifier `com.retubematrix.app` kết thúc bằng `.app`**
   - Tauri cảnh báo xung đột với bundle macOS. Cần đổi (ví dụ `com.retubematrix.desktop`) trước khi phát hành macOS; đổi identifier kéo theo migration appdata.
2. **Lệch version Tauri npm ↔ Rust**
   - `@tauri-apps/api` 2.12.4 vs `tauri` 2.11.5; nhiều plugin lệch minor. Build phải dùng `--ignore-version-mismatches`; nên đồng bộ trước release.

## 9. Đã sửa trong quá trình test

- **Auto-update dialog**: bản build đầu tiên hiện "Lỗi cập nhật — Failed to check for updates" khi mở app vì endpoint mới chưa có release. Đã chuyển auto-check sang `silent: true`; rebuild và xác nhận không còn dialog.
- **Summary dead path**: đã bỏ nút AI Summary + floating action khỏi extension, bỏ `retubematrix://summary` khỏi parser Rust/TS; thêm test `summary_deep_link_is_rejected`.

## 10. Kết luận

- Bản 0.20.16 **build và khởi động được**, UI mới render đúng, không còn dialog update lỗi.
- Đã **click thật qua 9 trang** bằng chuột/Win32: Dashboard (2 hồ sơ), Profiles (2/2), Channels, Outliers, Reup & BKT, Library, Universal, Logs, Settings; Dependencies hiển thị yt-dlp/FFmpeg đúng.
- Toàn bộ kiểm thử tự động (lint, type, Rust test, Python, DB, IPC, i18n) **pass**.
- Các luồng cần tài khoản/Studio/network thật vẫn phải do tester thủ công thực hiện theo `TEST_PLAN_CODE_DERIVED.md`.
- Trước release chính thức: xử lý 2 known issue còn lại (identifier `.app`, lệch version Tauri), sau đó chạy QA thủ công mục 6–16 của test plan.
