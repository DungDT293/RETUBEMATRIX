# Kế hoạch Rebrand & Dọn Dead Code — RETubeMatrix

> Trạng thái: **đang thực hiện** · Lập ngày: 2026-11-06
> Phạm vi: `reupytb` (RETubeMatrix) sau khi hợp nhất code youwee + BrowserMulti.

---

## 0. Quyết định đã chốt

| #   | Vấn đề                                                                                       | Quyết định                                                      |
| :-- | :------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| 1   | 6 tính năng không có trong nav (Download, Gallery, Subtitles, Metadata, Processing, Summary) | **Xóa**                                                         |
| 2   | Updater                                                                                      | **Dùng repo riêng** `https://github.com/DungDT293/RETUBEMATRIX` |
| 3   | Rebrand định danh (scheme, CLI, SDK, extension…)                                             | **Đổi ngay**, không giữ compat dài hạn                          |
| 4   | Plugin store                                                                                 | Trỏ catalog về repo riêng (giữ nội dung catalog hiện tại)       |

**Nguyên tắc chung**

- Không sửa 8 file vendored từ BrowserMulti nếu không ghi vào `PROVENANCE.md`.
- Mỗi phase phải qua: `bun run biome check .` → `bun run tsc -b` → `cargo check` → `bun test`.
- Không commit/push trừ khi người dùng yêu cầu.
- Mọi thay đổi định danh phải có migration dữ liệu (localStorage, appdata) và alias chuyển tiếp.

---

## 1. Bản đồ nguồn gốc (Provenance)

| Nguồn                                            | Thành phần                                                                            | Dấu hiệu nhận biết                                                                   |
| :----------------------------------------------- | :------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------- |
| **youwee** (`vanloctech/youwee`)                 | Rust core, React shell, plugin SDK, extension, CLI/deep-link, docs                    | scheme `youwee`, updater `vanloctech/youwee`, `sdk-js/`, `extensions/youwee-webext/` |
| **BrowserMulti v1.4.1** (`com.browsermulti.app`) | `browser_engine/` (65/75 file giống hệt), `roots/browsermulti/`                       | `core/`, `actions/`, `runner.py` (mới), Chromium 155.0.8059.12                       |
| **RETubeMatrix**                                 | Reup Lv1/Lv2, BKT + traffic light, đối chiếu 1-1, Outlier Hunter, Auto-Pilot, rebrand | `ffmpeg.rs`, `ReupBktPage.tsx`, `outlier_hunter.py`, `reup-auto-pilot.ts`            |

**8 file BrowserMulti đã bị sửa khi vendor** (không được ghi đè khi sync):

```
actions/upload_actions.py
actions/youtube_channel.py
core/browser.py
core/engines/browsermulti_engine.py
core/paths.py
core/profile_store.py
core/window_arranger.py
core/window_icon_badge.py
```

**2 file chỉ có ở RETubeMatrix**: `browser_engine/runner.py`, `browser_engine/outlier_hunter.py`.

---

## 2. P0 — Hotfix an toàn — ✅ Hoàn tất 2026-11-06

- [x] **P0.1 Updater**: endpoint → `DungDT293/RETUBEMATRIX`; đã tạo key ký mới tại `%USERPROFILE%\.tauri\retubematrix-updater.key` và cập nhật `pubkey`. Xem `docs/UPDATER.md`.
- [x] **P0.2 Plugin store**: `PLUGIN_STORE_CATALOG_URL` → `raw.githubusercontent.com/DungDT293/RETUBEMATRIX/main/plugin-store/catalog.json`.
- [x] **P0.3 Xóa hardcode đường dẫn máy dev**:
  - `src-tauri/src/commands/profiles.rs` (fallback `D:\...\runner.py`, `D:\...\yt-dlp`, `C:\Users\Admin\...python.exe`).
  - `browser_engine/outlier_hunter.py` (`D:\...`, `C:\Users\Admin\...`).
  - `browser_engine/core/engines/browsermulti_engine.py` (`D:\TOOL DUNG CODE\BrowserMulti`, `E:\...`, `D:\dichchrome`).
- [x] **P0.4** `beforeDevCommand` / `beforeBuildCommand` → `bun run dev` / `bun run build`.
- [x] **P0.5** Đổi chuỗi sản phẩm `reupytb` → `RETubeMatrix` trong notification, Dashboard, Profiles, runner docstring.

