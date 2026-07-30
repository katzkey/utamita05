@echo off
title utamita05 stop
echo Stopping utamita05 server on port 8768...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:":8768 " ^| findstr /C:"LISTENING"') do (
    echo   Killing PID %%P
    taskkill /PID %%P /F >nul 2>&1
)
echo Done.
timeout /t 2 /nobreak >nul
