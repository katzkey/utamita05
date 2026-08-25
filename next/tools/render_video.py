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


DEFAULT_SIDE = {"dur": 0.4, "ease": "easeOut", "fade": True,
                "slide": {"enabled": False, "dir": "up", "dist": 40},
                "scale": {"enabled": False, "from": 0.8}}


def normalize_motion(m):
    """欠けている項目を既定値で埋める（app/core/motion.js の normalizeMotion と対）。"""
    def side(s, ease):
        s = s or {}
        out = {**DEFAULT_SIDE, "ease": ease, **s}
        out["slide"] = {**DEFAULT_SIDE["slide"], **(s.get("slide") or {})}
        out["scale"] = {**DEFAULT_SIDE["scale"], **(s.get("scale") or {})}
        return out
    m = m or {}
    return {"unit": m.get("unit", "line"), "stagger": m.get("stagger", 0.03),
            "in": side(m.get("in"), "easeOut"), "out": side(m.get("out"), "easeIn")}


# ブラウザ側（app/core/motion.js）と同じイージングを ffmpeg の式にする。
# 見たものと書き出したものがずれないよう、式を対応させておく。
def ease_expr(name, p):
    if name == "linear":    return f"({p})"
    if name == "easeIn":    return f"(pow(({p}),3))"
    if name == "easeInOut": return f"(if(lt(({p}),0.5),4*pow(({p}),3),1-pow(-2*({p})+2,3)/2))"
    if name in ("back", "elastic"):
        # elastic は式が長くなるので back で近似する
        return f"(1+2.70158*pow(({p})-1,3)+1.70158*pow(({p})-1,2))"
    return f"(1-pow(1-({p}),3))"   # easeOut


def slide_expr(mi, mo, di, do, span, t_in):
    """overlay の x/y に足すずれ。

    注意：overlay の t は「出力の絶対時刻」で、レイヤー内部の 0 始まりの時刻とは違う。
    fade や scale はレイヤー側のフィルタなので 0 始まりだが、ここは絶対時刻で組む。
    """
    dirs = {"up": (0, 1), "down": (0, -1), "left": (1, 0), "right": (-1, 0)}
    sl_in = mi.get("slide") or {}
    sl_out = mo.get("slide") or {}
    if not sl_in.get("enabled") and not sl_out.get("enabled"):
        return "", ""

    ex, ey = "0", "0"
    if sl_out.get("enabled") and do > 0:
        dx, dy = dirs.get(sl_out.get("dir", "up"), (0, 1))
        dist = float(sl_out.get("dist", 40))
        p = f"min(1,max(0,1-(t-{t_in + span:.3f})/{do:.4f}))"
        e = ease_expr(mo.get("ease", "easeIn"), p)
        ex = f"if(gt(t,{t_in + span:.3f}),{dx * dist}*(1-({e})),{ex})"
        ey = f"if(gt(t,{t_in + span:.3f}),{dy * dist}*(1-({e})),{ey})"
    if sl_in.get("enabled") and di > 0:
        dx, dy = dirs.get(sl_in.get("dir", "up"), (0, 1))
        dist = float(sl_in.get("dist", 40))
        p = f"min(1,max(0,(t-{t_in:.3f})/{di:.4f}))"
        e = ease_expr(mi.get("ease", "easeOut"), p)
        ex = f"if(lt(t,{t_in + di:.3f}),{dx * dist}*(1-({e})),{ex})"
        ey = f"if(lt(t,{t_in + di:.3f}),{dy * dist}*(1-({e})),{ey})"
    return f"+({ex})", f"+({ey})"


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
        fo = max(0.0, float(normalize_motion(ln.get("motion"))["out"].get("dur", 0.4)))
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
        # 欠けた項目は既定値で埋める。アプリ側で 1 項目だけ触った行は
        # 途中までしか入っていないことがあり、そのままだと長さ 0 = 動かない。
        m = normalize_motion(ln.get("motion"))
        mi, mo = m["in"], m["out"]
        di = max(0.0, float(mi.get("dur", 0.4)))
        do = max(0.0, float(mo.get("dur", 0.4)))
        di = min(di, span); do = min(do, span)

        # レイヤーは絵のある範囲だけを切り出したもの。元の位置へ置く。
        x = int(ln.get("x", 0)); y = int(ln.get("y", 0))
        w = int(ln.get("w", 0)); h = int(ln.get("h", 0))

        # 進み具合 e（0=出る前 / 1=定常）。イン中とアウト中で式を切り替える。
        # t はこの入力の先頭からの秒数（setpts でずらす前）。
        e = ease_expr(mi.get("ease", "easeOut"), f"min(1,max(0,t/{max(di,0.0001):.4f}))")
        e_out = ease_expr(mo.get("ease", "easeIn"), f"min(1,max(0,1-(t-{span:.3f})/{max(do,0.0001):.4f}))")
        E = f"if(lt(t,{di:.3f}),{e},if(lt(t,{span:.3f}),1,{e_out}))" if (di > 0 or do > 0) else "1"

        chain = [f"[{idx}:v]format=rgba"]

        # スケール（1 に向かって変化する）
        sc_in, sc_out = mi.get("scale") or {}, mo.get("scale") or {}
        if (sc_in.get("enabled") and di > 0) or (sc_out.get("enabled") and do > 0):
            fi_from = float(sc_in.get("from", 0.8)) if sc_in.get("enabled") else 1.0
            fo_from = float(sc_out.get("from", 0.8)) if sc_out.get("enabled") else 1.0
            sc = (f"if(lt(t,{di:.3f}), {fi_from}+(1-{fi_from})*({e}),"
                  f"if(lt(t,{span:.3f}), 1, {fo_from}+(1-{fo_from})*({e_out})))")
            chain.append(f"scale=w='max(2,{w}*({sc}))':h='max(2,{h}*({sc}))':eval=frame")

        # フェード
        if mi.get("fade", True) and di > 0:
            chain.append(f"fade=t=in:st=0:d={di:.3f}:alpha=1")
        if mo.get("fade", True) and do > 0:
            chain.append(f"fade=t=out:st={max(0.0, span - do):.3f}:d={do:.3f}:alpha=1")

        chain.append(f"setpts=PTS-STARTPTS+{t_in:.3f}/TB")
        fg.append(",".join(chain) + f"[l{k}]")

        # スライド（重ねる位置を時間で動かす）。スケールで大きさが変わる分は
        # 中心がずれないよう overlay 側で補正する。
        ox, oy = slide_expr(mi, mo, di, do, span, t_in)
        cx = f"{x}+{w}/2-w/2" if "scale=" in ",".join(chain) else f"{x}"
        cy = f"{y}+{h}/2-h/2" if "scale=" in ",".join(chain) else f"{y}"

        nxt = f"v{k}"
        fg.append(
            f"[{cur}][l{k}]overlay=x='{cx}{ox}':y='{cy}{oy}':eof_action=pass:"
            f"enable='between(t,{t_in:.3f},{t_in + span + do:.3f})'[{nxt}]"
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
