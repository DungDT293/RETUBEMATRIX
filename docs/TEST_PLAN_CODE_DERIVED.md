# Test Plan — RETubeMatrix 0.20.16 (Rebrand + Dead-code cleanup)

> Tài liệu này được suy ra trực tiếp từ code (commands, services, UI pages) sau đợt rebrand P0–P4.
> Mục tiêu: tester có thể kiểm thử đúng các luồng còn tồn tại, tránh test các trang đã xóa.

---

## 1. Phạm vi

- App: `RETubeMatrix` 0.20.16 (identifier `com.retubematrix.app`).
- 9 phân hệ còn trong menu: Dashboard, Profiles, Channels, Outliers, Reup & BKT, Library, Universal, Logs, Settings.
- **Đã xóa, không test**: DownloadPage, GalleryPage, MetadataPage, ProcessingPage, SubtitlesPage, SummaryPage.
- Nền tảng test chính: Windows x64 (WebView2). Linux/macOS cần build riêng.

## 2. Điều kiện tiên quyết

- Cài bản `RETubeMatrix_0.20.16_x64-setup.exe` (hoặc chạy `src-tauri/target/release/RETubeMatrix.exe` cho bản portable).
- Có ít nhất 1 profile MultiBrowser đã đăng nhập YouTube Studio (cho BKT/upload).
- Có FFmpeg/FFprobe, yt-dlp, Deno trong `src-tauri/bin` hoặc Settings → Dependencies báo xanh.
- Có API key AI nếu test tóm tắt/tối ưu tiêu đề.

## 3. Kết quả smoke tự động (đã chạy)

| Hạng mục        | Cách chạy                                               | Kết quả                                                                                                                  |
| :-------------- | :------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------- |
| TypeScript      | `tsc -b`                                                | ✅ 0 lỗi                                                                                                                 |
| SDK             | `tsc -p sdk-js/tsconfig.json`                           | ✅ 0 lỗi                                                                                                                 |
| Lint/format     | `biome check .`                                         | ✅ 0 lỗi (361 file)                                                                                                      |
| Rust            | `cargo check`                                           | ✅ 0 lỗi                                                                                                                 |
| Rust tests      | `cargo test --lib`                                      | ✅ 234 passed                                                                                                            |
| Frontend bundle | `vite build`                                            | ✅ build OK                                                                                                              |
| App launch      | chạy `RETubeMatrix.exe`, chụp cửa sổ                    | ✅ cửa sổ `RETubeMatrix` 1116×839, render trang Universal; **không còn dialog lỗi update** sau khi sửa auto-check silent |
| CLI             | `RETubeMatrix.exe --version`                            | ✅ `RETubeMatrix 0.20.16`                                                                                                |
| Python engine   | `python runner.py --action list_profiles`               | ✅ JSON hợp lệ                                                                                                           |
| Extension       | `node extensions/retubematrix-webext/scripts/build.mjs` | ✅ chromium + firefox                                                                                                    |

Ảnh smoke: [retubematrix-0.20.16-smoke.png](screenshots/retubematrix-0.20.16-smoke.png).

> Ghi nhận từ test thực tế: bản build đầu tiên hiện dialog **"Lỗi cập nhật — Failed to check for updates"** khi mở app, do updater trỏ repo mới nhưng chưa có release. Đã sửa: auto-check truyền `silent: true`, lỗi mạng/404 không hiện dialog; chỉ báo khi người dùng bấm kiểm tra thủ công.

### Giới hạn của agent (không thể thay tester)

- Có thể **mở app, chụp màn hình, đọc process/window title**.
- **Không click/duyệt UI** được: WebView2 không expose accessibility tree qua UI Automation (chỉ 10 phần tử khung).
- **Không đăng nhập YouTube Studio**, không upload video thật, không kiểm tra Content ID thật.
- **Không tải video thật** khỏi mạng/account; không xác minh file output bằng player.
- Các mục đánh dấu **MANUAL** bên dưới cần tester thực hiện.

---

## 4. Smoke / khung ứng dụng

