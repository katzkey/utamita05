#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""開発用の写し next/ を作り直す

テスターが使う URL（…/utamita05/app/）は凍結し、直すのは
…/utamita05/next/app/ だけにする。テスト中に足元が動かないようにするため。

next/ は丸ごと独立した写しにする。共有にすると、開発中の変更が
そのままテスター側にも出てしまう（ヘルパーの配布物も含めて）。

  python tools/make_next.py     # 今の app/ から next/ を作り直す
  python tools/promote.py       # 区切りがついたら next/ を本番へ
"""
import io, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEXT = os.path.join(ROOT, "next")
COPY = ["app", "ae", "templates", "tools"]

# next/ の中では、参照先も next/ を向かせる
REWRITE = [
    ("utamita05/app/",   "utamita05/next/app/"),
    ("utamita05/tools/", "utamita05/next/tools/"),
]
TEXT_EXT = {".html", ".js", ".css", ".json", ".py", ".sh", ".bat", ".vbs", ".ps1", ".md", ".txt"}


def main():
    if os.path.isdir(NEXT):
        shutil.rmtree(NEXT)
    os.makedirs(NEXT)
    for d in COPY:
        src = os.path.join(ROOT, d)
        if not os.path.isdir(src):
            continue
        shutil.copytree(src, os.path.join(NEXT, d),
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    n = 0
    for base, _dirs, files in os.walk(NEXT):
        for f in files:
            if os.path.splitext(f)[1].lower() not in TEXT_EXT:
                continue
            p = os.path.join(base, f)
            try:
                s = io.open(p, encoding="utf-8").read()
            except Exception:
                continue
            s2 = s
            for a, b in REWRITE:
                s2 = s2.replace(a, b)
            # セットアップが ZIP から取り出す場所も next/tools にする
            s2 = s2.replace("(Get-ChildItem $ex -Directory | Select-Object -First 1).FullName 'tools'",
                            "(Get-ChildItem $ex -Directory | Select-Object -First 1).FullName 'next\tools'")
            s2 = s2.replace('-maxdepth 2 -type d -name tools',
                            '-maxdepth 3 -type d -path "*/next/tools"')
            if s2 != s:
                nl = "\r\n" if f.endswith((".bat", ".vbs", ".ps1")) else "\n"
                io.open(p, "w", encoding="utf-8", newline=nl).write(s2)
                n += 1
    print("next/ を作り直しました（書き換えたファイル %d 件）" % n)
    print("開発用: https://katzkey.github.io/utamita05/next/app/")


if __name__ == "__main__":
    sys.exit(main())
