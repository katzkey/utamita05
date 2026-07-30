# utamita05 ローカルサーバ
# python -m http.server を拡張：
#   - 静的ファイル配信（標準）
#   - GET /pick-file?accept=image,video → OS ファイル選択ダイアログ、絶対パスを返す
#
# PowerShell の WinForms OpenFileDialog を使うので Windows 専用。

import http.server
import json
import subprocess
import sys
from urllib.parse import urlparse, parse_qs

PORT = 8768

ACCEPT_FILTERS = {
    "image": "Images|*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.tif;*.tiff;*.webp",
    "video": "Videos|*.mp4;*.mov;*.avi;*.mkv;*.webm",
    "image,video": "Images and Videos|*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.tif;*.tiff;*.webp;*.mp4;*.mov;*.avi;*.mkv;*.webm",
    "audio": "Audio|*.mp3;*.wav;*.aac;*.flac;*.ogg;*.m4a;*.mp4;*.m4v",
    "json": "JSON|*.json",
    "any": "All files|*.*",
}

def pick_file_with_powershell(accept_key="any", title="ファイルを選択"):
    primary_filter = ACCEPT_FILTERS.get(accept_key, ACCEPT_FILTERS["any"])
    all_filter = ACCEPT_FILTERS["any"]
    full_filter = primary_filter + "|" + all_filter
    safe_filter = full_filter.replace("'", "''")
    safe_title = title.replace("'", "''")
    # WinForms は STA で動かす。出力は UTF-8 で明示。
    ps_script = (
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "Add-Type -AssemblyName System.Windows.Forms | Out-Null; "
        "Add-Type -AssemblyName System.Drawing | Out-Null; "
        # ダイアログを最前面化するためのオーナー：画面中央、ほぼ不可視サイズ
        "$owner = New-Object System.Windows.Forms.Form; "
        "$owner.Text = ''; "
        "$owner.TopMost = $true; "
        "$owner.ShowInTaskbar = $false; "
        "$owner.FormBorderStyle = 'FixedToolWindow'; "
        "$owner.Size = New-Object System.Drawing.Size(1,1); "
        "$owner.Opacity = 0.01; "
        "$owner.StartPosition = 'CenterScreen'; "
        "$owner.Show(); "
        "$owner.BringToFront(); "
        "$owner.Activate(); "
        "[System.Windows.Forms.Application]::DoEvents(); "
        "$d = New-Object System.Windows.Forms.OpenFileDialog; "
        f"$d.Filter = '{safe_filter}'; "
        f"$d.Title = '{safe_title}'; "
        "$d.Multiselect = $false; "
        "$d.RestoreDirectory = $true; "
        "$null = $d.ShowDialog($owner); "
        "$owner.Close(); $owner.Dispose(); "
        "if ($d.FileName) { [Console]::Out.Write($d.FileName) }"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-STA", "-Command", ps_script],
            capture_output=True,
            timeout=300,
        )
        # PowerShell の stdout を UTF-8 として解釈、BOM/改行を除去
        raw = result.stdout or b""
        text = raw.decode("utf-8", errors="replace").lstrip("﻿").strip()
        if result.returncode != 0:
            err = (result.stderr or b"").decode("utf-8", errors="replace").strip()
            print("[pick-file] PowerShell stderr:", err, file=sys.stderr)
        print("[pick-file] picked:", repr(text), file=sys.stderr)
        return text
    except Exception as e:
        print("[pick-file] error:", e, file=sys.stderr)
        return ""


_FONT_CACHE = None

def list_system_fonts():
    """PowerShell で InstalledFontCollection を列挙。結果はプロセス内キャッシュ。"""
    global _FONT_CACHE
    if _FONT_CACHE is not None:
        return _FONT_CACHE
    ps_script = (
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "Add-Type -AssemblyName System.Drawing | Out-Null; "
        "$c = New-Object System.Drawing.Text.InstalledFontCollection; "
        "$c.Families | ForEach-Object { $_.Name } | Sort-Object -Unique"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True,
            timeout=15,
        )
        raw = (result.stdout or b"").decode("utf-8", errors="replace")
        names = [line.strip() for line in raw.splitlines() if line.strip()]
        _FONT_CACHE = names
        return names
    except Exception as e:
        print("[fonts] error:", e, file=sys.stderr)
        return []


class Handler(http.server.SimpleHTTPRequestHandler):
    # CORS 許可（同一オリジンだが念のため）
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, format, *args):
        # 最低限のログ
        sys.stderr.write("[%s] %s\n" % (self.address_string(), format % args))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/fonts":
            names = list_system_fonts()
            body = json.dumps({"fonts": names}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/pick-file":
            qs = parse_qs(parsed.query)
            accept = (qs.get("accept", ["any"])[0]).lower()
            title = qs.get("title", ["ファイルを選択"])[0]
            path = pick_file_with_powershell(accept, title)
            body = json.dumps({"path": path}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/file":
            self.handle_file(parsed)
            return
        super().do_GET()

    def handle_file(self, parsed):
        import os
        qs = parse_qs(parsed.query)
        path = qs.get("path", [""])[0]
        if not path or not os.path.exists(path):
            self.send_response(404)
            self.end_headers()
            return
        size = os.path.getsize(path)
        ext = os.path.splitext(path)[1].lower()
        mime_map = {
            ".mp3": "audio/mpeg", ".wav": "audio/wav",
            ".m4a": "audio/mp4", ".aac": "audio/aac",
            ".ogg": "audio/ogg", ".flac": "audio/flac",
            ".mp4": "video/mp4", ".m4v": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".gif": "image/gif",
        }
        mime = mime_map.get(ext, "application/octet-stream")

        # Range リクエスト対応（音声/動画のシーク用）
        range_header = self.headers.get("Range", "")
        start = 0
        end = size - 1
        partial = False
        if range_header.startswith("bytes="):
            try:
                rng = range_header.replace("bytes=", "")
                parts = rng.split("-")
                if parts[0]:
                    start = int(parts[0])
                if parts[1]:
                    end = int(parts[1])
                partial = True
            except Exception:
                partial = False

        length = end - start + 1
        try:
            with open(path, "rb") as f:
                f.seek(start)
                if partial:
                    self.send_response(206)
                    self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                else:
                    self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(64 * 1024, remaining))
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except (BrokenPipeError, ConnectionResetError):
                        return
                    remaining -= len(chunk)
        except Exception as e:
            print("[file] error:", e, file=sys.stderr)


def main():
    addr = ("127.0.0.1", PORT)
    httpd = http.server.ThreadingHTTPServer(addr, Handler)
    print(f"utamita05 server on http://127.0.0.1:{PORT}/")
    print(f"  app:       http://127.0.0.1:{PORT}/app/")
    print(f"  pick-file: GET /pick-file?accept=image,video")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()


if __name__ == "__main__":
    main()
