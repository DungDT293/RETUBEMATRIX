# Test Report — RETubeMatrix 0.20.16

> Người thực hiện: AI agent · Ngày: 2026-11-06 · Môi trường: Windows x64, WebView2
> Phương pháp: chạy tester [TEST_PLAN_CODE_DERIVED.md](TEST_PLAN_CODE_DERIVED.md) ở mức tối đa có thể tự động hoá.

---

## 1. Tổng quan

| Loại | Số lượng | Ghi chú |
| :--- | ---: | :--- |
| PASS (tự động + smoke thật) | 20 | Build, unit test, launch, CLI, Python, DB, static audit |
| FIXED trong quá trình test | 1 | Dialog lỗi auto-update khi chưa có release |
| BLOCKED (cần người/tài khoản) | 6 | Click UI, Studio login/upload, Content ID, tải thật, proxy, Telegram |
| KNOWN ISSUE (ghi nhận, chưa sửa) | 3 | Summary deep link chết, identifier `.app`, lệch version Tauri |

Bằng chứng smoke: [retubematrix-0.20.16-smoke.png](screenshots/retubematrix-0.20.16-smoke.png).

## 2. Automated suite

| Check | Lệnh | Kết quả |
| :--- | :--- | :--- |
| Lint/format | `biome check .` | ✅ 0 lỗi (360 file) |
| TypeScript | `tsc -b` | ✅ 0 lỗi |
| SDK TypeScript | `tsc -p sdk-js/tsconfig.json` | ✅ 0 lỗi |
| Rust check | `cargo check` | ✅ 0 lỗi (0.20.16) |
| Rust tests | `cargo test --lib` | ✅ 234 passed |
| Frontend bundle | `vite build` | ✅ build OK |
| Extension | `node extensions/retubematrix-webext/scripts/build.mjs` | ✅ chromium + firefox |
| Python syntax | `python -m py_compile runner.py outlier_hunter.py` | ✅ OK |
| Python import | `python -c "import runner"` | ✅ OK |

## 3. Build & launch thật

| Case | Kết quả |
| :--- | :--- |
| Build release 0.20.16 (`tauri build --no-bundle`) | ✅ `target/release/RETubeMatrix.exe` |
| Mở app | ✅ cửa sổ `RETubeMatrix` 1116×839 |
| Sidebar | ✅ đúng 9 mục; không còn 6 trang đã xóa |
| Auto-check update lúc khởi động | ✅ **không còn dialog lỗi** (đã fix silent) |
| Render trang Universal | ✅ toolbar, input, empty state, 1.800+ sites |
| Process count | ✅ 1 instance (single-instance) |
| CLI `--version` | ✅ `RETubeMatrix 0.20.16` |
| CLI `--help` | ✅ usage/arguments đúng |

## 4. Python browser engine

| Case | Kết quả |
| :--- | :--- |
| `runner.py --action list_profiles` | ✅ 2 profiles, JSON hợp lệ |
| `runner.py --action get_stats` | ✅ total_profiles=2, ready=2, running=0 |
| `parse_subscribers('340K' / '3.4M' / '49N')` | ✅ 340000 / 3400000 / 49000 |
| `import runner` | ✅ OK |

## 5. Database runtime

DB: `%APPDATA%\com.retubematrix.app\retubematrix.db`

| Kiểm tra | Kết quả |
| :--- | :--- |
| Bảng chính | ✅ 21 bảng gồm history, channels, outlier, BKT, FTS5 |
| FTS5 | ✅ `history_search_fts` + 4 bảng phụ |
| Dữ liệu mẫu | outlier_videos=60, bkt_test_channels=3 |
| Bảng queue/log | ✅ tồn tại (0 hàng tại thời điểm test) |

## 6. Static audit

| Case | Kết quả |
| :--- | :--- |
| Version 4 nơi | ✅ package/tauri/Cargo/Cargo.lock = `0.20.16` |
| i18n parity | ✅ 13 locale × 6 namespace, không thiếu/thừa |
| Dangling page refs | ✅ 0 tham chiếu tới 6 trang đã xóa |
| FE gọi command đã xóa | ✅ 0 |
| IPC coverage | ✅ 147 invoke FE, 154 command đăng ký, **0 missing** |
| Deep link config | ✅ `retubematrix` + `youwee` |
| Updater endpoint | ✅ `DungDT293/RETUBEMATRIX` |
| Extension build | ✅ manifest 0.20.16, deep link `retubematrix://` |
| SDK CLI | ✅ `retubematrix-sdk` build/pack/keygen/verify |
| Branding tests | ✅ 2 passed (updater + scheme) |
| Deep-link tests | ✅ 4 passed |

## 7. BLOCKED — cần tester thật

| Case | Lý do |
| :--- | :--- |
| Click/duyệt toàn bộ UI | WebView2 không expose accessibility tree qua UI Automation (chỉ 10 node khung) |
| Profiles: mở Chromium, proxy, arrange | Cần thao tác GUI và quan sát cửa sổ |
| Channels: thêm kênh, auto-download thật | Cần mạng + kênh thật |
| Reup/BKT: upload, Studio polling, Content ID | Cần profile đã đăng nhập YouTube Studio |
| Universal: tải video thật | Cần URL/network, sẽ tạo file/history thật |
| Telegram/plugin `.ywp` ký | Cần bot token và gói plugin thật |

## 8. KNOWN ISSUE ghi nhận

1. **Summary deep link / AI Summary trên extension không còn đích đến**
   - `retubematrix://summary` vẫn được parser chấp nhận, extension vẫn có nút "AI Summary", nhưng `SummaryPage` đã bị xóa → bấm vào không có tác dụng.
   - Đề xuất: xóa nút summary khỏi extension + bỏ hỗ trợ `summary` deep link, hoặc khôi phục một trang tóm tắt tối giản.
2. **Identifier `com.retubematrix.app` kết thúc bằng `.app`**
   - Tauri cảnh báo xung đột với bundle macOS. Cần đổi (ví dụ `com.retubematrix.desktop`) trước khi phát hành macOS; đổi identifier kéo theo migration appdata.
3. **Lệch version Tauri npm ↔ Rust**
   - `@tauri-apps/api` 2.12.4 vs `tauri` 2.11.5; nhiều plugin lệch minor. Build phải dùng `--ignore-version-mismatches`; nên đồng bộ trước release.

## 9. Đã sửa trong quá trình test

- **Auto-update dialog**: bản build đầu tiên hiện "Lỗi cập nhật — Failed to check for updates" khi mở app vì endpoint mới chưa có release. Đã chuyển auto-check sang `silent: true`; rebuild và xác nhận không còn dialog.

## 10. Kết luận

- Bản 0.20.16 **build và khởi động được**, UI mới render đúng, không còn dialog update lỗi.
- Toàn bộ kiểm thử tự động (lint, type, Rust test, Python, DB, IPC, i18n) **pass**.
- Các luồng cần tài khoản/Studio/network thật vẫn phải do tester thủ công thực hiện theo `TEST_PLAN_CODE_DERIVED.md`.
- Trước release chính thức: xử lý 3 known issue (ưu tiên summary dead path + identifier `.app`), sau đó chạy QA thủ công mục 6–16 của test plan.
