# RETubeMatrix

<div align="center">

[![English](../README.md)](../README.md)
[![Tiếng Việt](README.vi.md)](README.vi.md)
[![简体中文](README.zh-CN.md)](README.zh-CN.md)

  <a href="#">
    <img src="../src-tauri/icons/icon.png" alt="RETubeMatrix Logo" width="128" height="128">
  </a>

**RETubeMatrix — Nền Tảng Tự Động Hóa Reup, Săn Đề Xuất & Kiểm Thử Bản Quyền YouTube Đỉnh Cao**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/badge/version-v0.20.15-brightgreen.svg)](https://github.com/DungDT293/RETUBEMATRIX/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/DungDT293/RETUBEMATRIX)

</div>

---

## 🌟 Giới Thiệu (Overview)

**RETubeMatrix** là hệ thống quản trị, tự động hóa và phân tích video YouTube đa kênh chuyên nghiệp. Nền tảng kết hợp kiến trúc đa tầng giữa **Tauri 2.0 (Rust)** siêu nhẹ, giao diện hiện đại **React 19 + TypeScript + Tailwind CSS**, động cơ trình duyệt chống phát hiện **MultiBrowser Chromium Anti-detect** và pipeline xử lý video bản quyền thông minh.

---

## 🚀 9 Chức Năng Cốt Lõi (Core Capabilities)

### 1. Tổng Quan Hệ Thống (Dashboard & Đối Chiếu 1-1)

- **Bảng đối chiếu 1-1**: Liên kết chặt chẽ Kênh Đối Thủ (Scraped Source) ↔ Kênh Hệ Thống (Profile Đích), kiểm soát số video cào được, số video đã tải, số video test BKT và từ khóa đối chiếu.
- **Cơ chế Chống Đăng Nhầm Kênh**: Tự động nhận diện và cảnh báo màu hổ phách `⚠️ Chưa gán (Dễ nhầm lẫn)` ngăn ngừa đăng nhầm nội dung sang sai profile.

### 2. Quản Lý Profile (MultiBrowser Anti-detect)

- Hồ sơ trình duyệt Chromium độc lập 100% vân tay (Canvas, WebGL, AudioContext, User-Agent, Client Rects, WebRTC).
- Hỗ trợ gán Proxy IPv4/IPv6 (HTTP, SOCKS5) theo từng profile.
- Tự động sắp xếp lưới cửa sổ (Auto-tile Grid 2x2, 3x3) và kịch bản tương tác nuôi YouTube Studio an toàn.

### 3. Theo Dõi Kênh & Phân Tích Video

- **Quét tổng video đa chiều**: Sắp xếp theo Mới nhất, Phổ biến nhất (Viral), Cũ nhất, Thời lượng dài/ngắn, Tiêu đề A-Z.
- **Bộ lọc thời gian linh hoạt**: Tất cả, 3 ngày qua, 7 ngày qua hoặc chọn khoảng ngày tùy ý.
- **Tác vụ hàng loạt**: Chọn nhanh Top 5, Top 10, Top 20 video; 1 click chuyển sang "Tải video sạch" hoặc "Test BKT".

### 4. Reup & Test Bản Quyền (Copyright Shield)

- **Lách bản quyền đa cấp**: Tùy chọn bật/tắt lách bản quyền; tự động lấy mẫu âm thanh động qua FFprobe (`asetrate={sr}*pitch,aresample={sr},atempo={speed/pitch}`) triệt tiêu 100% độ lệch tiếng.
- **Xóa sạch Metadata mặc định**: Toàn bộ EXIF, thẻ tag, thông số tác giả gốc được xóa sạch khi tải về máy.
- **Hệ thống nhãn rủi ro đèn giao thông (Traffic Light)**:
  - 🟢 **Xanh (Green)**: Toàn bộ video từ kênh này an toàn, sạch bản quyền.
  - 🟡 **Vàng (Yellow)**: Video mới nhất hoặc 1 video cũ dính bản quyền (cảnh báo).
  - 🔴 **Đỏ (Red - Blacklist)**: 2 video liên tiếp dính bản quyền ➔ Lập tức gắn nhãn Đỏ, tự động tắt auto_download = 0, khóa quét/tải để bảo vệ hệ thống.
- **Kênh Test Bản Quyền Độc Lập**:
  - Quota nghiêm ngặt 15 video / 24 giờ.
  - Tự động khóa đăng khi hết quota và tự động luân chuyển sang kênh test khác còn lượt.
  - Hoạt động tách biệt hoàn toàn với profile chính, bảo vệ an toàn tuyệt đối cho tài khoản kiếm tiền.

### 5. Săn Đề Xuất (Outlier Hunter & Mô Hình Ikigai)

- **Tư duy ngách theo mô hình Ikigai Nhật Bản**: Giao thoa giữa (1) Nhu cầu người xem, (2) Khả năng làm lâu dài và (3) Khả năng kiếm tiền (CPM/Affiliate).
- **Bộ công cụ phân tích ngách chuyên sâu**:
  - _YouTube Alphabet Autosuggest (a-z)_: Đào sâu mỏ vàng từ khóa đuôi dài.
  - _Google Trends YouTube Search 12 tháng_: Mở liên kết phân tích biến động nhu cầu thực tế.
  - _Chỉ số Content Gap_: Phát hiện khoảng trống nhu cầu tìm kiếm cao nhưng ít video đáp ứng.
  - _VPH & Vận tốc Đề xuất_: Đo lường view mỗi giờ (Views Per Hour) và gia tốc viral của các kênh nhỏ có view bứt phá.

### 6. AI Tối Ưu Tiêu Đề & Thumbnail

- **Quy tắc Tiêu đề 95% - 5%**: Giữ nguyên 95% ngữ cảnh & từ khóa SEO chính, tinh chỉnh 5% hook cuối (tò mò, kịch tính, bí mật) để tăng đột phá CTR.
- **Tối ưu Thumbnail Content ID**: Giữ nguyên vẹn nhân vật và chữ gốc; tinh chỉnh nhẹ độ tương phản, độ nét, zoom 102% và dời pixel để vượt qua thuật toán băm ảnh Content ID.

### 7. Tải Video Sạch & Playlist Đa Luồng

- Hỗ trợ tải video chất lượng cao từ 720p, 1080p đến 4K, 8K qua lõi yt-dlp tích hợp sẵn.
- Tải toàn bộ playlist đa luồng, hỗ trợ tải livestreams từ điểm bắt đầu.

### 8. Nhật Ký & Kiểm Tra Lỗi (Categorized Logs)

- Tự động phân loại sự kiện ghi log thành 6 file chuyên biệt:
  - `download.log` — Nhật ký tải video và trích xuất media.
  - `channels.log` — Tiến trình cào và phân tích kênh đối thủ.
  - `bkt_test.log` — Chi tiết tiến trình đăng và kiểm tra bản quyền YouTube Studio.
  - `outlier.log` — Dữ liệu săn đề xuất và đào từ khóa.
  - `reup.log` — Lịch sử render và biến đổi video lách bản quyền.
  - `ai.log` — Nhật ký tối ưu tiêu đề và thumbnail qua AI.
- Thông báo lỗi chi tiết bằng tiếng Việt có dấu kèm hướng xử lý nhanh.

### 9. Cài Đặt & Cấu Hình Hệ Thống

- Tích hợp trọn gói offline: Đóng gói sẵn Python 3.11 embed, Chromium 155, FFmpeg/FFprobe, Deno, yt-dlp mà không cần cài thêm môi trường ngoài.

---

## 📦 Cài Đặt (Installation)

Tải phiên bản mới nhất tại [Releases Page](https://github.com/DungDT293/RETUBEMATRIX/releases):

| Nền tảng        | Định dạng              | Mô tả                                                |
| :-------------- | :--------------------- | :--------------------------------------------------- |
| **Windows x64** | `.exe` (NSIS Setup)    | Bộ cài đặt đầy đủ trọn gói, tích hợp sẵn mọi runtime |
| **Windows x64** | `.msi` (MSI Installer) | Gói cài đặt chuẩn Windows Installer doanh nghiệp     |

---

## 🛠️ Biên Dịch Từ Mã Nguồn (Build from Source)

### Yêu cầu tiên quyết

- [Bun](https://bun.sh/) (v1.3.5 hoặc mới hơn) hoặc [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/) (v1.77.2 hoặc mới hơn)
- [Tauri CLI 2.0](https://tauri.app/)

### Các bước thực hiện

```bash
# Clone repository
git clone https://github.com/DungDT293/RETUBEMATRIX.git
cd RETUBEMATRIX

# Cài đặt dependencies
bun install   # hoặc npm install

# Chạy chế độ phát triển (Development)
bun run tauri dev

# Đóng gói phiên bản phát hành (Production Release)
bun run tauri build
```

---

## 📄 Bản Quyền & Giấy Phép (License)

Dự án được phân phối dưới giấy phép **MIT License** — xem chi tiết tại file [LICENSE](../LICENSE).
