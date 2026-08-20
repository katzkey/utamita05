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

import io, json, os, re, shutil, subprocess, sys, tempfile, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


# ---- 処理中だけスリープを抑止する ----
# 書き出しや解析は数分かかるが、Windows の待機判定は CPU 負荷ではなく操作の有無で
# 決まるため、席を外すと処理中でもスリープに入ってしまう。
#
# SetThreadExecutionState は「呼んだスレッド」に対して効き、そのスレッドが
# 終われば自動で解除される。なのでジョブのスレッド内で完結させる。
# （グローバルに数えると、解除が別スレッドで呼ばれて噛み合わない）
ES_CONTINUOUS      = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001


def _set_awake(on):
    """戻り値: 成功したか。効かない環境や失敗時は False。"""
    if os.name != "nt":
        return False
    try:
        import ctypes
        flags = (ES_CONTINUOUS | ES_SYSTEM_REQUIRED) if on else ES_CONTINUOUS
        prev = ctypes.windll.kernel32.SetThreadExecutionState(ctypes.c_uint(flags))
        return prev != 0
    except Exception:
        return False   # 抑止できなくても処理自体は続けたい


class KeepAwake:
    """with で囲んだ間だけスリープを抑止する。

    Windows は SetThreadExecutionState、macOS は caffeinate を使う。
    どちらも使えなければ何もしない（抑止できなくても処理は続けたい）。
    """
    def __enter__(self):
        self.ok = _set_awake(True)
        self.proc = None
        if not self.ok and sys.platform == "darwin":
            try:
                # -i: アイドルによるスリープを抑止。この with を抜けたら止める
                self.proc = subprocess.Popen(["caffeinate", "-i"])
            except Exception:
                self.proc = None
        return self

    def __exit__(self, *a):
        if self.ok:
            _set_awake(False)
        if self.proc:
            try:
                self.proc.terminate()
            except Exception:
                pass
        return False


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
RENDER_VIDEO = os.path.join(HERE, "render_video.py")
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

# 動画書き出しの工程
STEPS_RENDER = [
    ("upload", "素材を受け取る"),
    ("encode", "映像を書き出す"),
]

JOBS = {}
LOCK = threading.Lock()

# 終わったジョブを何秒保持するか。
# 書き出し結果の mp4 はこの間ダウンロードできる。過ぎたら一時フォルダごと消す。
RETAIN_SEC = 60 * 60
SWEEP_SEC = 300


def _rm(path):
    if path and os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)


def sweep_jobs():
    """終わってから時間が経ったジョブを片付ける。
    ヘルパーは常駐するので、これが無いと一時フォルダとメモリが増え続ける。"""
    now = time.time()
    with LOCK:
        stale = [k for k, j in JOBS.items()
                 if j["status"] in ("done", "error", "canceled")
                 and now - (j.get("finishedAt") or j["startedAt"]) > RETAIN_SEC]
        for k in stale:
            job = JOBS.pop(k)
        # ロックの外で消したいので集めておく
            for d in job.get("dirs", []):
                _rm(d)


def sweep_orphans():
    """前回の起動で残った一時フォルダを片付ける（1 日以上前のもの）。"""
    base = tempfile.gettempdir()
    cutoff = time.time() - 24 * 3600
    try:
        for name in os.listdir(base):
            if not name.startswith(("utamita_job_", "utamita_up_", "utamita_render_")):
                continue
            path = os.path.join(base, name)
            try:
                if os.path.isdir(path) and os.path.getmtime(path) < cutoff:
                    _rm(path)
            except OSError:
                pass
    except OSError:
        pass


def sweeper():
    while True:
        time.sleep(SWEEP_SEC)
        try:
            sweep_jobs()
        except Exception:
            pass


