@echo off
cd /d "%~dp0"
echo Starting RETubeMatrix...

if exist "%~dp0src-tauri\target\release\RETubeMatrix.exe" (
    start "" "%~dp0src-tauri\target\release\RETubeMatrix.exe"
) else if exist "%~dp0src-tauri\target\debug\RETubeMatrix.exe" (
    start "" "%~dp0src-tauri\target\debug\RETubeMatrix.exe"
) else if exist "%~dp0src-tauri\target\debug\youwee.exe" (
    start "" "%~dp0src-tauri\target\debug\youwee.exe"
) else (
    echo Khong tim thay binary. Dang khoi chay tauri dev...
    call bun run tauri:dev
)