| ID    | Thao tác                    | Kỳ vọng                                                                         | Code                                      |
| :---- | :-------------------------- | :------------------------------------------------------------------------------ | :---------------------------------------- |
| SM-01 | Mở app                      | Cửa sổ `RETubeMatrix`, không có màn hình trắng                                  | `src/App.tsx`                             |
| SM-02 | Đếm menu sidebar            | Đúng 9 mục; **không** có Download/Gallery/Metadata/Processing/Subtitles/Summary | `components/layout/Sidebar.tsx`           |
| SM-03 | Đóng bằng X                 | App ẩn xuống tray, không thoát; có notification lần đầu                         | `lib.rs` `on_window_event`                |
| SM-04 | Click tray → Open           | Cửa sổ hiện lại, focus đúng                                                     | `lib.rs` `show_main_window`               |
| SM-05 | Đổi ngôn ngữ trong Settings | UI đổi ngay; tray rebuild theo ngôn ngữ                                         | `App.tsx`, `rebuild_tray_menu_cmd`        |
| SM-06 | Khởi động lại app           | Không mất queue/settings đã lưu                                                 | `usePersistedDownloadQueue`, localStorage |

---

## 5. Dashboard

| ID    | Thao tác             | Kỳ vọng                                                                      | Code                                          |
| :---- | :------------------- | :--------------------------------------------------------------------------- | :-------------------------------------------- |
| DB-01 | Mở Dashboard         | 6 thẻ KPI hiển thị số liệu, không NaN                                        | `DashboardPage.tsx`, `get_multibrowser_stats` |
| DB-02 | Bảng đối chiếu 1-1   | Kênh có `bkt_profile_id` hiện profile đích; kênh chưa gán hiện `⚠️ Chưa gán` | `followed_channels.bkt_profile_id`            |
| DB-03 | Bấm "Gán ngay"       | Chuyển sang đúng kênh/profile để gán, không đăng nhầm                        | `DashboardPage`                               |
| DB-04 | Card lỗi gần đây     | Hiện lỗi kèm profile; click mở đúng profile                                  | `get_multibrowser_stats.recent_errors`        |
| DB-05 | Card session gần đây | Thời gian/trạng thái khớp `run_history.jsonl`                                | `browser_engine/core/run_history.py`          |

## 6. Profiles (MultiBrowser)

| ID    | Thao tác        | Kỳ vọng                                              | Code                                                             |
| :---- | :-------------- | :--------------------------------------------------- | :--------------------------------------------------------------- |
| PR-01 | Tạo profile mới | Profile xuất hiện trong bảng, có `profile_dir` riêng | `save_multibrowser_profile`                                      |
| PR-02 | Mở profile      | Chromium anti-detect khởi chạy, giữ cookie đăng nhập | `launch_multibrowser_profile` → `runner.py open_profile`         |
| PR-03 | Đóng profile    | Process dừng, trạng thái về "Đã dừng"                | `stop_multibrowser_profile`                                      |
| PR-04 | Test proxy      | Trả latency/IP/quốc gia; proxy sai báo lỗi rõ        | `test_multibrowser_proxy` → `action_test_proxy`                  |
| PR-05 | Sắp xếp cửa sổ  | Cửa sổ vào lưới 2x2/3x3, không tràn màn hình         | `arrange_multibrowser_windows`, `window_arranger.py`             |
| PR-06 | Xóa profile     | Xóa data dir + lock; không còn trong danh sách       | `delete_multibrowser_profile`                                    |
| PR-07 | Bulk stop/group | Nhiều profile dừng/gán nhóm đúng                     | `bulk_stop_multibrowser_profiles`, `bulk_set_multibrowser_group` |
| PR-08 | Clean cache     | Cache GPU/Code bị xóa, cookie giữ nguyên             | `clean_multibrowser_profile_cache`                               |

## 7. Channels

| ID    | Thao tác                | Kỳ vọng                                                          | Code                                           |
| :---- | :---------------------- | :--------------------------------------------------------------- | :--------------------------------------------- |
| CH-01 | Theo dõi kênh mới       | Kênh xuất hiện, resolve được `youtube_channel_id`                | `follow_channel`, `resolve_youtube_channel_id` |
| CH-02 | Check now               | Quét video mới ngay, cập nhật `last_checked_at`                  | `check_channel_now`                            |
| CH-03 | Bật auto-download       | Video mới tự vào hàng đợi tải                                    | `polling.rs` emit `channel-auto-download`      |
| CH-04 | Bộ lọc duration/keyword | Video ngoài filter bị `ignored`, không tải                       | `check_channel_for_new_videos`                 |
| CH-05 | Xem chi tiết kênh       | Danh sách video, sort theo mới/viral/cũ, filter 3/7 ngày         | `ChannelsPage`, `get_channel_videos`           |
| CH-06 | Tải video đã chọn       | Queue nhận đúng video, trạng thái `downloading`                  | `downloadSelectedVideos`                       |
| CH-07 | Traffic light           | 1 video đỏ → vàng; 2 video đỏ liên tiếp → đỏ + tắt auto_download | `update_channel_video_risk_db`                 |
| CH-08 | Kênh đỏ                 | Không cho quét/tải tiếp, hiện lý do                              | `followed_channels.risk_status`                |

