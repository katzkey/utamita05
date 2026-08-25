#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""画面まわりの自作関数に、定義漏れが無いか調べる

node --check では見つからない。その行に来て初めて落ちるので、
「書き出し中にパネルを開き直すと壊れる」のような形で後から出る。
実際に renderProgress を存在しない名前で呼んでいた。

対象は render* / show* / paint* / watch* / update* のような自作の名前だけに絞る。
全部の呼び出しを見ると CSS の calc() などが混ざって使い物にならない。

  python tools/check_calls.py next/app
"""
import io, os, re, sys

PAT = re.compile(r"(?<![.\w$])((?:render|show|paint|watch|update|build|apply|toggle)[A-Za-z0-9_$]*)\s*\(")


def check(root):
    bad = []
    for base, _d, files in os.walk(root):
        for f in sorted(files):
            if not f.endswith(".js"):
                continue
            p = os.path.join(base, f)
            s = io.open(p, encoding="utf-8").read()
            defined = set(re.findall(r"function\s+([A-Za-z_$][\w$]*)", s))
            defined |= set(re.findall(r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", s))
            for m in re.finditer(r"import\s*\{([^}]*)\}", s):
                for n in m.group(1).split(","):
                    n = n.strip().split(" as ")[-1].strip()
                    if n:
                        defined.add(n)
            for m in PAT.finditer(s):
                n = m.group(1)
                if n in defined:
                    continue
                bad.append("%s:%d  %s()" % (p.replace(os.sep, "/"),
                                            s[:m.start()].count("\n") + 1, n))
    return bad


if __name__ == "__main__":
    hits = check(sys.argv[1] if len(sys.argv) > 1 else "app")
    for h in hits:
        print("  " + h)
    print("定義漏れなし" if not hits else "%d 件" % len(hits))
    sys.exit(1 if hits else 0)
