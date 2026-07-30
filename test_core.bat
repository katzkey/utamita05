@echo off
title utamita05 core test
cd /d "%~dp0"

echo Running Phase 0 core tests...
echo.
echo URL: http://localhost:8768/app/core/test.html
echo (Close this window to stop)
echo.

start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8768/app/core/test.html"

python -m http.server 8768

pause