def new_job(steps=None):
    steps = steps or STEPS
    return {
        "kind": "timing" if steps is STEPS else "render",
        "stepdefs": steps,
        "status": "running",           # running | done | error | canceled
        "steps": {k: 0.0 for k, _ in steps},
        "result": None, "error": None, "tail": [],
        "startedAt": time.time(), "elapsed": 0.0,
        "proc": None, "workdir": None, "outfile": None,
        "dirs": [],          # 終了後に消す一時フォルダ
        "finishedAt": None,
    }


def run_render_job(job_id, workdir, spec_path, out_path):
    """歌詞レイヤーPNGと背景/音声を ffmpeg で合成して MP4 を書き出す。"""
    job = JOBS[job_id]
    job["workdir"] = workdir
    job["dirs"].append(workdir)
    job["steps"]["upload"] = 100.0
    cmd = [sys.executable, RENDER_VIDEO, "--progress", "json",
           "--spec", spec_path, "--out", out_path]
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    try:
        with KeepAwake():
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 env=env, text=True, encoding="utf-8", errors="replace")
            job["proc"] = p
            for line in p.stdout:
                line = line.strip()
                if not line.startswith("{"):
                    # JSON 以外＝スクリプトのエラー本文。捨てると「code 1」しか
                    # 残らず原因が分からなくなるので、末尾だけ取っておく。
                    if line:
                        job["tail"].append(line)
                        del job["tail"][:-40]
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
                elif d.get("type") == "done":
                    job["result"] = {"bytes": d.get("bytes"), "elapsed": d.get("elapsed")}
            p.wait()
            if job["status"] == "canceled":
                return
            if p.returncode != 0 or not os.path.exists(out_path):
                job["status"] = "error"
                job["error"] = job["error"] or ("書き出しに失敗しました"
                    + f"（code {p.returncode}）" + _tail_text(job))
                return
            job["outfile"] = out_path
            job["status"] = "done"
            job["elapsed"] = time.time() - job["startedAt"]
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
    finally:
        job["finishedAt"] = time.time()


def _tail_text(job, keep=12):
    """異常終了したとき、スクリプトが最後に吐いた行を添える。
    これが無いと画面には「code 1」しか出ず、何が起きたのか分からない。"""
    lines = [l for l in job.get("tail", []) if l][-keep:]
    if not lines:
        return ""
    return "\n\n----- 最後の出力 -----\n" + "\n".join(lines)


