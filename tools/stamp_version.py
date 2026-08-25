#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""読み込み URL に版を打つ

GitHub Pages はキャッシュが効くため、push しても古い JS が動き続けることがある。
実際、修正済みなのに「直っていない」と判断しかけた場面が何度もあった。
コミット ID を全モジュールの import に付けて、変更時に必ず取り直させる。

  python tools/stamp_version.py        # コミット前に実行
"""
import io, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 対象を指定できる：開発用の写し（next/app）にも打てるようにするため
#   python tools/stamp_version.py next/app
APP = os.path.join(ROOT, sys.argv[1] if len(sys.argv) > 1 else "app")


def main():
    ver = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                         cwd=ROOT, capture_output=True, text=True).stdout.strip() or "dev"
    n = 0
    # index.html
    p = os.path.join(APP, "index.html")
    s = io.open(p, encoding="utf-8").read()
    s2 = re.sub(r'src="main\.js(\?v=[^"]*)?"', f'src="main.js?v={ver}"', s)
    if s2 != s:
        io.open(p, "w", encoding="utf-8", newline="").write(s2); n += 1

    # 各モジュールの相対 import に版を付ける
    for base, _, files in os.walk(APP):
        for f in files:
            if not f.endswith(".js"):
                continue
            fp = os.path.join(base, f)
            s = io.open(fp, encoding="utf-8").read()
            # 相対 import に版を付ける。from ... と、動的な import( ... ) の両方。
            # 動的の方に付け忘れると、版違いの別モジュールとして読み込まれ、
            # 状態が二重になる（実際に起きた。調べた結果が使われない側に入っていた）。
            s2 = s
            for pat in (r'(from\s+"(?:\./|\.\./)[^"]+?\.js)(\?v=[^"]*)?"',
                        r'(import\(\s*"(?:\./|\.\./)[^"]+?\.js)(\?v=[^"]*)?"'):
                s2 = re.sub(pat, lambda m: m.group(1) + f'?v={ver}"', s2)
            if s2 != s:
                io.open(fp, "w", encoding="utf-8", newline="").write(s2); n += 1
    print(f"版 {ver} を {n} ファイルに反映")


if __name__ == "__main__":
    main()
