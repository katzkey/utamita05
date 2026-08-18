#!/bin/bash
# うたみた05 ヘルパーのセットアップ（macOS / Linux）
#
# 使い方（ターミナルに貼り付ける）:
#   curl -fsSL https://katzkey.github.io/utamita05/tools/setup_helper.sh | bash
#
# .command を配らないのは、ダウンロードしたファイルには実行権限が付かず、
# Gatekeeper にも止められて、結局ターミナルでの操作が要るため。
# それなら最初から 1 行で済ませたほうが早い。

set -u
DEST="$HOME/Library/Application Support/utamita05"
[ "$(uname)" = "Darwin" ] || DEST="$HOME/.local/share/utamita05"
ZIPURL="https://github.com/katzkey/utamita05/archive/refs/heads/main.zip"

echo "============================================================"
echo "  うたみた05 ヘルパーのセットアップ"
echo "============================================================"
echo
echo "  この Mac に、うたみた05 が使う音声処理のソフトを入れます。"
echo
echo "    ・ffmpeg           音声と映像を扱う道具"
echo "    ・Python 用の部品   歌声の聞き取りとボーカル分離に使う"
echo
echo "  合わせて 1〜2GB、10〜30 分かかります。"
echo "  入れる先 : $DEST"
echo "  やめるときは Control + C を押してください。"
echo
printf "  続けますか？ [Enter で続行] "
read -r _ < /dev/tty || true
echo

die() { echo; echo "  ✗ $1"; echo; exit 1; }

# ---------- 1. Python ----------
echo "[1/5] Python を確認しています..."
PY=""
for c in python3.12 python3.11 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" 2>/dev/null; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  echo
  echo "  Python 3.9 以上が見つかりませんでした。"
  echo "  ターミナルで次を実行してから、もう一度お試しください。"
  echo
  echo "      xcode-select --install"
  echo
  die "Python が要ります"
fi
echo "      OK ($PY $("$PY" -c 'import platform;print(platform.python_version())'))"
echo

# ---------- 2. ffmpeg ----------
echo "[2/5] ffmpeg を確認しています..."
if ! command -v ffmpeg >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "      見つからないので Homebrew で入れます..."
    brew install ffmpeg || die "ffmpeg を入れられませんでした"
  else
    echo
    echo "  ffmpeg が無く、Homebrew も入っていません。"
    echo "  次の 1 行で Homebrew を入れてから、もう一度お試しください。"
    echo
    echo '      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo
    die "ffmpeg が要ります"
  fi
fi
echo "      OK"
echo

# ---------- 3. 本体を取ってくる ----------
echo "[3/5] ヘルパー本体をダウンロードしています..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$ZIPURL" -o "$TMP/src.zip" || die "ダウンロードに失敗しました"
unzip -q "$TMP/src.zip" -d "$TMP/ex" || die "展開に失敗しました"
SRC="$(find "$TMP/ex" -maxdepth 2 -type d -name tools | head -1)"
[ -n "$SRC" ] || die "tools フォルダが見つかりませんでした"
mkdir -p "$DEST/tools"
cp -R "$SRC/." "$DEST/tools/"
# ZIP 経由だと実行権限が落ちるので付け直す
chmod +x "$DEST/tools/"*.sh 2>/dev/null || true
echo "      OK"
echo

# ---------- 4. ライブラリ ----------
# macOS の python は pip での直接インストールを拒む（PEP 668）ので、
# 専用の入れ物（venv）を作ってその中に入れる。他の環境も汚さない。
echo "[4/5] 必要なライブラリを入れています（ここが長いです）..."
"$PY" -m venv "$DEST/venv" || die "venv を作れませんでした"
VPY="$DEST/venv/bin/python"
"$VPY" -m pip install --upgrade pip >/dev/null || true
"$VPY" -m pip install -r "$DEST/tools/requirements.txt" || die "ライブラリのインストールに失敗しました"
echo "      OK"
echo

# ---------- 5. 自動起動 ----------
echo "[5/5] ログイン時に自動で立ち上がるよう登録しています..."
if [ "$(uname)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.utamita05.helper.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.utamita05.helper</string>
  <key>ProgramArguments</key>
  <array>
    <string>$DEST/venv/bin/python</string>
    <string>$DEST/tools/helper_server.py</string>
  </array>
  <key>WorkingDirectory</key><string>$DEST/tools</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DEST/helper.log</string>
  <key>StandardErrorPath</key><string>$DEST/helper.log</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
</dict>
</plist>
PLISTEOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST" || die "自動起動の登録に失敗しました"
else
  echo "      macOS 以外なので登録は省略します。"
  echo "      手で動かすとき： \"$DEST/venv/bin/python\" \"$DEST/tools/helper_server.py\""
fi
echo "      OK"
echo

# 立ち上がったか確かめる
echo "ヘルパーの応答を待っています..."
for i in $(seq 1 20); do
  if curl -fsS -m 2 http://127.0.0.1:8777/ping >/dev/null 2>&1; then
    echo "  ✓ 動いています。"
    break
  fi
  sleep 1
  [ "$i" = "20" ] && echo "  △ まだ応答がありません。ログ: $DEST/helper.log"
done

echo
echo "============================================================"
echo "  終わりました。"
echo
echo "  ヘルパーは今から動いています（画面には出ません）。"
echo "  次回からはログインすれば自動で立ち上がります。"
echo
echo "  アプリに戻って画面を更新してください。"
echo "  https://katzkey.github.io/utamita05/app/"
echo "============================================================"
echo
