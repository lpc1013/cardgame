#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 src/assets/cards/**/*.jpg 中非主规格(1728×2304, 3:4)的卡图重裁为 3:4，覆盖原文件。
策略：居中裁切到 3:4；若裁后高度 >=800 则缩放到主规格 1728×2304，否则保持原分辨率仅改比例。
用法（在 app/ 下运行）：
  python scripts/_fix_card_dims.py            # 全量处理
  python scripts/_fix_card_dims.py --only 策/c_zhaqian.jpg 势/g_wei_ding.jpg  # 只处理指定文件（测试）
  python scripts/_fix_card_dims.py --dry-run  # 只扫描报告不写盘
"""
import os
import sys
import datetime
from PIL import Image

ROOT = "src/assets/cards"
MAIN_W, MAIN_H = 1728, 2304
TARGET_RATIO = 3 / 4
MIN_RESIZE_H = 800          # 裁后高度低于此值不放大，仅改比例
TOLERANCE = 1e-3            # 判定已近 3:4 的容差
BACKUP_TXT = "scripts/_fix_card_dims_backup.txt"


def is_main(w, h):
    return (w, h) == (MAIN_W, MAIN_H)


def ratio_ok(w, h):
    return abs(w / h - TARGET_RATIO) <= TOLERANCE


def plan(w, h):
    """返回 (是否需处理, 目标宽, 目标高, 裁剪box)。"""
    if is_main(w, h):
        return False, w, h, None
    box = None
    cw, ch = w, h
    r = w / h
    if not ratio_ok(w, h):
        if r > TARGET_RATIO:  # 太宽：裁左右
            cw = round(h * TARGET_RATIO)
            x0 = (w - cw) // 2
            box = (x0, 0, x0 + cw, h)
        else:                 # 太高：裁上下
            ch = round(w / TARGET_RATIO)
            y0 = (h - ch) // 2
            box = (0, y0, w, y0 + ch)
    # 目标尺寸：裁后高度 >= MIN_RESIZE_H -> 主规格；否则保持裁后分辨率
    if ch >= MIN_RESIZE_H:
        tw, th = MAIN_W, MAIN_H
    else:
        tw, th = cw, ch
    return True, tw, th, box


def process(path, dry_run=False):
    img = Image.open(path)
    w, h = img.size
    need, tw, th, box = plan(w, h)
    if not need:
        return None
    img = img.convert("RGB")
    if box:
        img = img.crop(box)
    if (tw, th) != img.size:
        img = img.resize((tw, th), Image.LANCZOS)
    if not dry_run:
        img.save(path, "JPEG", quality=92, optimize=True, subsampling=2)
    return (w, h, tw, th)


def main():
    only = None
    dry_run = "--dry-run" in sys.argv
    if "--only" in sys.argv:
        i = sys.argv.index("--only")
        only = set(sys.argv[i + 1:])

    rows = []
    changed = 0
    skipped = 0
    for dirname in sorted(os.listdir(ROOT)):
        full = os.path.join(ROOT, dirname)
        if not os.path.isdir(full):
            continue
        for f in sorted(os.listdir(full)):
            if not f.endswith(".jpg"):
                continue
            rel = f"{dirname}/{f}"
            if only and rel not in only:
                continue
            path = os.path.join(full, f)
            try:
                res = process(path, dry_run=dry_run)
            except Exception as e:
                rows.append(f"{rel}  解析/处理失败: {e}")
                skipped += 1
                continue
            if res is None:
                continue
            old_w, old_h, new_w, new_h = res
            rows.append(f"{rel}  {old_w}×{old_h} → {new_w}×{new_h}")
            changed += 1

    print(f"{'[dry-run] ' if dry_run else ''}需处理 {changed} 张，跳过/失败 {skipped} 张")
    for r in rows:
        print("  " + r)

    if not dry_run and not only and changed:
        stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        lines = [f"# 卡图重裁备份清单 {stamp}（主规格 {MAIN_W}×{MAIN_H}，覆盖原文件前记录）"]
        lines.extend(rows)
        with open(BACKUP_TXT, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
        print(f"备份清单已写入 {BACKUP_TXT}")


if __name__ == "__main__":
    main()
