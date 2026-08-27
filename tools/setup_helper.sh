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
for c in python3.13 python3.12 python3.11 python3.10 python3; do
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
# Homebrew は入っていても PATH に無いことがある（特に Apple Silicon の
# /opt/homebrew/bin）。決め打ちの場所も見てから判断する。
BREW=""
for b in "$(command -v brew 2>/dev/null)" /opt/homebrew/bin/brew /usr/local/bin/brew; do
  [ -n "$b" ] && [ -x "$b" ] && { BREW="$b"; break; }
done
[ -n "$BREW" ] && eval "$("$BREW" shellenv)" 2>/dev/null || true

if ! command -v ffmpeg >/dev/null 2>&1; then
  if [ -n "$BREW" ]; then
    echo "      見つからないので Homebrew で入れます..."
    "$BREW" install ffmpeg || die "ffmpeg を入れられませんでした"
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
# ここで取り出すフォルダ（開発用の写しでは next/tools になる）
SUBDIR="tools"
mkdir -p "$DEST/tools"
# unzip は日本語のファイル名で止まることがある（Illegal byte sequence）。
# 実際に Mac で失敗した。必要なのは tools だけなので、Python で該当分だけ取り出す。
"$PY" - "$TMP/src.zip" "$DEST/tools" "$SUBDIR" <<'PYEOF' || die "展開に失敗しました"
import sys, os, zipfile
zp, dest, subdir = sys.argv[1], sys.argv[2], sys.argv[3].split("/")
n = 0
with zipfile.ZipFile(zp) as z:
    for info in z.infolist():
        if info.is_dir():
            continue
        parts = info.filename.split("/")
        # <リポジトリ>-main/<subdir>/... だけを取り出す
        if parts[1:1 + len(subdir)] != subdir:
            continue
        rel = parts[1 + len(subdir):]
        if not rel:
            continue
        out = os.path.join(dest, *rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with z.open(info) as src, open(out, "wb") as dst:
            dst.write(src.read())
        n += 1
print("      %d 個のファイルを取り出しました" % n)
sys.exit(0 if n else 1)
PYEOF
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
# --upgrade を付けないと、古い版が入ったままになる。
# 実際に demucs 4.0 系のまま残って、保存の段で落ちた例がある。
"$VPY" -m pip install --upgrade -r "$DEST/tools/requirements.txt" || die "ライブラリのインストールに失敗しました"

# 入っただけでは動くとは限らない。実際に読み込んで確かめる。
# 版が古くて中身が違う（demucs.api が無い等）ことがあるため。
echo "      確認しています..."
CHECK="$("$VPY" - <<'EOF'
miss = []
for name in ("faster_whisper", "demucs", "pykakasi", "numpy", "soundfile"):
    try:
        __import__(name)
    except Exception as e:
        miss.append(name + " -> " + str(e))
# torchaudio は新しい demucs では使わないので必須にしない。
# 入っているのに書き出す部品が無い場合だけ知らせる。
try:
    import torchaudio
    if not torchaudio.list_audio_backends():
        print("note: torchaudio に書き出す部品がありません（soundfile を入れてあります）")
except Exception:
    pass
import demucs
dv = getattr(demucs, "__version__", "0")
if tuple(int(x) for x in str(dv).split(".")[:2] if x.isdigit()) < (4, 1):
    miss.append("demucs " + str(dv) + " は古すぎます。4.1.0 以上が要ります")
try:
    import demucs.api
except Exception:
    try:
        import demucs
        v = getattr(demucs, "__version__", "?")
    except Exception:
        v = "?"
    print("note: demucs " + str(v) + " には api が無いので、コマンド版を使います")
if miss:
    print("MISSING")
    for m in miss:
        print("  " + m)
EOF
)"
[ -n "$CHECK" ] && echo "$CHECK" | sed "s/^/      /"
echo "$CHECK" | grep -q "^MISSING$" && die "必要なものが読み込めませんでした（上の行を担当者へ送ってください）"
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
  # 新しい macOS は bootstrap、古いものは load。両方試す
  launchctl bootout "gui/$(id -u)/com.utamita05.helper" 2>/dev/null || true
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null     || launchctl load "$PLIST"     || die "自動起動の登録に失敗しました"
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
