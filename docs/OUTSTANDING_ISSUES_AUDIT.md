# Kiểm Toán Toàn Diện Các Lỗi Hệ Thống & Rủi Ro Tồn Đọng (Audit Report v1.0.0 - v1.3.3)

Tài liệu này ghi nhận toàn bộ quá trình phát hiện, chẩn đoán, xử lý các lỗi kỹ thuật và danh mục rủi ro còn tồn đọng của hệ thống **RETubeMatrix** qua tất cả các phiên bản phát hành từ v1.0.0 đến v1.3.3.

---

## 1. Bảng Tổng Hợp Trạng Thái Lỗi Qua Các Phiên Bản

| Mã Lỗi | Hạng Mục / Thành Phần | Phiên Bản Phát Sinh | Phiên Bản Đã Fix | Mức Độ | Trạng Thái |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | Python Engine: `NameError: name 'os' is not defined` | v1.2.0 | **v1.2.1** | P0 (Critical) | **Đã khắc phục hoàn toàn** |
| **BUG-02** | YouTube Studio: Không mở được hộp thoại tải video lên (`not_found_or_unstable`) | v1.0.0 - v1.2.0 | **v1.2.1** | P0 (Critical) | **Đã khắc phục hoàn toàn** |
| **BUG-03** | BKT Pipeline: Quá trình tải lên bị treo tại 0% quá 15 phút trên YouTube Studio | v1.0.8 - v1.2.0 | **v1.2.1** | P0 (Critical) | **Đã khắc phục hoàn toàn** |
| **BUG-04** | FFmpeg Reup: Lệch độ dài âm thanh +2.5s do hardcode mẫu 44.1 kHz | v1.0.0 - v1.0.10 | **v1.0.11** | P1 (High) | **Đã khắc phục hoàn toàn** |
| **BUG-05** | UI Performance: Tràn DOM (~35.000 nodes) gây đơ chuột khi mở kênh lớn | v1.0.0 - v1.0.10 | **v1.0.11** | P1 (High) | **Đã khắc phục hoàn toàn** |
| **BUG-06** | Tauri v2 IPC: Lỗi deserialization do xung đột camelCase / snake_case | v1.2.0 | **v1.2.0** | P1 (High) | **Đã khắc phục hoàn toàn** |
| **BUG-07** | Process Control: Rò rỉ tiến trình Chrome zombie chạy ngầm chiếm RAM | v1.0.5 - v1.0.9 | **v1.0.10** | P2 (Medium) | **Đã khắc phục hoàn toàn** |
| **BUG-08** | Sidebar Panel: Không hiển thị phiên bản phần mềm dưới logo RETubeMatrix | v1.0.0 - v1.2.0 | **v1.2.1** | P3 (Low) | **Đã khắc phục hoàn toàn** |
| **BUG-09** | YouTube Studio: Treo hộp thoại kiểm tra tính năng nâng cao (Feature Eligibility Freeze) | v1.0.0 - v1.3.1 | **v1.3.2** | P1 (High) | **Đã khắc phục hoàn toàn** |
| **BUG-10** | YouTube Bot Challenge: yt-dlp bị chặn `Sign in to confirm you're not a bot` khi tải video | v1.0.0 - v1.3.2 | **v1.3.3** | P0 (Critical) | **Đã khắc phục hoàn toàn** |
| **BUG-11** | UI State & ETA: Mất hiển thị tiến trình khi chuyển tab và thiếu ước lượng thời gian ETA | v1.0.0 - v1.3.2 | **v1.3.3** | P1 (High) | **Đã khắc phục hoàn toàn** |
| **BUG-12** | Deduplication: Dispatch trùng lặp video đã xuất bản lên Kênh Đích | v1.0.0 - v1.3.2 | **v1.3.3** | P1 (High) | **Đã khắc phục hoàn toàn** |
| **RISK-01**| Mạng / Proxy: YouTube chặn IP Proxy trả về HTTP 429 hoặc yêu cầu xác minh SMS | Tất cả | Chưa thể triệt tiêu 100% | P1 (High) | **Rủi ro môi trường (Cần quản lý Proxy)** |
| **RISK-02**| Kênh YouTube: Đạt ngưỡng giới hạn tải video hàng ngày (Daily Upload Limit) | Tất cả | Đã có bộ nhận diện cảnh báo | P2 (Medium) | **Giới hạn thuật toán của YouTube** |
| **RISK-03**| Render Pipeline: Khóa file video đầu ra khi FFmpeg chưa hoàn tất ghi | v1.0.0 - v1.2.0 | Đã có retry & lock check | P2 (Medium) | **Đã phòng vệ (Cần giám sát I/O)** |
| **RISK-04**| YouTube Studio UI Drift: Google thay đổi cấu trúc Web Components / Shadow DOM | Tất cả | Đã dùng fallback 3 tầng | P2 (Medium) | **Rủi ro định kỳ từ Google** |

