"""配布用 zip を作る。個人設定・キャッシュ・開発用スクリプトは除外。"""
import os, zipfile, datetime
from pathlib import Path

ROOT = Path(__file__).parent
DIST_NAME = "utamita05"
ZIP_NAME = f"{DIST_NAME}_{datetime.datetime.now().strftime('%Y%m%d')}.zip"
ZIP_PATH = ROOT.parent / ZIP_NAME  # 親フォルダに出力

# 含める
INCLUDE = [
    "app",
    "ae/build_project.jsx",
    "ae/scan_templates.jsx",
    "templates/templates.aep",
    "templates/templates.sample.json",
    "docs/utamita05_setup_Lv1.pptx",
    "docs/utamita05_usage.pptx",
    "docs/utamita05_templates.pptx",
    "server.py",
    "start.bat",
    "stop.bat",
]

# 除外パターン（配下は展開しない）
EXCLUDE_DIR_NAMES = { ".claude", ".git", "__pycache__", "node_modules", "screenshots" }
EXCLUDE_FILE_SUFFIXES = { ".pyc", ".settings.txt", ".log" }
EXCLUDE_FILE_NAMES = { "templates.json", "make_dist.py" }

def should_skip(path: Path) -> bool:
    if path.name in EXCLUDE_FILE_NAMES:
        return True
    if path.suffix in EXCLUDE_FILE_SUFFIXES:
        return True
    for part in path.parts:
        if part in EXCLUDE_DIR_NAMES:
            return True
    return False

def add_recursive(zf: zipfile.ZipFile, src: Path, arcbase: str):
    if src.is_file():
        if should_skip(src):
            return
        arcname = f"{DIST_NAME}/{arcbase}"
        print(f"  + {arcname}")
        zf.write(src, arcname=arcname)
        return
    for p in src.rglob("*"):
        if p.is_dir():
            continue
        rel = p.relative_to(src)
        if should_skip(rel):
            continue
        arcname = f"{DIST_NAME}/{arcbase}/{rel.as_posix()}"
        print(f"  + {arcname}")
        zf.write(p, arcname=arcname)

def main():
    print(f"作成先: {ZIP_PATH}")
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for item in INCLUDE:
            src = ROOT / item
            if not src.exists():
                print(f"  - スキップ（存在しない）: {item}")
                continue
            add_recursive(zf, src, item)
    size_mb = ZIP_PATH.stat().st_size / (1024 * 1024)
    print(f"\n完了: {ZIP_PATH.name}  ({size_mb:.1f} MB)")

if __name__ == "__main__":
    main()
