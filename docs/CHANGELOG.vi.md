# Nhật ký thay đổi

Tất cả thay đổi đáng chú ý của RETubeMatrix sẽ được ghi lại trong file này.

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.20.16] - 2026-11-06

### Thay đổi

- **Chuyển thương hiệu RETubeMatrix** - Updater trỏ tới `DungDT293/RETUBEMATRIX`; deep link dùng `retubematrix://` (vẫn nhận `youwee://` cũ); CLI, extension và SDK đổi tên thành `retubematrix`.
- **Tiền tố biến môi trường plugin** - Thêm `RETUBEMATRIX_*`, giữ alias `YOUWEE_*` cho plugin cũ.

### Sửa lỗi

- **Kiểm tra cập nhật nền** - Tự động kiểm tra update không còn hiện dialog lỗi khi endpoint chưa có release hoặc mất mạng; chỉ báo lỗi khi người dùng kiểm tra thủ công.

### Xóa bỏ

- **Dọn tính năng không dùng** - Xóa các trang Download, Gallery, Metadata, Processing, Subtitles, Summary không còn truy cập được; xóa module Rust gallery/metadata/processing và 32 module Python không dùng trong `browser_engine`.

## [0.20.15] - 2026-11-05

### Thêm mới

- **Quy trình Tự Động Hóa 100% Zero-Touch Auto-Pilot** - Triển khai luồng tự động 1-Click khép kín từ Reup Lv1 -> AI Tiêu đề (95/5 word boundary) & Mô tả 3 tầng -> Tự nạp companion thumbnail -> Upload kênh BKT (unlisted) -> Adaptive Studio Restrictions Polling (tối đa 25 lần / 10-12 phút) -> Tự động Publish sang Kênh Chính khi xác nhận `green_clean`
- **Tự động xuất Thumbnail .jpg độc lập đi kèm video** - Bổ sung `--write-thumbnail --convert-thumbnails jpg` trong `download.rs` giúp yt-dlp luôn lưu giữ ảnh `.jpg` rời bên cạnh video để đưa vào tham số upload YouTube Studio
- **Chu kỳ giám sát Studio thông minh (Adaptive Polling)** - Nâng cấp toàn diện cơ chế quét bản quyền hỗ trợ tối đa 25 chu kỳ (mỗi 25s, tổng 10-12 phút) bám sát các khâu xử lý thực tế của YouTube ("Processing SD/HD..." -> "Checks in progress..." -> "None / Copyright claim"), không bao giờ báo sạch ảo hay timeout quá sớm
- **Nút 'Đưa vào Reup & Test BKT' từ Thư viện** - Thêm nút thao tác nhanh trong menu 3 chấm của video đã tải, tự động nạp video và thumbnail vào trang Reup
- **Bảo vệ chống crash URL mạng trong Reup** - Nhận diện URL YouTube trong Reup, chặn FFmpeg crash và cung cấp nút "Tải về máy" 1-Click

### Sửa lỗi

- **AI Tiêu Đề 95/5 Chuẩn Tiếng Việt & Điểm CTR Động (TC-25)** - Thay thế thuật toán cắt ký tự thô bằng ngắt ranh giới từ (word boundary) an toàn cho âm tiết tiếng Việt, tích hợp kho 25+ mẫu hook qua 5 phong cách (tò mò, bí mật, khẩn cấp, giá trị, CTA), tính điểm CTR động (+15% đến +49%), xoay vòng seed và nút 1-click Áp dụng vào video BKT/Kênh Chính
- **Cấu hình tải Phụ đề (CC) trong Clean Downloader (TC-29)** - Thêm nút CC, popover chọn chế độ (tắt/tự động/thủ công), ngôn ngữ, nhúng phụ đề và định dạng trong Downloader, chuyển tiếp vào `download_video`
- **Chuẩn hóa tên kênh @Handle & Gradient Initials Avatar (TC-09)** - Tự động làm đẹp tên kênh từ `@Handle` và URL; tạo avatar chữ cái đầu gradient chuyên nghiệp khi kênh chưa có ảnh đại diện
- **Đa ngôn ngữ BKT Error Keys (TC-36)** - Bổ sung đầy đủ `bktLoginRequired`, `bktTimeout`, `bktQuotaExceeded` cho 10 ngôn ngữ còn thiếu
- **Trợ năng nút Refresh yt-dlp (TC-34)** - Thêm `aria-label` và `title` cho nút refresh trong `DependenciesSection.tsx`
- **Khắc phục lỗi đơ click trong Tester Guide & Mở rộng 44 kịch bản** - Sửa lỗi đệ quy trong `safeStorage` của `TESTER_GUIDE_RETUBEMATRIX.html` và mở rộng bộ test case lên 44 ca

## [0.20.14] - 2026-11-04

### Sửa lỗi

- **Tự động giới hạn chiều cao lưới sắp xếp cửa sổ (TC-06)** - Khắc phục triệt để lỗi tràn đáy màn hình khi sắp xếp profile theo lưới nhiều hàng (như preset "2 cột"). Chiều cao và chiều rộng cửa sổ được tự động co giãn (`max_h = (screen_h - (rows - 1) * gap) // rows`), đảm bảo 100% cửa sổ luôn nằm gọn trong vùng làm việc màn hình, không bị chìm xuống dưới thanh taskbar. Truyền đầy đủ tham số `columns` và `gap` từ `runner.py`
- **Đồng bộ dữ liệu từ Săn Đề Xuất sang Reup & Test BKT (TC-17)** - Khắc phục tình trạng bấm "Test BKT" chỉ chuyển trang mà không điền thông tin video. Cả tiêu đề và URL video đề xuất đều được lưu qua `sessionStorage` và tự động điền vào Tab 1 (`inputVideoPath`) cùng Tab 2 (`uploadVideoPath` và `uploadTitle`)
- **Xuất ảnh bìa Thumbnail Canvas và Tải file về máy (TC-26)** - Triển khai thuật toán vẽ HTML5 Canvas off-screen với đầy đủ bộ lọc biến đổi hình ảnh (độ tương phản, độ sáng, độ bão hòa, zoom dời pixel chống quét hash, tone màu). Tạo blob PNG chuẩn và tự động tải file ảnh về máy tính (`optimized_thumbnail_<timestamp>.png`)
- **Tự động tải trước thông tin video sau 500ms debounce (TC-27)** - Tích hợp bộ đệm 500ms trong `UniversalUrlInput.tsx` tự động gọi lệnh lấy thông tin video và hiển thị thẻ xem trước `VideoPreview` (tiêu đề, ảnh bìa, thời lượng, độ phân giải) ngay khi dán link trước khi bấm Thêm
- **Bộ cài NSIS tự động đóng tiến trình con & Nâng cấp an toàn** - Nâng cấp `template.nsi` tự động đóng sạch toàn bộ các tiến trình phụ (`RETubeMatrix.exe`, `retubematrix-yt-dlp.exe`, `browsermulti.exe`, `python.exe`, `msedgewebview2.exe`) và thực thi gỡ cài đặt ngầm yên lặng, chấm dứt hoàn toàn hiện tượng báo lỗi "Unable to uninstall!" khi cài đè
- **Khắc phục chặn LocalStorage trên file:// trong Tester Guide** - Tích hợp lớp bọc `safeStorage` trong `TESTER_GUIDE_RETUBEMATRIX.html` tự động chuyển sang bộ nhớ đệm khi trình duyệt chặn `localStorage` dưới giao thức `file:///`, đảm bảo tất cả nút bấm, bộ lọc và ghi chú luôn hoạt động 100%

## [0.20.13] - 2026-11-04

### Sửa lỗi

- **Sắp xếp cửa sổ thuần ctypes & Phân giải đường dẫn hồ sơ** - Xóa bỏ hoàn toàn phụ thuộc vào `win32gui` / `win32process` (`pywin32`) bằng cách triển khai thuật toán tìm cửa sổ thuần `ctypes` qua Windows API (`EnumWindows` kết hợp `OpenInputDesktop`). Tự động phân giải đường dẫn tuyệt đối `profile_data_dir`, khắc phục triệt để lỗi "Không tìm thấy cửa sổ Chromium đúng hồ sơ để sắp xếp"
- **Xác thực và chọn kênh YouTube ưu tiên trong BKT** - Nâng cấp toàn diện `ensure_preferred_youtube_channel` với bộ chuẩn hóa linh hoạt (`_normalize_clean`), hỗ trợ so khớp chính xác cả khi handle thiếu ký tự `@`, tên kênh, URL hoặc định dạng viết hoa thường. Bổ sung cơ chế đọc trực tiếp header tài khoản đang hoạt động (`ytd-active-account-header-renderer`) giúp nhận diện tức thì ngay cả trên các tài khoản Google chỉ có duy nhất 1 kênh
- **Loại bỏ tiến trình Zombie & Polling ngầm trạng thái Profile** - Lọc bỏ các tiến trình phụ có tham số `--type=` khỏi `chrome_pids_by_user_data_dir` để chỉ tiến trình trình duyệt gốc quyết định trạng thái hoạt động. Bổ sung bộ đếm polling ngầm 4 giây trên `ProfilesPage.tsx` giúp UI tự động đồng bộ về "Đã dừng" ngay khi tắt cửa sổ Chrome bên ngoài
- **Hỗ trợ đa ngôn ngữ giao diện YouTube Studio** - Bổ sung selector song ngữ Anh - Việt ("Create" / "Tạo", "Upload videos" / "Tải video lên", icon upload) trong `upload_actions.py` đảm bảo thao tác tải video luôn mượt mà