---

## 2. Chi Tiết Các Lỗi Đã Khắc Phục (Resolved Issues)

### BUG-01: `NameError: name 'os' is not defined` trong `upload_actions.py`
- **Hiện tượng**: Khi kích hoạt Auto-Reup hoặc đăng video kiểm tra bản quyền, tiến trình báo lỗi đỏ rực: `BKT: Lỗi (name 'os' is not defined)` ngay khi vừa mở hồ sơ.
- **Nguyên nhân gốc rễ**: Tại bước kiểm tra tồn tại và kích thước file video trước khi upload (`os.path.exists`, `os.path.getsize`), lập trình viên đã thêm kiểm tra an toàn nhưng thiếu câu lệnh `import os` ở đầu tệp `upload_actions.py`.
- **Giải pháp xử lý**: Đã bổ sung `import os` vào cả `browser_engine/actions/upload_actions.py` và `roots/browsermulti/actions/upload_actions.py`.

### BUG-02: Không mở được hộp thoại tải video lên (`reason=not_found_or_unstable`)
- **Hiện tượng**: Trình duyệt điều hướng tới trang Nội dung kênh (`.../channel/UC.../videos/upload`), tìm nút Tạo / Tải lên nhưng báo lỗi `not_found_or_unstable` và dừng tiến trình.
- **Nguyên nhân gốc rễ**:
  1. Selector menu item sử dụng cú pháp giả lập riêng của Playwright `:has-text('Upload')`, `:has-text('Tải')`. Khi chuyển xuống hàm đánh giá DOM thuần của trình duyệt (`node.matches`), JavaScript ném ngoại lệ `SyntaxError` và bị nuốt chửng, dẫn đến không tìm thấy nút.
  2. Ranh giới Web Components Shadow DOM của `<ytcp-text-menu>` chặn selector phân cấp dạng `root_selector="ytcp-text-menu tp-yt-paper-dialog"`.
  3. Khi menu xổ xuống bị lỗi, fallback cũ chỉ tìm `#upload-button` (nút này chỉ xuất hiện ở kênh trống chưa có video nào, trên kênh đã có video thì nút này hoàn toàn không tồn tại).
- **Giải pháp xử lý**: Xây dựng kiến trúc 3 tầng mở hộp thoại kiên cố:
  - Tầng 1: Click nút Create qua Playwright piercing locator `#create-icon, button[aria-label*='Tạo' i], button[aria-label*='Create' i]`.
  - Tầng 2: Chọn mục đầu tiên trong menu xổ xuống đa ngôn ngữ bằng locator trực tiếp `tp-yt-paper-dialog[opened] tp-yt-paper-item, #text-item-0`.
  - Tầng 3: Deep Shadow DOM JavaScript event dispatch kích hoạt thẳng sự kiện click nếu có overlay che khuất.

### BUG-03: Quá trình tải lên bị treo tại 0% quá 15 phút trên YouTube Studio
- **Hiện tượng**: BKT Pipeline tải video lên, nhưng lịch sử tiến trình liên tục ghi nhận `Quá trình tải lên bị treo tại 0% quá 15 phút trên YouTube Studio (không có tiến triển) -- đã dừng để tránh treo hàng đợi`.
- **Nguyên nhân gốc rễ**:
  1. Trong `js_lib.py`, hàm dò tìm nút Hủy tải lên (`cancelUploadVisible`) quét quá rộng, bắt nhầm các nút chức năng khác trên hàng video khiến `cancelUploadVisible` luôn là `True`.
  2. Khi video đã tải từ máy lên server Google 100% và chuyển sang bước xử lý (SD Processing / Content ID Checking), trên Studio không còn số `%` tải lên. Nhưng do `cancelUploadVisible = True`, hệ thống bị ép hiểu nhầm là video vẫn đang trong pha tải lên và gán `upload_percent_snapshot = 0%`.
  3. Sau 900 giây (15 phút) không thấy % tăng, hệ thống tự kích hoạt timeout an toàn và ném exception.
