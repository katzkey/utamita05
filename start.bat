@echo off
title utamita05
cd /d "%~dp0"

echo ===========================================
echo  utamita05
echo ===========================================
echo.
echo URL: http://localhost:8768/app/
echo (Close this window to stop)
echo.

start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8768/app/"

python server.py

echo.
echo Server stopped.
pause