## [0.20.12] - 2026-11-04

### Sửa lỗi

- **Tự động đóng tiến trình khi cài đặt/nâng cấp NSIS** - Khắc phục triệt để hộp thoại lỗi `[!] Unable to uninstall!` khi người dùng cài đè phiên bản mới trong khi app hoặc tiến trình con đang chạy. Tích hợp lệnh đóng tự động an toàn cho `RETubeMatrix.exe`, `retubematrix-yt-dlp.exe`, và `browsermulti.exe` trong `template.nsi` trước khi thực thi bộ gỡ hoặc chép đè tệp
- **Khắc phục lỗi khởi tạo file Tester Guide** - Xử lý dứt điểm tình trạng click không ăn trên file `TESTER_GUIDE_RETUBEMATRIX.html` bằng cách kiểm tra trạng thái `document.readyState`, đảm bảo giao diện luôn nạp mượt mà 100% khi mở trực tiếp qua giao thức `file://` hoàn toàn offline

### Thêm mới

- **Bộ kiểm thử toàn diện chi tiết từng nút bấm** - Mở rộng bảng kiểm thử trong `TESTER_GUIDE_RETUBEMATRIX.html` bao quát từ tổng quan đến chi tiết từng nút bấm, trường nhập liệu, thanh trượt, modal và edge-case của toàn bộ 9 phân hệ chức năng

## [0.20.11] - 2026-11-04

### Sửa lỗi

- **Khắc phục triệt để Deadlock mở Kênh Test & Quản lý Profile** - Xóa bỏ hoàn toàn race condition khi hàm truy vấn danh sách hồ sơ `action_list_profiles` tự ý kill trình duyệt đang khởi động khi cửa sổ chưa kịp hiển thị. Chuyển đổi sang cơ chế kiểm tra an toàn theo PID (`psutil.pid_exists`) không can thiệp tiến trình
- **Dọn dẹp cây tiến trình đệ quy** - Nâng cấp `_clean_profile_locks` để kill sạch toàn bộ cây tiến trình con (`proc.children(recursive=True)`), chấm dứt hoàn toàn tình trạng để lại các tiến trình mồ côi `BrowserMulti` treo ngầm trong Task Manager
- **Tự động phục hồi phiên khởi chạy Chromium** - Bổ sung cơ chế tự dọn dẹp các tiến trình ngầm không có cửa sổ trong `session.start` thay vì ném lỗi `RuntimeError` gây kẹt trạng thái "Đang chạy" ảo
- **Quét tiến trình an toàn** - Bắt ngoại lệ `psutil.AccessDenied` và `psutil.NoSuchProcess` trong `chrome_pids_by_user_data_dir` và bổ sung nhận diện tên tiến trình `browsermulti`
- **Kế thừa dữ liệu từ cơ sở dữ liệu cũ** - Tự động đồng bộ và nạp dữ liệu các kênh test, kênh theo dõi và video từ `youwee.db` cũ sang `retubematrix.db` mới

### Thêm mới

- **Bảng Kiểm Thử Toàn Diện Cho Tester** - Cập nhật hoàn chỉnh `TESTER_GUIDE_RETUBEMATRIX.html` với 40 ca kiểm thử chi tiết từ bao quát đến từng nút bấm, kèm trường mục cần test (`targetElement`), nút 1-click copy dữ liệu mẫu (`samplePayload`), và cảnh báo lỗi tiềm ẩn

## [0.20.10] - 2026-11-04

### Thêm mới

- **Kiểm định cửa sổ hiển thị thực tế** - Tích hợp hàm Win32 `has_profile_windows` (`EnumWindows`, `IsWindowVisible`) để phát hiện chính xác cửa sổ Chromium thực sự của người dùng thay vì chỉ dựa vào PID tiến trình chạy ngầm

### Sửa lỗi

- **Khắc phục trạng thái hồ sơ hiển thị sai "Đang chạy"** - Sửa lỗi hồ sơ vẫn báo "Đang chạy" dù người dùng đã đóng trình duyệt do các tiến trình phụ của Chromium (crashpad, utility, gpu) còn treo ngầm. Hệ thống giờ đây tự động dọn dẹp khóa (`SingletonLock`, `lockfile`, `browsermulti_session.pid`) và ngắt tiến trình zombie khi liệt kê hồ sơ, đưa về trạng thái "Đã dừng" chuẩn xác
- **Tối ưu khởi chạy đồng thời Kênh Test và Quản lý Profile** - Ngăn chặn xung đột file khóa khi mở liên tiếp kênh test BKT và hồ sơ trình duyệt, đảm bảo Chromium mở mượt mà và tự động đưa lên trước màn hình

### Thay đổi

- **Đồng bộ nhận diện thương hiệu RETubeMatrix 100%** - Hoàn tất chuyển đổi tên file thực thi (`RETubeMatrix.exe`), công cụ tải (`retubematrix-yt-dlp.exe`), giao thức (`retubematrix://`), storage key và toàn bộ 13 bộ ngôn ngữ i18n


## [0.20.9] - 2026-11-04

### Thêm mới

- **Quét Toàn Bộ Ngách Ngon 1-Click** - Bổ sung nút "⚡ Quét Toàn Bộ Ngách Ngon" giúp quét đồng loạt 7 cụm ngách vàng Ikigai chỉ với một thao tác
- **Phân loại ngách bằng Filter Pills** - Thêm thanh lọc ngách trực quan trên giao diện Săn Đề Xuất giúp xem video theo từng ngách hoặc toàn bộ
- **Động cơ mở trình duyệt hệ thống** - Bổ sung lệnh Tauri `open_external_url` gọi trực tiếp Windows ShellExecute (`rundll32 url.dll,FileProtocolHandler`), đảm bảo mọi liên kết luôn mở trên Google Chrome/Edge/Firefox của máy tính
- **Bộ chặn liên kết toàn diện (Global Interceptor)** - Bắt mọi thao tác click link ngoài và thẻ `target="_blank"` trên toàn ứng dụng để chuyển hướng ra trình duyệt ngoài, không mở tab WebView nội bộ

### Sửa lỗi

- **Định dạng thời gian đăng chuẩn YouTube** - Chuyển đổi hiển thị số giờ khổng lồ (như `48940h trước`) thành thời gian tự nhiên (ngày, tuần, tháng, năm trước) kèm tooltip ngày giờ chính xác khi rê chuột
- **Khắc phục nút "Xem" video** - Sửa toàn diện các nút "Xem" trong Săn Đề Xuất, Phân tích đối thủ và Mở Google Trends không còn bị kẹt tab nội bộ
- **Tối ưu bộ lọc ngách trường tồn** - Nới lỏng các điều kiện lọc trong cơ sở dữ liệu SQLite và động cơ Python giúp các ngách nhạc nền vlog, thư giãn, học bài tìm kiếm ra kết quả bứt phá thực tế

## [0.20.8] - 2026-11-03

### Thêm mới

- **Săn Đề Xuất chuẩn Ikigai** - Tái cấu trúc toàn bộ Chức năng 5 theo mô hình Ikigai Nhật Bản (Nhu cầu người xem, Khả năng làm đều, Đường kiếm tiền) cùng 3 phân nhóm ngách chiến lược và hỗ trợ ngách tự chọn
- **4 Công cụ kiểm chứng ngách thực chiến** - Tích hợp YouTube Alphabet Autosuggest A-Z (tiền tố/hậu tố/câu hỏi), Google Trends YouTube Search 12 tháng, chỉ số cơ hội Content Gap, và Phân tích kênh đối thủ kèm đo vận tốc view VPH
- **Xóa sạch dữ liệu đề xuất cũ** - Thêm nút thao tác nhanh trên UI và lệnh IPC `clear_all_outliers_cmd` để xóa hoàn toàn dữ liệu đề xuất cũ khỏi cơ sở dữ liệu SQLite