- **Giải pháp xử lý**:
  - Chuẩn hóa chính xác selector của nút Hủy tải lên (`#cancel-upload-button`, `cancel-upload`).
  - Mở rộng 14 chữ ký nhận diện trạng thái xử lý/kiểm tra bản quyền mới của Studio 2026.
  - Thiết lập cơ chế chuyển giao tự động: Nếu sau 45 giây không còn số liệu % tải lên tăng, hệ thống tự động xác nhận pha upload stream đã hoàn tất và chuyển thẳng sang bước kiểm tra Content ID.

### BUG-04: Lệch âm thanh 2.5s khi lách bản quyền video
- **Hiện tượng**: Video sau khi qua bộ lọc lách bản quyền MD5/Pitch bị lệch tiếng so với hình khoảng 2.5 giây trên YouTube.
- **Nguyên nhân gốc rễ**: Hardcode tần số lấy mẫu `44100` Hz trong bộ lọc FFmpeg `asetrate=44100*...`, trong khi phần lớn video YouTube nguồn có tần số 48.000 Hz.
- **Giải pháp xử lý**: Đo tần số mẫu thực tế bằng FFprobe trước khi render và áp dụng công thức: `asetrate={sr}*pitch,aresample={sr},atempo={speed/pitch}`.

### BUG-05: Đơ giao diện khi mở accordion kênh có nhiều video
- **Hiện tượng**: Kênh có 500-1000 video khi mở accordion làm trình duyệt bị đơ chuột 5-10 giây.
- **Nguyên nhân gốc rễ**: DOM render đồng thời hơn 35.000 phần tử HTML cùng lúc, kèm theo các thao tác tìm kiếm mảng $O(N^2)$.
- **Giải pháp xử lý**: Áp dụng Chunked Virtual Rendering (nạp 30 video mỗi lần cuộn) và tối ưu hóa Map tra cứu trạng thái $O(1)$, giảm 97% số lượng node DOM hoạt động.

### BUG-09: Treo hộp thoại kiểm tra tính năng nâng cao (Feature Eligibility Freeze) trên YouTube Studio
- **Hiện tượng**: Tiến trình tải video lên YouTube Studio bị đứng vô thời hạn khi xuất hiện popup kiểm tra điều kiện sử dụng tính năng nâng cao (`ytcp-feature-eligibility-dialog`).
- **Nguyên nhân gốc rễ**: Popup này xuất hiện bất ngờ đè lên wizard tải lên nhưng không nằm trong danh sách modal được bộ dọn dẹp nhận diện.
- **Giải pháp xử lý**: Bổ sung bộ nhận diện và tự động đóng modal `ytcp-feature-eligibility-dialog` trong `modals.py` và `upload_actions.py` trên phiên bản v1.3.2.

### BUG-10: YouTube Bot Challenge khi tải video kênh qua yt-dlp
- **Hiện tượng**: Khi tải video từ một số kênh hoặc video mới, yt-dlp báo lỗi `ERROR: [youtube] ...: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication`. Tiến trình tải thất bại và nút quay về trạng thái ban đầu.
- **Nguyên nhân gốc rễ**: YouTube kích hoạt thuật toán phát hiện bot khi yêu cầu xuất phát từ địa chỉ IP datacenter hoặc thiếu phiên cookie người dùng thực tế.
- **Giải pháp xử lý**: Tích hợp hàm `resolve_test_profile_cookie_arg_safe` trong backend Rust (v1.3.3), tự động quét thư mục profile test của ứng dụng (`browser_engine/profiles/*/Default/Network/Cookies`) và tiêm cờ `--cookies-from-browser chrome:<path>` vào yt-dlp, loại bỏ hoàn toàn lỗi bot challenge.

### BUG-11: Mất hiển thị tiến trình khi chuyển đổi tab và thiếu ước lượng thời gian ETA
- **Hiện tượng**: Khi chuyển sang tab khác trong quá trình tải hoặc render video rồi quay lại, thông tin tiến độ bị biến mất khiến người dùng không biết tác vụ có còn hoạt động hay không; không có thời gian dự kiến hoàn tất (ETA).
- **Nguyên nhân gốc rễ**: Trạng thái tiến trình chỉ được lưu trong state cục bộ của component và bị unmount khi rời tab; thiếu công thức tính toán thời gian còn lại chuẩn hóa.
- **Giải pháp xử lý**: Xây dựng thanh trạng thái nổi `GlobalActiveTasksDock.tsx` gom nhóm toàn bộ tác vụ ngầm (Tải, Render, BKT) duy trì liên tục qua chuyển đổi route, kết hợp bộ tính toán `formatEta` và `calculateRemainingSeconds` trên toàn bộ các khâu.