## 8. Outlier Hunter

| ID    | Thao tác                | Kỳ vọng                                              | Code                                                |
| :---- | :---------------------- | :--------------------------------------------------- | :-------------------------------------------------- |
| OU-01 | Quét 1 ngách            | Trả danh sách video đạt ngưỡng, lưu `outlier_videos` | `trigger_outlier_scan_cmd`, `hunt_niche_outliers`   |
| OU-02 | Quét toàn bộ ngách      | Không lỗi, gộp kết quả theo ngách                    | `OutlierHunterPage`                                 |
| OU-03 | Lọc theo ngách/status   | Kết quả đúng filter                                  | `get_outlier_videos_cmd`                            |
| OU-04 | Ping momentum           | Cập nhật VPH/gia tốc/sparkline                       | `trigger_outlier_ping_cmd`, `update_momentum_radar` |
| OU-05 | Phân tích kênh đối thủ  | Trả video + VPH + tags                               | `analyze_competitor_channel_cmd`                    |
| OU-06 | Keyword goldmine        | Trả gợi ý autocomplete + độ cạnh tranh               | `find_keyword_goldmines_cmd`                        |
| OU-07 | Hook analysis           | Trả 30s hook/transcript; lỗi 429 phải báo rate limit | `analyze_video_hook_cmd`, `Transcript Diagnostics`  |
| OU-08 | Đưa video sang Reup/Tải | Điền đúng path/URL sang trang đích                   | `sessionStorage` + `ReupBktPage`                    |

## 9. Reup & BKT

| ID    | Thao tác                 | Kỳ vọng                                                       | Code                                             |
| :---- | :----------------------- | :------------------------------------------------------------ | :----------------------------------------------- |
| RB-01 | Reup Lv1                 | Output mới, MD5/SHA256 đổi, audio không lệch tiếng            | `run_reup_pipeline_v1_cmd`, `services/ffmpeg.rs` |
| RB-02 | Reup Lv2                 | Có hflip/eq/scale/crop, hash đổi, file phát được              | `run_reup_pipeline_v2_cmd`                       |
| RB-03 | Nhập URL vào Reup        | Bị chặn kèm nút "Tải về máy"                                  | `ReupBktPage` URL guard                          |
| RB-04 | Upload BKT unlisted      | Video lên Studio ở chế độ unlisted, trả YouTube ID            | `upload_video_multibrowser`                      |
| RB-05 | Poll Studio              | `pending` lặp tối đa 25 lần (~10–12 phút), không báo xanh sớm | `checkBktCopyrightStatus` + `MAX_POLLS`          |
| RB-06 | Kết quả xanh             | Chỉ khi có kết quả thật; hiện "None/—"                        | `runner.py check_copyright_status`               |
| RB-07 | Kết quả đỏ               | Hiện Content ID, gợi ý Lv2                                    | `bkt_check_status=red_matched`                   |
| RB-08 | Auto-publish             | Chỉ publish khi xanh + bật auto + có profile chính            | `handleCheckStudioStatus`                        |
| RB-09 | Auto-Pilot               | 5 bước: Reup → title 95/5 → thumbnail → upload → poll         | `handleRunAutoPilot`                             |
| RB-10 | Quota kênh test          | 15 video/24h; hết quota khóa và chuyển kênh khác              | `bkt_channels.rs`, `daily_quota`                 |
| RB-11 | Kênh test chưa đăng nhập | Báo lỗi login, không treo                                     | `runner.py` login check                          |

## 10. Universal (tải đa nền tảng)