### Sửa lỗi

- **Mở rộng thanh điều hướng Sidebar** - Tăng chiều rộng menu bên trái lên 248px và xử lý hiển thị để tên ứng dụng RETubeMatrix không còn bị mất chữ "x"
- **Xử lý xung đột biểu tượng kính lúp** - Đồng bộ ô tìm kiếm hồ sơ trong ProfilesPage với component Input chuẩn, giải quyết dứt điểm lỗi kính lúp đè lên chữ placeholder
- **Bộ icon Windows đa kích thước** - Tạo file `icon.ico` chuẩn 7 kích thước (16x16 đến 256x256), khai báo `installerIcon` trong NSIS và đặt window icon lúc khởi động để taskbar và desktop hiển thị logo RETubeMatrix mới
- **Loại bỏ từ khóa ngách gán cứng** - Xóa bỏ triệt để từ khóa gán cứng cũ ("kể chuyện bí ẩn"), đảm bảo thuật toán quét đúng ngách người dùng đã chọn

### Sửa lỗi

- **Mở rộng thanh điều hướng Sidebar** - Tăng chiều rộng menu bên trái từ 180px lên 224px, khắc phục triệt để lỗi tên ứng dụng bị cắt cụt ("RETubeMatri") và mang lại không gian hiển thị rộng rãi, cân đối cho các mục menu tiếng Việt
- **Xử lý xung đột biểu tượng kính lúp** - Đưa `.input-field` vào `@layer components` trong CSS và thiết lập khoảng đệm `padding-left` độc lập cho ô tìm kiếm hồ sơ, chấm dứt hoàn toàn tình trạng chữ đè lên kính lúp
- **Đồng bộ biểu tượng Taskbar & Desktop** - Tái tạo file icon đa kích thước (`icon.ico` chứa đủ 7 độ phân giải chuẩn từ 16x16 đến 256x256), bổ sung cơ chế theo dõi file trong `build.rs` và xóa bộ nhớ đệm biên dịch cũ để Desktop và thanh Taskbar hiển thị logo RETubeMatrix mới

### Thay đổi

- **Đồng bộ tài liệu và dự án RETubeMatrix** - Hoàn thiện tài liệu README và cấu hình xuất bản cho kho lưu trữ chính thức RETubeMatrix

## [0.20.6] - 2026-11-03

### Thêm mới

- **Bộ nhận diện thương hiệu RETubeMatrix** - Đồng bộ tên thương hiệu chính thức RETubeMatrix trên toàn bộ thanh tiêu đề, menu điều hướng và trang Cài đặt; loại bỏ toàn bộ liên kết Donate và badge của Youwee cũ, thay bằng Card ma trận kiến trúc động cơ RETubeMatrix
- **Phân loại 6 file log chuyên biệt** - Tự động ghi nhật ký vận hành thành 6 file riêng biệt (`download.log`, `channels.log`, `bkt_test.log`, `outlier.log`, `reup.log`, `ai.log`) trong thư mục ứng dụng
- **Bộ tài liệu kiểm thử tương tác trực quan** - Cung cấp file `TESTER_GUIDE_RETUBEMATRIX.html` trực quan với 9 tab chức năng, chế độ tập trung 1 việc duy nhất (Focus Runner), thống kê KPI thời gian thực và chuyển đổi giao diện Sáng/Tối

### Sửa lỗi

- **Khắc phục Deadlock kênh test BKT** - Loại bỏ hoàn toàn deadlock native SQLite Mutex trong `save_bkt_test_channel_db` khi lưu kênh test thứ 2 hoặc sửa cấu hình kênh test đã có
- **Xác thực hồ sơ trình duyệt Profile ID** - Xác thực sự tồn tại của Profile ID trực tiếp qua kho hồ sơ đa trình duyệt thay vì truy vấn bảng SQLite không tồn tại; chặn tạo liên kết với Profile giả mạo kèm thông báo tiếng Việt có dấu
- **Tối ưu phiên YouTube Studio Warmup** - Nâng timeout chờ nút avatar lên 25 giây, chủ động nhận diện redirect sang trang đăng nhập Google (`accounts.google.com`) và thông báo tiếng Việt hướng dẫn vào Quản lý Profile đăng nhập trước, ngăn chặn tình trạng Chromium tự đóng đột ngột
- **Bảo toàn tính trung thực BKT** - Tuyệt đối không báo "Sạch Bản Quyền" khi chưa đăng nhập hoặc gặp lỗi phiên làm việc, chuyển trạng thái failed minh bạch

## [0.20.5] - 2026-11-02

### Thêm mới

- **Bộ cài độc lập trọn gói** - Đóng gói sẵn Python 3.11 embed kèm site-packages, static FFmpeg/FFprobe, Deno, yt-dlp sidecar và toàn bộ Chromium runtime BrowserMulti v155.0.8059.12 vào bộ cài đặt để chạy độc lập trên máy sạch không cần tải thêm
- **Sao chép từ khóa mỏ vàng** - Bổ sung nút sao chép từ khóa nhanh trong hộp thoại Đào Mỏ Vàng Từ Khóa YouTube

### Sửa lỗi

- **Kiểm tra bản quyền Studio BKT** - Ngăn chặn tình trạng báo sai "Sạch Bản Quyền" khi kiểm tra 0 video; tự động xóa kết quả kiểm tra cũ khi đổi hồ sơ hoặc kênh
- **Khởi chạy runtime BrowserMulti** - Chuyển sang sao chép thư mục thực để NSIS đóng gói đầy đủ và bổ sung cơ chế fallback tự động sang Playwright Chromium
- **Lệch thời lượng audio 48 kHz** - Nhận diện tần số mẫu nguồn động bằng FFprobe và áp dụng bộ lọc `asetrate`/`aresample` tương ứng, loại bỏ triệt để hiện tượng lệch tiếng +2.5s trên audio 48 kHz
- **Tham số cài đặt kênh** - Hỗ trợ cả camelCase và snake_case cho lệnh Tauri cài đặt kênh nhằm khắc phục lỗi `Missing field checkInterval`
- **Hợp đồng xóa hồ sơ trình duyệt** - Xử lý tương thích cả object tombstone và boolean khi xóa hồ sơ
- **Tiến trình Outlier Hunter** - Truyền biến môi trường `YTDLP_BIN` và trả lỗi có cấu trúc thay vì nuốt lỗi trả về rỗng khi yt-dlp gặp sự cố
- **Chẩn đoán phụ đề bị giới hạn** - Phân biệt rõ lỗi YouTube chặn request (HTTP 429/RequestBlocked) với tình trạng video không có phụ đề
- **Parse số lượng sub & danh sách đen bản quyền** - Parse chính xác chuỗi sub "340K", "3.4M", "49N" và bổ sung các từ khóa bản quyền nặng (MV official, Marvel, K+, Vie Channel, Sơn Tùng,...)
- **Schema cơ sở dữ liệu Outlier** - Bổ sung migration tự động cho các cột `acceleration_status` và `view_velocity`

## [0.20.4] - 2026-09-20

### Sửa lỗi

- **Cài đặt tải từ browser extension** - Giữ lại các cài đặt Youwee global như container, thư mục đầu ra, playlist và subtitle khi browser extension bắt đầu tải xuống
- **Tương thích runtime AppImage** - Đóng gói lại AppImage Linux không kèm các thư viện runtime Wayland, GLib và GStreamer có thể xung đột với Mesa và WebKitGTK mới hơn, tránh cửa sổ trắng khi khởi động trên các bản Linux hiện đại
- **Chọn ngôn ngữ subtitle tự động** - Tôn trọng các ngôn ngữ đã chọn cho subtitle tự động thay vì yêu cầu mọi ngôn ngữ subtitle có sẵn hoặc được dịch
- **Tương thích khởi động Flatpak** - Dùng GNOME Platform 49 ổn định trong khi điều tra crash khởi động của WebKitGTK 2.52, không khởi tạo system tray không có trong runtime Flatpak, đồng thời smoke-test app đã đóng gói với Xvfb trong CI

### Thay đổi

- **Kiểm tra release AppImage** - Kiểm tra layout runtime AppImage sau khi đóng gói lại trong CI Linux và ký lại artifact hoàn chỉnh để đảm bảo tính toàn vẹn khi cập nhật
- **Thứ tự ký extension Firefox** - Chỉ ký extension Firefox sau khi toàn bộ gói desktop và Flatpak build thành công, tránh release lỗi làm tiêu hao version AMO