### BUG-12: Dispatch trùng lặp video đã xuất bản lên Kênh Đích
- **Hiện tượng**: Người dùng có thể vô tình bấm tải hoặc điều phối reup lại một video đối thủ đã được xuất bản thành công lên kênh chính trước đó.
- **Nguyên nhân gốc rễ**: Thiếu cờ liên kết trạng thái xuất bản giữa bảng `bkt_test_jobs` và bảng `channel_videos`.
- **Giải pháp xử lý**: Bổ sung cột `target_published`, `target_video_id`, `target_profile_id`, `target_published_at` vào bảng `channel_videos` cùng khóa chặn logic trong `useChannelVideoWorkflows.ts`, khóa hành động và thông báo trực quan nếu video đã được xuất bản thành công.

---

## 3. Danh Mục Các Lỗi & Rủi Ro Còn Tồn Đọng (Outstanding & Potential Risks)

Dưới đây là các rủi ro hệ thống phụ thuộc vào môi trường bên ngoài (Google, mạng mạng, phần cứng) mà người dùng và kỹ thuật viên cần lưu ý:

### RISK-01: Rủi ro chặn Proxy / HTTP 429 / Yêu cầu xác minh SMS (Mức độ: P1)
- **Mô tả**: Khi chạy nhiều profile YouTube Studio đồng thời trên cùng một dải IP hoặc dùng proxy datacenter chất lượng thấp, Google có thể yêu cầu giải CAPTCHA hoặc gửi mã SMS xác minh danh tính.
- **Hệ quả**: Trình duyệt dừng ở màn hình xác minh, Playwright không thể tự vượt qua do quy tắc bảo mật của Google.
- **Hướng xử lý & Khuyến nghị**:
  1. Người dùng cần mở Profile độc lập bằng nút "Mở Profile" trên giao diện để tự đăng nhập và vượt xác minh một lần duy nhất.
  2. Sử dụng Proxy dân cư (Residential Proxy / Mobile Proxy xoay IP sạch) cho từng profile riêng biệt.

### RISK-02: Giới hạn số lượng video tải lên hàng ngày (Daily Upload Limit) (Mức độ: P2)
- **Mô tả**: Các kênh YouTube mới tạo hoặc chưa kích hoạt tính năng nâng cao (Advanced Features) bị YouTube giới hạn chỉ được tải lên từ 1 đến 10 video mỗi ngày. Khi vượt quá, Studio hiển thị popup "Đã đạt đến giới hạn số lượng video tải lên hàng ngày".
- **Hệ quả**: Không thể tải thêm video mới cho đến 00:00 ngày hôm sau theo giờ Thái Bình Dương.
- **Hướng xử lý**: Hệ thống RETubeMatrix đã tích hợp hạn ngạch an toàn mặc định (15 video/kênh/ngày cho kênh test) và bộ nhận diện popup lỗi để dừng hàng đợi mà không làm crash tiến trình.

### RISK-03: Khóa file video đầu ra khi FFmpeg chưa hoàn tất (Mức độ: P2)
- **Mô tả**: Trên các máy tính có ổ cứng HDD hoặc tốc độ ghi chậm, khi kích hoạt song song vừa Render vừa Upload, file `.mp4` có thể vẫn đang bị tiến trình FFmpeg giữ khóa ghi (file lock).
- **Hệ quả**: Python ném lỗi `PermissionError: File video đang bị khóa bởi tiến trình khác`.
- **Hướng xử lý**: RETubeMatrix v1.2.1 đã bổ sung bước thăm dò đọc nhị phân 512 bytes đầu tiên của file video trước khi upload; nếu file đang bị khóa, hệ thống sẽ chờ thử lại tối đa 3 lần thay vì văng lỗi ngay lập tức.

