@echo off
echo ==========================================================
echo 💠 GTest Architect v8.0.6 - Force Refresh & Rebuild 🚀
echo ==========================================================

echo [1/4] Killing zombie Node.js processes...
taskkill /f /im node.exe >nul 2>&1

echo [2/4] Verifying dependencies...
call npm install --no-audit --no-fund

echo [3/4] Starting Production Server v8.0.6...
REM (Keys are loaded automatically from .env or Windows Variables)
echo.
echo 💠 SUCCESS! Launching GTest Architect...
call gtest-gen.bat ui
pause
