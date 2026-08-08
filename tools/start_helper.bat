@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo うたみた05 ローカルヘルパーを起動します
echo このウィンドウは閉じないでください
echo.
python helper_server.py
pause
