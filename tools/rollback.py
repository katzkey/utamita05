#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""公開しているアプリを、以前の版へ戻す

  python tools/rollback.py            版の一覧を出す
  python tools/rollback.py v0.2.2     その版の内容に戻す（commit はしない）

戻すのは配信物だけ（app / ae / templates）。開発用の道具や next/ は触らない。
実行後に中身を確かめてから、自分で commit / push する。
"""
import io, os, subprocess, sys

# Windows のコンソールは既定が cp932 で、説明文の記号（—）で落ちる
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = ["app", "ae", "templates"]


def run(args, **kw):
    # Windows の既定は cp932 で、タグの説明（日本語）を読めずに落ちる
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", **kw)


def main():
    if len(sys.argv) < 2:
        print("戻せる版:")
        out = run(["git", "tag", "-l", "-n1"]).stdout.strip()
        for line in out.splitlines():
            print("  " + line)
        print()
        print("使い方: python tools/rollback.py v0.2.2")
        return 0

    tag = sys.argv[1]
    if run(["git", "rev-parse", "--verify", tag]).returncode != 0:
        print("そんな版はありません: " + tag)
        return 1

    dirty = run(["git", "status", "--porcelain", "--"] + TARGETS).stdout.strip()
    if dirty:
        print("配信物に未コミットの変更があります。先に片づけてください:")
        print(dirty)
        return 1

    r = run(["git", "checkout", tag, "--"] + TARGETS)
    if r.returncode != 0:
        print("戻せませんでした:")
        print(r.stderr)
        return 1

    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "stamp_version.py")], cwd=ROOT)
    print()
    print(tag + " の内容に戻しました（まだ commit していません）。")
    print("中身を確かめてから、次を実行してください:")
    print('  git commit -am "' + tag + ' に戻す"')
    print("  git push")
    return 0


if __name__ == "__main__":
    sys.exit(main())