## [0.20.3] - 2026-08-23

### Sửa lỗi

- **Metadata gói deep link Linux** - Chuẩn hóa MIME desktop entry trong gói `.deb` để bước kiểm tra đóng gói release chạy ổn định

### Thay đổi

- **Kiểm tra CI gói Linux** - Build và kiểm tra gói `.deb` trong CI để xác nhận desktop entry deep link của Youwee giữ nguyên yêu cầu URL

## [0.20.2] - 2026-08-23

### Sửa lỗi

- **Thêm vào hàng đợi trên macOS Monterey** - Sửa lỗi nút Add không phản hồi trên WebView macOS cũ chưa hỗ trợ API UUID hiện đại của trình duyệt
- **Deep link Firefox trên Linux** - Truyền URL `youwee://` qua desktop entry trong gói `.deb` để yêu cầu Download now đến được Youwee

## [0.20.1] - 2026-08-01

### Thêm mới

- **Plugin Store** - Thêm menu riêng trong Cài đặt để tìm và cài các gói plugin đã được kiểm soát từ catalog live trên GitHub
- **Metadata trong tên file** - Thêm tùy chọn trong Download để thêm thông tin video đã chọn như ngày đăng, lượt xem, người đăng, thời lượng, độ phân giải hoặc ID video vào đầu tên file
- **Ngôn ngữ tiếng Romania** - Thêm bản dịch tiếng Romania cho giao diện ứng dụng
- **Ngôn ngữ tiếng Uzbek** - Thêm bản dịch tiếng Uzbek cho giao diện ứng dụng
- **Ngôn ngữ tiếng Thổ Nhĩ Kỳ** - Thêm bản dịch tiếng Thổ Nhĩ Kỳ cho giao diện ứng dụng

### Sửa lỗi

- **Icon AppImage** - Cập nhật Tauri build tooling và các dependency tương thích để gói AppImage Linux giữ đúng metadata icon desktop

## [0.20.0] - 2026-07-08

### Thêm mới

- **Ngôn ngữ tiếng Nhật** - Thêm bản dịch tiếng Nhật cho giao diện ứng dụng
- **Ngôn ngữ tiếng Tây Ban Nha** - Thêm bản dịch tiếng Tây Ban Nha cho giao diện ứng dụng
- **Chọn codec trong Universal** - Thêm lựa chọn codec video cho tải xuống Universal
- **AI Summary cho video dài** - Thêm tùy chọn định dạng và tóm tắt nhiều phần liền mạch để bản chi tiết của video dài giữ được nhiều ngữ cảnh hơn
- **Gói Flatpak cho Linux** - Thêm gói phát hành Flatpak cho người dùng Linux trên các distro mới, nơi AppImage có thể cần cài thêm FUSE

### Thay đổi

- **Cập nhật trong Flatpak** - Bỏ qua updater AppImage tích hợp khi Youwee chạy từ Flatpak để việc cập nhật do Flatpak quản lý

### Sửa lỗi

- **Phóng to cửa sổ trên Windows** - Sửa lỗi double-click thanh tiêu đề tùy chỉnh trên Windows làm cửa sổ phóng to rồi tự quay lại kích thước cũ
- **Mở vị trí file** - Chuyển các thao tác mở file trong thư mục qua command có xử lý theo từng hệ điều hành của Youwee để mở thư mục ổn định hơn
- **Nhận diện dependency** - Thêm `~/.local/bin` vào đường dẫn tìm kiếm trên Unix để app mở từ GUI tìm được các công cụ người dùng tự cài ổn định hơn
- **Profile cookie Firefox** - Dùng đúng thư mục profile thật hoặc đường dẫn tuyệt đối từ `profiles.ini` cho tải bằng cookie trình duyệt, trong khi Settings vẫn hiển thị tên dễ đọc
- **Tiêu đề tải xuống Unicode** - Giữ tiêu đề video Unicode từ metadata và đường dẫn file UTF-8 cuối cùng thay vì fallback sang output tiến trình bị mất ký tự
- **URL trong đoạn text đã paste** - Tách link HTTP(S) từ đoạn text đã paste trong Download, Universal, Gallery và các ô nhập metadata
- **Tên file an toàn trên Windows** - Củng cố xử lý tên file yt-dlp trên Windows bằng trim theo độ dài đường dẫn và rule tên file Windows-safe mà không đổi template output
- **Tóm tắt OpenAI** - Tự điều chỉnh tham số sampling cho OpenAI và Proxy tương thích OpenAI để model legacy và reasoning tạo tóm tắt mà không lỗi 400

## [0.19.0] - 2026-06-30

### Thêm mới

- **Collection trong Thư viện** - Thêm tùy chọn tự tạo collection cho playlist đã tách, lượt tải từ channel và file chapter
- **Cách xóa trong Thư viện** - Thêm cài đặt chọn việc xóa một mục trong Thư viện có xóa luôn file media hay không
- **Tốc độ khung hình** - Thêm tùy chọn ưu tiên tải 30 FPS trong Tải xuống, Universal và Kênh, kèm cảnh báo rõ về chất lượng
- **Ghi nhớ video đã tải** - Thêm tùy chọn phát hiện video đã có trong Thư viện cho Tải xuống, Universal, Gallery và Kênh, với lựa chọn hỏi, bỏ qua hoặc cho phép tải trùng
- **Công cụ tách file** - Thêm action tùy chọn để tách file media đã tải xong thành các đoạn có tên riêng bằng FFmpeg

### Thay đổi

- **Lịch sử trong Thư viện** - Bỏ cài đặt giới hạn số mục lịch sử để Thư viện có thể giữ bản ghi video đã tải cho tới khi người dùng tự xóa
- **Tóm tắt trong Thư viện** - Tinh chỉnh action của item và chuyển bản tóm tắt AI đầy đủ sang dialog đọc riêng có chỉnh cỡ chữ
- **Thư mục tải của hàng đợi** - Hỏi người dùng có muốn áp dụng thư mục tải mới cho các item trong hàng đợi khi đổi thư mục tải tổng hay không

### Sửa lỗi

- **Link extension khi app chưa mở** - Sửa lỗi link tải từ browser extension chỉ mở Youwee nhưng không thêm video khi app đang đóng
- **Đánh số trong AI Summary** - Sửa lỗi danh sách chủ đề trên giao diện luôn bắt đầu lại từ 1 khi có dòng trống giữa các mục
- **Điều khiển lấy video Kênh** - Thêm nút dừng khi đang lấy video kênh và tránh tải lại danh sách khi mở kênh vừa duyệt xong
- **Thumbnail trong dialog trùng lặp** - Sửa lỗi dialog video đã tải hiển thị placeholder dù mục trong Thư viện đã có thumbnail
- **Icon trong Cài đặt** - Sửa lỗi icon Font Awesome quá lớn làm vỡ bố cục Cài đặt khi CSS icon không khả dụng

## [0.18.0] - 2026-06-29

### Thêm mới

- **Đánh số file trong hàng đợi** - Thêm tùy chọn thêm số thứ tự hàng đợi vào đầu tên file khi tải nhiều video thường
- **Folder tải trong hàng đợi** - Thêm nút đổi folder tải xuống riêng cho từng item trong hàng đợi
- **Tùy chọn yt-dlp nâng cao** - Thêm tùy chọn nâng cao đã kiểm soát cho người dùng cần tinh chỉnh lệnh tải yt-dlp
- **Đánh số file playlist** - Thêm cài đặt Tải xuống để thêm số thứ tự playlist vào đầu tên file khi tải playlist
- **Tách chapter có sẵn** - Thêm cài đặt Tải xuống để tách chapter có sẵn trong video thành file riêng và tùy chọn đánh số file chapter
- **AI Summary trong extension** - Thêm nút Tóm tắt trong browser extension để mở video YouTube trực tiếp ở màn AI Summary
- **Giới hạn token cho AI Summary** - Thêm ô tùy chọn trong Cài đặt để chỉnh số token đầu ra tối đa khi tạo bản tóm tắt
- **Rule bỏ qua cookie** - Thêm cài đặt dạng tag để bỏ qua cookie trình duyệt hoặc tệp cookie cho các site khớp rule, mặc định có Facebook Reels

### Thay đổi

- **Giao diện extension** - Làm mới popup và menu nút nổi của browser extension theo phong cách gọn, hiện đại và đồng bộ hơn với trình phát nhạc

### Sửa lỗi

