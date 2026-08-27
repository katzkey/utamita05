#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""next/ の内容を本番（テスターが使う URL）へ反映する

勝手に走らせない。区切りがついて、反映してよいと言われたときだけ実行する。

  python tools/promote.py
"""
import io, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEXT = os.path.join(ROOT, "next")
COPY = ["app", "ae", "templates", "tools"]
# 開発用の道具は写さない。next/tools はヘルパーの配布物としてだけ使う。
# 写してしまうと、あとから足した道具が promote で消える（実際に消えた）。
DEV_ONLY = {"make_next.py", "promote.py", "stamp_version.py", "check_calls.py", "rollback.py"}
REWRITE = [
    ("utamita05/app/",   "utamita05/app/"),
    ("utamita05/tools/", "utamita05/tools/"),
]
TEXT_EXT = {".html", ".js", ".css", ".json", ".py", ".sh", ".bat", ".vbs", ".ps1", ".md", ".txt"}


def main():
    if not os.path.isdir(NEXT):
        print("next/ がありません"); return 1
    for d in COPY:
        src, dst = os.path.join(NEXT, d), os.path.join(ROOT, d)
        if not os.path.isdir(src):
            continue
        if d == "tools":
            # tools は丸ごと入れ替えない。開発用の道具まで消えるため、上書きだけ。
            for name in os.listdir(src):
                if name in DEV_ONLY or name == "__pycache__":
                    continue
                shutil.copy2(os.path.join(src, name), os.path.join(dst, name))
            continue
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", *DEV_ONLY))

    for base, _dirs, files in os.walk(ROOT):
        if os.sep + "next" in base or os.sep + ".git" in base:
            continue
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
            s2 = s2.replace('SUBDIR="tools"', 'SUBDIR="tools"')
            s2 = s2.replace('set "SUBDIR=tools"', 'set "SUBDIR=tools"')
            if s2 != s:
                nl = "\r\n" if f.endswith((".bat", ".vbs", ".ps1")) else "\n"
                io.open(p, "w", encoding="utf-8", newline=nl).write(s2)
    print("next/ を本番へ反映しました。tools/stamp_version.py を実行してから commit してください。")


if __name__ == "__main__":
    sys.exit(main())