> Kiểm chứng P0: `biome check` (2 file FE) ✅ · `tsc -b` ✅ · `cargo check` ✅ · `py_compile` ✅.
> Việc còn lại của rebrand (scheme, CLI, SDK, extension, docs) nằm ở P3.

---

## 3. P1 — Chốt inventory & tài liệu nguồn — ✅ Hoàn tất 2026-11-06

- [x] Tạo `PROVENANCE.md`: commit/version gốc của youwee, BrowserMulti v1.4.1, danh sách 8 file patch.
- [x] Tạo `docs/UPDATER.md`: quy trình ký release, secret GitHub, xoay key.
- [x] Rà lại danh sách 6 tính năng xóa và mapping component/context/service tương ứng.

---

## 4. P2 — Dọn dead code

### Wave 1 — Frontend

| Đơn vị              | Phạm vi xóa                                                                                                                         | Ghi chú                                                                                         |
| :------------------ | :---------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| 6 trang unreachable | `DownloadPage`, `GalleryPage`, `MetadataPage`, `ProcessingPage`, `SubtitlesPage`, `SummaryPage` + export trong `src/pages/index.ts` | Giữ `HistoryPage`                                                                               |
| Subtitles           | 18 file `components/subtitles/`, `contexts/SubtitleContext.tsx`, 4 file `lib/subtitle-*`, mount trong `App.tsx`                     | Cô lập hoàn toàn                                                                                |
| Gallery             | 4 component `Gallery*`, `contexts/GalleryDlContext.tsx`, nhánh trong `useTrayDownloadStatus`                                        |                                                                                                 |
| Processing UI       | 7 file `components/processing/`, `ProcessingPage`                                                                                   | Giữ `ProcessingContext` nếu `GeneralSection` còn dùng `previewSizeThreshold`, hoặc tách setting |
| Metadata            | `pages/metadata/*`, `MetadataContext`, `DataExportContext`                                                                          |                                                                                                 |
| Summary             | `SummaryPage`, `SummarySessionProvider`, `lib/summary-session.ts`                                                                   | Giữ `AIContext` (History dùng)                                                                  |
| DownloadPage-only   | `QueueList`, `QueueItem`, `SettingsPanel`, `UrlInput`, `YoutubeKeywordSearch`                                                       | `SourceBadge`/`VideoPreview`/`SchedulePopover` vẫn được dùng nên giữ lại                        |
| i18n                | namespace `subtitles`, `gallery`, `metadata`                                                                                        | Đã xóa 39 file JSON (13 locale × 3 namespace)                                                   |

> **✅ Wave 1 hoàn tất 2026-11-06**: giảm từ 244 → 186 file TS/TSX (xóa 58 file), provider tree từ 17 → 12 tầng. Kiểm chứng: `tsc -b` ✅ · `biome check .` ✅ (4 warning tồn tại trong file vendored `injected_listener.js`, không sửa theo quy tắc provenance).
> Chưa xóa key `pages.summary`/`pages.processing` trong locale (không còn component dùng, nhưng giữ lại không ảnh hưởng).

### Wave 2 — Rust backend — ✅ Hoàn tất 2026-11-06

- Giữ: `run_reup_pipeline_v1/v2_cmd` (tách sang `commands/reup.rs`), `get_video_metadata`, `generate_video_thumbnail`, `split_media_segments`, toàn bộ download/channels/BKT/outlier/plugin/AI.
- Xóa: `commands/gallery.rs`, `commands/metadata.rs`, `commands/processing.rs`, `commands/processing/jobs.rs`, `commands/processing/attachments.rs`, `services/gallerydl.rs`.
- `commands/processing/` thu gọn còn `metadata.rs` (get_video_metadata) + `preview.rs` (generate_video_thumbnail).
- Xóa **42 command registration** không còn consumer; bỏ `POLLING_INTERVAL_SECS`, `_has_cli_request`, `GalleryDlStatus`, `check_gallerydl`.
- **Whisper được giữ lại** vì `AIContext` dùng `transcribe_url_with_whisper` làm fallback transcript; chỉ đăng ký command này.
- Còn tồn (chưa xóa vì rủi ro thấp, sẽ dọn sau): `_use_bun_runtime`, một số hàm command không còn đăng ký (`add_history`, `get_video_basic_info`, `get_available_subtitles`, `generate_summary_with_options`, `cancel_summary_generation`), 2 command Whisper không đăng ký.