- **Tải được khôi phục bởi plugin** - Sửa lỗi plugin `download.failed` khôi phục file thành công nhưng item gốc vẫn bị hiển thị là thất bại
- **Workflow plugin khi thử lại** - Sửa lỗi tải xuống thất bại khi thử lại không dùng workflow plugin mới được gán
- **Nút nổi trong extension** - Sửa lỗi nút nổi của browser extension không hiện hoặc bị crash trên các tab đã mở sẵn trước khi extension được cài hoặc reload
- **Tải từ extension khi app chưa mở** - Sửa lỗi bấm `Download now` trong browser extension chỉ mở Youwee nhưng không thêm video khi app desktop chưa chạy sẵn
- **Thông tin video cho AI Summary** - Sửa lỗi AI Summary bị kẹt khi lấy thông tin video trong trường hợp phụ đề có sẵn nhưng yt-dlp không chọn được định dạng video
- **Độ dài AI Summary** - Bỏ giới hạn token đầu ra mặc định bị hard-code để provider dùng mặc định của model, trừ khi người dùng tự đặt giá trị
- **Tiêu đề video quá dài** - Sửa lỗi tải xuống thất bại khi tiêu đề quá dài được dùng làm tên file

## [0.17.2] - 2026-06-17

### Thay đổi

- **Font và icon giao diện** - Đóng gói sẵn font và icon để giao diện hiển thị ổn định mà không phụ thuộc vào CDN bên ngoài
- **Bố cục chi tiết plugin** - Đổi phần chi tiết plugin đã import trong Cài đặt sang dạng tab cho Thông tin, Quyền được yêu cầu, và Runtime & tương thích
- **Nút tải thêm trong Kênh** - Đổi nút Tải thêm ở màn hình duyệt Kênh và chi tiết kênh đã theo dõi sang kiểu floating giống Tìm YouTube theo từ khóa

### Sửa lỗi

- **Ẩn hiện trình phát nhạc** - Sửa lỗi trình phát nhạc khi thu gọn vẫn để lại lớp phủ vô hình, có thể chặn nút bên dưới và làm nhạc phát lại từ đầu khi người dùng bấm vào vùng bị che
- **Trạng thái hoàn tất của Kênh** - Sửa lỗi video trong kênh đã theo dõi bị mất trạng thái hoàn tất sau khi mở lại app bằng cách lưu chắc trạng thái tải thủ công và khôi phục theo đúng video ID cùng file lịch sử còn tồn tại
- **Theo dõi trùng kênh** - Trả về record kênh đã theo dõi hiện có khi follow lại cùng URL để tránh đồng bộ video vào channel id không tồn tại

## [0.17.1] - 2026-06-11

### Thêm mới

- **Lên lịch cho live sắp bắt đầu** - Thêm action trực tiếp trên item trong hàng đợi để lên lịch thử tải lại khi live YouTube chưa bắt đầu
- **Nguồn từ khóa YouTube trong Xuất dữ liệu** - Thêm nguồn từ khóa YouTube để export kết quả tìm kiếm từ Data Export
- **Folder lưu từ CLI** - Thêm `--output` / `-o` để mỗi lượt tải được thêm từ CLI có thể dùng folder lưu tuyệt đối riêng

### Thay đổi

- **Điều khiển lên lịch** - Tinh chỉnh popover lên lịch và trạng thái lịch đang chạy với preset nhanh hơn, preview rõ hơn và countdown gọn hơn
- **Cài đặt và tài liệu CLI** - Tinh chỉnh card CLI trong General settings, bổ sung bản dịch CLI cho toàn bộ ngôn ngữ được hỗ trợ, và mở rộng hướng dẫn CLI với ghi chú cài đặt cho macOS, Windows và Linux

### Sửa lỗi

- **Cập nhật FFmpeg app-managed** - Lưu version release của gói FFmpeg app-managed đã cài để check update không còn lặp khi binary FFmpeg báo version build git nội bộ
- **Trạng thái FFmpeg** - Hiển thị FFmpeg hệ thống được tự phát hiện là System thay vì App managed, và báo lỗi verify cài đặt app-managed rõ hơn
- **Phiên bản yt-dlp bundled** - Ưu tiên sidecar đi kèm bản app hiện tại để binary app-managed cũ không che bản bundled mới hơn
- **Nguồn yt-dlp trong Channel** - Sửa luồng duyệt Channel để dùng đúng nguồn/channel yt-dlp đã chọn, gồm Stable và System
- **URL paste bị escape** - Chuẩn hóa dấu câu URL bị shell escape trong ô nhập Download, Universal và Gallery để link dạng `watch\?v\=...` vẫn thêm đúng video vào hàng đợi
- **URL CLI bị escape** - Chuẩn hóa dấu câu URL bị shell escape để URL YouTube có dạng `watch\?v\=...` vẫn tải đúng video mong muốn
- **Lỗi live đã lên lịch** - Hiển thị thông báo rõ ràng cho live YouTube sắp diễn ra thay vì gộp vào lỗi skipped hoặc unspecified chung chung
- **Output CLI trên Windows** - Sửa lỗi `youwee -V` và `youwee --help` không in kết quả trong terminal Windows

## [0.17.0] - 2026-06-07

### Thêm mới

- **Giao diện dòng lệnh** - Thêm CLI local `youwee` với nút cài đặt, request tải có cấu trúc và các tùy chọn chất lượng, chế độ âm thanh, chỉ thêm vào queue, playlist, phụ đề, cắt đoạn tải, tải live từ đầu và bỏ qua live
- **Bỏ qua live** - Thêm cài đặt tải xuống để bỏ qua video đang phát trực tiếp trong giao diện YouTube và Universal
- **Tìm kiếm tóm tắt AI** - Thêm tìm kiếm Thư viện dùng SQLite FTS5 trên tiêu đề, URL, đường dẫn file và các bản tóm tắt AI đã lưu, kèm lựa chọn phạm vi tìm trong tất cả nội dung, chỉ chi tiết hoặc chỉ tóm tắt AI
- **Tìm YouTube theo từ khóa** - Thêm màn hình tìm video YouTube theo từ khóa riêng với bộ lọc ngày tải lên, thời lượng, thứ tự ưu tiên và tính năng video, cho phép chọn kết quả rồi thêm trực tiếp vào hàng đợi tải
- **Tab trạng thái hàng đợi** - Thêm tab trạng thái gọn cho hàng đợi YouTube và Universal để lọc video theo trạng thái tải
- **Cầu nối tìm kiếm YouTube cho Plugin SDK** - Mở app-managed YouTube keyword search cho plugin JavaScript qua `ctx.youwee.youtube.searchVideos(...)`, kèm bộ lọc có kiểu dữ liệu rõ ràng và hỗ trợ continuation

### Thay đổi

- **Thời gian chờ AI** - Mở rộng lựa chọn Thời gian chờ khi tạo AI lên tối đa 60 phút và áp dụng timeout đã chọn vào HTTP request của các nhà cung cấp AI để hỗ trợ tóm tắt video dài
- **Tên file database của ứng dụng** - Đổi database SQLite nội bộ từ `logs.db` sang `youwee.db`, tự động migrate từ file cũ và giữ file cũ làm backup

### Sửa lỗi

- **Bilibili HTTP 412** - Thêm header giống trình duyệt cho request Bilibili qua yt-dlp để tránh lỗi `HTTP Error 412`

## [0.16.0] - 2026-06-02

### Thêm mới

- **Lưu hàng đợi tải xuống** - Thêm tùy chọn trong cài đặt Tải xuống để lưu các item trong queue YouTube, Universal và Gallery vào database của ứng dụng, giúp khôi phục lại hàng đợi sau khi đóng và mở lại Youwee
- **Xuất dữ liệu** - Thêm không gian Xuất dữ liệu mới để xuất danh sách từ playlist và kênh YouTube, chọn chính xác các cột cần lấy, lưu file ở nhiều định dạng như CSV, Excel, JSON, Markdown, HTML, SQLite và Word, đồng thời lưu file đã xuất vào Thư viện để mở lại sau
- **Tải từ xa qua Telegram** - Thêm mục cài đặt Remote Download với điều khiển Telegram bằng long polling, nhập chat ID được phép dạng tag, popup hướng dẫn lệnh, hỗ trợ `/add`, `/download`, `/status`, `/queue`, `/stop`, `/help`, cùng cú pháp chất lượng ngắn như `720`, `audio`, và `mp3`

### Thay đổi

- **Thêm vào queue khi đang tải** - Cho phép thêm URL mới vào queue YouTube, Universal và Gallery trong lúc đang tải, đồng thời worker chờ ngắn để nhận item vừa thêm trước khi kết thúc phiên tải hiện tại
- **Chọn định dạng YouTube** - Đổi codec video mặc định của YouTube sang Auto để lượt tải mới không còn ép chọn riêng H.264 và đồng nhất hơn với Universal khi video không có stream AVC phù hợp

