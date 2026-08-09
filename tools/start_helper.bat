@echo off
setlocal
chcp 65001 > nul
cd /d "%~dp0"

echo ============================================================
echo   utamita05 local helper
echo   Keep this window open while you use the app.
echo ============================================================
echo.

rem python / py の順に探す（Microsoft Store のダミーは除外したいので実行して確かめる）
set "PY="
python -c "import sys" >nul 2>&1 && set "PY=python"
if not defined PY py -3 -c "import sys" >nul 2>&1 && set "PY=py -3"

if not defined PY (
  echo [ERROR] Python が見つかりません。
  echo         https://www.python.org/ からインストールしてください。
  echo.
  pause
  exit /b 1
)

%PY% helper_server.py

echo.
echo ヘルパーが終了しました。
pause
