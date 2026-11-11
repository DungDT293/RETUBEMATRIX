# PROJECT CONTEXT — RETUBEMATRIX

> **Tệp quy chuẩn bối cảnh dự án (Project Context)**
> Khi bắt đầu phiên làm việc mới với AI, chỉ cần chỉ định:
> _"Hãy đọc tệp `PROJECT_CONTEXT.md` để nắm toàn bộ bối cảnh dự án trước khi chúng ta bắt đầu."_

---

## 1. TỔNG QUAN DỰ ÁN & MỤC ĐÍCH

- **Tên ứng dụng**: **RETubeMatrix** (Tên mã kỹ thuật: `reupytb`, Tên gói: `retubematrix`)
- **Phiên bản hiện tại**: `v1.0.1` (Phát hành: 2026-11-11)
- **Mục đích**: Nền tảng Desktop All-in-One chuyên nghiệp dành cho việc săn đón video đề xuất ngách (Outlier Hunter theo mô hình Ikigai), tải video sạch đa luồng, theo dõi tự động kênh đối thủ (đối chiếu 1-1 không nhầm lẫn kênh), xử lý lách bản quyền đa cấp độ (Reup Pipeline Lv.1 & Lv.2 đổi Checksum MD5/SHA256, Dynamic Audio Resampling, xóa sạch EXIF gốc), kiểm tra bản quyền trực tiếp với YouTube Studio qua Kênh Test BKT độc lập (Quota 15 video/24h, Traffic Light Xanh/Vàng/Đỏ), AI tối ưu Tiêu đề (Quy tắc 95%-5%) & Thumbnail (bảo toàn 95% nhân vật/chữ), quản lý hồ sơ trình duyệt Anti-Detect độc lập (MultiBrowser Cloak Chromium 155), chẩn đoán lỗi chuyên biệt 6 file log, Trung tâm Điều hành Doanh nghiệp SaaS Master Hub phân quyền 4 cấp với Cloudflare Edge Gateway & Khóa cứng máy HWID, và hệ sinh thái Plugin mở rộng (`.ywp`).

