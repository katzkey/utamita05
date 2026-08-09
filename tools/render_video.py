#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
歌詞レイヤーを合成して MP4 を書き出す

ブラウザ側が「行ごとに 1 枚の透過 PNG」を書き出す。このスクリプトはそれを
ffmpeg で背景に重ね、フェードを掛け、元の音声ごと H.264 で焼く。

  python render_video.py --spec spec.json --out out.mp4

ブラウザで動画を作らないのは、ffmpeg のほうが
  - エンコードが速くて綺麗（CPU でも実用速度）
  - 音声をそのまま残せる
  - 背景動画を普通の入力として扱える
ため。ブラウザ側は「絵を 1 枚描く」だけに専念させる。

spec.json の形
{
  "width": 1920, "height": 1080, "fps": 30,
  "duration": 241.7,
  "audio": "song.mp4",                  // 音声の取得元（省略で無音）
  "background": {"type":"solid","color":"#101014"}   // または
                {"type":"image","file":"bg.png"} / {"type":"video","file":"bg.mp4"}
  "fadeIn": 0.3, "fadeOut": 0.3,        // 行の既定フェード秒
  "lines": [
    {"file":"layers/line_000.png", "tIn":21.4, "tOut":26.9, "fadeIn":0.3, "fadeOut":0.3}
  ]
}
"""

import argparse, json, os, re, subprocess, sys, time


def q(path):
    """ffmpeg の filter 内で使うパスのエスケープ"""
    return path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def prescale_still_backgrounds(spec, workdir, W, H):
    """静止画の背景を出力解像度に合わせて 1 回だけ変換しておく。

    ffmpeg は -loop 1 で読んだ静止画でも毎フレーム scale を通すため、
    大きな画像だと拡大処理だけで時間を食う（実測：60 秒の書き出しで
    背景ありが 108 秒、背景なしが 22 秒）。先に 1 枚だけ作れば済む。
    """
    for i, b in enumerate(spec.get("backgrounds") or []):
        if b.get("kind") in ("video", "solid") or not b.get("file"):
            continue
        src = os.path.join(workdir, b["file"])
        if not os.path.exists(src):
            continue
        dst_rel = f"bg_scaled_{i}.png"
        dst = os.path.join(workdir, dst_rel)
        vf = fit_scale_filter(b.get("fit", "cover"), W, H)
        r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vf", vf,
                            "-frames:v", "1", dst],
                           capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(dst):
            b["file"] = dst_rel
            b["_prescaled"] = True


def fit_scale_filter(fit, W, H):
    if fit == "contain":
        return (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
                f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x00000000")
    if fit == "stretch":
        return f"scale={W}:{H}"
    if fit == "original":
        return (f"crop=min(iw\\,{W}):min(ih\\,{H}),"
                f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x00000000")
    return (f"scale={W}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H}")   # cover


def build_command(spec, out_path, workdir):
    W = int(spec.get("width", 1920))
    H = int(spec.get("height", 1080))
    fps = int(spec.get("fps", 30))
    dur = float(spec.get("duration", 0)) or 1.0
    lines = spec.get("lines", [])
    bg = spec.get("background") or {"type": "solid", "color": "#000000"}

    backgrounds = spec.get("backgrounds") or []

    cmd = ["ffmpeg", "-y", "-v", "error", "-stats"]
    inputs = []          # (種別, フィルタで参照する index)

    # ---- 一番下に敷く単色 ----
    base_color = (spec.get("baseColor") or bg.get("color") or "#000000").lstrip("#")
    cmd += ["-f", "lavfi", "-i", f"color=c=0x{base_color}:s={W}x{H}:r={fps}"]
    bg_idx = len(inputs); inputs.append("bgcolor")

    # ---- 背景素材（画像 / 動画）。時間範囲つきで複数敷ける ----
    bg_input_idx = []
    for b in backgrounds:
        span = max(0.05, float(b["tOut"]) - float(b["tIn"]))
        fo = float(b.get("fadeOut", 0))
        kind = b.get("kind")
        if kind == "solid":
            # 単色も時間範囲とフェードを持つ 1 枚の層として扱う。
            # 「黒を敷いて、それをフェードアウトさせて下の画像を出す」等ができる。
            col = (b.get("color") or "#000000").lstrip("#")
            cmd += ["-f", "lavfi", "-t", f"{span + fo:.3f}",
                    "-i", f"color=c=0x{col}:s={W}x{H}:r={fps}"]
        elif kind == "video":
            cmd += ["-stream_loop", "-1", "-t", f"{span + fo:.3f}", "-i", b["file"]]
        else:
            cmd += ["-loop", "1", "-t", f"{span + fo:.3f}", "-i", b["file"]]
        bg_input_idx.append(len(inputs)); inputs.append("bg")

    # ---- 行レイヤー（静止画をループ入力し、後で時間軸をずらす）----
    layer_idx = []
    for ln in lines:
        span = max(0.05, float(ln["tOut"]) - float(ln["tIn"]))
        fo = float(ln.get("fadeOut", spec.get("fadeOut", 0.3)))
        cmd += ["-loop", "1", "-t", f"{span + fo:.3f}", "-i", ln["file"]]
        layer_idx.append(len(inputs)); inputs.append("layer")

    # ---- 音声 ----
    audio_idx = None
    if spec.get("audio"):
        cmd += ["-i", spec["audio"]]
        audio_idx = len(inputs); inputs.append("audio")

    # ---- フィルタグラフ ----
    fg = []
    fg.append(f"[{bg_idx}:v]fps={fps},format=rgba,setsar=1[bg]")
    cur = "bg"

    for k, (b, idx) in enumerate(zip(backgrounds, bg_input_idx)):
        t_in = float(b["tIn"])
        span = max(0.05, float(b["tOut"]) - t_in)
        fi = min(float(b.get("fadeIn", 0)), span / 2)
        fo = min(float(b.get("fadeOut", 0)), span / 2)
        op = float(b.get("opacity", 1.0))
        # 事前変換済みなら既に出力解像度なので、毎フレームのスケールは不要
        skip_scale = b.get("_prescaled") or b.get("kind") == "solid"
        pre = "" if skip_scale else fit_scale_filter(b.get("fit", "cover"), W, H) + ","
        chain = [f"[{idx}:v]{pre}fps={fps},format=rgba,setsar=1"]
        if op < 1.0:
            chain.append(f"colorchannelmixer=aa={op:.3f}")
        if fi > 0:
            chain.append(f"fade=t=in:st=0:d={fi:.3f}:alpha=1")
        if fo > 0:
            chain.append(f"fade=t=out:st={max(0.0, span - fo):.3f}:d={fo:.3f}:alpha=1")
        chain.append(f"setpts=PTS-STARTPTS+{t_in:.3f}/TB")
        fg.append(",".join(chain) + f"[b{k}]")
        nxt = f"bgv{k}"
        fg.append(f"[{cur}][b{k}]overlay=x=0:y=0:eof_action=pass:"
                  f"enable='between(t,{t_in:.3f},{t_in + span + fo:.3f})'[{nxt}]")
        cur = nxt

    for k, (ln, idx) in enumerate(zip(lines, layer_idx)):
        t_in = float(ln["tIn"])
        span = max(0.05, float(ln["tOut"]) - t_in)
        fi = float(ln.get("fadeIn", spec.get("fadeIn", 0.3)))
        fo = float(ln.get("fadeOut", spec.get("fadeOut", 0.3)))
        fi = min(fi, span / 2); fo = min(fo, span / 2)

        # レイヤーは絵のある範囲だけを切り出したもの。元の位置へ置くだけで
        # 拡大も余白埋めも要らない。全画面のまま重ねると行数分だけ
        # 全面合成が走り、書き出しが極端に遅くなる。
        x = int(ln.get("x", 0)); y = int(ln.get("y", 0))
        fg.append(
            f"[{idx}:v]format=rgba,"
            f"fade=t=in:st=0:d={fi:.3f}:alpha=1,"
            f"fade=t=out:st={max(0.0, span - fo):.3f}:d={fo:.3f}:alpha=1,"
            f"setpts=PTS-STARTPTS+{t_in:.3f}/TB[l{k}]"
        )
        nxt = f"v{k}"
        fg.append(
            f"[{cur}][l{k}]overlay=x={x}:y={y}:eof_action=pass:"
            f"enable='between(t,{t_in:.3f},{t_in + span + fo:.3f})'[{nxt}]"
        )
        cur = nxt

    fg.append(f"[{cur}]format=yuv420p[vout]")

    # フィルタはファイル経由で渡す。
    # Windows のコマンドライン長は 32767 文字が上限で、行数が増えると
    # -filter_complex に直接書く方式では超えて起動できなくなる
    # （200 行で約 62,000 文字になることを確認済み）。
    script = os.path.join(workdir, "filter_complex.txt")
    with open(script, "w", encoding="utf-8") as f:
        f.write(";\n".join(fg))
    cmd += ["-filter_complex_script", script, "-map", "[vout]"]

    if audio_idx is not None:
        cmd += ["-map", f"{audio_idx}:a:0", "-c:a", "aac", "-b:a", "192k"]
    else:
        cmd += ["-an"]

    cmd += [
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-r", str(fps), "-t", f"{dur:.3f}",
        "-movflags", "+faststart", os.path.abspath(out_path),
    ]
    return cmd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--progress", default="text", choices=["text", "json"])
    ap.add_argument("--print-cmd", action="store_true")
    a = ap.parse_args()

    workdir = os.path.dirname(os.path.abspath(a.spec))
    spec = json.load(open(a.spec, encoding="utf-8"))
    dur = float(spec.get("duration", 0)) or 1.0
    prescale_still_backgrounds(spec, workdir,
                               int(spec.get("width", 1920)), int(spec.get("height", 1080)))
    cmd = build_command(spec, a.out, workdir)

    if a.print_cmd:
        print(" ".join(cmd))
        return 0

    t0 = time.time()
    # 入力は workdir 基準の相対パスで渡している（コマンドライン長を抑えるため）
    p = subprocess.Popen(cmd, cwd=workdir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, encoding="utf-8", errors="replace")
    tail = []
    for line in p.stdout:
        tail.append(line)
        if len(tail) > 40:
            tail.pop(0)
        # ffmpeg の -stats 行から進捗を拾う
        m = re.search(r"time=(\d+):(\d+):(\d+\.?\d*)", line)
        if m:
            sec = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
            pct = min(99.9, sec / dur * 100)
            if a.progress == "json":
                sys.stdout.write(json.dumps({"type": "progress", "step": "encode",
                                             "percent": round(pct, 1)}, ensure_ascii=False) + "\n")
            else:
                sys.stdout.write(f"\rエンコード {pct:5.1f}%")
            sys.stdout.flush()
    p.wait()

    if p.returncode != 0:
        msg = "".join(tail).strip()[-1500:]
        if a.progress == "json":
            sys.stdout.write(json.dumps({"type": "error", "message": msg}, ensure_ascii=False) + "\n")
        else:
            sys.stdout.write("\n" + msg + "\n")
        return 1

    el = round(time.time() - t0, 1)
    size = os.path.getsize(a.out) if os.path.exists(a.out) else 0
    if a.progress == "json":
        sys.stdout.write(json.dumps({"type": "progress", "step": "encode", "percent": 100.0},
                                    ensure_ascii=False) + "\n")
        sys.stdout.write(json.dumps({"type": "done", "out": a.out, "elapsed": el,
                                     "bytes": size}, ensure_ascii=False) + "\n")
    else:
        sys.stdout.write(f"\n完了 {a.out}  {size/1048576:.1f} MB  {el} 秒\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