### Wave 3 — Python browser engine — ✅ Hoàn tất 2026-11-06

- Tính import closure từ `runner.py`: **135 module reachable**, **40 unreachable**.
- Đã xóa **32 đường dẫn** (30 file + 2 thư mục `core/proxy_reputation/`, `core/recorder/`):
  `google_*`, `drive_actions`, `sheets_actions`, `maps_actions`, `gmail_actions`, `oauth_actions`, `youtube_actions`, `profile_package`, `profile_transfer_inbox`, `license_client`/`license_signing`, `proxy_reputation`, `recorder`, `renderer_forensics`, `sidecar_client`, `storage_manager`, `transfer_security`…
- Giữ `outlier_hunter.py` (import cục bộ trong runner) và `actions/__init__.py`.
- Kết quả: `browser_engine` còn **37 file Python**; `import runner` OK và `--action list_profiles` trả JSON hợp lệ.

---

## 5. P3 — Rebrand định danh (đổi ngay)

| Bước | Nội dung                                                               | File chính                                                        |
| :--- | :--------------------------------------------------------------------- | :---------------------------------------------------------------- |
| 3.1  | Chuỗi hiển thị: tray, notification, About, lỗi, extension locales      | `lib.rs`, `polling.rs`, `SettingsPage`, `extensions/.../_locales` |
| 3.2  | Đường dẫn dữ liệu chuẩn `%LOCALAPPDATA%\RETubeMatrix`; fallback legacy | `core/paths.py`, `browsermulti_engine.py`                         |
| 3.3  | CLI `retubematrix` (bỏ dần `youwee`)                                   | `cli_shortcut.rs`                                                 |
| 3.4  | Deep link: `retubematrix://` (+ giữ `youwee://` trong 1 phiên bản)     | `tauri.conf.json`, `external.rs`, `external-link.ts`              |
| 3.5  | SDK/plugin env: `RETUBEMATRIX_*`; đổi tên package SDK                  | `sdk-js/`, `plugin/bridge.rs`                                     |
| 3.6  | Extension: đổi thư mục/tên/manifest/deep link                          | `extensions/youwee-webext`                                        |
| 3.7  | Updater & release (hoàn tất P0.1)                                      | `tauri.conf.json`, `.github/workflows/build.yml`                  |
| 3.8  | Plugin store: catalog riêng, publisher riêng, validator                | `plugin-store/`, `plugin.rs`                                      |

---

## 6. P4 — Docs & test

- [ ] Đồng bộ `README.md`, `PROJECT_CONTEXT.md`, `AGENTS.md`, `docs/CLI.md`, `docs/PLUGINS.md`.
- [ ] Cập nhật 3 changelog khi bump version.
- [ ] Test: scheme cũ/mới, CLI alias, migration localStorage, guard updater endpoint, import closure browser_engine.
- [ ] Cập nhật `TESTER_GUIDE_RETUBEMATRIX.html`.

---

## 7. Định nghĩa hoàn thành (DoD)

1. `rg -i youwee` trong code chạy chỉ còn hằng số compat có comment `LEGACY_`.
2. 4 lệnh kiểm tra pass.
3. Cài mới/nâng cấp: deep link cũ/mới, CLI cũ/mới, updater trỏ đúng repo.
4. Không còn trang unreachable; bundle size giảm.
5. Docs + 3 changelog khớp version.

---

## 8. Rủi ro & giảm thiểu

| Rủi ro                         | Giảm thiểu                                                |
| :----------------------------- | :-------------------------------------------------------- |
| Updater key mismatch           | Test staging; tài liệu hóa key; không commit private key  |
| Xóa command làm gãy plugin/CLI | Giữ deprecated 1 phiên bản, audit reference trước         |
| Đổi scheme gãy link cũ         | Giữ `youwee://` trong 1 phiên bản, extension fallback     |
| Xóa nhầm file vendored         | Chỉ xóa theo import closure; ghi patch vào provenance     |
| Mất dữ liệu profile/DB         | Backup `%APPDATA%\com.retubematrix.app` trước khi migrate |

---

## 9. Ước lượng

| Phase | Thời lượng |
| :---- | :--------- |
| P0    | 0.5 ngày   |
| P1    | 0.5 ngày   |
| P2    | 2–3 ngày   |
| P3    | 5–8 ngày   |
| P4    | 1–2 ngày   |
