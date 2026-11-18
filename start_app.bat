@echo off
setlocal
cd /d "%~dp0"
echo ===================================================
echo     DANG KHOI DONG RETUBEMATRIX
echo ===================================================

rem Don sach cac tien trinh cu bi treo ngam neu co de tranh single-instance lock
tasklist /FI "IMAGENAME eq RETubeMatrix.exe" 2>NUL | find /I /N "RETubeMatrix.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Phat hien tien trinh RETubeMatrix dang chay ngam, dang don dep de mo cua so moi...
    taskkill /F /IM RETubeMatrix.exe >nul 2>&1
    timeout /t 1 /nobreak >nul
)

if exist "%~dp0RETubeMatrix_new.exe" (
    echo Dang cap nhat ban build moi...
    move /y "%~dp0RETubeMatrix_new.exe" "%~dp0RETubeMatrix.exe" >nul 2>&1
)

if exist "%~dp0RETubeMatrix.exe" (
    echo Dang khoi chay RETubeMatrix...
    start "" "%~dp0RETubeMatrix.exe"
    exit /b 0
)

if exist "%~dp0src-tauri\target\release\RETubeMatrix.exe" (
    echo Dang khoi chay RETubeMatrix tu release build...
    start "" "%~dp0src-tauri\target\release\RETubeMatrix.exe"
    exit /b 0
)

if exist "%~dp0src-tauri\target\debug\RETubeMatrix.exe" (
    echo Dang khoi chay RETubeMatrix tu debug build...
    start "" "%~dp0src-tauri\target\debug\RETubeMatrix.exe"
    exit /b 0
)

echo Khong tim thay binary release. Dang khoi chay qua moi truong dev...
call bun run tauri:dev
