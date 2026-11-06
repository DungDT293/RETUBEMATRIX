# Provenance — Nguồn gốc mã nguồn RETubeMatrix

Tài liệu này ghi lại **code nào đến từ đâu** để tránh nhầm lẫn khi bảo trì, đặc biệt giữa ba nguồn: youwee, BrowserMulti và phần tự phát triển RETubeMatrix.

## 1. Ba nguồn chính

| Nguồn                                       | Phiên bản / commit                                 | Phạm vi trong repo này                                                                                                  | Dấu hiệu                                                                  |
| :------------------------------------------ | :------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **youwee** (`github.com/vanloctech/youwee`) | Kế thừa trước khi rebrand (xem git remote/history) | Rust core (`src-tauri/src/`), React shell (`src/`), plugin SDK (`sdk-js/`), browser extension (`extensions/`), docs gốc | scheme `youwee`, CLI `youwee`, `youwee-sdk`, `YOUWEE_*`                   |
| **BrowserMulti** (`com.browsermulti.app`)   | **v1.4.1**                                         | `browser_engine/` (vendor), `roots/browsermulti/` (Chromium 155.0.8059.12)                                              | `core/`, `actions/`, `runner.py` là file mới của RETubeMatrix             |
| **RETubeMatrix** (tự phát triển)            | 0.20.x                                             | Reup Lv1/Lv2, BKT + traffic light, đối chiếu 1-1, Outlier Hunter, Auto-Pilot, rebrand                                   | `ffmpeg.rs`, `ReupBktPage.tsx`, `outlier_hunter.py`, `reup-auto-pilot.ts` |

Repo đích: `https://github.com/DungDT293/RETUBEMATRIX`.

## 2. BrowserMulti vendored — trạng thái

Tính đến 2026-11-06, `browser_engine/` có **75 file Python**:

- **65 file giống hệt** BrowserMulti v1.4.1 (so khớp SHA256).
- **8 file đã sửa** cho RETubeMatrix.
- **2 file chỉ có ở RETubeMatrix**: `runner.py`, `outlier_hunter.py`.

### 8 file đã sửa (không được ghi đè khi sync)

| File                                  | Lý do sửa                                                               |
| :------------------------------------ | :---------------------------------------------------------------------- |
| `actions/upload_actions.py`           | Selector YouTube Studio, luồng upload/publish cho BKT                   |
| `actions/youtube_channel.py`          | Chọn kênh YouTube đích, kiểm tra tài khoản                              |
| `core/browser.py`                     | Khởi tạo session anti-detect cho runner                                 |
| `core/engines/browsermulti_engine.py` | Đường dẫn runtime; đã bỏ hardcode máy dev (2026-11-06)                  |
| `core/paths.py`                       | Data root `%LOCALAPPDATA%\RETubeMatrix\browser_engine`, fallback legacy |
| `core/profile_store.py`               | Quản lý profile cho RETubeMatrix                                        |
| `core/window_arranger.py`             | Sắp xếp cửa sổ                                                          |
| `core/window_icon_badge.py`           | Badge số cửa sổ                                                         |

> `runner.py` là entrypoint CLI mới (BrowserMulti dùng `sidecar_main.py` + FastAPI).
> `outlier_hunter.py` là module mới cho Outlier Hunter.

### Quy tắc sync từ BrowserMulti

1. Chỉ copy các file **không nằm trong bảng 8 file** ở trên.
2. Với 8 file đã sửa: diff với BrowserMulti, áp patch thủ công, không copy đè.
3. Sau khi sync, chạy:
   - `python -m py_compile browser_engine/runner.py browser_engine/outlier_hunter.py`
   - `python browser_engine/runner.py --action list_profiles`
4. Cập nhật bảng trên nếu có file sửa mới.

### Kiểm tra nhanh mức trùng khớp

```powershell
$bm = "D:\TOOL DUNG CODE\BrowserMulti"
$be = ".\browser_engine"
Get-ChildItem $be -Recurse -File -Filter *.py |
  Where-Object { $_.FullName -notmatch "__pycache__" } |
  ForEach-Object {
    $rel = $_.FullName.Substring((Resolve-Path $be).Path.Length + 1)
    $other = Join-Path $bm $rel
    if (Test-Path $other) {
      $same = (Get-FileHash $_.FullName).Hash -eq (Get-FileHash $other).Hash
      if (-not $same) { "DIFF: $rel" }
    } else { "ONLY-REUP: $rel" }
  }
```

## 3. youwee legacy — phần còn lại có chủ đích

Các định danh sau **vẫn giữ để tương thích** và sẽ được đổi dần ở P3:

- Deep link `youwee://` (code đã nhận cả `retubematrix://`).
- CLI `youwee` ([cli_shortcut.rs](../src-tauri/src/commands/cli_shortcut.rs)).
- SDK `youwee-sdk`, env `YOUWEE_*` cho plugin.
- Extension `extensions/youwee-webext/`.
- localStorage key `youwee-*` (đọc fallback).
- Appdata legacy `com.vanloctech.youwee`, `com.vanloctech.retubematrix`.
- Binary legacy `youwee-yt-dlp*` (chỉ fallback).

## 4. Những gì đã đổi ở P0 (2026-11-06)

- Updater → repo `DungDT293/RETUBEMATRIX` + key ký mới (xem `docs/UPDATER.md`).
- Plugin store remote → repo riêng.
- Bỏ hardcode đường dẫn máy dev trong Rust/Python.
- `beforeDevCommand`/`beforeBuildCommand` → bun.
- Chuỗi sản phẩm `reupytb` → `RETubeMatrix` ở notification/Dashboard/Profiles/runner.

## 5. Trim BrowserMulti engine (Wave 3, 2026-11-06)

`browser_engine/` đã được rút gọn theo import closure từ `runner.py`:

- Giữ **37 file Python** (trước trim: 75).
- Xóa các module không reachable: `google_*`, `drive_actions`, `sheets_actions`, `maps_actions`,
  `gmail_actions`, `oauth_actions`, `youtube_actions`, `profile_package`, `profile_transfer_inbox`,
  `license_client`/`license_signing`, `proxy_reputation/`, `recorder/`, `renderer_forensics`,
  `sidecar_client`, `storage_manager`, `transfer_security`, `visit_history`…
- **Không xóa** `outlier_hunter.py` (import cục bộ trong runner) và `actions/__init__.py`.

Khi sync lại từ BrowserMulti, chỉ copy các module còn nằm trong danh sách reachable; không khôi phục
các module đã trim trừ khi thêm tính năng mới cần chúng.
