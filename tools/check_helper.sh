#!/bin/bash
# うたみた05 ヘルパーの状態を調べる（macOS / Linux）
#
#   curl -fsSL https://katzkey.github.io/utamita05/tools/check_helper.sh | bash
#
# 出た内容をそのまま担当者へ送ってください。

DEST="$HOME/Library/Application Support/utamita05"
[ "$(uname)" = "Darwin" ] || DEST="$HOME/.local/share/utamita05"

echo "==== うたみた05 ヘルパーの状態 ===="
echo "日時    : $(date)"
echo "OS      : $(uname -s) $(uname -r) / $(uname -m)"
[ "$(uname)" = "Darwin" ] && echo "macOS   : $(sw_vers -productVersion 2>/dev/null)"
echo
echo "-- 道具 --"
for c in python3 ffmpeg brew curl unzip; do
  p="$(command -v $c 2>/dev/null)"
  echo "$c : ${p:-（無し）}"
done
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  [ -x "$b" ] && echo "brew（PATH 外）: $b"
done
echo
echo "-- 入れた先 --"
echo "$DEST"
if [ -d "$DEST" ]; then
  echo "tools のファイル数 : $(ls -1 "$DEST/tools" 2>/dev/null | wc -l | tr -d " ")"
  echo "start_helper.sh    : $([ -f "$DEST/tools/start_helper.sh" ] && echo あり || echo 無し)"
  echo "venv の python     : $([ -x "$DEST/venv/bin/python" ] && echo あり || echo 無し)"
  if [ -x "$DEST/venv/bin/python" ]; then
    echo "入っているもの     :"
    "$DEST/venv/bin/python" -m pip list 2>/dev/null | grep -Ei "faster-whisper|demucs|pykakasi|numpy|torch" | sed "s/^/    /"
  fi
else
  echo "（フォルダがありません＝セットアップが終わっていません）"
fi
echo
echo "-- 自動起動 --"
PLIST="$HOME/Library/LaunchAgents/com.utamita05.helper.plist"
echo "plist : $([ -f "$PLIST" ] && echo あり || echo 無し)"
launchctl list 2>/dev/null | grep utamita05 | sed "s/^/    /" || echo "    （動いていません）"
echo
echo "-- 応答 --"
if curl -fsS -m 3 http://127.0.0.1:8777/ping >/dev/null 2>&1; then
  echo "127.0.0.1:8777 : 応答あり（ヘルパーは動いています）"
else
  echo "127.0.0.1:8777 : 応答なし"
fi
echo
echo "-- 最後のログ 20 行 --"
tail -20 "$DEST/helper.log" 2>/dev/null || echo "（ログがありません）"
echo "==== ここまで ===="
