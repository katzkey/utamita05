#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
うたみた05 ローカルヘルパー

GitHub Pages 上のアプリから叩かれて、重い処理（ボーカル分離・書き起こし）を
この PC で実行する。アプリ本体はローカルに置かないので、push すれば全員最新、
という配布の利点はそのまま。

  python helper_server.py            # http://127.0.0.1:8777 で待ち受け

API
  GET  /ping                 疎通確認
  POST /jobs                 multipart: song=<ファイル>, lines=<JSON配列>
                             → {"jobId": "..."}
  GET  /jobs/<id>            進捗 → {"status","steps":[{key,label,percent}],...}
  GET  /jobs/<id>/result     完了後の結果 JSON
  POST /jobs/<id>/cancel     中止

https のページから http://localhost を叩けることは検証済み。
CORS と Private Network Access のヘッダを返す必要がある（下の _cors）。
"""

import io, json, os, re, subprocess, sys, tempfile, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def parse_multipart(body, boundary):
    """multipart/form-data の最小パーサ。
    Python 3.13 で cgi モジュールが削除されたため自前で持つ（依存を増やさないため）。
    戻り値: {name: {"filename": str|None, "value": bytes}}
    """
    sep = b"--" + boundary
    out = {}
    for part in body.split(sep):
        if not part or part in (b"--\r\n", b"--"):
            continue
        part = part.lstrip(b"\r\n")
        if part.startswith(b"--"):
            continue
        head, _, data = part.partition(b"\r\n\r\n")
        if not _:
            continue
        data = data[:-2] if data.endswith(b"\r\n") else data
        name = filename = None
        for line in head.split(b"\r\n"):
            if line.lower().startswith(b"content-disposition:"):
                text = line.decode("utf-8", "replace")
                m = re.search(r'name="([^"]*)"', text)
                if m:
                    name = m.group(1)
                m = re.search(r'filename="([^"]*)"', text)
                if m:
                    filename = m.group(1)
        if name:
            out[name] = {"filename": filename, "value": data}
    return out

HERE = os.path.dirname(os.path.abspath(__file__))
AUTO_TIMING = os.path.join(HERE, "auto_timing.py")
PORT = int(os.environ.get("UTAMITA_HELPER_PORT", "8777"))

# 許可するオリジン。ローカルで開いた場合にも使えるよう複数許可。
ALLOWED = {
    "https://katzkey.github.io",
    "http://localhost:8000", "http://127.0.0.1:8000",
    "http://localhost:5500", "http://127.0.0.1:5500",
}

STEPS = [
    ("extract",    "音声を取り出す"),
    ("separate",   "ボーカルを分離する"),
    ("transcribe", "歌声を書き起こす"),
    ("align",      "歌詞と対応づける"),
    ("snap",       "歌い出しに合わせる"),
]

JOBS = {}
LOCK = threading.Lock()


def new_job():
    return {
        "status": "running",           # running | done | error | canceled
        "steps": {k: 0.0 for k, _ in STEPS},
        "result": None, "error": None,
        "startedAt": time.time(), "elapsed": 0.0,
        "proc": None, "workdir": None,
    }


def run_job(job_id, song_path, lines, model):
    job = JOBS[job_id]
    workdir = tempfile.mkdtemp(prefix="utamita_job_")
    job["workdir"] = workdir
    lyr_path = os.path.join(workdir, "lyrics.txt")
    out_path = os.path.join(workdir, "timing.json")
    with io.open(lyr_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    cmd = [sys.executable, AUTO_TIMING, "--progress", "json",
           "--song", song_path, "--lyrics", lyr_path, "--out", out_path,
           "--model", model]
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             env=env, text=True, encoding="utf-8", errors="replace")
        job["proc"] = p
        for line in p.stdout:
            line = line.strip()
            if not line or not line.startswith("{"):
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get("type") == "progress":
                with LOCK:
                    job["steps"][d["step"]] = d["percent"]
                    job["elapsed"] = time.time() - job["startedAt"]
            elif d.get("type") == "error":
                job["error"] = d.get("message")
        p.wait()
        if job["status"] == "canceled":
            return
        if p.returncode != 0:
            job["status"] = "error"
            job["error"] = job["error"] or f"処理が異常終了しました (code {p.returncode})"
            return
        with io.open(out_path, encoding="utf-8") as f:
            job["result"] = json.load(f)
        job["status"] = "done"
        job["elapsed"] = time.time() - job["startedAt"]
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)


class H(BaseHTTPRequestHandler):
    server_version = "UtamitaHelper/1.0"

    # ---------- 共通 ----------
    def _cors(self):
        origin = self.headers.get("Origin", "")
        self.send_header("Access-Control-Allow-Origin", origin if origin in ALLOWED else "null")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin")

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    # ---------- ルーティング ----------
    def do_GET(self):
        if self.path == "/ping":
            return self._json({"ok": True, "version": 1,
                               "steps": [{"key": k, "label": l} for k, l in STEPS]})
        m = re.match(r"^/jobs/([\w-]+)$", self.path)
        if m:
            job = JOBS.get(m.group(1))
            if not job: return self._json({"error": "不明なジョブです"}, 404)
            with LOCK:
                return self._json({
                    "status": job["status"],
                    "elapsed": round(job["elapsed"], 1),
                    "error": job["error"],
                    "steps": [{"key": k, "label": l, "percent": job["steps"][k]} for k, l in STEPS],
                })
        m = re.match(r"^/jobs/([\w-]+)/result$", self.path)
        if m:
            job = JOBS.get(m.group(1))
            if not job: return self._json({"error": "不明なジョブです"}, 404)
            if job["status"] != "done": return self._json({"error": "まだ完了していません"}, 409)
            return self._json(job["result"])
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        m = re.match(r"^/jobs/([\w-]+)/cancel$", self.path)
        if m:
            job = JOBS.get(m.group(1))
            if not job: return self._json({"error": "不明なジョブです"}, 404)
            job["status"] = "canceled"
            if job.get("proc"):
                try: job["proc"].terminate()
                except Exception: pass
            return self._json({"ok": True})

        if self.path != "/jobs":
            return self._json({"error": "not found"}, 404)

        ctype = self.headers.get("Content-Type", "")
        m = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', ctype)
        if "multipart/form-data" not in ctype or not m:
            return self._json({"error": "multipart/form-data で送ってください"}, 400)
        boundary = (m.group(1) or m.group(2)).strip().encode()

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        fields = parse_multipart(body, boundary)

        if "song" not in fields or "lines" not in fields:
            return self._json({"error": "song と lines が必要です"}, 400)

        try:
            lines = json.loads(fields["lines"]["value"].decode("utf-8"))
            lines = [str(x).strip() for x in lines if str(x).strip()]
        except Exception:
            return self._json({"error": "lines の JSON が読めません"}, 400)
        if not lines:
            return self._json({"error": "歌詞が空です"}, 400)

        name = os.path.basename(fields["song"]["filename"] or "song.bin")
        workdir = tempfile.mkdtemp(prefix="utamita_up_")
        song_path = os.path.join(workdir, name)
        with open(song_path, "wb") as f:
            f.write(fields["song"]["value"])

        model = fields.get("model", {}).get("value", b"medium").decode("utf-8", "replace")
        job_id = uuid.uuid4().hex[:12]
        JOBS[job_id] = new_job()
        threading.Thread(target=run_job, args=(job_id, song_path, lines, model), daemon=True).start()
        return self._json({"jobId": job_id, "lines": len(lines)})

    def log_message(self, fmt, *args):
        sys.stderr.write("[helper] " + (fmt % args) + "\n")


if __name__ == "__main__":
    print("=" * 58)
    print("  うたみた05 ローカルヘルパー")
    print(f"  http://127.0.0.1:{PORT}  で待ち受け中")
    print("  このウィンドウは開いたままにしてください")
    print("  終了するには Ctrl+C")
    print("=" * 58)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
