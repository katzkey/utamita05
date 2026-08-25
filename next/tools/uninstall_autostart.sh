#!/bin/bash
# 自動起動をやめる（macOS）
PLIST="$HOME/Library/LaunchAgents/com.utamita05.helper.plist"
if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null
  rm -f "$PLIST"
  echo "自動起動を解除しました。"
else
  echo "登録されていません。"
fi
