@echo off
cd /d "d:\TOOL DUNG CODE\reupytb"
start "reupytb-Vite" /min cmd /k "call npm run dev"
timeout /t 2 /nobreak >nul
start "reupytb-App" /D "d:\TOOL DUNG CODE\reupytb" "d:\TOOL DUNG CODE\reupytb\src-tauri\target\debug\youwee.exe"
start "reupytb-Browser" /D "d:\TOOL DUNG CODE\reupytb" cmd /k "python browser_engine/runner.py --action open_profile --profile-id a82cd01c"
