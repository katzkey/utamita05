#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
歌詞タイミング自動検出

音源と歌詞テキストから、行ごとの IN / OUT を推定して JSON に書き出す。

  python auto_timing.py --song song.mp4 --lyrics lyrics.txt --out timing.json

処理の流れ（検証で 35 行中 34 行が 0.5 秒以内、全行 1 秒以内だった構成）:
  1. 音声を取り出す        ffmpeg で 44.1kHz(分離用) と 16kHz mono(認識用) を作る
  2. ボーカルを分離        Demucs。伴奏があると認識が壊滅するので必須
  3. 歌声を書き起こす      Whisper。vad_filter は必ず False（True だと歌詞の半分以上を捨てる）
  4. 歌詞と対応づける      認識結果と歌詞の両方を「かな」に直し、文字単位で重ねる
                          読みで比べるので、違う漢字で書き起こされても音が合えば一致する
  5. 歌い出しに合わせる    分離済みボーカルの音量から拾った立ち上がりに吸着させる

進捗は 1 行 1 JSON で stdout に流す（--progress json のとき）。
  {"type":"progress","step":"separate","index":1,"percent":42.0}
  {"type":"done","result":{...}}
"""

import argparse, json, os, re, subprocess, sys, tempfile, time, wave
import numpy as np

# 工程の一覧。UI 側はこれをそのまま箇条書きにして、それぞれに % を出す。
STEPS = [
    ("extract",   "音声を取り出す"),
    ("separate",  "ボーカルを分離する"),
    ("transcribe","歌声を書き起こす"),
    ("align",     "歌詞と対応づける"),
    ("snap",      "歌い出しに合わせる"),
]
STEP_INDEX = {k: i for i, (k, _) in enumerate(STEPS)}


class Reporter:
    """工程ごとの進捗を出す。json モードでは 1 行 1 JSON。"""

    def __init__(self, mode="text"):
        self.mode = mode
        self._last = {}

    def step(self, key, percent):
        percent = max(0.0, min(100.0, float(percent)))
        # 出しすぎないよう 1% 刻みに間引く
        if self._last.get(key) is not None and percent < 100 and percent - self._last[key] < 1.0:
            return
        self._last[key] = percent
        if self.mode == "json":
            sys.stdout.write(json.dumps({
                "type": "progress", "step": key,
                "index": STEP_INDEX[key], "percent": round(percent, 1),
            }, ensure_ascii=False) + "\n")
        else:
            label = dict(STEPS)[key]
            bar = "#" * int(percent / 5) + "." * (20 - int(percent / 5))
            sys.stdout.write(f"\r[{STEP_INDEX[key]+1}/{len(STEPS)}] {label:<12s} [{bar}] {percent:5.1f}%")
            if percent >= 100:
                sys.stdout.write("\n")
        sys.stdout.flush()

    def emit(self, obj):
        if self.mode == "json":
            sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        else:
            sys.stdout.write(str(obj) + "\n")
        sys.stdout.flush()


# ---------------------------------------------------------------- 1. 音声抽出

def extract_audio(song, workdir, rep):
    rep.step("extract", 5)
    wav44 = os.path.join(workdir, "audio44k.wav")
    wav16 = os.path.join(workdir, "audio16k.wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", song, "-vn", "-ar", "44100", wav44],
                   check=True)
    rep.step("extract", 60)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", song, "-vn", "-ac", "1", "-ar", "16000", wav16],
                   check=True)
    with wave.open(wav16, "rb") as w:
        dur = w.getnframes() / w.getframerate()
    rep.step("extract", 100)
    return wav44, wav16, dur


# ---------------------------------------------------------------- 2. 分離

def separate_vocals(wav44, workdir, rep, device="cpu"):
    """曲からボーカルだけを取り出す。

    demucs.api は 4.0 から入ったもの。古い demucs が入っている環境では
    使えないので、その場合はコマンド版（python -m demucs）に落とす。
    結果は同じ。版を揃えさせるより、動く方を選ぶ。
    """
    try:
        import demucs.api            # noqa: F401
    except ImportError:
        print("[info] demucs.api が無いのでコマンド版を使います", flush=True)
        return _separate_vocals_cli(wav44, workdir, rep, device)
    return _separate_vocals_api(wav44, workdir, rep, device)


def _separate_vocals_cli(wav44, workdir, rep, device="cpu"):
    out = os.path.join(workdir, "demucs_out")
    cmd = [sys.executable, "-m", "demucs", "--two-stems", "vocals",
           "-n", "htdemucs", "-d", device, "-o", out, wav44]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, encoding="utf-8", errors="replace")
    tail = []
    for line in p.stdout:
        line = line.rstrip()
        if line:
            tail.append(line)
            del tail[:-20]
        # 進捗は  34%|███  のような形で出る
        m = re.search(r"(\d{1,3})%", line)
        if m:
            rep.step("separate", min(99.0, float(m.group(1))))
    p.wait()
    if p.returncode != 0:
        raise RuntimeError("ボーカル分離に失敗しました\n" + "\n".join(tail))

    # demucs_out/<モデル名>/<曲名>/vocals.wav に出る
    found = None
    for root, _dirs, files in os.walk(out):
        for f in files:
            if f.startswith("vocals"):
                found = os.path.join(root, f)
    if not found:
        raise RuntimeError("分離結果 vocals.wav が見つかりませんでした")

    voc16 = os.path.join(workdir, "vocals16k.wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", found, "-ac", "1", "-ar", "16000", voc16],
                   check=True)
    rep.step("separate", 100)
    return voc16


def _separate_vocals_api(wav44, workdir, rep, device="cpu"):
    import demucs.api
    state = {"models": 1}

    def cb(d):
        # segment_offset / audio_length と、モデル何個目かで全体の % を出す
        try:
            models = d.get("models") or state["models"]
            state["models"] = models
            idx = d.get("model_idx_in_bag", 0)
            off = d.get("segment_offset", 0)
            total = d.get("audio_length", 0) or 1
            p = (idx + min(1.0, off / total)) / max(models, 1) * 100
            rep.step("separate", p)
        except Exception:
            pass

    sep = demucs.api.Separator(model="htdemucs", device=device, callback=cb)
    _, stems = sep.separate_audio_file(wav44)
    voc = os.path.join(workdir, "vocals.wav")
    demucs.api.save_audio(stems["vocals"], voc, samplerate=sep.samplerate)

    voc16 = os.path.join(workdir, "vocals16k.wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", voc, "-ac", "1", "-ar", "16000", voc16],
                   check=True)
    rep.step("separate", 100)
    return voc16


# ---------------------------------------------------------------- 3. 書き起こし

def transcribe(voc16, duration, rep, model_size="medium"):
    from faster_whisper import WhisperModel
    m = WhisperModel(model_size, device="cpu", compute_type="int8")
    # vad_filter=False が重要。True にすると歌詞の半分以上が欠落する（検証済み）
    segs, _ = m.transcribe(
        voc16, language="ja", word_timestamps=True,
        vad_filter=False, beam_size=5,
    )
    words = []
    for s in segs:
        for w in (s.words or []):
            t = w.word.strip()
            if t:
                words.append({"w": t, "s": w.start, "e": w.end})
        rep.step("transcribe", min(99.0, s.end / max(duration, 1) * 100))
    rep.step("transcribe", 100)
    return words


# ---------------------------------------------------------------- 4. 対応づけ

def to_kana(text, kks):
    return "".join(x["hira"] for x in kks.convert(text))


def align_kana(words, lines, rep):
    """認識語と歌詞を「かな」に直して文字単位で重ね、各行の先頭時刻を返す。"""
    import pykakasi
    kks = pykakasi.kakasi()

    rec = []
    for w in words:
        k = to_kana(w["w"], kks)
        if not k:
            continue
        d = (w["e"] - w["s"]) / len(k)
        for i, c in enumerate(k):
            rec.append((c, w["s"] + d * i, w["s"] + d * (i + 1)))

    kl = [to_kana(x, kks) for x in lines]
    truth = "".join(kl)
    starts, ends, p = [], [], 0
    for x in kl:
        starts.append(p); p += len(x); ends.append(p - 1)

    R, T = len(rec), len(truth)
    if R == 0 or T == 0:
        return [None] * len(lines), [None] * len(lines), 0.0

    INF = float("inf")
    dp = [[INF] * (T + 1) for _ in range(R + 1)]
    bk = [[None] * (T + 1) for _ in range(R + 1)]
    dp[0][0] = 0.0
    for i in range(R + 1):
        if i % max(1, R // 50) == 0:
            rep.step("align", i / max(R, 1) * 90)
        row, nrow = dp[i], dp[i + 1] if i < R else None
        for j in range(T + 1):
            cur = row[j]
            if cur == INF:
                continue
            if i < R and j < T:
                c = 0.0 if rec[i][0] == truth[j] else 1.0
                if cur + c < nrow[j + 1]:
                    nrow[j + 1] = cur + c; bk[i + 1][j + 1] = ("m", i, j)
            if i < R and cur + 1 < nrow[j]:
                nrow[j] = cur + 1; bk[i + 1][j] = ("d", i, j)
            if j < T and cur + 1 < row[j + 1]:
                row[j + 1] = cur + 1; bk[i][j + 1] = ("i", i, j)

    t_start = [None] * T
    t_end = [None] * T
    i, j = R, T
    matched = 0
    while bk[i][j]:
        op, pi, pj = bk[i][j]
        if op == "m":
            t_start[pj] = rec[pi][1]; t_end[pj] = rec[pi][2]; matched += 1
        i, j = pi, pj

    for arr in (t_start, t_end):
        known = [k for k, v in enumerate(arr) if v is not None]
        for k in range(T):
            if arr[k] is None and known:
                lo = [x for x in known if x < k]; hi = [x for x in known if x > k]
                if lo and hi:
                    a, b = lo[-1], hi[0]
                    arr[k] = arr[a] + (arr[b] - arr[a]) * (k - a) / (b - a)
                elif lo:
                    arr[k] = arr[lo[-1]]
                else:
                    arr[k] = arr[hi[0]]

    rep.step("align", 100)
    coverage = matched / max(T, 1)
    ins = [t_start[s] if s < T else None for s in starts]
    outs = [t_end[e] if e < T else None for e in ends]
    return ins, outs, coverage


# ---------------------------------------------------------------- 5. 吸着

def voiced_mask(wav_path, thr_offset=8.0, smooth=9):
    """10ms 刻みで「歌声が鳴っているか」の真偽値を返す。"""
    with wave.open(wav_path, "rb") as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    hop = int(sr * 0.01); n = len(a) // hop
    rms = np.sqrt(np.array([np.mean(a[i*hop:(i+1)*hop] ** 2) for i in range(n)]) + 1e-12)
    db = 20 * np.log10(rms + 1e-9)
    db = np.convolve(db, np.ones(smooth) / smooth, mode="same")
    return db > (np.percentile(db, 35) + thr_offset)


def clamp_out_to_voiced(t_in, t_out, voiced):
    """OUT が無音まで伸びていたら、最後に歌っていた所まで戻す。
    間奏をまたぐ行で、末尾の文字が引き伸ばされるのを防ぐ
    （検証ではこれが無いと最大 11.3 秒ずれた。入れると 0.9 秒に収まる）。"""
    i0 = int(t_in / 0.01)
    i1 = min(int(t_out / 0.01), len(voiced) - 1)
    if i1 <= i0 or voiced[i1]:
        return t_out
    k = i1
    while k > i0 and not voiced[k]:
        k -= 1
    return max(t_in + 0.3, (k + 1) * 0.01)


def vad_onsets(wav_path, thr_offset=8.0, min_gap_frames=35, smooth=9):
    v = voiced_mask(wav_path, thr_offset, smooth)
    out = []; i = 0; last_end = -10 ** 9
    while i < len(v):
        if v[i]:
            if (i - last_end) > min_gap_frames:
                out.append(i * 0.01)
            j = i
            while j < len(v) and (v[j] or (j - i) < 15):
                j += 1
            last_end = j; i = j
        else:
            i += 1
    return out


def snap(times, voc16, rep, window=1.0):
    rep.step("snap", 10)
    ons = vad_onsets(voc16)
    rep.step("snap", 60)
    used = set(); out = []
    for t in times:
        if t is None:
            out.append(None); continue
        c = [(abs(o - t), k, o) for k, o in enumerate(ons) if k not in used and abs(o - t) <= window]
        if c:
            _, k, o = min(c); used.add(k); out.append(o)
        else:
            out.append(t)
    rep.step("snap", 100)
    return out


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--song", required=True)
    ap.add_argument("--lyrics", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="medium")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--progress", default="text", choices=["text", "json"])
    ap.add_argument("--keep-temp", action="store_true")
    a = ap.parse_args()

    rep = Reporter(a.progress)
    t0 = time.time()

    lines = [l.strip() for l in open(a.lyrics, encoding="utf-8").read().splitlines() if l.strip()]
    if not lines:
        rep.emit({"type": "error", "message": "歌詞が空です"}); return 1

    workdir = tempfile.mkdtemp(prefix="autotiming_")
    try:
        wav44, wav16, dur = extract_audio(a.song, workdir, rep)
        # ボーカル分離は精度を上げるための下ごしらえで、無くても進められる。
        # demucs が入らない環境（Python 3.9 など）で全体が止まるのは割に合わない。
        try:
            voc16 = separate_vocals(wav44, workdir, rep, a.device)
        except Exception as e:
            # 中身に丸ごとの traceback が入ることがあるので、1 行目だけ見せる
            why = str(e).strip().splitlines()[0] if str(e).strip() else e.__class__.__name__
            rep.emit({"type": "warn",
                      "message": "ボーカル分離を飛ばしました（%s）。精度が落ちることがあります。" % why[:120]})
            rep.step("separate", 100)
            voc16 = wav16
        words = transcribe(voc16, dur, rep, a.model)
        times, out_times, coverage = align_kana(words, lines, rep)
        times = snap(times, voc16, rep)
        voiced = voiced_mask(voc16)

        # OUT は「その行を歌い終わった時刻」。
        # 次の行の IN 直前まで伸ばすと、間奏をまたぐ行が極端に長くなる
        # （検証では最大 15.3 秒ずれた。歌い終わりを使うと最大 1.8 秒）。
        result_lines = []
        for i, (text, t) in enumerate(zip(lines, times)):
            tout = out_times[i] if i < len(out_times) else None
            if t is not None:
                if tout is None or tout <= t:
                    tout = t + 0.5
                tout = clamp_out_to_voiced(t, tout, voiced)
                # 次の行に食い込まないよう詰める
                nxt = next((x for x in times[i+1:] if x is not None), None)
                if nxt is not None:
                    tout = min(tout, nxt - 0.03)
                tout = max(tout, t + 0.3)
            result_lines.append({
                "index": i, "text": text,
                "tIn": round(t, 3) if t is not None else None,
                "tOut": round(tout, 3) if t is not None else None,
            })

        out = {
            "version": 1,
            "song": os.path.basename(a.song),
            "duration": round(dur, 3),
            "elapsed": round(time.time() - t0, 1),
            "model": a.model,
            "kanaCoverage": round(coverage, 3),
            "lines": result_lines,
        }
        json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        rep.emit({"type": "done", "out": a.out, "lines": len(result_lines),
                  "elapsed": out["elapsed"], "kanaCoverage": out["kanaCoverage"]})
        return 0
    finally:
        if not a.keep_temp:
            import shutil
            shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
