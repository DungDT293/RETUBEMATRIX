# RETUBEMATRIX — BẢN THIẾT KẾ KIẾN TRÚC & QUY CHUẨN KỸ THUẬT REWRITE (MASTER SPECIFICATION)

> **Tài liệu tham chiếu chuẩn mực cho việc khởi tạo và phát triển ứng dụng mới từ đầu.**  
> Tài liệu này tổng hợp toàn bộ bài học thực chiến xương máu, mục đích cốt lõi, luồng logic vận hành 7 giai đoạn, bảng tra cứu chi tiết "Nên làm" (DO) & "Tuyệt đối tránh" (DON'T), thiết kế hệ thống bản quyền SaaS Master Hub / HWID và cấu trúc mã nguồn tinh gọn.

---

## MỤC LỤC
1. [Mục Đích Tối Thượng & Bài Toán Nghiệp Vụ](#phần-1-mục-đích-tối-thượng--bài-toán-nghiệp-vụ)
2. [Luồng Logic Vận Hành 7 Giai Đoạn (Core Architecture Pipeline)](#phần-2-luồng-logic-vận-hành-7-giai-đoạn-core-architecture-pipeline)
3. [Bảng Tra Cứu Thực Chiến: Những Điều Nên Làm (DO) & Tuyệt Đối Tránh (DON'T)](#phần-3-bảng-tra-cứu-thực-chiến-những-điều-nên-làm-do--tuyệt-đối-tránh-dont)
   - [3.1. Cơ chế Mạng, Proxy Dân Cư & Bypass Chứng Chỉ SSL/MITM](#31-cơ-chế-mạng-proxy-dân-cư--bypass-chứng-chỉ-sslmitm)
   - [3.2. Thao Tác Với Polymer Web Components & Shadow DOM (YouTube Studio)](#32-thao-tác-với-polymer-web-components--shadow-dom-youtube-studio)
   - [3.3. Luồng Tải Lên (Upload Stream) & Xử Lý Các Hộp Thoại (Modals/Popups)](#33-luồng-tải-lên-upload-stream--xử-lý-các-hộp-thoại-modalspopups)
   - [3.4. Động Cơ Kiểm Tra Bản Quyền Content ID (BKT Engine)](#34-động-cơ-kiểm-tra-bản-quyền-content-id-bkt-engine)
   - [3.5. Xử Lý Đa Phương Tiện & Bộ Lọc FFmpeg (Chống Lệch Tiếng Gốc 48kHz)](#35-xử-lý-đa-phương-tiện--bộ-lọc-ffmpeg-chống-lệch-tiếng-gốc-48khz)
   - [3.6. Đóng Gói Ứng Dụng Desktop (Tauri v2 & NSIS Packager)](#36-đóng-gói-ứng-dụng-desktop-tauri-v2--nsis-packager)
   - [3.7. Chuẩn Mực Thiết Kế Giao Diện (Clean Flat UI & No-Emoji Policy)](#37-chuẩn-mực-thiết-kế-giao-diện-clean-flat-ui--no-emoji-policy)
4. [Hệ Thống Bản Quyền SaaS, Phân Quyền 4 Cấp & Khóa Cứng HWID](#phần-4-hệ-thống-bản-quyền-saas-phân-quyền-4-cấp--khóa-cứng-hwid)
5. [Cấu Trúc Thư Mục & Thiết Kế Kiến Trúc Tinh Gọn Cho Dự Án Mới](#phần-5-cấu-trúc-thư-mục--thiết-kế-kiến-trúc-tinh-gọn-cho-dự-án-mới)

---

## PHẦN 1: MỤC ĐÍCH TỐI THƯỢNG & BÀI TOÁN NGHIỆP VỤ

### 1.1. Bài toán thực tế của Content Creator & Reup quy mô lớn (MCN / Solo Creator)
Trong quá trình vận hành hệ thống kênh YouTube số lượng lớn, người làm nội dung và reup bán tự động đối mặt với 5 rào cản kỹ thuật chí mạng:
1. **Dính gậy bản quyền (Copyright Strike) & Quét chùm**: Khi tải video từ nền tảng khác hoặc reup lại trên YouTube, việc dính nhạc nền có bản quyền hoặc bản ghi hình ảnh được bảo hộ trong Content ID sẽ khiến video bị chặn toàn cầu hoặc ăn gậy bản quyền. Nghiêm trọng hơn, nếu nhiều kênh bị phạt trong cùng một mạng, YouTube sẽ quét liên đới (Linked Account Suspension) dẫn tới mất trắng toàn bộ dàn kênh.
2. **Lộ dấu vân tay trình duyệt (Browser Fingerprinting) & Chung IP**: Đăng nhập và vận hành nhiều kênh trên các trình duyệt thông thường hoặc các công cụ tự động hóa sơ sài (dùng Selenium/Puppeteer không cloak) làm lộ cờ `navigator.webdriver`, canvas hash, audio fingerprint và WebRTC IP thật, khiến YouTube phát hiện mạng lưới bot và khóa tài khoản hàng loạt.
3. **Mất thời gian mò mẫm video đề xuất**: Việc lướt xem thủ công trên YouTube tốn 3–5 tiếng mỗi ngày mà không có số liệu định lượng để biết video nào thực sự là "Outlier" (video có lượt xem tăng đột biến gấp nhiều lần mức trung bình của kênh nhỏ).
4. **Lệch tiếng hình ảnh khi render (Audio Drift)**: Các công cụ render lách âm thanh thông thường cố định tần số lấy mẫu (sample rate) ở mức `44100 Hz`. Trong khi đó, video YouTube chuẩn có tần số âm thanh là `48000 Hz`. Sự chênh lệch này khiến âm thanh bị trôi chậm hoặc nhanh hơn hình ảnh từ 2.5 đến 4 giây trên các video dài, làm hỏng trải nghiệm người xem.
5. **Nghẽn quy trình đăng thủ công**: Thao tác điền form, chọn danh sách phát, bật kiếm tiền (Monetization), trả lời khảo sát phù hợp với quảng cáo (Ad Suitability), xử lý popup xác nhận chiếm tới 80% thời gian lao động.

### 1.2. Giải pháp cốt lõi của ứng dụng
Ứng dụng được thiết kế như một **Hệ sinh thái tự động hóa khép kín (End-to-End Automation Suite)** với các trụ cột:
- **Outlier Hunter**: Săn video đột phá theo ngách dựa trên mô hình Ikigai và phân tích toán học ($Views / Subs$, $Views / Median$, $VPH$).
- **Dynamic FFmpeg Resampling**: Lách bản quyền âm thanh và hình ảnh an toàn, thay đổi hash MD5/SHA-256 và giữ khớp tiếng 100% theo tần số gốc (`{sr}`).
- **Anti-Detect Profile Engine**: Quản lý đa tài khoản trên các profile Chromium độc lập, tách biệt cookie, cache, canvas fingerprint, và định tuyến qua Proxy dân cư xoay IP tĩnh/động.
- **Bể Kênh Test Bản Quyền (BKT Engine)**: Tải video lên kênh phụ ở chế độ Không công khai (Unlisted), theo dõi tiến trình kiểm tra Content ID theo thời gian thực (In-Session Polling). Khi và chỉ khi đạt chuẩn **100% Sạch Bản Quyền (Green Clean)** mới tự động xuất bản sang Kênh Đích.
- **SaaS Master Hub**: Hệ thống phân quyền tập trung 4 cấp (Master Owner, Admin, Leader, User), quản lý hạn ngạch license và khóa cứng thiết bị theo Hardware ID (HWID SHA-256).

---

## PHẦN 2: LUỒNG LOGIC VẬN HÀNH 7 GIAI ĐOẠN (CORE ARCHITECTURE PIPELINE)

Quy trình tự động hóa của ứng dụng vận hành theo chuỗi liên hoàn 7 giai đoạn khép kín:

```
[ Giai đoạn 1: Săn Outlier & Giám Sát Đối Thủ RSS ]
                         │
                         ▼
[ Giai đoạn 2: Tải Video Nguyên Bản (yt-dlp Stream) ]
                         │
                         ▼
[ Giai đoạn 3: Tiền Xử Lý An Toàn (FFmpeg Dynamic Resampling) ]
                         │
                         ▼
[ Giai đoạn 4: Điều Phối Trình Duyệt Ẩn Danh (Anti-Detect + Proxy) ]
                         │
                         ▼
[ Giai đoạn 5: Tải Lên Studio Tự Động (Polymer Wizard 6 Bước) ]
                         │
                         ▼
[ Giai đoạn 6: Giám Sát Bản Quyền Content ID (BKT Engine) ]
                         │
           ┌─────────────┴─────────────┐
           ▼                           ▼
[ 🟢 Sạch Bản Quyền (Clean Streak) ]   [ 🔴 Dính Vi Phạm (Claim/Strike) ]
           │                           │
           ▼                           ▼
[ Giai đoạn 7: Xuất Bản Kênh Đích ]  [ Báo Cáo Vi Phạm & Hủy Bỏ ]
```

### Chi Tiết Từng Giai Đoạn

#### Giai đoạn 1: Săn Video Đề Xuất & Theo Dõi Kênh Đối Thủ
1. **Theo dõi đối thủ qua RSS Feed**:
   - Trích xuất `youtube_channel_id` (kể cả từ URL `@handle` hoặc Custom URL).
   - Polling trực tiếp endpoint RSS: `https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}`.
   - Nhẹ (chỉ vài KB), tốc độ cao, phát hiện video mới chỉ sau 1–5 phút đối thủ vừa đăng mà không tốn hạn ngạch YouTube API.
2. **Bộ lọc toán học Outlier Hunter**:
   - Cào 30 video gần nhất của kênh mục tiêu để tính **Median Views** (trung vị lượt xem).
   - Tính toán các chỉ số đột phá:
     - $\text{Sub Outlier Ratio} = \frac{\text{Views}}{\text{Subscribers}}$
     - $\text{Baseline Outlier Ratio} = \frac{\text{Views}}{\text{Median Views}}$
     - $\text{VPH (Views Per Hour)} = \frac{\text{Views}}{\text{Số giờ đã xuất bản}}$
     - $\text{Engagement Rate} = \frac{\text{Likes} + \text{Comments}}{\text{Views}}$
   - Lọc các video vượt ngưỡng ($\text{Views} \ge 25,000$, $\text{Sub Outlier Ratio} \ge 5.0$, $\text{VPH} \ge 300$).

#### Giai đoạn 2: Tải Video Nguyên Bản
- Gọi `yt-dlp` đóng gói tĩnh kèm cấu hình `--no-add-metadata` để bảo toàn độ sạch.
- Kiểm tra tính toàn vẹn file, lưu vào thư mục lưu trữ và ghi nhận vào SQLite `history` để tránh trùng lặp.

#### Giai đoạn 3: Tiền Xử Lý Reup (FFmpeg Safe Mod)
- Dùng `ffprobe` bóc tách thông số kỹ thuật gốc: resolution, aspect ratio, và đặc biệt là **Sample Rate âm thanh gốc** (`{sr}`, 48000 Hz hoặc 44100 Hz).
- Áp dụng bộ lọc lách an toàn:
  - Tốc độ hình ảnh: $speed \approx 1.02 - 1.05$.
  - Cao độ âm thanh (Pitch): $pitch \approx 1.01 - 1.03$.
  - Bộ lọc âm thanh chuẩn xác: `asetrate={sr}*pitch,aresample={sr},atempo={speed/pitch}`.
  - Scale/Crop nhẹ 1–2%, xóa toàn bộ EXIF/Metadata gốc (`-map_metadata -1`).
  - Thêm padding ngẫu nhiên cuối file để thay đổi hoàn toàn mã băm MD5 và SHA-256.

#### Giai đoạn 4: Điều Phối Trình Duyệt Ẩn Danh (Anti-Detect & Proxy)
- Khởi động Chromium qua Playwright/CDP kết nối vào User Data Directory của hồ sơ tương ứng.
- Cấu hình Proxy (nếu có) thông qua Bridge nội bộ hoặc cờ Chromium, kết hợp lệnh CDP `Security.setIgnoreCertificateErrors` để tránh lỗi chứng chỉ SSL.
- Kiểm tra trạng thái đăng nhập: Điều hướng tới `https://studio.youtube.com`. Nếu bị chuyển hướng sang `accounts.google.com`, dừng lại và thông báo cho người dùng đăng nhập thủ công.

#### Giai đoạn 5: Tải Lên Studio Tự Động (Polymer Wizard 6 Bước)
- Nhấn "Tạo" ➔ "Tải video lên", gán tệp vào `<input type="file">`.
- **Bước 1 — Details**: Điền Tiêu đề, Mô tả, Thumbnail, Danh sách phát. Tích chọn "Không dành cho trẻ em". Điền Tags an toàn $\le 450$ ký tự.
- **Bước 2 — Monetization (cho kênh BKT)**: Tự động bật Kiếm tiền (ON) ➔ Bấm Xong.
- **Bước 3 — Ad Suitability (cho kênh BKT)**: Cuộn xuống cuối chọn "Không có mục nào ở trên" (None of the above) ➔ Bấm "Gửi bài đánh giá" (Submit rating).
- **Bước 4 — Video Elements**: Thêm màn hình kết thúc hoặc bấm Tiếp tục.
- **Bước 5 — Checks**: Chờ kiểm tra định dạng sơ bộ ➔ Bấm Tiếp tục.
- **Bước 6 — Visibility**: Chọn chế độ **Không công khai (Unlisted)** cho kênh test BKT (hoặc Công khai/Lên lịch cho kênh chính).
- **Bắt buộc xử lý Popup "Vẫn xuất bản" (Publish anyway)** nếu YouTube cảnh báo kiểm tra chưa xong.
- **Chờ Upload Stream đạt 100%** trước khi chuyển trang hoặc đóng dialog.

#### Giai đoạn 6: Giám Sát Bản Quyền Content ID (BKT Engine)
- Điều hướng trực tiếp URL về trang Quản lý Nội dung: `https://studio.youtube.com/channel/{cid}/videos/upload`.
- Bật chặn tài nguyên nặng (Route Interception: chặn images, fonts, media stream) để giảm RAM xuống dưới 180MB/profile.
- Theo dõi cột Hạn chế (Restrictions) theo cơ chế **Grace Period** và **Clean Streak $\ge 4$ chu kỳ**.
- Nếu phát hiện dính bản quyền: Click xem chi tiết để bóc tách loại vi phạm (Âm thanh hay Hình ảnh), tên tác phẩm, chủ sở hữu và mốc thời gian vi phạm ➔ Ghi nhận `red_matched` và dừng luồng.
- Nếu vượt qua kiểm tra: Ghi nhận trạng thái `green_clean`.

#### Giai đoạn 7: Xuất Bản Kênh Đích (Publishing Phase)
- Lấy video đã xác nhận `green_clean`, chuyển sang Hồ sơ của Kênh Đích.
- Đăng tải với Tiêu đề, Mô tả, Tags chuẩn SEO đã được tối ưu.
- Xuất bản ở chế độ Công khai (Public) hoặc đặt lịch phát sóng (Schedule) theo khung giờ vàng.

---

## PHẦN 3: BẢNG TRA CỨU THỰC CHIẾN: NHỮNG ĐIỀU NÊN LÀM (DO) & TUYỆT ĐỐI TRÁNH (DON'T)

### 3.1. Cơ Chế Mạng, Proxy Dân Cư & Bypass Chứng Chỉ SSL/MITM

| NHỮNG ĐIỀU NÊN LÀM (DO) | NHỮNG ĐIỀU TUYỆT ĐỐI TRÁNH (DON'T) | LÝ DO KỸ THUẬT & HẬU QUẢ |
| :--- | :--- | :--- |
| **BẮT BUỘC** thêm cờ `--proxy-bypass-list=<-loopback>` khi proxy trỏ về bridge nội bộ `127.0.0.1`. | **TUYỆT ĐỐI KHÔNG** bỏ sót tiền tố dấu trừ `<` trước loopback. | Nếu thiếu dấu trừ `<`, Chromium sẽ tự động bỏ qua (bypass) bridge nội bộ và gửi request bằng IP thật của máy, gây lộ danh tính. |
| **BẮT BUỘC** gọi lệnh CDP: `await client.send('Security.setIgnoreCertificateErrors', { ignore: true })` ngay sau khi tạo context. | **KHÔNG** chỉ dựa vào cờ dòng lệnh `--ignore-certificate-errors`. | Khi đi qua Proxy dân cư MITM, các phiên bản Chromium mới vẫn chặn kết nối WebSocket/CDP với lỗi `ERR_CERT_AUTHORITY_INVALID` nếu không có lệnh CDP tường minh. |
| **BẮT BUỘC** duy trì kết nối HTTP/2 khi cấu hình mạng proxy. | **TUYỆT ĐỐI KHÔNG** thêm cờ `--disable-http2` khi cố khắc phục lỗi mạng. | Giao thức Google Scotty Upload của YouTube Studio yêu cầu stream chunking trên nền HTTP/2. Tắt HTTP/2 sẽ làm rớt kết nối tải lên giữa chừng. |
| **NÊN** dựng Local Authenticated Proxy Bridge trung gian để browser kết nối nội bộ. | **KHÔNG** truyền username/password của proxy trực tiếp vào command-line của Chromium. | Tránh tình trạng Chromium kích hoạt modal hệ thống `407 Proxy Authentication Required` làm treo toàn bộ luồng automation. |
| **NÊN** tăng timeout mạng lên $\ge 90$ giây đối với các profile dùng residential proxy. | **KHÔNG** dùng timeout mặc định ngắn (10–15s). | Proxy dân cư xoay IP thường có độ trễ lớn khi đổi nút mạng. Timeout ngắn sẽ khiến tải trang thất bại liên tục. |

### 3.2. Thao Tác Với Polymer Web Components & Shadow DOM (YouTube Studio)

| NHỮNG ĐIỀU NÊN LÀM (DO) | NHỮNG ĐIỀU TUYỆT ĐỐI TRÁNH (DON'T) | LÝ DO KỸ THUẬT & HẬU QUẢ |
| :--- | :--- | :--- |
| **BẮT BUỘC** phát chuỗi Synthetic Mouse Events (`mousedown`, `mouseup`, `click`) với `{ bubbles: true, composed: true, cancelable: true }`. | **TUYỆT ĐỐI KHÔNG** gọi lệnh `.click()` trực tiếp trên custom element (`<ytcp-button>`, `<tp-yt-paper-radio-button>`). | YouTube Studio dùng Polymer/Lit. Thao tác `.click()` thuần không kích hoạt ripple effect, không xuyên qua ranh giới shadow DOM và bị router nội bộ nuốt chửng. |
| **BẮT BUỘC** duyệt đệ quy xuyên `.shadowRoot` để phân giải thẻ nút thật (`button` hoặc `a`) nằm sâu bên trong (`resolveNativeButton`). | **KHÔNG** click vào khung host của custom element bên ngoài. | Custom element chỉ là container giao diện; logic submit và navigation thực sự nằm trong thẻ `<button>` ẩn bên trong Shadow Root. |
| **BẮT BUỘC** kiểm tra URL hiện tại; nếu sau 1.0 giây chưa vào đúng trang mục tiêu, chuyển hướng ngay bằng `page.goto(target_url)`. | **KHÔNG** click mù vào thẻ anchor sidebar `#menu-item-1` để hy vọng chuyển từ Dashboard sang Content page. | Sidebar menu có thể bị ảo hóa (virtualized DOM) hoặc bị che bởi overlay nền, dẫn tới click không có tác dụng hoặc click nhầm phần tử khác. |
| **BẮT BUỘC** kiểm tra phần tử bằng `elementFromPoint` trước khi click để bảo đảm không bị overlay che khuất. | **KHÔNG** click mù theo tọa độ khi chưa kiểm tra cờ backdrop (`tp-yt-iron-overlay-backdrop`). | Nếu backdrop đang mở, click chuột sẽ bị backdrop hấp thụ và nút bấm bên dưới không nhận được sự kiện. |

### 3.3. Luồng Tải Lên (Upload Stream) & Xử Lý Các Hộp Thoại (Modals/Popups)

| NHỮNG ĐIỀU NÊN LÀM (DO) | NHỮNG ĐIỀU TUYỆT ĐỐI TRÁNH (DON'T) | LÝ DO KỸ THUẬT & HẬU QUẢ |
| :--- | :--- | :--- |
| **BẮT BUỘC** theo dõi thanh tiến trình `ytcp-video-upload-progress` cho đến khi upload stream đạt 100% trước khi đổi trang. | **TUYỆT ĐỐI KHÔNG** reload trang (F5) hoặc chuyển URL ngay khi hộp thoại tải lên vừa đóng lại. | Dù nút Lưu đã bấm xong, file nhị phân vẫn đang được stream nền lên máy chủ `upload.youtube.com`. Reload trang lúc này sẽ ngắt socket và làm video bị lỗi vĩnh viễn: "Processing abandoned". |
| **BẮT BUỘC** phát hiện và tự động click nút "Vẫn xuất bản" / "Publish anyway" trong confirmation dialog. | **KHÔNG** chỉ đứng chờ nút `#done-button` hoàn tất mà bỏ qua popup cảnh báo kiểm tra của YouTube. | YouTube Studio thường hiện popup cảnh báo video chưa kịp kiểm tra bản quyền xong. Nếu không nhấn "Vẫn xuất bản", tool sẽ bị treo vô tận tại bước cuối. |
| **BẮT BUỘC** bảo vệ các nút hủy (`isCancelForbiddenControl`), cấm click nhầm nút Cancel Upload khi đang dọn dẹp popup. | **KHÔNG** quét các selector đóng dialog chung chung (`button`, `ytcp-button`) mà không loại trừ các từ khóa `hủy`, `cancel`. | Rất nhiều tool tự động hóa dính lỗi sơ đẳng: khi cố đóng modal thông báo thì vô tình click trúng nút "Hủy tải lên" của video đang xử lý! |
| **BẮT BUỘC** hoàn thành bước Ad Suitability (Chọn None of the above ➔ Gửi đánh giá) trên kênh đã BKT. | **KHÔNG** bỏ qua bước đánh giá quảng cáo trên kênh đã bật kiếm tiền. | Nếu không bấm gửi đánh giá, nút "Tiếp" sẽ bị vô hiệu hóa màu xám, làm tắc nghẽn toàn bộ wizard tải lên. |
| **BẮT BUỘC** giới hạn độ dài Tags $\le 450$ ký tự theo công thức đặc thù của YouTube Studio. | **KHÔNG** nạp quá 480 ký tự hoặc tiêm chuỗi định dạng URL vào ô tìm kiếm và ô từ khóa. | Công thức YouTube tính cả độ dài tag, dấu phân cách và 2 ký tự đệm cho tag có khoảng trắng: `len(tag) + (2 if " " in tag else 0) + (1 if idx > 0 else 0)`. Vượt quá 500 ký tự sẽ khóa nút Lưu. |

### 3.4. Động Cơ Kiểm Tra Bản Quyền Content ID (BKT Engine)

| NHỮNG ĐIỀU NÊN LÀM (DO) | NHỮNG ĐIỀU TUYỆT ĐỐI TRÁNH (DON'T) | LÝ DO KỸ THUẬT & HẬU QUẢ |
| :--- | :--- | :--- |
| **BẮT BUỘC** duy trì Grace Period $\ge 20$ giây và yêu cầu `clean_streak >= 4` chu kỳ liên tiếp không còn spinner mới báo sạch. | **TUYỆT ĐỐI KHÔNG** kết luận video "Sạch Bản Quyền" khi vừa thấy dấu gạch ngang `—` ở giây đầu tiên (Clean Dash Trap). | Dấu gạch ngang `—` là trạng thái giữ chỗ (placeholder) mặc định của YouTube khi video mới lên bảng và chưa bắt đầu xử lý SD. Báo sạch lúc này là sai 100%. |
| **BẮT BUỘC** khớp chính xác ID video mục tiêu; chỉ kết luận khi video đó đã hoàn tất chu kỳ kiểm tra. | **TUYỆT ĐỐI KHÔNG** báo `green_clean` khi `checked_count === 0` hoặc khi Studio chưa quét xong. | Tránh tình trạng đọc nhầm trạng thái của video cũ hoặc bảng rỗng mà vẫn báo sạch. |
| **BẮT BUỘC** hỗ trợ regex bóc tách thời gian đếm lùi đa ngôn ngữ: Tây Ban Nha (`quedan`, `restan`), Nhật (`残り`), Pháp, Đức, Anh... | **KHÔNG** chỉ đọc chuỗi kiểm tra bằng tiếng Việt ("còn x phút") hay tiếng Anh ("x min left"). | Người dùng có thể sử dụng các profile trình duyệt với ngôn ngữ hiển thị quốc tế khác nhau. |
| **BẮT BUỘC** click xem chi tiết để bóc tách rõ vi phạm do Âm thanh (Audio) hay Hình ảnh (Visual), tên bài hát và mốc thời gian vi phạm. | **KHÔNG** chỉ kết luận chung chung là "Dính bản quyền". | Người làm reup cần biết chính xác bản quyền dính ở đoạn nhạc nào, phút thứ mấy để thay nhạc hoặc cắt bỏ đoạn vi phạm. |
| **BẮT BUỘC** phân biệt lỗi `not_logged_in` khi bị chuyển hướng sang `accounts.google.com` và thông báo người dùng đăng nhập. | **KHÔNG** để script chạy timeout 60s khi hồ sơ chưa có phiên đăng nhập YouTube Studio. | Giúp người dùng nắm được nguyên nhân thực sự thay vì báo lỗi crash không rõ nguồn gốc. |

### 3.5. Xử Lý Đa Phương Tiện & Bộ Lọc FFmpeg (Chống Lệch Tiếng Gốc 48kHz)

| NHỮNG ĐIỀU NÊN LÀM (DO) | NHỮNG ĐIỀU TUYỆT ĐỐI TRÁNH (DON'T) | LÝ DO KỸ THUẬT & HẬU QUẢ |
| :--- | :--- | :--- |
| **BẮT BUỘC** dùng `ffprobe` trích xuất chính xác Sample Rate (`{sr}`) của audio đầu vào trước khi render. | **TUYỆT ĐỐI KHÔNG** hardcode tần số lấy mẫu `44100` Hz trong bộ lọc FFmpeg (`asetrate=44100*...`). | Video YouTube chuẩn có tần số âm thanh là 48.000 Hz. Nếu ép về 44.100 Hz, một video dài 30 phút sẽ bị lệch tiếng hơn 2.5 giây so với hình ảnh. |
| **BẮT BUỘC** áp dụng công thức bù trừ thời lượng: `asetrate={sr}*pitch,aresample={sr},atempo={speed/pitch}`. | **KHÔNG** áp dụng `asetrate` mà quên bù trừ `atempo` tương ứng với tỷ lệ `speed / pitch`. | Đảm bảo luồng âm thanh sau khi biến đổi có thời lượng khớp từng mili-giây với luồng hình ảnh `setpts=PTS/{speed}`. |
| **NÊN** chia rõ các cấp độ Reup Pipeline (Level 1: Nhẹ nhàng, tốc độ cao; Level 2: Toàn diện với lọc âm và biến đổi hình ảnh). | **KHÔNG** re-encode toàn bộ video nặng nề nếu chỉ cần xử lý lách nhẹ cho máy cấu hình yếu. | Giúp các máy tính RAM 4GB–8GB vẫn vận hành trơn tru mà không bị đơ giật. |

### 3.6. Đóng Gói Ứng Dụng Desktop (Tauri v2 & NSIS Packager)

| NHỮNG ĐIỀU NÊN LÀM (DO) | NHỮNG ĐIỀU TUYỆT ĐỐI TRÁNH (DON'T) | LÝ DO KỸ THUẬT & HẬU QUẢ |
| :--- | :--- | :--- |
| **BẮT BUỘC** sử dụng bản sao thư mục vật lý thực tế (Real Directory Copy) cho tài nguyên khai báo trong `tauri.conf.json`. | **TUYỆT ĐỐI KHÔNG** dùng NTFS Junctions hoặc Symbolic Links cho tài nguyên bundle của Tauri NSIS. | Trình đóng gói NSIS của Tauri sẽ âm thầm bỏ qua các điểm reparse point (junction/symlink). Kết quả là file cài đặt tạo ra bị thiếu file, gây lỗi trắng màn hình hoặc không chạy được engine trên máy sạch. |
| **BẮT BUỘC** đóng gói đầy đủ Python embed độc lập và static binary (`ffmpeg.exe`, `ffprobe.exe`, `deno.exe`, `yt-dlp.exe`) trong thư mục app. | **KHÔNG** phụ thuộc vào môi trường Python hoặc FFmpeg cài sẵn trong biến môi trường PATH của máy người dùng. | Đảm bảo tính "cài là chạy" (Plug-and-Play) 100% không bắt người dùng cài đặt thủ công phức tạp. |
| **BẮT BUỘC** hỗ trợ cả `camelCase` và `snake_case` trong Tauri IPC command parameters. | **KHÔNG** giả định frontend JS chỉ gửi `snake_case`; Tauri v2 mặc định tuần tự hóa `camelCase`. | Ngăn ngừa lỗi deserialization payload khiến lệnh Rust không nhận được tham số từ giao diện React. |

### 3.7. Chuẩn Mực Thiết Kế Giao Diện (Clean Flat UI & No-Emoji Policy)

| NHỮNG ĐIỀU NÊN LÀM (DO) | NHỮNG ĐIỀU TUYỆT ĐỐI TRÁNH (DON'T) | LÝ DO KỸ THUẬT & HẬU QUẢ |
| :--- | :--- | :--- |
| **BẮT BUỘC** sử dụng icon SVG đơn sắc chuẩn Lucide Icons phẳng, tối giản, chuyên nghiệp. | **TUYỆT ĐỐI KHÔNG** thêm emoji hoặc biểu tượng trang trí rối mắt (`🍳`, `💰`, `🤖`, `🎧`, `✨`, `🎮`, `⚡`, `🚀`, `🔥`, `💎`, `🎯`...) vào giao diện. | Giữ giao diện chuẩn SaaS chuyên nghiệp, không làm bẩn/rối mắt người dùng khi theo dõi dữ liệu số lượng lớn. |
| **NÊN** tổ chức giao diện phẳng, phân nhóm rõ ràng theo 6 phân hệ cốt lõi. | **KHÔNG** bày biện hàng chục tab và nút bấm thừa thãi không phục vụ giá trị cốt lõi. | Tối ưu hóa trải nghiệm người dùng, giúp thao tác trực quan và tốc độ xử lý nhanh nhất. |

---

## PHẦN 4: HỆ THỐNG BẢN QUYỀN SAAS, PHÂN QUYỀN 4 CẤP & KHÓA CỨNG HWID

Quy trình License hiện tại đã đáp ứng hoàn hảo yêu cầu quản trị doanh nghiệp, do đó **PHẢI ĐƯỢC KẾ THỪA VÀ GIỮ NGUYÊN 100%** khi phát triển dự án mới:

```
[ Máy Khách: Rust Native Core ]
   │ Đọc Hardware ID (MachineGuid + ProcessorId + MotherboardUuid)
   │ Băm SHA-256 -> hwid_hash duy nhất
   ▼
[ Mạng Cạnh: Cloudflare Workers Gateway ]
   │ Endpoint: retubematrix-gateway.dungdong333.workers.dev
   │ Xác thực JWT / Session Token, ngăn chặn giả mạo request
   ▼
[ Cơ Sở Dữ Liệu: Supabase PostgreSQL (RLS Secured) ]
   │ Bảng profiles (role, tenant_id, hwid)
   │ Bảng tenants (license_key, seats, max_seats, expires_at)
   │ Bảng license_keys (status, key_hash, activated_hwid)
```

### 4.1. Kim tự tháp phân quyền 4 cấp (Pyramid RBAC)
1. **Master Owner** (`dungdong333@gmail.com` / role `owner`):
   - Toàn quyền tối thượng trên toàn bộ hệ thống.
   - Cấp phát license key cho các tenant (công ty), tùy chỉnh số ghế (seats) và gia hạn ngày sử dụng.
   - **Đặc quyền Master Owner Bypass 100%**: Không bị giới hạn khóa cứng 1 máy, có thể đăng nhập trên bất kỳ thiết bị nào mà không bị chặn HWID.
2. **Tenant Admin**:
   - Quản trị viên của một công ty/tổ chức.
   - Quản lý danh sách thành viên thuộc tenant của mình, cấp quyền Leader/User trong phạm vi số ghế được cấp phép.
   - Khóa cứng 1 tài khoản = 1 máy theo HWID.
3. **Team Leader**:
   - Trưởng nhóm quản lý các hồ sơ kênh, giám sát quota test bản quyền của các thành viên trong nhóm.
   - Khóa cứng 1 tài khoản = 1 máy theo HWID.
4. **User / Member**:
   - Nhân viên vận hành cơ bản, chỉ được truy cập vào các profile và tác vụ được phân công.
   - Khóa cứng 1 tài khoản = 1 máy theo HWID.

### 4.2. Cơ chế khóa cứng thiết bị phần cứng (HWID Binding)
- **Thu thập phần cứng bất biến qua Win32 API (`hwid.rs`)**:
  - `MachineGuid`: Khóa Registry `HKLM\SOFTWARE\Microsoft\Cryptography`.
  - `ProcessorId`: Định danh vi xử lý CPU qua Win32 CIM/WMIC.
  - `Motherboard UUID & Serial`: Định danh bo mạch chủ từ BIOS.
- **Tạo mã băm SHA-256 duy nhất**: Kết hợp 3 giá trị trên tạo thành chuỗi định danh duy nhất của máy trạm.
- **Nguyên tắc 1 Tài Khoản = 1 Máy (Anti-Sharing)**:
  - Khi kích hoạt License lần đầu, hệ thống gắn chặt `hwid_hash` vào tài khoản trong Supabase.
  - Nếu tài khoản cố tình đăng nhập trên một máy tính có HWID khác mà không phải Master Owner, Gateway lập tức từ chối: *"Tài khoản đã được liên kết với thiết bị khác"*.
  - Chỉ Master Owner hoặc Tenant Admin mới có quyền Reset HWID cho người dùng khi họ đổi máy tính làm việc.

### 4.3. Định dạng và Quản lý License Key
- Định dạng chuẩn hóa: `RTM-{TIER}-{RANDOM_HEX}` (ví dụ: `RTM-PRO-8F2B1C4D`, `RTM-ENTERPRISE-9A3E7C1B`).
- Hỗ trợ thao tác 1-Click Copy kèm badge trực quan, gia hạn nhanh (+30, +90, +365 ngày), nâng/hạ số lượng ghế (Seats) trực tiếp từ giao diện quản trị.

---

## PHẦN 5: CẤU TRÚC THƯ MỤC & THIẾT KẾ KIẾN TRÚC TINH GỌN CHO DỰ ÁN MỚI

Để loại bỏ hoàn toàn spaghetti code, code thừa và các module chồng chéo, cấu trúc dự án mới được thiết kế chuẩn mực như sau:

```
reupytb-v2/
├── package.json                          # Scripts: dev, build, check (bun runtime)
├── tauri.conf.json                       # Cấu hình bundle, security, window size
├── vite.config.ts                        # Vite build pipeline
├── tailwind.config.js                    # Bảng màu phẳng, dark mode, không emoji
│
├── src/                                  # FRONTEND: React 19 + TypeScript + Tailwind
│   ├── assets/                           # SVG Icons (Lucide), Logo vector
│   ├── components/                       # Shared UI Components (Button, Modal, Table, Badge)
│   │   ├── ui/                           # Primitives chuẩn Radix UI
│   │   └── layout/                       # Header, Sidebar, App Shell
│   ├── contexts/                         # Global State Management
│   │   ├── AuthContext.tsx               # Auth, License & HWID Binding (Kế thừa nguyên bản)
│   │   └── AppContext.tsx                # Tiến trình tác vụ toàn cục
│   ├── features/                         # 6 Phân Hệ Nghiệp Vụ Cốt Lõi
│   │   ├── dashboard/                    # Thống kê KPI ngày, tiến trình sản xuất
│   │   ├── hunter/                       # Săn Outlier (Ikigai) & Theo dõi đối thủ RSS
│   │   ├── profiles/                     # Quản lý Profile Anti-Detect & Proxy tester
│   │   ├── reup_studio/                  # Tiền xử lý FFmpeg Lv.1/Lv.2 & Dynamic Resampler
│   │   ├── bkt/                          # Bể Test Bản Quyền, Hạn ngạch 15 video/ngày & Giám sát Content ID
│   │   └── license/                      # SaaS Master Hub, Quản trị Tenant & HWID Devices
│   ├── hooks/                            # Custom React Hooks (IPC event subscriptions)
│   ├── stores/                           # Lightweight Zustand stores (chống prop-drilling)
│   ├── i18n/                             # Đa ngôn ngữ (en, vi, zh-CN)
│   └── types/                            # TypeScript Data Contracts
│
├── src-tauri/                            # BACKEND NATIVE: Rust Core (Tauri v2)
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs                       # Entry point ứng dụng desktop
│   │   ├── lib.rs                        # Đăng ký commands & Tauri builder
│   │   ├── database/                     # SQLite rusqlite WAL mode & Schema
│   │   │   ├── mod.rs
│   │   │   └── schema.rs
│   │   ├── commands/                     # Mỏng gọn: Chỉ validate và chuyển tiếp service
│   │   │   ├── auth.rs                   # Xác thực License, kiểm tra HWID
│   │   │   ├── hunter.rs                 # Kích hoạt quét Outlier
│   │   │   ├── profiles.rs               # Quản lý cấu hình hồ sơ & proxy
│   │   │   ├── bkt.rs                    # Hàng đợi BKT & Quota kênh test
│   │   │   └── ffmpeg.rs                 # Kích hoạt worker tiền xử lý video
│   │   ├── security/
│   │   │   └── hwid.rs                   # Đọc phần cứng Windows chống giả mạo (Kế thừa nguyên bản)
│   │   └── services/                     # Business Logic (DownloadQueue, RssWatcher, BktDispatcher)
│   └── bin/                              # Bundled static binaries (ffmpeg, ffprobe, deno, yt-dlp)
│
├── engine/                               # AUTOMATION CORE: Python 3 Embed Playwright Engine
│   ├── core/
│   │   ├── browser.py                    # Khởi tạo Playwright context, proxy, CDP SSL bypass
│   │   ├── cloak.py                      # Anti-detect fingerprint injection (Canvas, Audio, WebGL)
│   │   └── dom.py                        # Deep Shadow DOM traversal & Synthetic Mouse Events
│   ├── actions/
│   │   ├── uploader.py                   # 6-step Polymer Wizard uploader & Publish anyway confirm
│   │   └── bkt_monitor.py                # In-Session Polling, Grace Period, Content ID inspector
│   ├── runner.py                         # Lightweight CLI router (< 300 dòng code)
│   └── requirements.txt
│
└── cloud/                                # SAAS BACKEND: Cloudflare Workers + Supabase
    ├── worker-gateway/                   # Edge Worker xác thực HWID & License
    └── schema.sql                        # Supabase PostgreSQL Database Schema
```

---

## PHẦN 6: KẾT LUẬN & NGUYÊN TẮC BẮT TAY VÀO REWRITE

1. **Khởi tạo thư mục mới hoàn toàn sạch**: Không copy nguyên cây thư mục cũ sang; chỉ trích xuất các thuật toán lõi đã kiểm chứng (HWID extractor, Dynamic audio resampler, Shadow DOM synthetic events).
2. **Kế thừa 100% hệ thống License & Auth**: Giữ vững thiết kế `AuthContext.tsx`, `hwid.rs` và Cloudflare Gateway hiện tại.
3. **Tuân thủ kỷ luật phát triển nghiêm ngặt**:
   - Sử dụng `bun` làm runtime.
   - Luôn kiểm tra đủ 3 bước trước khi nghiệm thu: Biome linting ➔ `tsc -b` ➔ `cargo check`.
   - Giao diện phẳng, sạch sẽ, tuyệt đối không emoji rác.
   - Thử nghiệm đóng gói NSIS trên máy tính sạch để đảm bảo không bị thiếu file runtime.
