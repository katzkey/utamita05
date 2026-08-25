#!/bin/bash
# うたみた05 ヘルパーを手で立ち上げる（macOS / Linux）
#
# ふだんはログイン時に自動で立ち上がるので、これを使うのは
# 止まってしまったときだけ。
#
# 使い方（ターミナルに貼り付ける）:
#   bash "$HOME/Library/Application Support/utamita05/next/tools/start_helper.sh"

set -u
DEST="$HOME/Library/Application Support/utamita05"
[ "$(uname)" = "Darwin" ] || DEST="$HOME/.local/share/utamita05"
VPY="$DEST/venv/bin/python"

if [ ! -x "$VPY" ]; then
  echo "セットアップがまだのようです。先に次の 1 行を実行してください。"
  echo
  echo "    curl -fsSL https://katzkey.github.io/utamita05/next/tools/setup_helper.sh | bash"
  echo
  exit 1
fi

echo "============================================================"
echo "  うたみた05 ヘルパー"
echo "  使っている間はこの窓を閉じないでください。"
echo "============================================================"
echo
exec "$VPY" "$DEST/tools/helper_server.py"
