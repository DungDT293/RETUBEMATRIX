@echo off
chcp 65001 >nul
echo ========================================================
echo   CÀI ĐẶT MÔI TRƯỜNG PYTHON CHO REUPYTB TRÊN MÁY MỚI
echo ========================================================
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [LỖI] Chưa phát hiện Python trên máy tính!
    echo Vui lòng tải và cài đặt Python 3.10+ từ https://www.python.org/
    echo LƯU Ý QUAN TRỌNG: Hãy tích chọn ô "Add Python to PATH" khi cài đặt!
    echo.
    pause
    exit /b 1
)

echo [1/3] Đang nâng cấp pip...
python -m pip install --upgrade pip

echo.
echo [2/3] Đang cài đặt các thư viện cần thiết (requests, psutil, playwright, youtube-transcript-api)...
python -m pip install requests psutil playwright youtube-transcript-api

echo.
echo [3/3] Đang tải Chromium cho trình duyệt Anti-detect (Playwright)...
python -m playwright install chromium

echo.
echo ========================================================
echo   HOÀN TẤT CÀI ĐẶT MÔI TRƯỜNG CHO REUPYTB THÀNH CÔNG!
echo   Bây giờ bạn có thể mở reupytb và tạo hồ sơ bình thường.
echo ========================================================
echo.
pause