### Sửa lỗi

- **Xung đột cài đặt deb trên Linux** - Đổi tên yt-dlp bundled sang tên binary riêng của Youwee để gói `.deb` không còn đụng với package `yt-dlp` do distro quản lý
- **Đường dẫn dependency hệ thống** - Cải thiện resolve PATH trên Windows cho yt-dlp, FFmpeg, Deno, gallery-dl và các công cụ phụ trợ
- **Chọn profile cookie Firefox** - Ưu tiên profile Firefox đang active từ `profiles.ini` để tải bằng cookie trình duyệt dùng đúng profile có khả năng đang lưu cookie

## [0.15.1] - 2026-05-27

### Thay đổi

- **Cải tiến UI và UX** - Hoàn thiện giao diện và trải nghiệm trên AI Features, metadata, phần cài đặt plugin, dialog guide, và hệ thống thông báo dùng chung để trải nghiệm Youwee đồng nhất hơn
- **Hỗ trợ Plugin SDK v2.0.0** - Nâng cấp phần plugin lên `youwee-sdk` `v2.0.0`, gồm permission `read/write/AI` chặt chẽ hơn và hỗ trợ workspace plugin ưu tiên TypeScript

## [0.14.1] - 2026-05-24

### Thay đổi

- **Luồng hướng dẫn plugin và cấp quyền** - Tinh chỉnh luồng import plugin, duyệt quyền, hướng dẫn workspace, và giao diện cấu hình để việc cài plugin, gán workflow, và đọc guide trong Settings rõ ràng hơn
- **Tăng độ linh hoạt cho plugin author** - Cập nhật tích hợp workspace và SDK để hỗ trợ icon Lucide linh hoạt hơn và luồng test Deno gọn hơn cho người viết plugin

### Sửa lỗi

- **Log runtime plugin và tóm tắt output** - Giảm log plugin bị lặp, bỏ lưu raw protocol output của kết quả plugin, và hiển thị rõ hơn các đường dẫn file đầu ra sẽ được dùng cho step tiếp theo trong log post-processing
- **Hiển thị guide plugin và tài liệu đa ngôn ngữ** - Sửa lỗi dialog guide bị tràn nội dung và giữ lại các file `README.<locale>.md` cho plugin đã cài
- **Hoàn thiện giao diện cấu hình plugin** - Cải thiện control multi-select, thời điểm hiển thị validation, và các prompt khi import/bật plugin để đồng bộ hơn với giao diện chung của ứng dụng

## [0.14.0] - 2026-05-24

### Thêm mới

- **Tag và bộ sưu tập cho Thư viện** - Thêm tag tự do và bộ sưu tập ảo cho các mục trong Thư viện, bao gồm gán ngay trên từng item, filter nhanh bằng chip, quản lý bộ sưu tập và lọc nâng cao theo tag hoặc bộ sưu tập
- **Hệ thống plugin có ký và luồng SDK** - Thêm plugin `.ywp` có chữ ký với luồng attach/debug workspace, field cấu hình có kiểu dữ liệu rõ ràng, hướng dẫn plugin đa ngôn ngữ, duyệt quyền, gán vào workflow, xem log, và hỗ trợ đóng gói/ký bằng `youwee-sdk`

### Thay đổi

- **Đồng bộ ô nhập URL của Gallery** - Cập nhật ô nhập Gallery để bám sát hơn luồng single/multiple của YouTube, gồm style nút Add, layout batch, hint URL và wording đa ngôn ngữ

### Sửa lỗi

- **Crash khởi động trên Arch Linux với GBM EGL display** - Thêm fallback cho WebKitGTK trên Linux, mặc định tắt GBM renderer để tránh app bị abort khi khởi động trên một số hệ Arch-based

## [0.13.3] - 2026-05-14

### Thêm mới

### Thay đổi

### Sửa lỗi

- **Vòng lặp tải video ở kênh đã theo dõi** - Sửa regression từ tính năng phân trang khiến kênh đã theo dõi có thể bị kẹt trong trạng thái tải liên tục và không lấy danh sách video ổn định
- **Race condition ở progress khi tải kênh** - Progress duyệt kênh giờ bỏ qua event cũ từ request trước khi người dùng đổi kênh hoặc bấm tải lại liên tục
- **Tải thêm làm tăng sai số video mới** - Các video cũ được nạp từ những trang bổ sung của kênh sẽ không còn bị lưu là video mới, tránh sai badge và tray count

## [0.13.2] - 2026-05-10

### Thêm mới

- **Phân trang video kênh với Tải thêm** - Trang Kênh giờ tải mặc định 100 video đầu tiên và cho phép tải thêm theo từng đợt trong cả màn hình duyệt và màn hình chi tiết
- **Hỗ trợ tiếng Thái** - Bổ sung bản địa hóa đầy đủ tiếng Thái cho toàn bộ ứng dụng, bao gồm màn hình giao diện, cài đặt, công cụ phụ đề, luồng tải xuống và bộ chọn ngôn ngữ
- **Hỗ trợ tiếng Ả Rập** - Bổ sung bản địa hóa đầy đủ tiếng Ả Rập cho toàn bộ ứng dụng, bao gồm màn hình giao diện, cài đặt, công cụ phụ đề, luồng tải xuống, đồng thời thêm xử lý hướng chữ RTL

### Thay đổi

### Sửa lỗi

- **Giới hạn duyệt kênh ở 50 video** - Sửa lỗi duyệt kênh và playlist bị dừng sai ở 50 video dù vẫn còn thêm video
- **Phân loại sai dialog lỗi cookie** - Sửa lỗi yêu cầu cookie đăng nhập mới bị hiển thị nhầm như lỗi khóa DB cookie của trình duyệt; giờ app tách riêng dialog cho lỗi DB lock và lỗi cần cookie xác thực

## [0.13.1] - 2026-04-26

### Thêm mới

- **Nhà cung cấp AI LM Studio** - Thêm LM Studio làm nhà cung cấp AI nội bộ tương thích OpenAI, có endpoint local tùy chỉnh và không yêu cầu khóa API

### Thay đổi

### Sửa lỗi

- **Hậu xử lý WebM 4K** - Sửa lỗi tải WebM có thể chọn nhầm stream tương thích MP4/H.264 khiến FFmpeg thất bại ở bước post-processing conversion

## [0.13.0] - 2026-04-15

### Thêm mới

- **Trình phát nhạc nổi** - Thêm player âm thanh trong ứng dụng với hàng đợi, điều khiển phát, tốc độ và âm lượng
- **Tích hợp Aria2 làm trình tải ngoài** - Bổ sung hỗ trợ `aria2c` làm external downloader với tham số tùy chỉnh và xử lý lỗi đã bản địa hóa
- **Đổi tên file đã tải từ Queue và Thư viện** - Thêm thao tác đổi tên sau khi tải xong (queue YouTube + Universal và Thư viện), đồng bộ đường dẫn/tên trong DB và giao diện đa ngôn ngữ
- **Bộ lọc nâng cao và sắp xếp trong Thư viện** - Thêm panel Advanced Filters (loại media, khoảng ngày, định dạng, chất lượng), tìm kiếm theo `title + filepath`, và sắp xếp lịch sử có ghi nhớ lựa chọn sort
- **Trang tải Gallery riêng** - Thêm menu `Gallery` mới nằm dưới Universal, có ô nhập URL riêng, import hàng loạt, hàng đợi, chọn thư mục lưu và luồng Start/Stop dành cho các nguồn kiểu gallery chạy bằng `gallery-dl`

### Thay đổi

- **Xử lý queue động khi đang tải** - Worker queue giờ claim item theo thời gian thực, nên video thêm mới sẽ vào cuối hàng đợi và tự tải tiếp mà không cần bấm Start lại

### Sửa lỗi

- **Ổn định test đổi tên lịch sử trên CI** - Serialize các test dùng chung DB in-memory để tránh lỗi flaky `History entry not found` khi `cargo test` chạy song song
## [0.12.0] - 2026-03-04

### Thêm mới

- **Bộ chọn nguồn dependency (yt-dlp/FFmpeg)** - Thêm tùy chọn trong Cài đặt → Phụ thuộc để chọn dùng binary do ứng dụng quản lý hoặc do hệ thống quản lý
- **Xác nhận an toàn khi chuyển sang nguồn hệ thống** - Thêm hộp thoại xác nhận khi đổi yt-dlp/FFmpeg sang nguồn hệ thống để tránh bấm nhầm

### Thay đổi

