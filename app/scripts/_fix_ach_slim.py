#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 src/assets/achievements/ach_*.jpg 缩到最长边 256、重存为 quality 65 JPEG，覆盖原文件。
用途：图标展示位 40px，2048x2048/95~308KB 严重过剩，砍 80%+ 体积。
零源码改动约束：不改扩展名，引擎按 .jpg 引用。
用法（在 app/ 下运行）：python scripts/_fix_ach_slim.py
"""
import os
import glob
from PIL import Image

DIR = "src/assets/achievements"
MAX_SIDE = 256
QUALITY = 65
GLOB = os.path.join(DIR, "ach_*.jpg")


def main():
    paths = sorted(glob.glob(GLOB))
    if not paths:
        print("未匹配到", GLOB)
        return
    before_total = 0
    after_total = 0
    rows = []
    for p in paths:
        before = os.path.getsize(p)
        with Image.open(p) as img:
            img = img.convert("RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            img.save(p, "JPEG", quality=QUALITY, optimize=True, subsampling=2)
        after = os.path.getsize(p)
        before_total += before
        after_total += after
        rows.append((p, before, after))
    saved = before_total - after_total
    ratio = (1 - after_total / before_total) * 100 if before_total else 0
    print("文件数:", len(paths))
    print("瘦身前: %.2f MB" % (before_total / 1024 / 1024))
    print("瘦身後: %.2f MB" % (after_total / 1024 / 1024))
    print("节省:   %.2f MB (-%.1f%%)" % (saved / 1024 / 1024, ratio))
    print("抽样（前 5 / 后 5）：")
    for p, b, a in rows[:5] + rows[-5:]:
        name = os.path.basename(p)
        print("  %-36s  %4dKB -> %3dKB" % (name, b // 1024, a // 1024))


if __name__ == "__main__":
    main()
