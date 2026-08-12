@echo off
setlocal
chcp 65001 > nul
title うたみた05 ヘルパーのセットアップ

rem このファイル 1 つで、ヘルパーの動作に必要なものを一式そろえる。
rem アプリの「ヘルパーが見つかりません」から落としてもらう想定なので、
rem ダウンロードフォルダに置かれたまま実行されても動くようにしてある。
rem 置き場所は %LOCALAPPDATA%\utamita05 に固定する。

set "DEST=%LOCALAPPDATA%\utamita05"
set "ZIPURL=https://github.com/katzkey/utamita05/archive/refs/heads/main.zip"

echo ============================================================
echo   うたみた05 ヘルパーのセットアップ
echo ============================================================
echo.
echo  入れる先 : %DEST%
echo.
echo  ※ 途中で 1〜2GB のダウンロードがあります（音声処理のライブラリ）。
echo     回線によっては 10〜30 分かかります。
echo.
pause
echo.

rem ---------- 1. Python ----------
echo [1/5] Python を確認しています...
set "PY="
python -c "import sys" >nul 2>&1 && set "PY=python"
if not defined PY py -3 -c "import sys" >nul 2>&1 && set "PY=py -3"

if not defined PY (
  echo.
  echo   Python が見つかりませんでした。
  echo   ブラウザで配布ページを開きます。インストールのとき
  echo   「Add python.exe to PATH」に必ずチェックを入れてください。
  echo   入れ終わったら、このファイルをもう一度実行してください。
  echo.
  start https://www.python.org/downloads/windows/
  pause
  exit /b 1
)
echo       OK
echo.

rem ---------- 2. ffmpeg ----------
echo [2/5] ffmpeg を確認しています...
where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo       見つからないので winget で入れます...
  winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
  where ffmpeg >nul 2>&1
  if errorlevel 1 (
    echo.
    echo   ffmpeg を入れられませんでした。
    echo   入った直後は PATH が反映されないことがあります。
    echo   いったんこの窓を閉じ、開き直してからもう一度実行してください。
    echo   それでも駄目なら https://www.gyan.dev/ffmpeg/builds/ から手で入れてください。
    echo.
    pause
    exit /b 1
  )
)
echo       OK
echo.

rem ---------- 3. 本体を取ってくる ----------
echo [3/5] ヘルパー本体をダウンロードしています...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$tmp = Join-Path $env:TEMP 'utamita05_dl.zip';" ^
  "Invoke-WebRequest -Uri '%ZIPURL%' -OutFile $tmp;" ^
  "$ex = Join-Path $env:TEMP 'utamita05_ex';" ^
  "if (Test-Path $ex) { Remove-Item $ex -Recurse -Force }" ^
  "; Expand-Archive -Path $tmp -DestinationPath $ex -Force;" ^
  "$src = Join-Path (Get-ChildItem $ex -Directory | Select-Object -First 1).FullName 'tools';" ^
  "$dst = Join-Path '%DEST%' 'tools';" ^
  "New-Item -ItemType Directory -Force -Path $dst | Out-Null;" ^
  "Copy-Item (Join-Path $src '*') $dst -Recurse -Force;" ^
  "Remove-Item $tmp,$ex -Recurse -Force"
if errorlevel 1 (
  echo.
  echo   ダウンロードに失敗しました。回線と、社内のフィルタを確認してください。
  echo.
  pause
  exit /b 1
)
echo       OK
echo.

rem ---------- 4. ライブラリ ----------
echo [4/5] 必要なライブラリを入れています（ここが長いです）...
%PY% -m pip install --upgrade pip
%PY% -m pip install -r "%DEST%\tools\requirements.txt"
if errorlevel 1 (
  echo.
  echo   ライブラリのインストールに失敗しました。
  echo   上に出ているメッセージを、そのまま担当者へ送ってください。
  echo.
  pause
  exit /b 1
)
echo       OK
echo.

rem ---------- 5. 自動起動の登録と起動 ----------
echo [5/5] PC 起動時に自動で立ち上がるよう登録しています...
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\tools\install_autostart.ps1"
echo.

echo ============================================================
echo   終わりました。
echo.
echo   ヘルパーは今から動いています（画面には出ません）。
echo   次回からは PC を起動すれば自動で立ち上がります。
echo.
echo   アプリに戻って画面を更新してください。
echo   https://katzkey.github.io/utamita05/app/
echo ============================================================
echo.
pause