def run_job(job_id, song_path, lines, model):
    job = JOBS[job_id]
    workdir = tempfile.mkdtemp(prefix="utamita_job_")
    job["workdir"] = workdir
    job["dirs"].append(workdir)
    job["dirs"].append(os.path.dirname(song_path))   # アップロードされた曲の置き場
    lyr_path = os.path.join(workdir, "lyrics.txt")
    out_path = os.path.join(workdir, "timing.json")
    with io.open(lyr_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    cmd = [sys.executable, AUTO_TIMING, "--progress", "json",
           "--song", song_path, "--lyrics", lyr_path, "--out", out_path,
           "--model", model]
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    try:
        with KeepAwake():
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 env=env, text=True, encoding="utf-8", errors="replace")
            job["proc"] = p
            for line in p.stdout:
                line = line.strip()
                if not line or not line.startswith("{"):
                    # JSON 以外＝スクリプトのエラー本文。捨てると「code 1」しか
                    # 残らず原因が分からなくなるので、末尾だけ取っておく。
                    if line:
                        job["tail"].append(line)
                        del job["tail"][:-40]
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
                job["error"] = job["error"] or (
                    f"処理が異常終了しました (code {p.returncode})" + _tail_text(job))
                return
            with io.open(out_path, encoding="utf-8") as f:
                job["result"] = json.load(f)
            job["status"] = "done"
            job["elapsed"] = time.time() - job["startedAt"]
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
    finally:
        job["finishedAt"] = time.time()


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
                    "kind": job.get("kind", "timing"),
                    "steps": [{"key": k, "label": l, "percent": job["steps"][k]}
                              for k, l in job.get("stepdefs", STEPS)],
                })
        m = re.match(r"^/jobs/([\w-]+)/download$", self.path)
        if m:
            job = JOBS.get(m.group(1))
            if not job or not job.get("outfile") or not os.path.exists(job["outfile"]):
                return self._json({"error": "書き出し結果がありません"}, 404)
            data = open(job["outfile"], "rb").read()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Disposition", 'attachment; filename="utamita.mp4"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

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

        if self.path not in ("/jobs", "/render"):
            return self._json({"error": "not found"}, 404)

        ctype = self.headers.get("Content-Type", "")
        m = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', ctype)
        if "multipart/form-data" not in ctype or not m:
            return self._json({"error": "multipart/form-data で送ってください"}, 400)
        boundary = (m.group(1) or m.group(2)).strip().encode()

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        fields = parse_multipart(body, boundary)

        if self.path == "/render":
            return self._handle_render(fields)

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

    def _handle_render(self, fields):
        """歌詞レイヤーPNG + 背景/音声を受け取り、ffmpeg で MP4 を書き出す。"""
        if "spec" not in fields:
            return self._json({"error": "spec が必要です"}, 400)
        try:
            spec = json.loads(fields["spec"]["value"].decode("utf-8"))
        except Exception as e:
            return self._json({"error": "spec の JSON が読めません: " + str(e)}, 400)

        workdir = tempfile.mkdtemp(prefix="utamita_render_")
        os.makedirs(os.path.join(workdir, "layers"), exist_ok=True)

        # layer_0, layer_1, ... を layers/line_000.png として保存し spec に反映
        for i, ln in enumerate(spec.get("lines", [])):
            key = f"layer_{i}"
            if key not in fields:
                return self._json({"error": f"{key} が足りません"}, 400)
            rel = f"layers/line_{i:03d}.png"
            with open(os.path.join(workdir, rel), "wb") as f:
                f.write(fields[key]["value"])
            ln["file"] = rel

        # 背景素材を bg_0, bg_1, ... で受ける。
        # 単色レイヤーはファイルを持たない（ffmpeg 側で色から生成する）ので飛ばす。
        for i, b in enumerate(spec.get("backgrounds", [])):
            if b.get("kind") == "solid":
                continue
            key = f"bg_{i}"
            if key not in fields:
                return self._json({"error": f"背景 {i} のファイルが届いていません"}, 400)
            ext = os.path.splitext(fields[key]["filename"] or "")[1] or ".bin"
            rel = f"bg_{i}{ext}"
            with open(os.path.join(workdir, rel), "wb") as f:
                f.write(fields[key]["value"])
            b["file"] = rel

        # 音声（任意）
        if "audio" in fields and fields["audio"]["value"]:
            ext = os.path.splitext(fields["audio"]["filename"] or "")[1] or ".bin"
            rel = "audio_src" + ext
            with open(os.path.join(workdir, rel), "wb") as f:
                f.write(fields["audio"]["value"])
            spec["audio"] = rel

        spec_path = os.path.join(workdir, "spec.json")
        with io.open(spec_path, "w", encoding="utf-8") as f:
            json.dump(spec, f, ensure_ascii=False, indent=1)
        out_path = os.path.join(workdir, "out.mp4")

        job_id = uuid.uuid4().hex[:12]
        JOBS[job_id] = new_job(STEPS_RENDER)
        threading.Thread(target=run_render_job,
                         args=(job_id, workdir, spec_path, out_path), daemon=True).start()
        return self._json({"jobId": job_id, "lines": len(spec.get("lines", []))})

    def log_message(self, fmt, *args):
        sys.stderr.write("[helper] " + (fmt % args) + "\n")


if __name__ == "__main__":
    sweep_orphans()
    threading.Thread(target=sweeper, daemon=True).start()

    print("=" * 58)
    print("  うたみた05 ローカルヘルパー")
    print(f"  http://127.0.0.1:{PORT}  で待ち受け中")
    print("  このウィンドウは開いたままにしてください")
    print("  終了するには Ctrl+C")
    print("=" * 58)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