| ID    | Thao tác              | Kỳ vọng                                          | Code                         |
| :---- | :-------------------- | :----------------------------------------------- | :--------------------------- |
| UN-01 | Dán URL               | Preview sau ~500ms: title/thumbnail/duration     | `UniversalUrlInput` debounce |
| UN-02 | Thêm nhiều URL        | Tách đúng từng URL, không dính dấu câu           | `extractUrls`                |
| UN-03 | Tải video             | Progress %, speed, ETA; hoàn tất ghi Library     | `download_video`             |
| UN-04 | Chất lượng cần FFmpeg | Nếu thiếu FFmpeg, chặn và mở dialog cài          | `FFmpegRequiredDialog`       |
| UN-05 | Phụ đề                | Bật CC, chọn lang/format/embed; file phụ đề đúng | `append_subtitle_args`       |
| UN-06 | Cookie lỗi            | Hiện dialog cookie mới, không crash              | `BrowserCookieErrorDialog`   |
| UN-07 | Trùng Library         | Chặn/tải lại theo lựa chọn duplicate             | `find_duplicate_downloads`   |
| UN-08 | Hẹn giờ               | Schedule chạy đúng giờ, trạng thái trên tray     | `useSchedule`                |

## 11. Library

| ID    | Thao tác           | Kỳ vọng                                               | Code                                                   |
| :---- | :----------------- | :---------------------------------------------------- | :----------------------------------------------------- |
| LB-01 | Tìm không dấu      | "video" tìm được "Video"; FTS hoạt động               | `history_search_fts`                                   |
| LB-02 | Filter/sort        | Đúng theo tag/collection/format/ngày                  | `HistoryContext`                                       |
| LB-03 | Gán tag/collection | Lưu DB, hiện chip đúng                                | `assign_history_tags`, `assign_history_collections`    |
| LB-04 | Phát nhạc          | Player phát file, queue/volume/rate đúng              | `PlayerContext`                                        |
| LB-05 | Đổi tên file       | File đổi tên, DB sync path mới                        | `rename_downloaded_file`, `sync_history_renamed_entry` |
| LB-06 | Mở thư mục         | Mở Explorer đúng file                                 | `open_file_location`                                   |
| LB-07 | Xóa entry          | Theo setting: chỉ DB hay xóa cả file                  | `library-delete-behavior`                              |
| LB-08 | Tải lại            | Redownload đúng URL, tạo entry mới                    | `HistoryContext`                                       |
| LB-09 | Split media        | Cắt segment đúng thời lượng                           | `split_media_segments`                                 |
| LB-10 | Tóm tắt AI         | Tóm tắt lưu vào history; lỗi thiếu transcript rõ ràng | `generate_video_summary`                               |

## 12. Logs

| ID    | Thao tác      | Kỳ vọng                                            | Code               |
| :---- | :------------ | :------------------------------------------------- | :----------------- |
| LG-01 | Lọc theo loại | 6 loại: download/channels/bkt_test/outlier/reup/ai | `database/logs.rs` |
| LG-02 | Tìm kiếm      | Lọc đúng message/URL                               | `LogsPage`         |
| LG-03 | Export        | File `retubematrix-logs-YYYY-MM-DD.json` hợp lệ    | `export_logs`      |
| LG-04 | Auto scroll   | Bật/tắt đúng, không giật khi log nhiều             | `LogsPage`         |

## 13. Settings

| ID    | Thao tác              | Kỳ vọng                                                 | Code                                              |
| :---- | :-------------------- | :------------------------------------------------------ | :------------------------------------------------ |
| ST-01 | Kiểm tra dependencies | yt-dlp/FFmpeg/Deno hiện đúng phiên bản, badge xanh      | `DependenciesContext`, `commands/dependencies.rs` |
| ST-02 | Cập nhật yt-dlp       | Tải/cập nhật theo channel stable/nightly, verify SHA    | `update_ytdlp`                                    |
| ST-03 | AI config             | Lưu key/model; Test connection trả OK/lỗi rõ            | `save_ai_config`, `test_ai_connection`            |
| ST-04 | Whisper               | Bật/tắt, custom endpoint; dùng làm fallback transcript  | `AIContext`, `transcribe_url_with_whisper`        |
| ST-05 | Network/Proxy         | Cookie/proxy áp dụng cho download + polling             | `network-config.ts`, `set_polling_network_config` |
| ST-06 | Telegram              | Token/chat id; `/status`, `/add`, `/download` hoạt động | `services/telegram.rs`                            |
| ST-07 | Plugin cài `.ywp`     | Kiểm tra chữ ký, xin quyền, chạy workflow               | `commands/plugin.rs`                              |
| ST-08 | CLI shortcut          | Cài `retubematrix`, trạng thái hiện đúng                | `install_cli_shortcut`                            |
| ST-09 | Theme/ngôn ngữ        | Đổi theme 8 màu + ngôn ngữ, không reload                | `ThemeContext`, `i18n`                            |
| ST-10 | About/Updater         | Endpoint trỏ `DungDT293/RETUBEMATRIX`; không còn youwee | `tauri.conf.json`, `useAppUpdater`                |