- **Công nghệ cốt lõi (Tech Stack)**:
  - **Desktop Core**: [Tauri 2.0](https://tauri.app/) (Rust backend)
  - **Frontend**: React 19 + TypeScript + Tailwind CSS + Radix UI + Lucide Icons + Vite
  - **Cloud & SaaS Gateway**: Cloudflare Workers Edge Gateway (`retubematrix-gateway.dungdong333.workers.dev`), Supabase PostgreSQL với Row-Level Security (RLS)
  - **Hardware Security Engine**: Rust Native Win32 / Registry Cryptography / WMIC / CIM HWID Extraction (SHA-256 fingerprint)
  - **Database**: SQLite (`rusqlite`) ở chế độ WAL Mode kết hợp Virtual Table FTS5 tìm kiếm toàn văn bản tiếng Việt không dấu (`unicode61 remove_diacritics 2`)
  - **External Bundled Engines**: Bundled `yt-dlp`, Bundled `FFmpeg`/`FFprobe`, Bundled `gallery-dl`, Bundled `Deno runtime`, Bundled `Python 3 Embed`
  - **Browser Automation Core**: Python 3 (Playwright / Chromium Cloak Engine) cô lập tại `%LOCALAPPDATA%\reupytb\browser_engine\`
  - **Plugin Engine**: Kiến trúc sandbox chạy các gói `.ywp` có chữ ký, hỗ trợ JavaScript/TypeScript SDK (`retubematrix-sdk`) chạy trên Deno hoặc Node.js runtime

- **Môi trường & Công cụ phát triển**:
  - Package manager: `bun` (tuyệt đối không dùng npm/npx theo quy chuẩn `AGENTS.md`)
  - Linting: `bun run biome check --write .`
  - Rust check: `cargo check` (trong thư mục `src-tauri/`)
  - TypeScript check: `bun run tsc -b`
  - Chạy dev: `bun run tauri dev`

---

## 2. KIẾN TRÚC TỔNG THỂ & IPC CONTRACT

Ứng dụng hoạt động theo mô hình Hybrid đa tiến trình an toàn và độc lập:

```mermaid
flowchart TD
    UI[Frontend: React 19 + TypeScript + Tailwind CSS] -- invoke / IPC Events --> Rust[Tauri 2.0 Rust Core Engine]
    UI -- HTTPS JWT / REST --> CF_GATEWAY[Cloudflare Edge Gateway: retubematrix-gateway.dungdong333.workers.dev]
    
    subgraph SaaS_Cloud [Hạ Tầng SaaS Cloud & Phân Quyền]
        CF_GATEWAY -- Zero-Cold-Start Proxy --> SUPABASE[Supabase PostgreSQL + RLS]
        SUPABASE -- RBAC Tables --> TENANTS[(companies, app_users, licenses, audit_logs)]
        UI -- HWID SHA-256 --> HWID_LOCK[Khóa Cứng Thiết Bị 1 Máy - 1 Tài Khoản]
        HWID_LOCK -- Bypass --> OWNER_BYPASS[Master Owner All-Device Access]
    end

    subgraph RustServices [Tauri 2.0 Core Services]
        Rust -- rusqlite WAL --> DB[(retubematrix.db + FTS5)]
        Rust -- Stdio Process --> YTDLP[Bundled yt-dlp]
        Rust -- Stdio Process --> FFMPEG[Bundled FFmpeg & FFprobe]
        Rust -- Stdio Process --> GALLERY[Bundled gallery-dl]
        Rust -- Stdio Process --> DENO[Bundled Deno Runtime]
        Rust -- Reqwest Async --> TELEGRAM[Telegram Bot Poller]
        Rust -- Subprocess CLI JSON Base64 --> RUNNER[Python runner.py]
    end

    subgraph BrowserEngine [Browser Multi & Outlier Core]
        RUNNER -- Playwright Cloak --> CHROMIUM[Anti-detect Chromium Profiles]
        RUNNER -- Win32 API --> WINDOWS[Window Manager / Grid Auto-Tile]
        RUNNER -- yt-dlp Stealth Request --> OUTLIERS[YouTube Outlier Scanner & Hook Analyzer]
    end

    subgraph ExternalPlatforms [Mạng & Nền tảng bên ngoài]
        CHROMIUM -- Session / Cookie --> YT_STUDIO[YouTube Studio BKT]
        TELEGRAM -- Long Polling --> TG_SERVERS[Telegram API]
        DENO -- Sandboxed --> PLUGINS[Hệ sinh thái Plugin .ywp]
    end
```

---

## 3. DOCS CHO BACKEND & API

### 3.1. Rust Tauri IPC Commands (`src-tauri/src/commands/`)

Tất cả các command được đăng ký trong `src-tauri/src/lib.rs` và giao tiếp với Frontend qua `@tauri-apps/api/core::invoke`. Tham số từ Frontend luôn tuân thủ quy ước `camelCase` (kèm dự phòng `snake_case` ở backend).

#### A. Download & Queue Commands (`commands/download.rs`, `commands/download_queue.rs`)

| Command Name           | Tham số                               | Ý nghĩa                                                                                                           |
| :--------------------- | :------------------------------------ | :---------------------------------------------------------------------------------------------------------------- |
| `download_video`       | `url`, `quality`, `format`, `options` | Bắt đầu tải video/audio với yt-dlp (hỗ trợ proxy, cookie, cắt đoạn time range, sponsorblock, subtitles, playlist) |
| `stop_download`        | `id`                                  | Hủy tiến trình tải video cụ thể                                                                                   |
| `load_download_queue`  | `queue_kind`                          | Nạp danh sách hàng đợi đã lưu từ SQLite (`download_queues`)                                                       |
| `save_download_queue`  | `queue_kind`, `items_json`            | Lưu trạng thái hàng đợi tải xuống SQLite khi tắt app                                                              |
| `clear_download_queue` | `queue_kind`                          | Xóa sạch hàng đợi tải tương ứng                                                                                   |

#### B. Gallery & Media Split Commands (`commands/gallery.rs`, `commands/media_split.rs`)

| Command Name            | Tham số                                | Ý nghĩa                                                                                |
| :---------------------- | :------------------------------------- | :------------------------------------------------------------------------------------- |
| `download_gallery`      | `url`, `options`                       | Tải album/gallery ảnh hoặc đa phương tiện bằng `gallery-dl`                            |
| `stop_gallery_download` | `id`                                   | Hủy tiến trình tải gallery                                                             |
| `check_gallerydl`       | -                                      | Kiểm tra runtime và binary `gallery-dl`                                                |
| `split_media_segments`  | `input_path`, `segments`, `output_dir` | Cắt nhỏ video/audio thành nhiều phân đoạn không mã hóa lại hoặc với FFmpeg stream copy |

#### C. Video Info & Subtitle Detection (`commands/video.rs`, `commands/youtube_search.rs`)

| Command Name              | Tham số          | Ý nghĩa                                                                  |
| :------------------------ | :--------------- | :----------------------------------------------------------------------- |
| `get_video_basic_info`    | `url`            | Lấy nhanh tiêu đề, thumbnail, thời lượng video                           |
| `get_video_info`          | `url`, `cookies` | Trích xuất toàn bộ metadata chi tiết, danh sách formats và audio streams |
| `get_playlist_entries`    | `url`            | Trích xuất danh sách tất cả video trong một playlist YouTube             |
| `search_youtube_videos`   | `query`, `limit` | Tìm kiếm video YouTube trực tiếp                                         |
| `get_available_subtitles` | `url`            | Lấy danh sách phụ đề có sẵn (gốc & tự động tạo)                          |
| `get_video_transcript`    | `url`, `lang`    | Bóc tách nội dung phụ đề/transcript của video                            |

#### D. Channel Monitoring & Polling Commands (`commands/channels.rs`)

| Command Name                                  | Tham số                                                                                                                                     | Ý nghĩa                                                                                                                                                                 |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_followed_channels`                       | -                                                                                                                                           | Lấy danh sách toàn bộ kênh đang theo dõi kèm cấu hình lọc                                                                                                               |
| `follow_channel`                              | `url`, `config`                                                                                                                             | Theo dõi kênh mới, tự động resolve `youtube_channel_id` để kích hoạt RSS siêu tốc                                                                                       |
| `unfollow_channel`                            | `id`                                                                                                                                        | Hủy theo dõi kênh và xóa dữ liệu liên quan                                                                                                                              |
| `update_channel_settings`                     | `id`, `settings`                                                                                                                            | Cập nhật cấu hình lọc (duration, include/exclude keywords, threads, codec, Reup pipeline, template)                                                                     |
| `update_channel_info`                         | `id`, `name`, `thumbnail`                                                                                                                   | Cập nhật tên hoặc ảnh đại diện kênh                                                                                                                                     |
| `check_channel_now`                           | `channel_id`                                                                                                                                | Kích hoạt quét video mới ngay lập tức (bỏ qua chu kỳ hẹn giờ)                                                                                                           |
| `toggle_channel_auto_download`                | `channel_id`, `enabled`                                                                                                                     | Bật/tắt tự động tải video mới khi quét thấy                                                                                                                             |
| `get_channel_videos`                          | `channel_id`, `status`, `page`, `limit`                                                                                                     | Lấy danh sách video quét được từ kênh                                                                                                                                   |
| `save_channel_videos`                         | `videos`                                                                                                                                    | Lưu danh sách video quét được vào bảng `channel_videos`                                                                                                                 |
| `get_saved_channel_videos`                    | `channel_id`                                                                                                                                | Lấy toàn bộ video đã lưu của kênh                                                                                                                                       |
| `get_saved_channel_videos_by_video_ids`       | `video_ids`                                                                                                                                 | Truy vấn video theo danh sách ID                                                                                                                                        |
| `update_channel_video_status`                 | `id`, `status`                                                                                                                              | Đổi trạng thái video (`new`, `downloading`, `downloaded`, `failed`, `ignored`)                                                                                          |
| `update_channel_video_status_by_video_id`     | `channel_id`, `video_id`, `status`                                                                                                          | Cập nhật trạng thái theo cặp channel_id + video_id                                                                                                                      |
| `get_new_videos_count`                        | -                                                                                                                                           | Lấy tổng số video mới chưa xử lý                                                                                                                                        |
| `get_channel_stats` / `get_all_channel_stats` | `channel_id` / -                                                                                                                            | Thống kê số lượng video, trạng thái tải của từng kênh hoặc toàn bộ                                                                                                      |
| `set_polling_network_config`                  | `proxy`, `rate_limit`                                                                                                                       | Cài đặt thông số mạng, proxy cho worker polling                                                                                                                         |
| `update_channel_bkt_config`                   | `channel_id`, `bkt_test_mode`, `bkt_profile_id`                                                                                             | Cấu hình chế độ kiểm tra bản quyền BKT và chọn profile YouTube Studio                                                                                                   |
| `trigger_bkt_test_video`                      | `channel_video_id`, `profile_id`                                                                                                            | Đẩy video kênh nghi vấn lên YouTube Studio ở chế độ unlisted để test bản quyền                                                                                          |
| `check_bkt_copyright_status_cmd`              | `profile_id`, `video_id`                                                                                                                    | Quét YouTube Studio kiểm tra kết quả Content ID của video                                                                                                               |
| `extract_competitor_channel_seo_cmd`          | `channel_url`                                                                                                                               | Quét mã nguồn và metadata yt-dlp trích xuất tên kênh, từ khóa kênh, thẻ video và hashtags đối thủ                                                                       |
| `apply_competitor_seo_to_profile_cmd`         | `profile_id`, `channel_keywords`, `default_tags`, `made_for_kids`                                                                           | Tự động mở YouTube Studio, xóa sạch từ khóa rác cũ về 0/500 qua 4 tầng, điền từ khóa kênh và thẻ mặc định (<= 450 ký tự chuẩn Studio), tắt Made For Kids                |
| `nurture_competitor_channel_seo_cmd`          | `profile_id`, `duration_minutes`, `competitor_titles`, `competitor_hashtags`, `competitor_keywords`, `competitor_urls`, `preferred_channel` | Khởi chạy phiên nuôi kênh tự nhiên (module `YouTubeNurture` từ BrowserMulti) theo Tiêu đề & Hashtags đối thủ, retention >= 40%, tuyệt đối không tiêm URL vào ô tìm kiếm |

#### D2. BKT Test Pool & Daily Production Report Commands (`commands/bkt_channels.rs`)

| Command Name                  | Tham số                            | Ý nghĩa                                                                                                                    |
| :---------------------------- | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `get_bkt_test_channels`       | -                                  | Lấy danh sách kênh trong Bể Test Bản Quyền kèm số lượt quota còn lại trong ngày                                            |
| `save_bkt_test_channel`       | `channel`                          | Thêm mới hoặc cập nhật thông tin kênh test BKT (tên, profile liên kết, hạn ngạch daily_quota)                              |
| `delete_bkt_test_channel`     | `id`                               | Xóa kênh khỏi bể test bản quyền                                                                                            |
| `get_bkt_test_jobs`           | `limit`                            | Lấy danh sách tác vụ kiểm tra bản quyền Studio gần nhất                                                                    |
| `dispatch_batch_bkt_test`     | `payload: BktBatchDispatchRequest` | Điều phối hàng loạt video sang kênh test BKT, tự động phân bổ cân bằng tải (load balancing) hoặc gán kênh cụ thể           |
| `publish_bkt_job_to_main_cmd` | `job_id`                           | Xuất bản video đã xác thực `green_clean` trực tiếp sang Kênh YouTube Chính theo cấu hình hồ sơ 1-1                         |
| `recheck_bkt_job_cmd`         | `job_id`                           | Kích hoạt quét lại bản quyền cho một tác vụ BKT đang chờ hoặc cần xác minh lại                                             |
| `get_daily_report_stats`      | `date` / `date_filter`             | Lấy dữ liệu Báo Cáo Ngày (Hôm nay / Hôm qua / 7 ngày qua / ngày tùy chọn): 5 thẻ KPI ngày, quota test và activity timeline |

#### E. Outlier Hunter Commands (`commands/outliers.rs`)

| Command Name                      | Tham số                                                         | Ý nghĩa                                                                                           |
| :-------------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `get_outlier_settings_cmd`        | -                                                               | Đọc cấu hình Outlier Hunter (danh sách ngách, ngưỡng views, max subs, min outlier ratio, min VPH) |
| `update_outlier_settings_cmd`     | `settings`                                                      | Cập nhật cấu hình bộ lọc Outlier Hunter                                                           |
| `get_outlier_videos_cmd`          | `status`, `niche`, `limit`                                      | Truy vấn danh sách video đột phá theo ngách và trạng thái                                         |
| `update_outlier_video_status_cmd` | `id`, `status`, `local_filepath`, `reup_filepath`, `bkt_status` | Cập nhật trạng thái video (`discovered`, `watchlist`, `downloaded`, `reuped`, `ignored`)          |
| `delete_outlier_video_cmd`        | `id`                                                            | Xóa video khỏi danh sách Outlier                                                                  |
| `trigger_outlier_scan_cmd`        | `niche`                                                         | Kích hoạt worker quét YouTube tìm các video vượt trội theo ngách                                  |
| `trigger_outlier_ping_cmd`        | -                                                               | Ping lại danh sách Watchlist để tính tốc độ gia tốc views (Momentum / Acceleration)               |
| `find_keyword_goldmines_cmd`      | `seed_keyword`                                                  | Khai thác từ khóa vàng dựa trên YouTube Autocomplete & độ cạnh tranh                              |
| `analyze_video_hook_cmd`          | `video_id`                                                      | Phân tích 30 giây đầu kịch bản hook transcript của video triệu views                              |

#### F. Reup Pipeline & Video Processing Commands (`commands/processing.rs`, `commands/processing/*`)

| Command Name                                                                     | Tham số                     | Ý nghĩa                                                                                                                                                              |
| :------------------------------------------------------------------------------- | :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_reup_pipeline_v1_cmd`                                                       | `input_path`, `output_path` | Chạy Reup Pipeline Cấp độ 1 (giữ 95% gốc, scale/crop 1.01x, speed 1.03x, pitch 1.02x, dynamic resampling, clear EXIF, 32 bytes padding đổi MD5)                      |
| `run_reup_pipeline_v2_cmd`                                                       | `input_path`, `output_path` | Chạy Reup Pipeline Cấp độ 2 (Lách sâu: hflip, cân bằng màu LUT, scale 1.02x, crop 2%, speed 1.05x, pitch 1.04x, dynamic resampling, 48 bytes padding đổi MD5/SHA256) |
| `get_video_metadata`                                                             | `path`                      | Trích xuất thông số kỹ thuật video (codec, resolution, fps, bitrate, audio sample rate) bằng `ffprobe`                                                               |
| `detect_shot_changes`                                                            | `video_path`, `threshold`   | Nhận diện điểm chuyển cảnh (Scene Cut detection) hỗ trợ làm phụ đề và cắt dựng                                                                                       |
| `get_image_metadata`                                                             | `path`                      | Đọc thông số metadata ảnh                                                                                                                                            |
| `get_processing_attachment_info`                                                 | `path`                      | Lấy thông tin file đính kèm/media đầu vào                                                                                                                            |
| `generate_processing_command`                                                    | `params`                    | Tạo chuỗi câu lệnh FFmpeg tùy chỉnh theo yêu cầu người dùng                                                                                                          |
| `generate_quick_action_command`                                                  | `action`, `input_path`      | Tạo nhanh lệnh FFmpeg (nén video, chuyển MP4, trích âm thanh, lật hình)                                                                                              |
| `execute_ffmpeg_command`                                                         | `command`, `job_id`         | Thực thi lệnh FFmpeg với thanh tiến trình realtime                                                                                                                   |
| `cancel_ffmpeg`                                                                  | `job_id`                    | Hủy lệnh FFmpeg đang thực thi                                                                                                                                        |
| `get_processing_history` / `clear_processing_history`                            | -                           | Quản lý lịch sử xử lý video trong SQLite (`processing_jobs`)                                                                                                         |
| `save_processing_job` / `update_processing_job` / `delete_processing_job`        | `job` / `id`                | CRUD tác vụ xử lý video                                                                                                                                              |
| `get_processing_presets` / `save_processing_preset` / `delete_processing_preset` | `preset` / `id`             | Quản lý mẫu xử lý video FFmpeg định sẵn                                                                                                                              |
| `generate_video_preview` / `generate_audio_preview` / `generate_video_thumbnail` | `params`                    | Tạo file preview nhanh để xem trước hiệu ứng                                                                                                                         |
| `cleanup_previews`                                                               | -                           | Dọn dẹp cache preview tạm thời                                                                                                                                       |

#### G. MultiBrowser Profiles & YouTube Studio Automation Commands (`commands/profiles.rs`)

| Command Name                       | Tham số                               | Ý nghĩa                                                                                                              |
| :--------------------------------- | :------------------------------------ | :------------------------------------------------------------------------------------------------------------------- |
| `get_multibrowser_profiles`        | -                                     | Lấy danh sách toàn bộ hồ sơ trình duyệt từ kho `%LOCALAPPDATA%\reupytb\browser_engine\profiles\`                     |
| `save_multibrowser_profile`        | `profile`                             | Tạo mới hoặc cập nhật hồ sơ (Name, Group, Proxy, Note, Tags, Color)                                                  |
| `delete_multibrowser_profile`      | `profile_id`                          | Xóa hồ sơ và giải phóng thư mục dữ liệu kèm SingletonLock                                                            |
| `launch_multibrowser_profile`      | `profile_id`                          | Mở trình duyệt anti-detect Chromium với fingerprint cô lập                                                           |
| `stop_multibrowser_profile`        | `profile_id`                          | Đóng trình duyệt profile cụ thể                                                                                      |
| `bulk_stop_multibrowser_profiles`  | `profile_ids`                         | Đóng hàng loạt trình duyệt đang mở                                                                                   |
| `test_multibrowser_proxy`          | `proxy`                               | Kiểm tra độ trễ (latency ms), IP thực và quốc gia (Geo Location) của proxy                                           |
| `get_multibrowser_stats`           | -                                     | Lấy thống kê Dashboard: số profile sẵn sàng, đang chạy, lỗi hôm nay, runtime, phiên chạy gần đây                     |
| `arrange_multibrowser_windows`     | `params`                              | Tự động sắp xếp các cửa sổ Chromium theo dạng lưới (Auto-fit, Tile, Cascade, 2-3-4 cột) trên màn hình bằng Win32 API |
| `clean_multibrowser_profile_cache` | `profile_id`                          | Dọn dẹp cache trình duyệt an toàn (xóa cache GPU/Code, giữ nguyên Cookie đăng nhập)                                  |
| `update_multibrowser_profile_meta` | `profile_id`, `note`, `tags`, `color` | Cập nhật nhãn và ghi chú nhanh                                                                                       |
| `bulk_set_multibrowser_group`      | `profile_ids`, `group`                | Gom nhóm hàng loạt hồ sơ trình duyệt                                                                                 |
| `upload_video_multibrowser`        | `params`                              | Tự động đăng tải video lên YouTube Studio (điền tiêu đề, mô tả, tags, thumbnail, visibility, đặt lịch)               |

#### H. AI & Whisper Commands (`commands/ai.rs`, `commands/whisper.rs`)

| Command Name                                               | Tham số                           | Ý nghĩa                                                                    |
| :--------------------------------------------------------- | :-------------------------------- | :------------------------------------------------------------------------- |
| `save_ai_config` / `get_ai_config`                         | `config` / -                      | Lưu/đọc cấu hình AI (OpenAI, Gemini, Claude, Ollama, Custom URL, API Keys) |
| `test_ai_connection`                                       | `config`                          | Kiểm tra kết nối tới nhà cung cấp AI                                       |
| `generate_video_summary` / `generate_summary_with_options` | `url` / `text`, `config`          | Tóm tắt video/transcript với streaming SSE                                 |
| `cancel_summary_generation`                                | `request_id`                      | Hủy tiến trình AI đang tóm tắt                                             |
| `generate_ai_response`                                     | `prompt`, `system_prompt`         | Gửi prompt tùy ý tới mô hình AI                                            |
| `get_ai_models`                                            | `provider`                        | Lấy danh sách model được hỗ trợ                                            |
| `get_summary_languages`                                    | -                                 | Danh sách ngôn ngữ tóm tắt                                                 |
| `transcribe_video_with_whisper`                            | `video_path`, `format`, `api_key` | Trích xuất âm thanh và phiên âm video thành phụ đề SRT/VTT bằng Whisper    |
| `transcribe_url_with_whisper`                              | `url`, `format`, `api_key`        | Tải audio nhẹ nhất và phiên âm phụ đề từ URL                               |
| `generate_subtitles_with_whisper`                          | `params`                          | Tạo phụ đề chi tiết có mốc thời gian chính xác                             |

#### I. Plugin System Commands (`commands/plugin.rs`)

| Command Name                                                     | Tham số                    | Ý nghĩa                                                                                       |
| :--------------------------------------------------------------- | :------------------------- | :-------------------------------------------------------------------------------------------- |
| `list_plugins`                                                   | -                          | Liệt kê tất cả plugin đã cài đặt                                                              |
| `get_plugin_details`                                             | `plugin_id`                | Xem chi tiết manifest, quyền hạn, cấu hình và trạng thái của plugin                           |
| `inspect_plugin_package`                                         | `package_path`             | Kiểm tra gói `.ywp` trước khi cài đặt (xác minh chữ ký và quyền hạn)                          |
| `install_plugin_package`                                         | `package_path`             | Cài đặt gói plugin `.ywp` vào hệ thống                                                        |
| `uninstall_plugin`                                               | `plugin_id`                | Gỡ bỏ plugin khỏi ứng dụng                                                                    |
| `update_plugin_state`                                            | `plugin_id`, `enabled`     | Bật/tắt plugin                                                                                |
| `get_plugin_trigger_workflow` / `update_plugin_trigger_workflow` | `trigger` / `config`       | Quản lý quy trình tự động hóa workflow theo sự kiện (`download.completed`, `download.failed`) |
| `enqueue_plugin_workflow_trigger`                                | `trigger`, `payload`       | Kích hoạt thủ công một trigger workflow                                                       |
| `approve_plugin_permissions`                                     | `plugin_id`, `permissions` | Cấp phép các quyền mà plugin yêu cầu (network, filesystem, notifications)                     |
| `update_plugin_config_values`                                    | `plugin_id`, `values`      | Cập nhật giá trị cấu hình riêng của plugin                                                    |
| `set_plugin_provider` / `set_plugin_timeout`                     | `params`                   | Đổi runtime provider (Deno/Node) và thời gian chờ tối đa                                      |
| `open_plugin_directory`                                          | `plugin_id`                | Mở thư mục chứa mã nguồn plugin trên máy                                                      |
| `list_runtime_providers` / `get_runtime_provider_status`         | -                          | Kiểm tra tính sẵn sàng của các runtime Deno / Node.js                                         |
| `get_plugin_logs` / `clear_plugin_logs`                          | `plugin_id`                | Xem hoặc xóa nhật ký thực thi của plugin                                                      |

#### J. Telegram Remote Commands (`commands/telegram.rs`)

| Command Name          | Tham số                  | Ý nghĩa                                                                                       |
| :-------------------- | :----------------------- | :-------------------------------------------------------------------------------------------- |
| `set_telegram_config` | `config: TelegramConfig` | Cấu hình Bot Token, danh sách Chat ID cho phép, và hành động mặc định (`Add` hoặc `Download`) |
| `get_telegram_status` | -                        | Lấy trạng thái kết nối bot Telegram (`Running`, `Disabled`, `Error`)                          |
| `send_telegram_reply` | `chat_id`, `message`     | Gửi tin nhắn phản hồi về Telegram                                                             |

#### K. History, Tags & Collections Commands (`commands/history.rs`)

| Command Name                                                                        | Tham số                            | Ý nghĩa                                                             |
| :---------------------------------------------------------------------------------- | :--------------------------------- | :------------------------------------------------------------------ |
| `add_history`                                                                       | `entry`                            | Ghi nhận video đã tải vào lịch sử                                   |
| `get_history`                                                                       | `query`, `limit`, `offset`         | Truy vấn lịch sử (tự động sử dụng FTS5 nếu có chuỗi tìm kiếm)       |
| `get_history_entries_by_ids`                                                        | `ids`                              | Lấy chi tiết các mục lịch sử theo danh sách ID                      |
| `find_duplicate_downloads`                                                          | `url`, `media_id`, `canonical_url` | Phát hiện video đã tải trước đó để tránh tải trùng lặp              |
| `delete_history` / `clear_history`                                                  | `id` / -                           | Xóa một mục hoặc toàn bộ lịch sử tải                                |
| `get_history_count`                                                                 | -                                  | Lấy tổng số lượng video trong thư viện                              |
| `get_tags` / `assign_history_tags` / `remove_history_tag`                           | `params`                           | Quản lý nhãn dán cho video trong thư viện                           |
| `get_collections` / `create_collection` / `rename_collection` / `delete_collection` | `params`                           | Quản lý bộ sưu tập video                                            |
| `assign_history_collections` / `remove_history_from_collection`                     | `params`                           | Gán hoặc gỡ video khỏi bộ sưu tập                                   |
| `open_file_location` / `check_file_exists`                                          | `filepath`                         | Mở thư mục chứa file tải hoặc kiểm tra file còn tồn tại trên ổ cứng |
| `rename_downloaded_file` / `sync_history_renamed_entry`                             | `old_path`, `new_name`             | Đổi tên file vật lý và đồng bộ đường dẫn mới trong SQLite           |

#### L. Dependencies Manager Commands (`commands/dependencies.rs`)

| Command Name                                                                           | Tham số       | Ý nghĩa                                                                    |
| :------------------------------------------------------------------------------------- | :------------ | :------------------------------------------------------------------------- |
| `get_ytdlp_version` / `check_ytdlp_update` / `update_ytdlp`                            | -             | Kiểm tra phiên bản, tìm bản cập nhật và nâng cấp `yt-dlp`                  |
| `get_ytdlp_channel_cmd` / `set_ytdlp_channel_cmd`                                      | - / `channel` | Đổi kênh cập nhật yt-dlp (`stable`, `nightly`, `master`)                   |
| `get_ytdlp_source_cmd` / `set_ytdlp_source_cmd`                                        | - / `source`  | Đổi nguồn tải yt-dlp (`bundled` hoặc `system`)                             |
| `check_ffmpeg` / `download_ffmpeg` / `get_ffmpeg_source_cmd` / `set_ffmpeg_source_cmd` | -             | Quản lý nhị phân FFmpeg/FFprobe bundled                                    |
| `check_deno` / `download_deno`                                                         | -             | Quản lý runtime Deno cho Plugin engine                                     |
| `detect_installed_browsers` / `get_browser_profiles`                                   | -             | Phát hiện các trình duyệt và profile cục bộ (Chrome, Edge, Firefox, Brave) |

#### M. CLI, Deep-Link & System Commands

| Command Name                                       | Tham số  | Ý nghĩa                                                            |
| :------------------------------------------------- | :------- | :----------------------------------------------------------------- |
| `get_cli_shortcut_status` / `install_cli_shortcut` | -        | Quản lý shim dòng lệnh `retubematrix` trong WindowsApps / PATH     |
| `consume_pending_external_links`                   | -        | Xử lý các link được mở từ ngoài (Deep link `retubematrix://`)      |
| `consume_pending_cli_download_requests`            | -        | Xử lý yêu cầu tải nhận từ CLI command line                         |
| `bring_main_window_to_front`                       | -        | Đưa cửa sổ ứng dụng lên trên cùng khi người dùng tương tác         |
| `set_hide_dock_on_close`                           | `hide`   | Cấu hình ẩn cửa sổ vào khay hệ thống (Tray) thay vì thoát ứng dụng |
| `rebuild_tray_menu_cmd`                            | `lang`   | Dựng lại menu Khay hệ thống theo ngôn ngữ hiện tại                 |
| `update_tray_download_status`                      | `status` | Cập nhật số lượng download đang chạy lên Khay hệ thống             |

#### N. Hardware ID & Security Commands (`commands/hwid.rs`)

| Command Name          | Tham số | Ý nghĩa                                                                                                                                                                             |
| :-------------------- | :------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_system_hwid_cmd` | -       | Đọc mã băm định danh phần cứng bất biến (Windows MachineGuid, CPU ProcessorId, Motherboard UUID/Serial) kết hợp SHA-256 phục vụ xác thực bảo vệ bản quyền SaaS và khóa máy 1 thiết bị |

---

### 3.2. Python Browser Engine CLI Actions (`browser_engine/runner.py`)

Giao tiếp qua tiến trình độc lập với mã hóa UTF-8 chuẩn (`python -X utf8 browser_engine/runner.py --action <action> [--profile-id <id>] [--data-b64 <base64>]`).

| Action Name                  | Tham số dữ liệu Base64                                                                                                                      | Mô tả chi tiết chức năng                                                                                                                                                                                         |
| :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_profiles`              | -                                                                                                                                           | Quét và trả về danh sách toàn bộ hồ sơ trong kho `%LOCALAPPDATA%\reupytb\browser_engine\profiles\`                                                                                                               |
| `add_profile`                | `profile_data`                                                                                                                              | Tạo hồ sơ mới, sinh seed fingerprint độc lập (Canvas, WebGL, Audio, Hardware Concurrency)                                                                                                                        |
| `update_profile`             | `profile_data`                                                                                                                              | Cập nhật cấu hình hồ sơ (Proxy, user agent, viewport)                                                                                                                                                            |
| `delete_profile`             | `profile_id`                                                                                                                                | Xóa dữ liệu hồ sơ và dọn dẹp các tệp lock                                                                                                                                                                        |
| `test_proxy`                 | `proxy_url`                                                                                                                                 | Đo latency thực tế (ms), kiểm tra IP public và vị trí địa lý thông qua IP-API                                                                                                                                    |
| `open_profile`               | `profile_id`                                                                                                                                | Khởi động phiên Playwright `CloakSession` với fingerprint chống phát hiện, inject cookies                                                                                                                        |
| `stop_profile`               | `profile_id`                                                                                                                                | Đóng phiên làm việc của hồ sơ và thu hồi tiến trình Chrome                                                                                                                                                       |
| `bulk_stop`                  | `profile_ids`                                                                                                                               | Đóng đồng loạt danh sách hồ sơ                                                                                                                                                                                   |
| `upload_video`               | `MultiBrowserUploadParams`                                                                                                                  | Tự động hóa đăng video lên YouTube Studio: chọn tệp, điền tiêu đề/mô tả, tải thumbnail, tự động mở 'Hiện thêm' (#toggle-button) để điền thẻ tags Polymer (<= 480 ký tự), chọn chế độ hiển thị hoặc lên lịch đăng |
| `check_copyright_status`     | `profile_id`, `video_id`, `poll_in_session: bool`, `max_poll_seconds: int`                                                                  | Shadow Check trên YouTube Studio tối ưu máy yếu: Low-End Route Interception (chặn ảnh/font/media để hạ RAM <180MB), In-Session Reload Polling (F5 tại chỗ trong cùng 1 phiên Chromium, đọc "Còn X phút" điều chỉnh nhịp nghỉ 15s/20s/35s, stream JSON progress ra stdout), nhận diện selector quốc tế `[cell-id="notices"]`, `#notices` và `[cell-id="restrictions"]` -> trả về `green_clean` hoặc `red_matched` (kèm chi tiết gậy Audio/Visual/Owner) |
| `configure_channel_settings` | `profile_id`, `channel_keywords`, `default_tags`, `made_for_kids`                                                                           | Tự động hóa cài đặt Kênh YouTube Studio: cơ chế 4 tầng xóa sạch từ khóa rác cũ về 0/500, điền từ khóa kênh và thẻ mặc định <= 450 ký tự chuẩn Studio, tắt Made For Kids, bấm Lưu                                 |
| `extract_channel_seo`        | `channel_url`                                                                                                                               | Trích xuất metadata SEO đối thủ qua yt-dlp: tên kênh, channel keywords, default tags, hashtags, người đăng ký, tình trạng xác minh                                                                               |
| `nurture_channel`            | `profile_id`, `duration_minutes`, `competitor_titles`, `competitor_hashtags`, `competitor_keywords`, `competitor_urls`, `preferred_channel` | Khởi chạy phiên nuôi kênh tự nhiên kháng bot `YouTubeNurture` (từ BrowserMulti) theo Tiêu đề và Hashtag đối thủ, retention >= 40%, tương tác like/comment/sidebar                                                |
| `get_stats`                  | -                                                                                                                                           | Tổng hợp thống kê thời gian chạy, phiên hoạt động từ `run_history.jsonl` và trạng thái PID                                                                                                                       |
| `arrange_windows`            | `mode`, `cols`, `margin`                                                                                                                    | Sử dụng Windows API (`EnumWindows`, `SetWindowPos`) để tự động xếp các cửa sổ Chromium theo lưới màn hình                                                                                                        |
| `clean_cache`                | `profile_id`                                                                                                                                | Dọn dẹp an toàn các thư mục `Cache`, `Code Cache`, `GPUCache`, giữ nguyên Session Cookies                                                                                                                        |
| `update_profile_meta`        | `profile_id`, `note`, `tags`, `color`                                                                                                       | Cập nhật nhãn dán, màu đại diện và ghi chú                                                                                                                                                                       |
| `bulk_set_group`             | `profile_ids`, `group`                                                                                                                      | Gom nhóm danh sách hồ sơ                                                                                                                                                                                         |
| `hunt_outliers`              | `settings`, `target_niche`                                                                                                                  | Quét YouTube bằng yt-dlp trích xuất video theo ngách, tính median views kênh, đo tỷ lệ Outlier Ratio ($Views / Subs$ và $Views / Median$), lọc theo VPH                                                          |
| `ping_momentum`              | `watchlist_videos`                                                                                                                          | Quét lại lượt xem hiện tại của các video trong danh sách theo dõi, đo gia tốc tăng trưởng views/giờ (Acceleration) và cập nhật Sparkline history                                                                 |
| `find_goldmines`             | `seed_keyword`                                                                                                                              | Khai thác từ khóa vàng: gửi truy vấn gợi ý tự động (YouTube Autocomplete API) kết hợp phân tích khối lượng tìm kiếm và độ cạnh tranh ngách                                                                       |
| `analyze_hook`               | `video_id`                                                                                                                                  | Bóc tách transcript 30 giây đầu của video triệu view, nhận diện cấu trúc hook mở đầu và các luận điểm chính                                                                                                      |

---

## 4. DOCS CHO DATABASE SCHEMA (SQLite `retubematrix.db`)

Dữ liệu cục bộ được lưu trữ tại `%APPDATA%\com.retubematrix.app\retubematrix.db`.
Hệ thống tự động thực hiện migration an toàn từ file di sản `logs.db` sang `retubematrix.db` (dùng `VACUUM INTO` và `PRAGMA quick_check`).

```mermaid
erDiagram
    FOLLOWED_CHANNELS ||--o{ CHANNEL_VIDEOS : owns
    HISTORY ||--o{ HISTORY_TAGS : maps
    TAGS ||--o{ HISTORY_TAGS : references
    HISTORY ||--o{ HISTORY_COLLECTIONS : maps
    COLLECTIONS ||--o{ HISTORY_COLLECTIONS : references
    HISTORY ||--|| HISTORY_SEARCH_FTS : indexes
    OUTLIER_SETTINGS ||--o{ OUTLIER_VIDEOS : governs
    PROCESSING_JOBS }o--|| CHANNEL_VIDEOS : processes
```

### 4.1. Bảng `history` (Lịch sử tải & Thư viện video)

Lưu trữ toàn bộ video đã tải thành công, là nguồn căn cứ phát hiện video trùng lặp:
```sql
CREATE TABLE history (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail TEXT,
    filepath TEXT NOT NULL,
    filesize INTEGER,
    duration INTEGER,
    quality TEXT,
    format TEXT,
    source TEXT,
    downloaded_at INTEGER NOT NULL,
    summary TEXT,
    time_range TEXT,
    media_id TEXT,
    canonical_url TEXT
);
CREATE INDEX idx_history_downloaded ON history(downloaded_at DESC);
CREATE INDEX idx_history_source ON history(source);
CREATE INDEX idx_history_media_id ON history(media_id);
CREATE INDEX idx_history_canonical_url ON history(canonical_url);
```

### 4.2. Bảng `history_search_fts` (Virtual Table FTS5)

Tìm kiếm toàn văn bản siêu tốc bỏ dấu tiếng Việt, tự động đồng bộ qua Triggers:
```sql
CREATE VIRTUAL TABLE history_search_fts USING fts5(
    history_id UNINDEXED,
    title,
    filepath,
    url,
    summary,
    tokenize = 'unicode61 remove_diacritics 2'
);
```

### 4.3. Bảng `followed_channels` (Theo dõi kênh đối thủ)

```sql
CREATE TABLE followed_channels (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    thumbnail TEXT,
    platform TEXT NOT NULL DEFAULT 'youtube',
    last_checked_at TEXT,
    last_video_id TEXT,
    check_interval INTEGER NOT NULL DEFAULT 15,
    auto_download INTEGER NOT NULL DEFAULT 0,
    download_quality TEXT NOT NULL DEFAULT 'best',
    download_format TEXT NOT NULL DEFAULT 'mp4',
    download_threads INTEGER NOT NULL DEFAULT 1,
    download_video_codec TEXT NOT NULL DEFAULT 'h264',
    download_audio_bitrate TEXT NOT NULL DEFAULT '192',
    download_preferred_fps TEXT NOT NULL DEFAULT 'original',
    youtube_content_type TEXT NOT NULL DEFAULT 'all', -- 'all' | 'videos' | 'shorts' | 'streams'
    youtube_channel_id TEXT, -- Cho phép RSS Polling tức thời
    total_videos INTEGER,
    filter_min_duration INTEGER,
    filter_max_duration INTEGER,
    filter_include_keywords TEXT,
    filter_exclude_keywords TEXT,
    filter_max_videos INTEGER,
    reup_mod_enabled INTEGER DEFAULT 0,
    reup_mod_speed REAL DEFAULT 1.03,
    reup_mod_pitch REAL DEFAULT 1.02,
    reup_mod_flip INTEGER DEFAULT 0,
    reup_mod_crop REAL DEFAULT 0.015,
    custom_filename_template TEXT,
    risk_status TEXT DEFAULT 'green', -- 'green' | 'yellow' | 'red'
    risk_reason TEXT,
    bkt_test_mode INTEGER DEFAULT 0,
    bkt_profile_id TEXT,
    created_at TEXT NOT NULL
);
```

### 4.4. Bảng `channel_videos` (Video quét từ kênh đối thủ)

```sql
CREATE TABLE channel_videos (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail TEXT,
    duration REAL,
    upload_date TEXT,
    upload_timestamp INTEGER,
    video_type TEXT DEFAULT 'video', -- 'video' | 'short' | 'stream'
    view_count INTEGER,
    status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'downloading' | 'downloaded' | 'failed' | 'ignored'
    risk_status TEXT DEFAULT 'green',
    risk_reason TEXT,
    is_bkt_test INTEGER DEFAULT 0,
    bkt_youtube_id TEXT,
    bkt_check_status TEXT, -- 'pending' | 'green_clean' | 'red_matched' | 'failed'
    bkt_restriction TEXT,
    reup_pipeline_level INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES followed_channels(id) ON DELETE CASCADE,
    UNIQUE(channel_id, video_id)
);
CREATE INDEX idx_channel_videos_channel ON channel_videos(channel_id);
CREATE INDEX idx_channel_videos_status ON channel_videos(status);
```

### 4.4B. Bảng `bkt_test_channels` & `bkt_test_jobs` (Kênh Test Bản Quyền Pool)

Quản lý hạn ngạch độc lập (Quota 15 video/24h) và hàng đợi điều phối test bản quyền:
```sql
CREATE TABLE bkt_test_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    youtube_channel_name TEXT,
    youtube_channel_id TEXT,
    daily_quota INTEGER NOT NULL DEFAULT 15,
    daily_used INTEGER NOT NULL DEFAULT 0,
    last_reset_date TEXT NOT NULL, -- 'YYYY-MM-DD'
    is_active INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE bkt_test_jobs (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    video_title TEXT,
    video_file_path TEXT NOT NULL,
    source_channel_id TEXT,
    test_channel_id TEXT,
    profile_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'uploading' | 'checking' | 'completed' | 'failed' | 'green_clean' | 'red_matched'
    bkt_check_status TEXT, -- 'green_clean' | 'red_matched' | 'failed'
    bkt_youtube_id TEXT,
    bkt_restriction TEXT,
    error_message TEXT,
    tested_date TEXT, -- 'YYYY-MM-DD' phục vụ Range Scan ngày
    main_target_profile_id TEXT, -- Profile ID của Kênh Đích để xuất bản
    auto_publish_main INTEGER DEFAULT 0, -- Cờ tự động đăng lên Kênh Đích khi sạch
    target_title TEXT, -- Tiêu đề xuất bản Kênh Đích (AI 95/5)
    target_description TEXT, -- Mô tả 3 tầng xuất bản Kênh Đích
    target_tags TEXT, -- Thẻ tags xuất bản Kênh Đích
    thumbnail_path TEXT, -- File thumbnail độc lập đi kèm
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_bkt_jobs_status ON bkt_test_jobs(status);
CREATE INDEX idx_bkt_jobs_channel ON bkt_test_jobs(test_channel_id);
CREATE INDEX idx_bkt_test_jobs_date ON bkt_test_jobs(tested_date);
```

### 4.5. Bảng `outlier_hunter_settings` & `outlier_videos` (Thợ săn video đột phá)

```sql
CREATE TABLE outlier_hunter_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    enabled INTEGER NOT NULL DEFAULT 1,
    niches TEXT NOT NULL DEFAULT '["review phim","tin tức","công nghệ","giải trí"]',
    min_views INTEGER NOT NULL DEFAULT 25000,
    max_subscribers INTEGER NOT NULL DEFAULT 25000,
    min_sub_outlier REAL NOT NULL DEFAULT 5.0,
    min_baseline_outlier REAL NOT NULL DEFAULT 5.0,
    min_duration INTEGER NOT NULL DEFAULT 180,
    min_vph REAL NOT NULL DEFAULT 300.0,
    min_engagement_rate REAL NOT NULL DEFAULT 0.012,
    min_comments INTEGER NOT NULL DEFAULT 15,
    auto_download INTEGER NOT NULL DEFAULT 0,
    auto_reup_level TEXT NOT NULL DEFAULT 'v1',
    auto_bkt_test INTEGER NOT NULL DEFAULT 0,
    scan_interval_minutes INTEGER NOT NULL DEFAULT 60,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE outlier_videos (
    id TEXT PRIMARY KEY,
    niche TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL DEFAULT '',
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    subscribers INTEGER NOT NULL,
    views INTEGER NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL,
    upload_timestamp INTEGER NOT NULL,
    hours_published REAL NOT NULL,
    avg_vph REAL NOT NULL,
    current_vph REAL,
    momentum_score REAL DEFAULT 1.0,
    sub_outlier_ratio REAL NOT NULL,
    baseline_median_views INTEGER NOT NULL,
    baseline_outlier_ratio REAL NOT NULL,
    engagement_rate REAL NOT NULL,
    view_history TEXT NOT NULL DEFAULT '[]', -- Mảng JSON lưu lịch sử điểm view theo thời gian cho biểu đồ Sparkline
    status TEXT NOT NULL DEFAULT 'discovered', -- 'discovered' | 'watchlist' | 'downloaded' | 'reuped' | 'ignored'
    local_filepath TEXT,
    reup_filepath TEXT,
    bkt_status TEXT DEFAULT 'none',
    opportunity_score REAL DEFAULT 0.0,
    demand_signal TEXT DEFAULT '',
    hook_analysis TEXT DEFAULT '',
    acceleration_status TEXT DEFAULT '',
    view_velocity REAL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    last_ping_at TEXT NOT NULL
);
CREATE INDEX idx_outlier_status ON outlier_videos(status);
CREATE INDEX idx_outlier_momentum ON outlier_videos(momentum_score DESC);
CREATE INDEX idx_outlier_niche ON outlier_videos(niche);
CREATE INDEX idx_outlier_opp ON outlier_videos(opportunity_score DESC);
```

### 4.6. Bảng `processing_jobs` & `processing_presets` (Tiến trình xử lý FFmpeg)

```sql
CREATE TABLE processing_jobs (
    id TEXT PRIMARY KEY,
    input_path TEXT NOT NULL,
    output_path TEXT,
    task_type TEXT NOT NULL,
    user_prompt TEXT,
    ffmpeg_command TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    progress REAL DEFAULT 0,
    error_message TEXT,
    pipeline_level INTEGER DEFAULT 1,
    risk_status TEXT DEFAULT 'green',
    risk_reason TEXT,
    is_bkt_test INTEGER DEFAULT 0,
    channel_video_id TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX idx_processing_jobs_created ON processing_jobs(created_at DESC);

CREATE TABLE processing_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL,
    prompt_template TEXT NOT NULL,
    icon TEXT,
    created_at TEXT NOT NULL
);
```

### 4.7. Bảng `download_queues`, `tags`, `collections`, `logs`

- `download_queues`: Lưu trữ danh sách hàng đợi tải (`queue_kind`, `items_json`, `updated_at`).
- `tags` / `history_tags`: Quản lý nhãn dán video (`id`, `name`, `normalized_name`).
- `collections` / `history_collections`: Quản lý nhóm bộ sưu tập (`id`, `name`, `normalized_name`, `color`).
- `logs`: Ghi vết hoạt động tải và hệ thống (`id`, `timestamp`, `log_type`, `message`, `details`, `url`, `created_at`).

---

## 5. DOCS CHO CÁC LUỒNG XỬ LÝ WORKERS & ENGINES

### 5.1. Luồng Reup Pipeline Chống Bản Quyền (`services/ffmpeg.rs`)

Hệ thống triển khai 2 cấp độ Reup xử lý video và âm thanh độc lập nhằm qua mặt thuật toán Content ID với hiệu năng tối đa:

#### Cấp độ 1: Reup Pipeline Lv.1 (95% Giữ Gốc — 5% Biến Đổi Nhẹ)

- **Video Filter**:
  - `scale=iw*1.01:ih*1.01,crop=iw/1.01:ih/1.01`: Phóng to 1% và cắt biên nhẹ 1% để loại bỏ watermark và viền gốc.
  - `setpts=PTS/1.03`: Tăng tốc độ phát video lên 1.03x.
- **Tối ưu tốc độ Render (Ultrafast Preset & Fastdecode)**:
  - Sử dụng `-preset ultrafast -tune fastdecode -crf 22` giúp tốc độ render đạt **26.7x** trên máy có GPU NVIDIA (5 phút video render xong trong 11 giây) và gấp 3 lần tốc độ trên CPU thông thường.
- **Khống chế luồng thích ứng (Smart Thread Throttling)**:
  - Hàm `get_safe_ffmpeg_threads()`: Trên các hệ thống có số lõi CPU $\le 4$ (ví dụ VPS 3 vCPU Windows Server 2022), tự động giới hạn chỉ dùng tối đa `num_cores - 1` (2 threads) để không bị nhà mạng bóp xung (CPU throttle) và không làm đứng máy Windows Server; trên máy tính nhiều core ($> 4$), sử dụng toàn bộ công suất (`threads = 0`).
- **Truyền phát tiến độ thời gian thực (Real-time Progress Streaming)**:
  - Hàm `execute_ffmpeg_with_progress()` phân tích stdout `-progress pipe:1` của FFmpeg kết hợp thời lượng đo bằng `probe_video_duration` (FFprobe), phát sự kiện `reup-pipeline-progress` chứa `{ percent, speed, fps, eta_seconds, status }` về UI theo thời gian thực.
- **Audio Filter (Dynamic Audio Resampling)**:
  - **Bắt buộc**: Dùng FFprobe trích xuất sample rate thực tế của video nguồn (`{sr}` ví dụ `48000` hoặc `44100` Hz). Tuyệt đối không hardcode `44100`.
  - Bộ lọc: `asetrate={sr}*1.02,aresample={sr},atempo={1.03/1.02}` (tương đương `atempo=1.0098`). Cơ chế này dịch tần số pitch 1.02x, sau đó đưa sample rate về chuẩn gốc của file và điều chỉnh tempo để đồng bộ chính xác từng mili-giây với tốc độ video 1.03x, triệt tiêu hoàn toàn hiện tượng lệch tiếng (audio drift).
- **Metadata Stripping**:
  - `-map_metadata -1 -metadata title="" -metadata artist="" -metadata comment="" -fflags +bitexact`. Xóa toàn bộ dữ liệu máy quay, thời gian tạo gốc, và gán cờ bitexact.
- **Byte Padding (Thay đổi MD5 & SHA256)**:
  - Ghi ngẫu nhiên 32 bytes kết thúc bằng chuỗi `\0REUPYTB_...` vào cuối container file MP4 bằng Rust `OpenOptions::append`. Việc này biến đổi hoàn toàn hash Checksum mà không ảnh hưởng tới khả năng phát của player.

#### Cấp độ 2: Reup Pipeline Lv.2 (Lách Sâu Deep Evasion)

- Tự động kích hoạt khi video bị phát hiện dính bản quyền (`red_matched`) trong quá trình Shadow Check.
- **Video Filter**:
  - `hflip`: Lật ngang toàn bộ khung hình video.
  - `eq=contrast=1.04:brightness=0.02:saturation=1.05`: Hiệu chỉnh màu sắc (tăng nhẹ tương phản, độ sáng và độ bão hòa) để phá vỡ chữ ký màu sắc (Color Histogram signature).
  - `scale=iw*1.02:ih*1.02,crop=iw/1.02:ih/1.02`: Thu phóng 2% và crop 2%.
  - `setpts=PTS/1.05`: Tốc độ 1.05x.
- **Audio Filter**:
  - `asetrate={sr}*1.04,aresample={sr},atempo={1.05/1.04}` (tương đương `atempo=1.009615`).
- **Metadata & Byte Padding**: Xóa sạch metadata và bổ sung 48 bytes random padding.

---

### 5.2. Luồng Kiểm Tra Kênh BKT (Shadow Check) & Tự Động Hóa YouTube Studio

- **Giám sát 4 giai đoạn thời gian thực (Real-Time Background Task Monitor)**:
  1. Xếp hàng tác vụ (`queued`) -> 2. Render lách Reup (`reuping`) -> 3. Tải lên Unlisted (`uploading`) -> 4. Quét Studio Content ID (`checking`).
- **Chẩn đoán tài khoản Google & Nút 1-Click "Mở Studio"**:
  - Tích hợp nút 1-click mở trực tiếp YouTube Studio trên profile đã chọn. Tự động bắt lỗi nếu tài khoản Google chưa đăng nhập và hiển thị cảnh báo đỏ trực quan.
- **Tự động xuất bản Kênh Chính (Auto-Publish) & Dọn dẹp ổ cứng (Disk Cleanup)**:
  - Khi video được xác nhận Sạch Bản Quyền (`green_clean`), hệ thống tự động đăng tải lên Kênh Chính được gán (Public / Schedule / Unlisted) với Tiêu đề AI 95/5, mô tả 3 tầng đa lớp (bảo toàn tracklist/timestamps), thẻ tags và ảnh bìa thumbnail companion.
  - Ngay sau khi hoàn tất, hệ thống tự động xóa sạch file gốc, file reup tạm và thumbnail companion để tối ưu bộ nhớ ổ cứng.

---

### 5.3. Bộ Nhận Diện & Kiểm Tra Proxy Thông Minh Đa Định Dạng (Universal Proxy Engine)

- **Hỗ trợ định dạng 4 phần phổ biến**: Tự động nhận diện cấu trúc `IP:Port:User:Pass` (hoặc phân tách bằng `|`, `;`) từ Cloudmini, ProxyNo1, v.v., và tự động chuyển đổi sang URL chuẩn `http://user:pass@host:port`.
- **Hỗ trợ song song cả hai Port**: Tự động thử nghiệm thông minh cả cổng HTTPS lẫn SOCKS5.
- **Bảo mật hiển thị (`maskProxy`)**: Tự động che mật khẩu proxy trên giao diện bảng danh sách hồ sơ (chỉ hiển thị `IP:Port`), bảo vệ thông tin khi quay màn hình.

```mermaid
sequenceDiagram
    autonumber
    participant UI as Giao diện Reup BKT
    participant Rust as Rust Tauri Engine
    participant Runner as Python runner.py
    participant Chrome as Playwright Chromium
    participant Studio as YouTube Studio

    UI->>Rust: Kích hoạt trigger_bkt_test_video
    Rust->>Rust: Chạy Reup Pipeline Lv.1 tạo file sạch
    Rust->>Runner: Gọi upload_video (chế độ unlisted)
    Runner->>Chrome: Mở Chromium Anti-detect Profile
    Chrome->>Studio: Tải video lên YouTube Studio & Đặt chế độ Không công khai
    Studio-->>Chrome: Trả về YouTube Video ID đã tạo
    Chrome-->>Runner: Báo cáo thành công kèm video_id
    Runner-->>Rust: Cập nhật channel_videos (bkt_check_status = 'pending')
    
    loop Polling kết quả kiểm tra
        Rust->>Runner: Gọi check_copyright_status
        Runner->>Chrome: Mở YouTube Studio Video Details
        Chrome->>Studio: Đọc cột Hạn chế (Restrictions) & Kiếm tiền (Monetization)
        Studio-->>Chrome: Trả về trạng thái thực tế
        alt Không phát hiện vi phạm bản quyền
            Chrome-->>Rust: Trả về green_clean
            Rust->>UI: Báo Xanh (Sạch Bản Quyền) -> Sẵn sàng sử dụng
        else Phát hiện vi phạm Content ID
            Chrome-->>Rust: Trả về red_matched
            Rust->>Rust: Tự động kích hoạt Reup Pipeline Lv.2
            Rust->>UI: Báo Đỏ (Dính bản quyền) -> Chuyển sang Lv.2
        end
    end
```

---

### 5.3. Luồng Thợ Săn Video Đột Phá (Outlier Hunter Pipeline)

```mermaid
flowchart TD
    Scan[Kích hoạt trigger_outlier_scan_cmd] --> StealthFetch[yt-dlp Stealth Request quét YouTube theo ngách]
    StealthFetch --> Parse[Trích xuất Views, Subs, Upload Date, Duration, Likes, Comments]
    
    Parse --> CalcMedian[Tính Median Views của Kênh trong 30 video gần nhất]
    CalcMedian --> CalcRatios[Tính toán chỉ số đột phá]
    
    subgraph Metrics [Công thức tính toán]
        CalcRatios --> R1["Sub Outlier Ratio = Views / Subscribers"]
        CalcRatios --> R2["Baseline Outlier Ratio = Views / Median Views"]
        CalcRatios --> R3["VPH (Views Per Hour) = Views / Hours Published"]
        CalcRatios --> R4["Engagement Rate = (Likes + Comments) / Views"]
    end

    Metrics --> Filter{Kiểm tra ngưỡng thiết lập}
    Filter -- Không đạt --> Drop[Bỏ qua]
    Filter -- Đạt chuẩn Outlier --> SaveDB[(Lưu vào outlier_videos: Status = 'discovered')]
    
    SaveDB --> Watchlist[Thêm vào Watchlist]
    Watchlist --> PingPing[Worker trigger_outlier_ping_cmd định kỳ]
    PingPing --> Acceleration[Tính gia tốc tăng trưởng views: Acceleration Status & Velocity]
    Acceleration --> Sparkline[Cập nhật mảng view_history hiển thị biểu đồ Sparkline]
    
    SaveDB --> DeepDive[Phân tích chuyên sâu]
    DeepDive --> Hook[analyze_video_hook_cmd: Bóc tách 30s Hook mở đầu]
    DeepDive --> Goldmine[find_keyword_goldmines_cmd: Khai thác từ khóa ngách]
```

---

### 5.4. Luồng Điều Khiển Từ Xa Qua Telegram Bot (`services/telegram.rs`)

1. **Khởi tạo kết nối**: Khi cấu hình `bot_token` được bật, worker kích hoạt một async task nền chạy `getUpdates` dạng Long Polling (timeout 30 giây) tới Telegram API.
2. **Kiểm tra quyền truy cập (Access Control)**:
   - Mọi tin nhắn đến đều được kiểm tra `chat_id` dựa trên mảng `allowed_chat_ids`.
   - Nếu `allowed_chat_ids` không rỗng và `chat_id` người gửi không nằm trong danh sách, bot lập tức từ chối và cảnh báo.
3. **Phân tích lệnh (Command Parser)**:
   - `/start` hoặc `/help`: Gửi hướng dẫn cú pháp lệnh.
   - `/download <url> [quality]`: Kích hoạt tải ngay lập tức với chất lượng chỉ định.
   - `/add <url> [quality]`: Thêm video vào hàng đợi tải.
   - Gửi URL trực tiếp: Thực hiện hành động theo cấu hình `plain_url_action` (`Download` hoặc `Add`).
4. **Phản hồi trạng thái**: Gửi thông báo hoàn thành hoặc lỗi về người dùng Telegram kèm dung lượng và thời lượng video.

---

### 5.5. Hệ Sinh Thái Plugin & Workflow Automation (`services/plugin/`)

1. **Định dạng gói `.ywp` (RETubeMatrix Plugin)**: Là tệp nén ZIP chứa:
   - `manifest.json`: Tên, định danh, phiên bản, entrypoint, quyền hạn yêu cầu (`permissions: ["network", "filesystem", "notifications"]`), các trường cấu hình tùy biến (`configFields`).
   - `index.ts` / `index.js`: Mã nguồn thực thi logic plugin.
   - Icon và tài liệu hướng dẫn cục bộ (`README.md`).
2. **Sandbox & Runtimes**: Hỗ trợ chạy an toàn thông qua Bundled `Deno runtime` hoặc môi trường `Node.js` cục bộ.
3. **Vòng đời sự kiện (Event Lifecycle)**:
   - Lắng nghe các sự kiện hệ thống: `download.started`, `download.progress`, `download.completed`, `download.failed`.
   - Khi sự kiện hoàn thành, payload chứa đường dẫn file tải, thông số video và metadata được chuyển đến plugin đã đăng ký trong Workflow để tự động sao lưu lên Google Drive, gửi Webhook Discord/Telegram, hoặc chạy xử lý hậu kỳ.

### 5.6. Luồng Tự Động Hóa Cài Đặt SEO Kênh YouTube Studio & Nuôi Kênh Kháng Bot (BrowserMulti Engine)

```mermaid
flowchart TD
    subgraph FrontendUI [Giao Diện CompetitorSeoDialog]
        A[Bấm '⚡ Cài Đặt & Nuôi Kênh SEO'] --> B{Chọn Chức Năng}
        B -->|Tab 1: Cấu hình Studio| C[Trích xuất SEO: Từ khóa, Thẻ video, Hashtags]
        B -->|Tab 2: Nuôi kênh| D[Chọn thời lượng: 10, 15, 20, 30, 45, 60p]
    end

    subgraph StudioEngine [Playwright Automation: channel_settings.py]
        C --> E[Xóa sạch từ khóa cũ: 4 Tầng Phòng Thủ]
        E --> F[Tầng 1: Click nút X Clear-All trên ytcp-chip-bar]
        E --> G[Tầng 2: Quét đệ quy Shadow DOM xóa từng ytcp-chip]
        E --> H[Tầng 3: Playwright hover + force click]
        E --> I[Tầng 4: Backspace Hammer giám sát counter về 0/500]
        I --> J[Gõ từ khóa kênh: Giới hạn <= 450 ký tự chuẩn Studio]
        J --> K[Chọn Cài đặt nâng cao: Không dành cho trẻ em]
        K --> L[Chuyển menu: #upload-defaults Chế độ mặc định tải lên]
        L --> M[Cuộn scrollIntoView #tags: Dọn sạch & điền Thẻ video <= 450 ký tự]
        M --> N[Bấm nút Lưu & xác nhận toast đã lưu]
    end

    subgraph NurtureEngine [BrowserMulti Module: YouTubeNurture]
        D --> O[build_competitor_nurture_plan: Lọc sạch URL khỏi search_topics]
        O --> P[Bóc tách Tiêu đề 2-6 từ + Hashtags bỏ #]
        P --> Q[CloakSession mở Chromium chống phát hiện]
        Q --> R[Gõ phím người thật human-like delay 50-180ms]
        R --> S[Xem video liên quan: Giữ chân retention >= 40%]
        S --> T[Tương tác ngẫu nhiên: Like 25%, lướt comment, cuộn sidebar]
    end
```

#### A. Thuật toán tính ký tự đặc thù của YouTube Studio

- **Quy tắc phạt khoảng trắng (Implicit Quotation Marks)**: Khi một từ khóa/thẻ chứa khoảng trắng (cụm từ nhiều chữ, ví dụ: `tomorrowland festival`, `nhac tre remix`), hệ thống YouTube Studio / YouTube Data API tự động bọc ngầm cụm từ trong cặp dấu ngoặc kép (`"..."`). Cặp ngoặc kép ngầm này tính thêm đúng **+2 ký tự** vào tổng ngân sách 500 ký tự.
- **Quy tắc dấu phẩy**: Mỗi dấu phẩy phân cách giữa các chip tính **+1 ký tự**.
- **Công thức tính thực tế**:
  $$\text{Tổng ký tự Studio} = \sum (\text{length}(tag) + (2 \text{ nếu có dấu cách})) + (\text{số thẻ} - 1)$$
- **Ngưỡng an toàn tuyệt đối**: Hệ thống áp dụng mức trần $\le 450$ ký tự (chừa sẵn 50 ký tự đệm an toàn so với 500), bảo đảm không bao giờ bị đỏ khung hoặc vô hiệu hóa nút Lưu.

#### B. Cơ chế 4 tầng dọn dẹp sạch sẽ từ khóa cũ (Zero-Leftover Guarantee)

1. **Tầng 1**: Click trực tiếp nút `X` (Clear All) trên container `ytcp-chip-bar`.
2. **Tầng 2**: Javascript đệ quy duyệt qua toàn bộ cây Shadow DOM để click icon xóa bên trong từng `ytcp-chip`.
3. **Tầng 3**: Playwright di chuột (`hover`) qua từng chip để kích hoạt trạng thái hiển thị của icon xóa, sau đó gọi `click(force=True)`.
4. **Tầng 4 (Búa tạ bàn phím - Backspace Hammer)**: Focus vào ô input rỗng, gửi liên tục phím `Backspace` kèm đọc DOM thời gian thực (`#char-counter` và số lượng `ytcp-chip`). Vòng lặp chỉ dừng khi bộ đếm ký tự về đúng `0/500` và số chip = 0.
5. **Dọn sạch chữ thô**: Tự động xóa sạch text thô (như `music|`) nếu từ cuối cùng không thể tạo thành chip.

#### C. Quy trình nuôi kênh chuẩn BrowserMulti

- **Tuyệt đối KHÔNG tiêm URL vào ô tìm kiếm**: URLs đối thủ chỉ được lưu vào danh sách duyệt kênh ngoại tuyến, danh sách tìm kiếm `search_topics` chỉ chứa cụm từ khóa và hashtag sạch.
- **Mô phỏng hành vi người dùng thật 100%**: Sử dụng `CloakSession` với dấu vân tay trình duyệt tách biệt, gõ phím ngẫu nhiên 50–180ms, xem video đạt độ giữ chân $\ge 40\%$, tương tác Like/Comment/Sidebar ngẫu nhiên để thuật toán YouTube ghi nhận tài khoản chất lượng cao.

---

## 6. QUY TẮC BẤT DI BẤT DỊCH CHO DEVELOPER & AI (ANTI-REGRESSION RULES)

> [!CAUTION]
> **Tất cả các phiên làm việc và bảo trì mã nguồn BẮT BUỘC phải tuân thủ nghiêm ngặt 8 nguyên tắc dưới đây:**

1. **Không Hardcode Audio Sample Rate**:
   - Tuyệt đối không hardcode `44100` Hz trong bộ lọc FFmpeg Reup (`asetrate=44100*...`).
   - Luôn sử dụng FFprobe để đọc sample rate gốc của video (`{sr}`) và áp dụng: `asetrate={sr}*pitch,aresample={sr},atempo={speed/pitch}`. Điều này ngăn chặn hiện tượng lệch tiếng +2.5 giây trên định dạng 48 kHz chuẩn của YouTube.

2. **Trung Thực Trong Xác Thực Bản Quyền BKT**:
   - Tuyệt đối không báo cáo `green_clean` ("Sạch Bản Quyền") nếu `checked_count === 0` hoặc kết quả YouTube Studio đang ở trạng thái `pending` / `null`.
   - Luôn xóa trạng thái xác thực cũ khi người dùng chuyển đổi giữa các profile hoặc các kênh đối thủ.

3. **Bảo Đảm Môi Trường Đóng Gói (Bundled Packaging)**:
   - Tuyệt đối không dùng NTFS Junctions hoặc Symbolic Links đối với các thư mục tài nguyên nằm trong `tauri.conf.json` (như `roots/browsermulti/`), vì bộ đóng gói NSIS của Tauri sẽ bỏ qua reparse points và gây lỗi thiếu file ở bản cài đặt sạch. Phải dùng bản sao chép thư mục thực tế (real directory copy).
   - Bảo toàn đầy đủ Python embed (`src-tauri/python/`), các nhị phân tĩnh `ffmpeg`/`ffprobe`/`deno`/`yt-dlp` trong `src-tauri/bin/`.

4. **Tương Thích IPC Contract Tauri v2**:
   - Lời gọi IPC từ Frontend JS qua Tauri v2 mặc định sử dụng `camelCase`. Mọi command Rust nhận struct cấu hình (như `update_channel_settings`) phải luôn hỗ trợ cả `camelCase` và `snake_case` qua `#[serde(rename_all = "camelCase")]` hoặc `#[serde(alias = "...")]`.
   - Xử lý đầu ra JSON từ tiến trình Python an toàn, chấp nhận cả giá trị cờ boolean lẫn dictionary tombstones.

5. **Độ Tin Cậy Của Outlier Hunter**:
   - Luôn tiêm biến môi trường `YTDLP_BIN` vào môi trường chạy của tiến trình Python runner.
   - Nếu yt-dlp gặp lỗi hoặc thiếu binary, phải ném ra lỗi có cấu trúc — tuyệt đối không nuốt ngoại lệ (swallow exception) rồi trả về mảng rỗng `discovered_videos: []`.
   - Phải phân tích chuỗi người đăng ký (subscriber) có hậu tố nhân số lượng (`K`, `M`, `B`, `N`, `Triệu`, `Nghìn`) chính xác để tránh nhận nhầm kênh 340K subs thành 340 subs.

6. **Chẩn Đoán Phụ Đề & Giới Hạn YouTube (Transcript Diagnostics)**:
   - Phân biệt rõ ràng lỗi YouTube bị chặn IP / HTTP 429 Rate Limit (`RequestBlocked`) với trường hợp "Video thực sự không có phụ đề CC" để đưa ra thông báo kèm khuyến nghị cấu hình Proxy kịp thời cho người dùng.

7. **Quy Tắc Quản Trị Git & Kiểm Tra Trước Khi Bàn Giao**:
   - **Tuyệt đối KHÔNG commit và KHÔNG push** trừ khi người dùng ra lệnh trực tiếp bằng tiếng Việt (ví dụ: "commit nha", "commit di").
   - Trước khi hoàn thành bất kỳ thay đổi nào, phải chạy và bảo đảm 3 lệnh kiểm tra đều vượt qua:
     1. `bun run biome check --write .` (Định dạng & Linting)
     2. `bun run tsc -b` (Kiểm tra kiểu dữ liệu TypeScript)
     3. `cargo check` (Chạy trong thư mục `src-tauri/` để kiểm tra Rust backend)

8. **Quy Tắc An Toàn Nhập Liệu & Giới Hạn Ký Tự YouTube Studio (Studio Tags & Keywords Anti-Overflow)**:
   - **Tính toán chuẩn xác**: Luôn tính ký tự theo công thức đặc thù của YouTube Studio: `len(tag) + (2 if " " in tag else 0) + (1 if idx > 0 else 0)`.
   - **Trần an toàn 450 ký tự**: Giới hạn tối đa luôn đặt ở mức $\le 450$ ký tự (chừa sẵn 50 ký tự đệm so với 500), không bao giờ để vượt quá 480 ký tự gây vô hiệu hóa nút Lưu.
   - **Xóa sạch 100% trước khi nạp**: Phải chạy quy trình dọn dẹp 4 tầng đảm bảo bộ đếm về đúng `0/500` và số chip = 0 trước khi điền từ khóa mới.
   - **Không tiêm URL vào ô tìm kiếm**: Tuyệt đối lọc sạch mọi định dạng URL khỏi danh sách từ khóa tìm kiếm (`search_topics`) trong cả automation Studio lẫn luồng Nuôi kênh.

9. **Cách Ly Triệt Để Lỗi Updater (Silent Background Checks)**:
   - Khi kiểm tra cập nhật nền hoặc khi app khởi động, nếu kết nối mạng thất bại hoặc GitHub release chưa sẵn sàng (`status === 'error'`), tuyệt đối KHÔNG hiển thị modal popup lỗi che chắn giữa màn hình làm gián đoạn người dùng.
   - Mặc định tắt `autoCheckUpdate` khi khởi động; chỉ hiển thị thông báo trạng thái cập nhật khi người dùng chủ động thao tác trong phần Giới thiệu & Phiên bản.

10. **Chuẩn Hóa UI Clean Design System & Cấm Emoji Rác**:
    - Nghiêm cấm dùng emoji trang trí tùy tiện (`⚡`, `🎯`, `🕒`, `⌛`, `⏱️`, `⏳`, `🔤`) trên nhãn nút bấm hay badge hệ thống.
    - Sử dụng các Lucide icons đồng bộ: icon `Settings` cho Cài đặt Studio, icon `Sparkles` tím chuẩn cho AI và Nuôi Kênh SEO, `ShieldCheck` xanh dương cho Bảo mật/Cài đặt.
    - Popover Theme Picker phải sử dụng color swatch phẳng dạng thẻ chữ nhật bo góc gradient (`rounded-lg shadow-sm`) có dấu kiểm `Check` trắng, đồng nhất 100% với giao diện Cài đặt chung, xóa bỏ toàn bộ emoji quần áo/thức uống.

---

## 7. MA TRẬN 10 PHÂN HỆ CHỨC NĂNG CỐT LÕI CỦA RETUBEMATRIX (v1.0.0)

Hệ thống được chuẩn hóa toàn diện theo 10 phân hệ chức năng tương ứng trực tiếp với Navigation Sidebar:

### 7.1. Chức năng 1: Tổng Quan (Dashboard) — Báo Cáo Hoạt Động & Vận Hành Hằng Ngày

- **Bộ lọc thời gian đa năng**: Chuyển đổi tức thời giữa các mốc `[ Hôm nay ]`, `[ Hôm qua ]`, `[ 7 ngày qua ]` hoặc chọn ngày tùy chỉnh, hỗ trợ nút Làm mới dữ liệu realtime.
- **5 Thẻ KPI sản xuất trọng tâm**:
  1. _Video mới phát hiện (Discovered)_: Đếm số lượng video cào mới từ các kênh đối thủ trong ngày.
  2. _Đã tải về máy & Dung lượng (Downloaded)_: Số lượng video đã tải về máy kèm tổng dung lượng (GB/MB).
  3. _Kiểm tra Bản Quyền BKT_: Số video đã đưa lên Studio quét Content ID với phân loại chi tiết (🟢 Sạch / 🔴 Dính Claim / 🟡 Đang chờ).
  4. _Đã đăng Kênh Đích (Published)_: Số video sạch đã được Auto-Pilot xuất bản công khai lên Kênh YouTube Chính.
  5. _Quota Test BKT Còn Lại_: Giám sát hạn ngạch test còn khả dụng trong ngày trên toàn bộ bể kênh test (tự động reset lúc 00:00).
- **Tiến trình tự động hóa trong ngày (Daily Production Timeline)**: Dòng thời gian trực quan dạng vertical connecting nodes ghi lại hành trình video (Cào đối thủ ➔ Tải về ➔ Test BKT ➔ Xuất bản đích) có bộ lọc phân loại theo từng nghiệp vụ.
- **Bảng đối chiếu 1-1 (Thu gọn 7 phần)**: Kênh đối thủ ↔ Kênh hệ thống (Profile đích), hiển thị số video cào được, trạng thái rủi ro, cảnh báo chống nhầm kênh (`Chưa gán đích`) và nút chuyển nhanh tới Quản lý Kênh.
- **Hạ tầng Engine & Runtime (Thu gọn 5 phần)**: Trạng thái Local Engine Online, cấu hình phần cứng (OS, RAM, Python 3.11 Embed, thư mục AppData), tổng số hồ sơ và modal "Chi tiết phiên chạy" lưu trữ lịch sử automation.

### 7.2. Chức năng 2: Quản Lý Profile (MultiBrowser Anti-detect Cloak)

- Khởi chạy trình duyệt Chromium 155 cô lập hoàn toàn với User Data Dir riêng biệt.
- Che giấu và giả lập vân tay trình duyệt độc lập (Canvas, WebGL, AudioContext, User-Agent, Client Rects, WebRTC).
- Giữ nguyên vẹn 100% phiên đăng nhập Google/YouTube Studio và Cookie bền vững sau khi đóng/mở.
- Định tuyến Proxy độc lập trên từng hồ sơ (HTTP/SOCKS5), chống xung đột IP giữa các tài khoản nuôi.
- Cơ chế dọn tiến trình Zombie và Background UI Polling 4s tự động phát hiện đóng cửa sổ trình duyệt bên ngoài.

### 7.3. Chức năng 3: Theo Dõi Kênh Đối Thủ & Nuôi Kênh SEO 1-1

- **Sắp xếp đa chiều**: Mới nhất, Phổ biến nhất (Viral), Cũ nhất, Thời lượng dài/ngắn, Tiêu đề A-Z (đã loại bỏ sạch emoji gây nhiễu).
- **Bộ lọc thời gian**: Tất cả, 3 ngày qua, 7 ngày qua theo trường `upload_date`.
- **Bộ chọn nhanh số lượng**: Nút chọn Top 5, Top 10, Top 20 video đang hiển thị.
- **Tác vụ hàng loạt**:
  - Nút _Tải video sạch (N)_: Đẩy hàng loạt video đã chọn vào hàng đợi tải xuống.
  - Nút _Test BKT (N)_: Điều phối hàng loạt video sang Kênh Test Bản Quyền để thử nghiệm Content ID.
- **Cài Đặt SEO Kênh Theo Đối Thủ (Tự động 100%)**:
  - Trích xuất siêu dữ liệu SEO: Tên kênh, từ khóa kênh, thẻ video mặc định, hashtags đối thủ.
  - Dọn sạch 100% từ khóa cũ về `0/500` qua cơ chế 4 tầng (Nút X clear-all, Quét Shadow DOM, Hover force-click, Backspace Hammer).
  - Tự động điền Từ khóa kênh $\le 450$ ký tự chuẩn Studio, cấu hình Không dành cho trẻ em (COPPA), chuyển sang Chế độ mặc định tải lên (`#upload-defaults`) để điền Thẻ video mặc định $\le 450$ ký tự và bấm Lưu.
- **Nuôi Kênh Chuẩn BrowserMulti Theo SEO Đối Thủ**:
  - Khởi chạy phiên nuôi kênh tự nhiên bằng Tiêu đề và Hashtag đối thủ (lọc sạch URL khỏi ô tìm kiếm).
  - Gõ phím người thật (human typing delay ngẫu nhiên 50-180ms), xem video đạt độ giữ chân $\ge 40\%$, tương tác Like/Comment/Sidebar ngẫu nhiên, kháng Botguard.
  - Tùy chọn linh hoạt thời lượng nuôi: 10, 15, 20, 30, 45, 60 phút.
  - Sử dụng biểu tượng Lucide `Sparkles` tím chuẩn AI thay cho emoji sấm sét.

### 7.4. Chức năng 4: Săn Đề Xuất (Outlier Hunter & Mô hình Ikigai)

- **Ứng dụng mô hình Ikigai Nhật Bản**: Phân tích ngách tại giao điểm 3 trụ cột: (1) Nhu cầu người xem, (2) Khả năng làm lâu dài, (3) Tiềm năng kiếm tiền (CPM/Affiliate).
- **4 công cụ kiểm tra ngách tích hợp**:
  1. _YouTube Alphabet Autosuggest (a, b, c...)_: Đào từ khóa đuôi dài ít cạnh tranh.
  2. _Google Trends YouTube Search 12 tháng_: Mở trực tiếp link phân tích xu hướng tìm kiếm YouTube 12 tháng.
  3. _Chỉ số Content Gap_: Phát hiện chủ đề người xem tìm kiếm nhiều nhưng thiếu hụt video chất lượng.
  4. _VPH & Đo vận tốc đối thủ_: Đo lượng view mỗi giờ ($VPH = views / hours\_published$), gán nhãn Đang bứt tốc / Đang giảm nhiệt.
- Giao diện sạch sẽ, chuyển đổi toàn bộ icon sấm sét sang `Sparkles` tím.

### 7.5. Chức năng 5: Reup & Test Bản Quyền (Copyright Shield & BKT Pool)

- **Mặc định xóa sạch metadata gốc**: Toàn bộ video tải về đều áp dụng `--no-add-metadata` và `-map_metadata -1`, xóa sạch EXIF, uploader title, tags và comments gốc.
- **Reup Pipeline Lv.1**: Đổi mã băm container MD5/SHA256 và Dynamic Resampling âm thanh theo tần số gốc của file `{sr}` (`asetrate={sr}*pitch,aresample={sr},atempo={speed/pitch}`), triệt tiêu hoàn toàn hiện tượng lệch tiếng/hình.
- **Hệ thống nhãn rủi ro Traffic Light**:
  - 🟢 **Xanh (Green)**: Toàn bộ video từ kênh này an toàn, sạch bản quyền.
  - 🟡 **Vàng (Yellow)**: Video mới nhất hoặc 1 video cũ dính bản quyền (cảnh báo).
  - 🔴 **Đỏ (Red - Blacklist)**: 2 video liên tiếp dính Content ID ➔ Lập tức gắn nhãn Đỏ, tự động tắt `auto_download = 0`, khóa quét/tải để bảo vệ hệ thống tuyệt đối.
- **Kênh Test Bản Quyền (BKT Pool)**:
  - Chỉ làm nhiệm vụ tự động tải video Unlisted lên Studio để quét bản quyền ngầm, không liên quan đến dữ liệu Profile nuôi chính.
  - Quota nghiêm ngặt: 15 video / 24 giờ. Khi kênh hết quota, tự động khóa đăng và luân chuyển sang kênh test khác còn lượt.
- **Tải Lại Trong Phiên (In-Session Reload Polling)**: Giữ nguyên cửa sổ Chromium đang mở, F5 reload tại chỗ để đọc tiến độ xử lý của YouTube ("Còn X phút"), tự động tính nhịp ngủ 15s/20s/35s mà không mở đóng trình duyệt liên tục.
- **Tối Ưu Máy Yếu (Low-End Hardware Route Interception)**: Abort tải ảnh, web font, media và beacon theo dõi trong phiên quét Studio, hạ RAM từ >600MB xuống <180MB.
- **Nhận Diện Cột Chuẩn Quốc Tế `[cell-id="notices"]`**: Hỗ trợ đầy đủ Studio tiếng Anh, bóc tách ký tự gạch ngang dài (`—`), `None`, `Clean` để xác nhận ngay `green_clean`.
- **Auto-Pilot Xuất Bản Kênh Đích (Zero-Touch Publishing)**: Tự động chuyển tiếp video sạch sang Profile Kênh Chính đăng Công khai (kèm tiêu đề AI 95/5, mô tả, tags, companion thumbnail), hoặc hỗ trợ nút bấm thủ công 1-click "Đăng Kênh Đích".

### 7.6. Chức năng 6: Thư Viện Video & Quản Lý Tập Tin (Library)

- Quản lý tập trung toàn bộ video tải về, video sau xử lý Reup, phân đoạn media và hình ảnh.
- Tìm kiếm toàn văn bản tiếng Việt tức thì không dấu nhờ SQLite Virtual Table FTS5.
- Phân nhóm theo nhãn dán (Tags) và bộ sưu tập (Collections), hỗ trợ đổi tên file vật lý kèm cập nhật đường dẫn SQLite.

### 7.7. Chức năng 7: Tải Video Sạch URL Đa Nền Tảng (Universal Downloader)

- Tải đơn qua liên kết URL từ YouTube và 1800+ nền tảng độ phân giải cao (1080p, 2K, 4K).
- Tải toàn bộ Playlist đa luồng song song mà không làm đơ lag giao diện.
- Trình quản lý hàng đợi tải tự động lưu và khôi phục khi tắt/mở ứng dụng.

### 7.8. Chức năng 8: Nhật Ký & Kiểm Tra Lỗi Hệ Thống (Diagnostics)

- **Thông báo lỗi tiếng Việt có dấu**: Kèm hộp gợi ý (Tip) hướng dẫn khắc phục cụ thể cho từng loại lỗi.
- **Xuất file log chuẩn tên**: `retubematrix-logs-YYYY-MM-DD.json`.
- **Phân tách 6 file log riêng biệt**:
  - `download.log`: Tiến trình tải video, playlist, gallery.
  - `channels.log`: RSS Polling, cào video đối thủ, cập nhật kênh.
  - `bkt_test.log`: Đăng video Unlisted, kiểm tra Studio Content ID, quota 15 video.
  - `outlier.log`: Săn đề xuất ngách, Ikigai, Alphabet autosuggest, VPH.
  - `reup.log`: FFmpeg Reup pipeline Lv.1 & Lv.2, đổi mã băm MD5, dynamic audio resampling.
  - `ai.log`: Tạo tiêu đề AI 95%-5%, xử lý thumbnail, Whisper transcription.

### 7.9. Chức năng 9: Quản Trị Hệ Thống (SaaS Master Hub & Phân Quyền RBAC 4 Cấp)

- Vị trí thanh điều hướng: **STT 9** trên Sidebar (ngay trên Cài đặt).
- Dành riêng cho **Master Owner** (`dungdong333@gmail.com` hoặc tài khoản có role `owner`).
- Gồm 4 phân hệ quản trị tập trung (phong cách BrowserMulti):
  1. _Quản lý Doanh nghiệp (Tenants)_: Danh sách công ty, mã định danh, gói license, số lượng nhân sự, trạng thái kích hoạt/khóa.
  2. _Quản lý Nhân sự & Phân quyền RBAC_: Danh sách tài khoản trong toàn hệ thống, gán công ty, cấp role, kích hoạt/vô hiệu hóa, phê duyệt đổi máy.
  3. _License Center_: Quản lý mã kích hoạt, hạn ngạch ghế (Seats), ngày hết hạn, hỗ trợ copy nhanh mã license định dạng `RTBM-XXXX-XXXX-XXXX-XXXX`.
  4. _Giám sát Máy Online_: Bảng theo dõi thời gian thực các máy trạm đang phát heartbeat qua WebSocket/REST, hiển thị HWID, địa chỉ IP, phiên bản app và người dùng hiện hành.
- **Cấp Tài Khoản Mới Trực Tiếp**: Modal thêm tài khoản cho phép nhập Email, Mật khẩu, Công ty và Role, tự động gửi payload qua Cloudflare Edge Gateway tạo tài khoản ngay lập tức.

### 7.10. Chức năng 10: Cài Đặt Hệ Thống & Tự Động Cập Nhật (Settings)

- Vị trí thanh điều hướng: **STT 10** trên Sidebar.
- Gồm các phân mục: Cài đặt chung, Phụ thuộc, Tải xuống, Mạng & Xác thực, Giới thiệu & Phiên bản.
- **Bộ chọn chủ đề ThemePicker**: Swatch màu phẳng dạng thẻ bo góc gradient (`rounded-lg shadow-sm`) có dấu tích Check trắng, loại bỏ hoàn toàn emoji cũ.
- **Kiểm tra phiên bản bảo mật**: Kiểm tra bản cập nhật mã hóa qua GitHub Releases với Minisign, có thanh tiến trình tải trực quan. Chế độ kiểm tra ngầm hoàn toàn yên tĩnh (không hiển thị modal lỗi khi mất kết nối).

---

## 8. KIẾN TRÚC SAAS MASTER HUB, CLOUDFLARE EDGE GATEWAY & BẢNG PHÂN QUYỀN 4 CẤP

### 8.1. Hạ Tầng Cloudflare Edge Gateway & Supabase

Hệ thống điều hành trung tâm được xây dựng trên mô hình Serverless Edge kết hợp Cơ sở dữ liệu phân tán:

- **Edge Gateway Endpoint**: `https://retubematrix-gateway.dungdong333.workers.dev`
- **Nhiệm vụ**:
  - Đóng vai trò Reverse Proxy an toàn và tầng bảo vệ chống tấn công DDoS (Cloudflare Edge).
  - Xác thực token JWT, ký mã băm phần cứng và chuyển tiếp yêu cầu đến Supabase PostgreSQL.
  - Cung cấp API trực tiếp:
    * `POST /v1/auth/login`: Xác thực tài khoản và kiểm tra khóa máy HWID.
    * `POST /v1/auth/register`: Đăng ký tài khoản mới (mặc định vào trạng thái chờ phân bổ).
    * `POST /v1/admin/users/create`: Master Owner/Admin tạo trực tiếp tài khoản mới kèm mật khẩu.
    * `GET /v1/admin/dashboard`: Trả về dữ liệu tổng quan công ty, nhân sự, license, telemetry.
    * `POST /v1/admin/companies`: Thêm/sửa thông tin doanh nghiệp.
    * `POST /v1/admin/licenses`: Tạo và phân bổ license key mới.
    * `POST /v1/admin/hwid/approve`: Phê duyệt yêu cầu đổi máy trạm cho nhân sự.

### 8.2. Mô Hình Kim Tự Tháp Phân Quyền 4 Cấp Bậc (Pyramid RBAC)

```mermaid
graph TD
    Owner["Master Owner (Chủ Dự Án / dungdong333@gmail.com)"]
    Admin["Admin (Quản Trị Doanh Nghiệp)"]
    Leader["Leader (Trưởng Nhóm Sản Xuất)"]
    User["User (Nhân Viên Vận Hành Tool)"]

    Owner -->|"Toàn quyền hệ thống, mọi công ty, bypass HWID"| Admin
    Admin -->|"Quản lý nhân sự công ty, nâng quyền Leader, sửa/xóa User"| Leader
    Leader -->|"Quản lý nhóm video, sửa/xóa User trong nhóm"| User
```

| Cấp Bậc (Role) | Phạm Vi Quyền Hạn | Ràng Buộc Phần Cứng (HWID) | Thao Tác Được Phép |
| :--- | :--- | :--- | :--- |
| **Master Owner** | Toàn bộ hệ thống, mọi công ty, mọi tài khoản | **Bypass 100%** (Sử dụng không giới hạn trên mọi máy, mọi thiết bị) | Thêm/sửa/xóa công ty; thêm/sửa/xóa toàn bộ 3 role (Admin, Leader, User); cấp license; duyệt đổi máy toàn hệ thống; truy cập SaaS Hub |
| **Admin** | Trong phạm vi công ty được chỉ định | Khóa cứng 1 Máy / 1 Tài khoản | Quản lý thành viên công ty; phân quyền User lên Leader; sửa/xóa Leader và User trong công ty; phân bổ quota license được cấp |
| **Leader** | Trong nhóm nhân sự được phân công | Khóa cứng 1 Máy / 1 Tài khoản | Điều phối dự án/kênh của nhóm; sửa/xóa User thuộc quyền quản lý; theo dõi tiến độ cào và xuất bản |
| **User** | Sử dụng các tính năng desktop cơ bản | Khóa cứng 1 Máy / 1 Tài khoản | Đăng nhập và sử dụng công cụ desktop (Profile, Theo dõi kênh, Reup, Tải video, Săn đề xuất) |

### 8.3. Quy Trình Cấp & Quản Trị Tài Khoản Trực Tiếp

1. **Khởi Chạy Ứng Dụng Mới (Gatekeeper)**:
   - Khi cài đặt trên máy mới, ứng dụng tự động hiển thị màn hình Đăng ký / Đăng nhập bắt buộc.
   - Khi người dùng bấm Đăng ký tài khoản, tài khoản sẽ được tạo ở trạng thái `company_id = 'pending'` và hiển thị màn hình thông báo chờ Quản trị viên phân bổ vào công ty.
2. **Master Owner / Admin Cấp Tài Khoản Mới Trực Tiếp**:
   - Truy cập tab **Quản Lý Nhân Sự & Phân Quyền** trên SaaS Master Hub.
   - Bấm nút **+ Cấp Tài Khoản Mới**, nhập Email, Mật khẩu (hỗ trợ nút **Tạo ngẫu nhiên** mật khẩu mạnh), Họ và tên, chọn Doanh nghiệp, Cấp bậc (Role: Admin / Leader / User) và Tỷ lệ hoa hồng (%).
   - Hệ thống tự động gửi yêu cầu tới Cloudflare Edge Gateway (`POST /v1/admin/users/create`) và tạo tài khoản ngay lập tức trên Supabase.
   - **Modal Bàn Giao Tức Thì**: Ngay sau khi tạo thành công, giao diện hiển thị thẻ tóm tắt thông tin đăng nhập hoàn chỉnh (Họ tên, Email, Mật khẩu, Vai trò, Doanh nghiệp) kèm nút 1-click **"Sao Chép Email & Mật Khẩu Để Gửi Nhân Viên"**, giúp quản trị viên sao chép toàn bộ thông tin chuẩn vào clipboard để gửi cho nhân sự.

### 8.4. Cơ Chế Hiển Thị License Key Minh Bạch & Sao Chép 1-Click

- **Mã Định Danh License Chuẩn Hóa**: Các khóa bản quyền được sinh tự động theo định dạng chuẩn `RTM-{TIER}-{RANDOM_HEX}` (ví dụ: `RTM-PRO-8F2B1C4D`, `RTM-ENTERPRISE-9A3E7C1B`).
- **Hiển Thị Rõ Ràng & Trực Quan**: Trên bảng Quản lý Doanh nghiệp (Tenants) và License Center, mã License Key được hiển thị dưới dạng badge code font mono rõ ràng, minh bạch (kèm nút chuyển đổi ẩn/hiện mật mã).
- **Sao Chép 1-Click Tiện Lợi**: Tích hợp nút **Copy** ngay cạnh từng mã License Key và mã băm HWID. Khi bấm, hệ thống sao chép tức thì vào Clipboard và chuyển đổi icon sang **Check** màu xanh lá (`text-emerald-400`) trong vòng 2 giây để xác nhận thao tác thành công.
- **Thao Tác Quản Trị License**: Master Owner có toàn quyền:
  * Cấp mới License cho từng công ty với số lượng ghế (Seats) và thời hạn tùy chọn.
  * Gia hạn thêm thời hạn sử dụng (+30, +90, +365 ngày) với 1 cú click.
  * Tăng/giảm số lượng ghế (Seats) cấp phép cho công ty theo nhu cầu mở rộng quy mô.

### 8.5. Cơ Chế Khóa Máy HWID & Đặc Quyền Master Owner Bypass 100%

1. **Thu Thập Phần Cứng Bất Biến (Rust Core `commands/hwid.rs`)**:
   - Rust Core đọc trực tiếp các thông số phần cứng từ hệ thống Windows:
     * `MachineGuid`: Định danh máy tính từ khóa Registry `HKLM\SOFTWARE\Microsoft\Cryptography`.
     * `ProcessorId`: Định danh vi xử lý CPU qua WMIC / PowerShell CIM.
     * `Motherboard UUID` & `Baseboard Serial`: Định danh bo mạch chủ qua Win32 API.
   - Kết hợp các giá trị trên và tính toán mã băm SHA-256 duy nhất (`hwid_hash`).
2. **Nguyên Tắc 1 Máy = 1 Tài Khoản (Anti-Sharing)**:
   - Khi người dùng đăng nhập lần đầu, Edge Gateway ghi nhận `hwid_hash` vào bảng `devices`.
   - Nếu tài khoản đăng nhập trên một máy tính khác có `hwid_hash` không khớp, Gateway lập tức chặn truy cập và trả về trạng thái `isHwidMismatch = true`.
   - Giao diện tự động khóa và hiển thị màn hình xin cấp phép đổi máy, cho phép nhân sự nhập lý do gửi yêu cầu tới Quản trị viên.
   - Admin/Owner có thể phê duyệt đổi máy trạm cho nhân sự chỉ với 1-click trên SaaS Master Hub.
3. **Đặc Quyền Master Owner Bypass 100%**:
   - Hệ thống cài đặt cơ chế miễn trừ hoàn toàn khóa máy (`isOwnerEmail` check) cho Master Owner:
     * Nhận diện qua địa chỉ email `dungdong333@gmail.com`, tiền tố `dungdong333@` hoặc vai trò `user.role === 'owner'`.
     * Master Owner **hoàn toàn không bị ràng buộc bởi bất kỳ kiểm tra HWID nào**, không bao giờ bị chặn `isHwidMismatch`, cho phép đăng nhập tự do trên mọi máy tính, máy trạm kiểm thử, máy ảo và môi trường preview trình duyệt.

### 8.6. Cấu Trúc Điều Hướng Sidebar 10 Phân Hệ Chuẩn Hóa

Thanh điều hướng bên trái (Sidebar) của RETubeMatrix v1.0.0 được sắp xếp chuẩn hóa thành 10 phân hệ nghiệp vụ theo thứ tự tối ưu trải nghiệm vận hành:

| STT | Mã Phân Hệ | Nhãn Hiển Thị (i18n) | Biểu Tượng | Mô Tả Chức Năng |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `dashboard` | Tổng quan | `LayoutDashboard` | Trung tâm sản xuất nội dung hằng ngày, 5 thẻ KPI ngày, dòng thời gian timeline tự động hóa |
| **2** | `profiles` | Hồ sơ trình duyệt | `UserCheck` | Quản lý Profile Chromium MultiBrowser Anti-detect, Fingerprint cô lập, Proxy riêng |
| **3** | `channels` | Kênh YouTube | `Tv` | Theo dõi đối thủ 1-1, cào video tự động, sao chép cấu hình SEO và nuôi kênh kháng Bot |
| **4** | `outliers` | Săn đề xuất | `Flame` | Thợ săn video đột phá theo Ikigai, VPH gia tốc, phân tích 30s Hook và mỏ từ khóa vàng |
| **5** | `reup` | Reup & BKT | `FlaskConical` | Reup Pipeline Lv.1/Lv.2 đổi Checksum MD5, Dynamic Resampling âm thanh, BKT bản quyền Studio |
| **6** | `library` | Thư viện tải xuống | `FolderDown` | Kho lưu trữ video đã tải, quản lý thẻ tag, bộ sưu tập và tìm kiếm siêu tốc FTS5 |
| **7** | `universal` | Tải đa nền tảng | `Globe` | Tải video chất lượng cao từ YouTube và 1800+ trang web, tải toàn bộ playlist đa luồng |
| **8** | `logs` | Nhật ký lỗi | `ScrollText` | Bảng chẩn đoán chuyên biệt 6 tệp log hệ thống, thông báo lỗi tiếng Việt kèm gợi ý sửa |
| **9** | `saas` | **SaaS Master Hub** | `Crown` | **Trung tâm điều hành doanh nghiệp SaaS**, quản lý công ty, phân quyền RBAC 4 cấp, License và thiết bị online |
| **10** | `settings` | Cài đặt hệ thống | `Settings` | Cấu hình mạng/proxy, ThemePicker chuẩn hóa, quản lý nhị phân và Hub "Giới thiệu & Phiên bản" |

*Ghi chú: Mục **SaaS Master Hub** nằm trang trọng tại vị trí số 9, sử dụng biểu tượng Vương Miện hoàng gia vàng kim (`text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]`), chỉ hiển thị đầy đủ các tính năng quản trị tối cao đối với tài khoản Master Owner hoặc Admin.*

### 8.7. Chuẩn Hóa UI Design System & Cô Lập Modal Updater

1. **Triệt Tiêu Triệt Để Icon & Emoji Rác**:
   - Toàn bộ giao diện người dùng từ v1.0.0 đã loại bỏ 100% các biểu tượng cảm xúc (emoji) trang trí thừa thãi gây phân tâm.
   - Thống nhất sử dụng bộ biểu tượng đồ họa vector [Lucide Icons](https://lucide.dev/) với kích thước và độ dày nét viền đồng bộ.
   - Bảng màu thẻ trạng thái và Badge tuân thủ thiết kế hiện đại: `rounded`, không viền hoặc viền mỏng tinh tế, nền mờ bán trong suốt (ví dụ: `bg-emerald-500/10 text-emerald-400` cho trạng thái Sạch/Thành công, `bg-purple-500/10 text-purple-400` cho AI/License, `bg-amber-500/10 text-amber-400` cho Cảnh báo).
2. **Cô Lập Modal Tự Động Cập Nhật (Isolated Updater Dialog)**:
   - Cơ chế kiểm tra cập nhật ngầm định kỳ khi mở ứng dụng chạy hoàn toàn yên lặng trong nền. Nếu mất mạng, máy chủ GitHub Releases chưa có bản cập nhật mới hoặc endpoint lỗi thời, hệ thống **tuyệt đối không bao giờ hiển thị popup/dialog báo lỗi làm gián đoạn người dùng**.
   - Hộp thoại cập nhật phiên bản, ghi chú phát hành (Release Notes) và thanh tiến trình tải file chỉ hiển thị khi người dùng chủ động truy cập tab **"Giới thiệu & Phiên bản"** trong trang Cài đặt và bấm nút **"Kiểm tra cập nhật"**.
   - Tích hợp thanh tiến trình tải bản cài đặt trực tiếp dạng phần trăm (`%`) theo thời gian thực và tự động kích hoạt bộ cài NSIS khi quá trình tải hoàn tất.

### 8.8. Săn Đề Xuất 2.0 (Outlier Hunter Live Trending & Breakout Engine)

1. **Phân Luồng Rõ Ràng View Việt & View Ngoại**:
   - **View Việt**: Mặc định geo `VN`, tập trung 7 ngách vàng tiếng Việt dễ làm, dễ nổ view, ít cạnh tranh.
   - **View Ngoại**: Hỗ trợ 10 thị trường quốc tế trọng điểm với CPM/RPM cao: Hoa Kỳ / Toàn Cầu (US), Nhật Bản (JP), Hàn Quốc (KR), Thái Lan (TH), Vương Quốc Anh (UK), Đức (DE), Pháp (FR), Indonesia (ID), Brazil (BR), Đài Loan (TW).
2. **Chuẩn Hóa 7 Ngách Vàng Faceless (CPM/RPM Cao, Dễ Scale Ma Trận)**:
   - Review Phim / Movie Recap
   - Nhạc (Speed Up, Remix, Lofi không lời, 8D Audio, No Copyright BGM)
   - ASMR & Satisfying (Cắt xà phòng, phục hồi đồ cũ, làm sạch sâu, cát động lực)
   - Sự Thật & Bí Ẩn / Mind-blowing Facts
   - Động Vật & Thú Cưng Hài Hước
   - AI Manga / Manhwa Recap (Tóm tắt truyện tranh voice AI, hoạt hình 2D)
   - Mẹo Vặt & Tech Gadgets Faceless
3. **Chốt Chặn Loại Bỏ Triệt Để "Ngách Content" (Content Exclusion Filter)**:
   - Tự động loại trừ các từ khóa âm tính: `vlog`, `daily vlog`, `nhật ký cuộc sống`, `phỏng vấn đường phố`, `street interview`, `talkshow`, `mukbang người thật`, `livestream tâm sự`, `unboxing cá nhân`...
4. **Quét Xu Hướng Thời Gian Thực (Real-Time Radar)**:
   - Cào chủ đề thịnh hành hôm nay từ **Google Trends Daily RSS** theo từng quốc gia (VN, US, JP, KR, TH...).
   - Bộ lọc video bùng nổ theo thời gian: **24 giờ qua** (VPH >= 50, View/Sub >= 3x), **48 giờ qua**, **7 ngày qua**.
5. **Hệ Sinh Thái Tác Vụ 1-Click**:
   - Reup & Test BKT: Đưa thông tin video và tags sang luồng Reup.
   - Tải video: Thêm ngay vào hàng đợi tải video sạch.
   - Theo dõi kênh (Watchlist): Ping định kỳ gia tốc VPH và vẽ biểu đồ Sparkline.
   - Bóc SEO Tags: Trích xuất toàn bộ tags ẩn chuẩn VidIQ.
   - AI Studio: Viết lại 5 tiêu đề viral, mô tả 4 tầng SEO và phân tích Hook.

### 8.9. SaaS Master Hub & Local-First Persistence

1. **Loại Bỏ Triệt Để Hoa Hồng (`commissionRate`)**:
   - Xóa hoàn toàn các trường và công thức tính hoa hồng trong toàn bộ ứng dụng (types, context, services, modals, bảng hiển thị) vì không phù hợp mô hình reup/studio agency.
2. **Quản Lý Ngách Công Ty & Nhân Sự (`assignedNiches`)**:
   - Mỗi Doanh nghiệp (Tenant) quản lý danh sách các ngách hoạt động (`assignedNiches: string[]`).
   - Mỗi Nhân sự (Member) được phân công ngách phụ trách cụ thể (`assignedNiche: string`) từ danh sách ngách của công ty.
   - Hiển thị badge ngách trên cả 2 bảng Quản lý Doanh nghiệp và Quản lý Nhân sự kèm modal sửa chi tiết.
3. **Local-First Persistence (Bảo Toàn Dữ Liệu 100% Khi Khởi Động Lại)**:
   - Triển khai bộ đệm Local-First với `localStorage` (`rtm_saas_tenants_cache`, `rtm_saas_licenses_cache`, `rtm_saas_members_cache`).
   - Dữ liệu công ty (như `93media`) và tài khoản sếp được lưu trữ tức thì, mở app lên hiển thị ngay 0ms, không bao giờ bị trắng màn hình hoặc reset về 0 kể cả khi mất mạng hoặc Gateway Cloud offline.

### 8.10. Kiểm Toán An Ninh & Chuẩn Hóa Chu Trình SaaS Multi-Tenant & HWID Binding

1. **Khóa Chặt Đặc Quyền Master Owner**:
   - Nhận diện duy nhất địa chỉ email chính chủ `dungdong333@gmail.com`. Loại bỏ hoàn toàn lỗ hổng bypass mật khẩu qua tiền tố lỏng lẻo.
   - Bắt buộc kiểm tra mật khẩu chính xác từ Supabase/Gateway. Đặc quyền duy nhất của Master Owner là được tự do đăng nhập trên mọi máy tính mà không bị ràng buộc khóa phần cứng HWID.
2. **Khai Thông Luồng Xin Cấp Quyền Đổi Máy (`HWID_MISMATCH`)**:
   - Khi phát hiện lệch phần cứng, Gateway và Client tự động lưu lại `userId` và `email` của nhân sự.
   - Màn hình Xin Đổi Máy gửi đơn trơn tru kèm thông tin máy cũ, máy mới và lý do gửi về Gateway (`POST /v1/auth/request-hwid-reset` / `/v1/auth/request-device-change`).
   - Trên SaaS Master Hub (Tab 4), tích hợp bảng **Yêu Cầu Đổi Máy Chờ Duyệt** với 2 nút hành động: **Chấp Thuận** và **Từ Chối** gọi API duyệt trực tiếp 1-click.
3. **Đồng Bộ Thao Tác 1-1 Lên Cloud Gateway & Supabase**:
   - Cấp License mới: Gọi `POST /v1/admin/licenses/issue`, cấp key thật và ghi nhận vào cơ sở dữ liệu Cloud.
   - Khóa / Mở khóa công ty: Gọi `POST /v1/admin/companies/update`, đồng bộ trạng thái `is_active` tức thời.
   - Thêm ghế: Gọi `POST /v1/admin/licenses/action` với action `add_seats`.
   - Hủy liên kết máy: Gọi `POST /v1/admin/devices/unbind` để thu hồi thiết bị thực tế trên server.
4. **Heartbeat Thời Gian Thực & Cơ Chế Thu Hồi Phiên (Session Eviction)**:
   - Máy trạm Desktop tự động gửi tín hiệu sống định kỳ mỗi **3 phút** qua `POST /v1/device/heartbeat`.
   - Gateway cập nhật `last_heartbeat_at` và `last_ip` vào `device_bindings`.
   - Khi Quản trị viên khóa tài khoản hoặc khóa công ty, lần ping kế tiếp Gateway lập tức phản hồi mã lỗi `SESSION_REVOKED`. Máy trạm tự động cưỡng chế đăng xuất và khóa màn hình bảo vệ dữ liệu.
5. **Hiện Đại Hóa HWID Tương Thích Windows 11 24H2**:
   - Thay thế các lệnh gọi `wmic` đã bị Microsoft gỡ bỏ bằng 1 lệnh PowerShell CIM duy nhất xuất JSON nén.
   - Tối ưu hóa thời gian trích xuất phần cứng từ 4.5s xuống dưới **0.6s**, vượt qua toàn bộ unit test an ninh phần cứng.