- **Nhãn nguồn hệ thống theo hệ điều hành** - Nhãn nguồn hệ thống giờ hiển thị theo nền tảng (`Homebrew` trên macOS, `PATH` trên Windows, trình quản lý gói trên Linux)
- **Tự động tạo ghi chú phát hành GitHub trong luồng build** - Bật `generate_release_notes` trong workflow phát hành để bản phát hành có ghi chú tự sinh
- **Tích hợp thanh tiêu đề tùy chỉnh trên Windows** - Thay title bar native của Windows bằng control tùy chỉnh theo theme ứng dụng (vùng kéo cửa sổ, thu nhỏ/phóng to/đóng)

### Sửa lỗi

- **Ghi lịch sử tải xuống trên Windows** - Bắt chính xác đường dẫn file đầu ra cuối cùng trên Windows để bản tải hoàn tất luôn được thêm vào lịch sử Thư viện
- **Phân tích đường dẫn tải lại trên Windows** - Sửa tách thư mục output khi tải lại để xử lý đúng đường dẫn dùng dấu `\`
- **Xử lý output yt-dlp không phải UTF-8 trên Windows** - Thêm fallback decode GBK/ANSI và xử lý `--print-to-file` để vẫn lấy đúng đường dẫn file ở locale không UTF-8
- **Tự động làm mới Thư viện khi tải xong** - Lịch sử Thư viện giờ tự refresh khi trạng thái tải chuyển sang `finished`
- **Tương thích URL Douyin dạng modal** - Chuẩn hóa URL `douyin.com` có `modal_id` về dạng chuẩn `/video/{id}` trong backend yt-dlp và parser deep-link phía frontend

## [0.11.1] - 2026-03-01

### Thêm mới

- **Hỗ trợ tiếng Pháp, Bồ Đào Nha và Nga** - Bản địa hóa đầy đủ Français, Português và Русский cho toàn bộ giao diện, cài đặt, thông báo lỗi và nhãn metadata
- **Bản địa hóa thông báo lỗi backend** - Các thông báo lỗi từ backend (lỗi tải, lỗi mạng, v.v.) giờ được dịch theo ngôn ngữ người dùng đã chọn thay vì luôn hiển thị tiếng Anh

### Thay đổi

- **Tái cấu trúc chuỗi fallback transcript** - Thống nhất logic fallback transcript giữa AI summary và processing để hành vi nhất quán hơn

### Sửa lỗi

- **Fallback transcript cho Douyin và TikTok** - Cải thiện trích xuất transcript cho video Douyin và TikTok trước đây bị thất bại im lặng
- **Lỗi transcript và caption ngắn** - Lỗi transcript giờ được giữ lại để chẩn đoán thay vì bị nuốt im lặng; caption ngắn được chấp nhận là transcript hợp lệ thay vì bị từ chối
- **Cài đặt mặc định TikTok** - Điều chỉnh cài đặt tải mặc định của TikTok cho phù hợp với quy ước nền tảng

## [0.11.0] - 2026-02-20

### Thêm mới

- **Browser Extension tải nhanh (Chromium + Firefox)** - Giờ đây bạn có thể gửi trang video đang mở từ trình duyệt sang Youwee và chọn `Download now` hoặc `Add to queue`
- **Thiết lập Extension trong Cài đặt** - Thêm mục mới Cài đặt → Extension với nút tải trực tiếp và hướng dẫn cài đơn giản cho Chromium và Firefox

### Thay đổi

- **Làm mới UI/UX cho trang YouTube và Universal** - Tối giản thao tác nhập link, card preview, hàng đợi và phần title bar để giao diện gọn và đồng nhất hơn

### Sửa lỗi

- **Đồng bộ resolve dependency giữa các tính năng** - Chuẩn hóa luồng chọn yt-dlp/FFmpeg trong download, metadata, channels và polling nền để luôn tôn trọng nguồn đã chọn
- **Chế độ system fail rõ ràng khi thiếu binary** - Khi chọn nguồn hệ thống mà thiếu binary, ứng dụng giờ báo lỗi rõ ràng thay vì fallback ngầm

## [0.10.1] - 2026-02-15

### Thêm mới

- **Thiết lập font ASS** - Thêm tùy chỉnh font và cỡ chữ phụ đề cho xuất ASS và preview
- **Luồng xuống dòng phụ đề** - Thêm thao tác auto xuống dòng nhanh và hỗ trợ Shift+Enter khi chỉnh nội dung
- **Tự động thử lại có thể cấu hình** - Thêm cài đặt Auto Retry cho tải YouTube và Universal, cho phép đặt số lần thử lại và thời gian chờ để tự phục hồi khi mạng không ổn định hoặc live stream bị ngắt

### Thay đổi

### Sửa lỗi

- **Thông báo lỗi tải xuống rõ hơn** - Cải thiện thông báo lỗi yt-dlp với nguyên nhân cụ thể hơn để hỗ trợ nhận diện lỗi tạm thời và thử lại tự động chính xác hơn

## [0.10.0] - 2026-02-15

### Thêm mới

- **Xưởng phụ đề** - Thêm trang phụ đề tất cả trong một cho SRT/VTT/ASS với chỉnh sửa nội dung, công cụ thời gian, tìm/thay thế, tự sửa lỗi và các tác vụ AI (Whisper, Dịch, Sửa ngữ pháp)
- **Bộ công cụ phụ đề nâng cao** - Bổ sung timeline sóng âm/phổ tần, đồng bộ theo cảnh cắt, QC realtime theo style profile, công cụ tách/gộp, chế độ Dịch 2 cột (gốc/bản dịch), và công cụ batch cho project

### Thay đổi

### Sửa lỗi

## [0.9.4] - 2026-02-14

### Thêm mới

- **Chọn thư mục output cho Processing** - Thêm nút chọn thư mục lưu đầu ra trong khung chat Processing. Mặc định vẫn là thư mục của video chính, và output của AI/quick actions sẽ theo thư mục đã chọn
- **Đính kèm nhiều loại file trong chat AI Processing** - Chat Processing hỗ trợ đính kèm ảnh/video/phụ đề (chọn file + kéo thả), hiển thị preview và metadata phù hợp theo từng loại
- **Lối tắt đề xuất ngôn ngữ trong Cài đặt** - Thêm link nhanh trong Cài đặt → Chung để người dùng bình chọn/đề xuất ngôn ngữ tiếp theo trên GitHub Discussions
- **Kiểm tra cập nhật app từ system tray** - Thêm hành động mới trong tray để kiểm tra cập nhật Youwee trực tiếp

### Thay đổi

- **Sinh lệnh subtitle/merge ổn định hơn** - Luồng tạo lệnh Processing ưu tiên xử lý deterministic cho chèn phụ đề và ghép nhiều video (bao gồm gợi ý thứ tự intro/outro) trước khi fallback sang AI
- **Đổi tên mục kiểm tra kênh trong tray cho rõ nghĩa** - Đổi "Kiểm tra tất cả" thành "Kiểm tra kênh theo dõi ngay" để thể hiện đúng hành vi kiểm tra các kênh đã theo dõi
- **Đơn giản hóa tiêu đề trang** - Bỏ icon phía trước tiêu đề ở các trang Metadata, Processing và AI Summary để giao diện gọn hơn

### Sửa lỗi

- **Lỗi lấy thông tin video khi dùng xác thực/proxy** - Sửa thứ tự tham số yt-dlp để cờ cookie và proxy được chèn trước dấu phân tách URL `--`, tránh lỗi `Failed to fetch video info` trong khi luồng tải video vẫn hoạt động đúng
- **Kênh Stable luôn báo có bản cập nhật** - Sửa logic kiểm tra cập nhật yt-dlp cho stable/nightly để đọc phiên bản thực từ binary đã cài (`--version`) thay vì chỉ dựa vào metadata tồn tại file, giúp hiển thị đúng trạng thái "Đã cập nhật" sau khi cập nhật xong
- **Trạng thái cập nhật Bundled và binary đang dùng không đồng bộ** - Sửa luồng cập nhật bundled để hiển thị phiên bản mới có sẵn trong Settings và ưu tiên dùng binary `app_data/bin/yt-dlp` đã cập nhật khi có, giúp cập nhật bundled có hiệu lực thực tế
- **Làm mới phần thông tin video ở trang Processing** - Thiết kế lại khu vực dưới player theo kiểu YouTube với tiêu đề nổi bật và chip metadata hiện đại, đồng thời bỏ đổi màu hover và shadow ở badge codec để giao diện gọn hơn
- **Dropdown Prompt Templates không tự đóng** - Sửa dropdown Prompt Templates ở Processing để tự đóng khi click ra ngoài hoặc nhấn phím Escape
- **Hiển thị trùng số URL ở Universal** - Sửa badge số lượng URL trong ô nhập Universal bị lặp số (ví dụ `1 1 URL`)

## [0.9.3] - 2026-02-14

### Thêm mới

- **Tải phụ đề trong Metadata** - Thêm nút chuyển đổi phụ đề trong thanh cài đặt Metadata để tải phụ đề (thủ công + tự động tạo) cùng với metadata. Bao gồm popover để chọn ngôn ngữ và định dạng (SRT/VTT/ASS)

### Thay đổi

- **Cải thiện UX nhập thời gian cắt video** - Thay thế ô nhập text thường bằng ô nhập tự động định dạng, tự chèn `:` khi gõ (ví dụ `1030` → `10:30`, `10530` → `1:05:30`). Placeholder thông minh hiển thị `M:SS` hoặc `H:MM:SS` dựa theo độ dài video. Kiểm tra realtime với viền đỏ khi định dạng sai hoặc thời gian bắt đầu >= kết thúc. Hiện tổng thời lượng video khi có

## [0.9.2] - 2026-02-13

### Thêm mới

- **Tải video theo phân đoạn thời gian** - Chỉ tải một đoạn video bằng cách đặt thời gian bắt đầu và kết thúc (ví dụ: 10:30 đến 14:30). Có thể cài đặt cho từng video trên cả hàng đợi YouTube và Universal qua biểu tượng kéo. Sử dụng `--download-sections` của yt-dlp
- **Tự động kiểm tra cập nhật FFmpeg khi khởi động** - Kiểm tra cập nhật FFmpeg giờ chạy tự động khi mở app (cho bản cài đặt tích hợp). Nếu có bản cập nhật, sẽ hiển thị trong Cài đặt > Phụ thuộc mà không cần bấm nút làm mới

## [0.9.1] - 2026-02-13

### Sửa lỗi

- **Ứng dụng crash trên macOS không có Homebrew** - Sửa lỗi crash khi khởi động do thiếu thư viện động `liblzma`. Crate `xz2` giờ dùng static linking, giúp ứng dụng hoàn toàn độc lập không cần Homebrew hay thư viện hệ thống
- **Tự động tải bỏ qua cài đặt người dùng** - Tự động tải kênh giờ áp dụng cài đặt riêng cho mỗi kênh (chế độ Video/Âm thanh, chất lượng, định dạng, codec, bitrate) thay vì dùng giá trị mặc định. Mỗi kênh có cài đặt tải riêng có thể cấu hình trong bảng cài đặt kênh
- **Tăng cường bảo mật** - FFmpeg giờ dùng mảng tham số thay vì parse chuỗi shell, chặn command injection. Thêm validate URL scheme và `--` separator cho mọi lệnh yt-dlp để chặn option injection. Bật Content Security Policy, xóa quyền shell thừa, và thêm `isSafeUrl` cho các link hiển thị
- **Lỗi preview video với container MKV/AVI/FLV/TS** - Phát hiện preview giờ kiểm tra cả container và codec. Video trong container không hỗ trợ (MKV, AVI, FLV, WMV, TS, WebM, OGG) được tự động transcode sang H.264. HEVC trong MP4/MOV không còn bị transcode thừa trên macOS
- **Hẹn giờ tải không hiển thị khi thu nhỏ vào tray** - Thông báo desktop giờ hiển thị khi tải hẹn giờ bắt đầu, dừng hoặc hoàn thành trong khi ứng dụng thu nhỏ vào system tray. Menu tray hiển thị trạng thái hẹn giờ (vd: "YouTube: 23:00"). Hẹn giờ hoạt động trên cả trang YouTube và Universal
- **Thoát từ tray hủy download đang chạy** - Nút "Thoát" trên tray giờ dùng tắt an toàn thay vì kill process, cho phép download đang chạy hoàn tất cleanup và tránh file bị hỏng
- **Cài đặt ẩn Dock bị mất khi khởi động lại (macOS)** - Tùy chọn "Ẩn biểu tượng Dock khi đóng" giờ được đồng bộ với native layer khi khởi động app, không chỉ khi vào trang Cài đặt
- **Hàng đợi Universal hiện skeleton thay vì URL khi đang tải** - Thay thế placeholder skeleton nhấp nháy bằng URL thực tế và badge spinner "Đang tải thông tin...". Khi lấy metadata thất bại, item giờ thoát trạng thái loading thay vì hiện skeleton mãi mãi

## [0.9.0] - 2026-02-12

### Thêm mới

- **Theo dõi kênh & Tải tự động** - Theo dõi các kênh YouTube, duyệt video, chọn và tải hàng loạt với đầy đủ tùy chọn chất lượng/codec/định dạng. Polling nền phát hiện video mới với thông báo desktop và badge đếm video mới theo kênh. Panel kênh theo dõi thu gọn được, hỗ trợ thu nhỏ xuống system tray
- **Xác nhận xem trước file lớn** - Ngưỡng kích thước file có thể cấu hình (mặc định 300MB) hiển thị hộp thoại xác nhận trước khi tải video lớn trong trang Xử lý. Điều chỉnh ngưỡng tại Cài đặt → Chung → Xử lý
- **Tìm kiếm cài đặt đa ngôn ngữ** - Tìm kiếm trong cài đặt giờ hoạt động với mọi ngôn ngữ. Tìm bằng tiếng Việt (ví dụ "giao diện") hoặc tiếng Trung đều cho kết quả. Từ khóa tiếng Anh vẫn hoạt động như dự phòng

### Sửa lỗi

- **Trang Xử lý bị trắng màn hình với video 4K VP9/AV1/HEVC (Linux)** - Bộ giải mã AAC của GStreamer gây crash WebKitGTK khi phát video VP9/AV1/HEVC. Preview giờ dùng phương pháp dual-element: video H.264 không âm thanh + file WAV riêng biệt đồng bộ qua JavaScript, hoàn toàn bỏ qua đường dẫn AAC bị lỗi. Nếu phát video vẫn thất bại, tự động chuyển sang ảnh thu nhỏ JPEG tĩnh. Hoạt động trên macOS, Windows và Linux

## [0.8.2] - 2026-02-11

### Thêm mới

- **Ghi chú cập nhật đa ngôn ngữ** - Hộp thoại cập nhật hiển thị ghi chú phát hành theo ngôn ngữ người dùng (Tiếng Anh, Tiếng Việt, Tiếng Trung). CI tự động trích xuất nhật ký thay đổi từ các file CHANGELOG theo ngôn ngữ
- **Tùy chọn chất lượng 8K/4K/2K cho Universal** - Dropdown chất lượng giờ có thêm 8K Ultra HD, 4K Ultra HD và 2K QHD, giống như tab YouTube. Tự động chuyển sang chất lượng cao nhất có sẵn nếu nguồn không hỗ trợ
- **Nút bật/tắt "Phát từ đầu" cho Universal** - Nút mới trong Cài đặt nâng cao để ghi live stream từ đầu thay vì từ thời điểm hiện tại. Sử dụng flag `--live-from-start` của yt-dlp
- **Xem trước video cho Universal** - Tự động hiển thị thumbnail, tiêu đề, thời lượng và kênh khi thêm URL từ TikTok, Bilibili, Facebook, Instagram, Twitter và các trang khác. Thumbnail cũng được lưu vào Thư viện
- **Nhận diện nền tảng thông minh hơn** - Thư viện giờ nhận diện và gắn nhãn chính xác hơn 1800 trang web được yt-dlp hỗ trợ (Bilibili, Dailymotion, SoundCloud, v.v.) thay vì hiển thị "Khác". Thêm tab lọc Bilibili

### Sửa lỗi

- **Trang Xử lý bị treo khi upload video (Linux)** - File video được đọc toàn bộ vào RAM qua `readFile()`, gây tràn bộ nhớ và màn hình trắng. Giờ sử dụng giao thức asset của Tauri để stream video trực tiếp mà không cần tải vào bộ nhớ. Thêm Error Boundary để ngăn màn hình trắng, xử lý lỗi video với thông báo cụ thể theo codec, dọn dẹp blob URL chống rò rỉ bộ nhớ, và nhận dạng MIME type đúng cho các định dạng không phải MP4
- **Thumbnail bị lỗi trong Thư viện** - Sửa thumbnail từ các trang như Bilibili sử dụng URL HTTP. Thumbnail giờ hiển thị biểu tượng thay thế khi không tải được
- **Thư viện không làm mới khi chuyển trang** - Thư viện giờ tự động tải dữ liệu mới nhất khi chuyển đến trang thay vì phải làm mới thủ công