### RISK-04: Biến động cấu trúc giao diện YouTube Studio (UI Drift) (Mức độ: P2)
- **Mô tả**: Google thường xuyên cập nhật A/B testing giao diện Studio (thay đổi thứ tự các bước trong wizard upload hoặc đổi tên class Lit Web Components).
- **Hệ quả**: Các selector cũ có thể bị mất hiệu lực nếu không được cập nhật kịp thời.
- **Hướng xử lý**: RETubeMatrix áp dụng thiết kế đa tầng (Playwright piercing locators kết hợp duyệt đệ quy Shadow DOM), tự động thích ứng với cả 2 phiên bản giao diện Studio cũ và mới.

---

## 4. Ma Trận Phân Loại Mức Độ Nghiêm Trọng (Severity Matrix)

| Mã Lỗi / Rủi Ro | Phân Loại | Nguyên Nhân Kỹ Thuật | Kịch Bản Phát Sinh | Giải Pháp Xử Lý Triệt Để |
| :--- | :---: | :--- | :--- | :--- |
| **Studio DOM Mutation Block** | **P0** | Google đổi tên thẻ hoặc cấu trúc Shadow DOM của Upload Dialog / Wizard steps | YouTube cập nhật phiên bản Studio trên toàn cầu | Duy trì bộ lọc đa tầng (Piercing Locator + Recursive JS Evaluation + Fallback coordinates). Bật cảnh báo chẩn đoán UI để cập nhật selector kịp thời. |
| **YouTube IP 429 / BotGuard Block** | **P0** | Tần suất gửi request yt-dlp hoặc Studio reload quá nhanh từ 1 địa chỉ IP | Chạy quét nhiều kênh hoặc chạy BKT liên tục mà không dùng Proxy sạch | Tích hợp thuật toán Exponential Backoff, phân luồng Proxy độc lập trên từng profile, phát cảnh báo đổi Proxy khi gặp HTTP 429. |
| **Windows AV File Lock (Race Condition)** | **P1** | Windows Defender quét tệp media vừa render, chặn quyền mở file | Ngay sau khi FFmpeg hoàn tất xuất file MP4 | Thêm vòng lặp kiểm tra sẵn sàng tệp (File Availability Loop) thử mở file với Exponential Backoff (tối đa 5 lần, mỗi lần 500ms). |
| **Daily Upload Limit Trap** | **P1** | Kênh test BKT hết hạn ngạch tải lên trong ngày của YouTube | Kênh test vượt quá quota 15 video/ngày hoặc bị giới hạn bởi YouTube | Bắt chính xác thông báo "Daily upload limit reached" trong Studio DOM, tự động đánh dấu kênh test là `quota_exhausted` và chuyển sang kênh khác. |
| **Profile SingletonLock Collision** | **P2** | Chromium bị đóng cưỡng bức để lại file lock trong thư mục User Data | App bị tắt bất thường trong lúc đang chạy Studio | Tự động kiểm tra và dọn dẹp các tệp `SingletonLock`, `SingletonCookie` trước khi khởi chạy hồ sơ mới nếu PID cũ không còn tồn tại. |
| **Proxy SSL Stalling** | **P2** | Proxy dân cư bị ngắt kết nối giữa chừng hoặc handshake SSL bị lỗi thời | Mạng proxy chập chờn khi đang upload video dung lượng lớn | Kích hoạt cờ heartbeat 10s, thiết lập timeout đọc mạng trên Proxy Bridge và tự động chuyển trạng thái fail-fast sau 60s mất kết nối. |
| **SQLite Busy under Heavy Concurrency** | **P3** | Nhiều luồng worker (RSS polling, BKT pipeline, Download queue) ghi DB đồng thời | Cấu hình theo dõi nhiều hơn 20 kênh cùng lúc | Kích hoạt `PRAGMA busy_timeout = 5000` và đảm bảo mọi transaction ghi dữ liệu được gói gọn ngắn nhất có thể. |

---

## 5. Hướng Dẫn Kiểm Tra & Vận Hành Khuyến Nghị

1. **Cài đặt bản phát hành v1.2.1**: Chạy file `RETubeMatrix_1.2.1_x64-setup.exe` (hoặc `.msi`) để cập nhật toàn bộ engine đã được vá.
2. **Kiểm tra trạng thái Profile**: Trước khi chạy Auto-Reup, hãy bấm mở từng profile kênh test để xác nhận trạng thái đăng nhập YouTube Studio luôn hiển thị sẵn sàng.
3. **Theo dõi thanh tiến trình**: Phiên bản 1.2.1 hiển thị đầy đủ tốc độ tải xuống (MiB/s), dung lượng đã tải và thời gian ước tính còn lại (ETA) ngay trên giao diện thẻ kênh.