## 14. Deep link / CLI / Extension / SDK

| ID    | Thao tác                                          | Kỳ vọng                                          | Code                                    |
| :---- | :------------------------------------------------ | :----------------------------------------------- | :-------------------------------------- |
| DL-01 | `retubematrix://download?v=1&url=...` khi app tắt | App mở, queue nhận URL                           | `external.rs`, `lib.rs` single-instance |
| DL-02 | `youwee://...` (legacy)                           | Vẫn mở được, tương thích                         | `external.rs`                           |
| DL-03 | Link thiếu `v=1`/`url`                            | Bị từ chối, không crash                          | `external.rs`                           |
| CL-01 | `retubematrix --version`                          | In `RETubeMatrix 0.20.16`                        | `main.rs`, `cli.rs`                     |
| CL-02 | `retubematrix <url> --queue-only`                 | Chỉ thêm queue, không tải ngay                   | `build_cli_download_request`            |
| CL-03 | `retubematrix <url>` khi app đang chạy            | Instance cũ nhận lệnh, không mở app thứ 2        | `single-instance`                       |
| EX-01 | Load extension Chromium                           | Popup hiện, gửi tab sang app                     | `extensions/retubematrix-webext`        |
| EX-02 | Extension Firefox                                 | Manifest hợp lệ, gửi deep link `retubematrix://` | `manifest.firefox.json`                 |
| SD-01 | Build plugin bằng SDK                             | `retubematrix-sdk` build/pack thành `.ywp`       | `sdk-js/src/packager.ts`                |
| SD-02 | Plugin cũ dùng `YOUWEE_*`                         | Vẫn chạy nhờ runtime mirror env                  | `runtime-cli.ts`                        |

## 15. Packaging / Updater

| ID    | Thao tác                            | Kỳ vọng                                            | Code                           |
| :---- | :---------------------------------- | :------------------------------------------------- | :----------------------------- |
| PK-01 | Cài NSIS sạch                       | Cài thành công, shortcut/icon đúng                 | `template.nsi`                 |
| PK-02 | Nâng cấp bản cũ                     | Không báo "Unable to uninstall!"                   | `template.nsi`                 |
| PK-03 | Deep link sau cài                   | Cả `retubematrix://` và `youwee://` đăng ký        | `tauri.conf.json`              |
| UP-00 | Mở app khi endpoint chưa có release | Không hiện dialog lỗi; auto-check thất bại im lặng | `useAppUpdater` `silent: true` |
| UP-01 | Check update                        | Gọi đúng repo `DungDT293/RETUBEMATRIX`             | `useAppUpdater`, `tauri.conf`  |
| UP-02 | Chữ ký update                       | Bản ký bằng key mới được chấp nhận                 | `docs/UPDATER.md`              |

## 16. Negative / security

| ID    | Thao tác                              | Kỳ vọng                      |
| :---- | :------------------------------------ | :--------------------------- |
| NG-01 | URL `file://`, localhost              | Bị từ chối                   |
| NG-02 | yt-dlp advanced option `--exec`       | Bị từ chối ở FE và BE        |
| NG-03 | Header `Authorization` trong advanced | Bị chặn                      |
| NG-04 | BKT `checked_count=0`                 | **Không** báo xanh           |
| NG-05 | Plugin xin quyền chưa duyệt           | Bị chặn chạy                 |
| NG-06 | Plugin ghi vào `System32`, `~/.ssh`   | Bị chặn                      |
| NG-07 | Proxy sai                             | Báo lỗi rõ, không treo       |
| NG-08 | YouTube 429 khi lấy transcript        | Báo rate limit + gợi ý proxy |

---

## 17. Lệnh regression tự động

```powershell
# Frontend
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\biome.cmd check .
.\node_modules\.bin\vite.cmd build

# SDK
.\node_modules\.bin\tsc.cmd -p sdk-js\tsconfig.json

# Rust
cd src-tauri; cargo check; cargo test --lib

# Python engine
cd ..\browser_engine
python -m py_compile runner.py outlier_hunter.py
python runner.py --action list_profiles

# Extension
node extensions\retubematrix-webext\scripts\build.mjs
```

> Trên máy hiện tại chưa cài `bun`, nên dùng binary trong `node_modules/.bin`; CI dùng `bun run` theo AGENTS.
