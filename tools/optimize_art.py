"""卡图/立绘离线瘦身：按"实际渲染得到的最大尺寸"封顶重采样，再按 q82 重编码。

为什么要这一趟：389 张卡图里 369 张是即梦的原始输出 1728x2304，
而卡面在图鉴/行囊/手牌里画 150~320 CSS px，连点开放大也只到 320px（手机 82vw）。
浏览器每帧都在把 1728 缩到 236——离线用 LANCZOS 缩好，观感不降反升，字节掉一半以上。

三条硬约束（都是会静默坏事的那种）：
1. 只缩不放大。540x720 那批对手立绘按 1024 处理会被放大成 256KB（比原来 88KB 还大一倍）。
2. 只在"新文件确实更小"时才落盘。已经压过的图重编码会变大，不能无脑覆盖。
3. 保持原扩展名。art 索引按"去扩展名的文件名"查，多格式加载已支持 .jpg，换格式不在本脚本职责内。

跑法：python tools/optimize_art.py [--dirs cards/策 cards/势 ...] [--apply]
默认只报告不改文件（dry-run），加 --apply 才落盘。
"""
import argparse
import io
import os
import sys
from collections import defaultdict

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "src", "assets")

# 每一类按"它最宽能被画到多少 CSS px"给上限，再留 1.5x 给高 DPR。
# 上限之下的文件一律不动——已经够小了，再压只会掉画质不省字节。
CAPS = {
    "cards": 1024,        # 放大视图 320 CSS px；手机 82vw 也才 692
    "portraits": 1024,    # 立绘栏 ~200~320 CSS px
    "narrators": 1024,    # 608x1080，本来就在限内
    "endings": 1400,      # 结局插画是全幅，给到 1400
    "covers": 1400,
    "scenes": 2560,       # 全出血档保持原尺寸；淡水印档本来就是 480x270
    "achievements": 512,  # 只画 46~160 px
    "maps": 1600,
    "themes": 4096,       # 纹样贴图，本来就小，不动
}
QUALITY = 82
# 字节/像素的宽松上限：q82 落在 0.2~0.3，0.6 已经留了一倍余量，
# 超过它说明这张图根本没压过
MAX_BPP = 0.6


def top_dir(rel):
    return rel.replace("\\", "/").split("/")[0]


def optimize(path, cap, apply_writes):
    """返回 (原字节, 新字节或 None)；None 表示不需要动。"""
    with open(path, "rb") as fh:
        raw = fh.read()
    src = len(raw)
    im = Image.open(io.BytesIO(raw))
    fmt = (im.format or "").upper()
    # 只动"文件名声称是 JPEG"的那批：脚本落盘写的是 JPEG 字节，
    # 若按 .webp/.png 的文件名去覆盖，等于把 JPEG 数据挂到别的扩展名上。
    # 反过来 .jpg 里装着 PNG 的（见下 mislabeled）正是要修的。
    if not path.lower().endswith((".jpg", ".jpeg")):
        return src, None
    # 动图一律放行：scenes/motion/*.webp 是 anim-forge 烘出来的动画层，
    # PIL 只认第一帧，转手就把 21 幕动态背景压成一张静帧——整个功能没了
    try:
        if getattr(im, "n_frames", 1) > 1:
            return src, None
    except Exception:
        return src, None
    w, h = im.size
    # 扩展名说谎的那种（j_gong/j_yun 是 .jpg 里装 PNG）一律重编码：
    # 绘画类 PNG 比 JPEG 大近十倍，这两张各 2.7MB，而且文件名已经在对的地方骗了浏览器缓存语义
    mislabeled = fmt != "JPEG"
    # 宽度到限不等于压过了：j_gong / j_yun 是 1024x1536 却在 1.7~1.8 字节/像素
    # （q97 一档，单张 2.7MB），只按宽度设闸就会整张放过。密度超标的一并重编码。
    bpp = src / float(max(1, w * h))
    if not mislabeled and w <= cap and bpp <= MAX_BPP:
        return src, None
    scale = min(1.0, cap / w)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    out = im.convert("RGB")
    if (nw, nh) != (w, h):
        out = out.resize((nw, nh), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    new = buf.tell()
    if new >= src:
        return src, None
    if apply_writes:
        with open(path, "wb") as fh:
            fh.write(buf.getvalue())
    return src, new


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dirs", nargs="*", default=None)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    targets = []
    for base in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, base)
        if not os.path.isdir(d):
            continue
        if args.dirs and not any(base == x or base in x or x.startswith(base) for x in args.dirs):
            continue
        for dirpath, _names, files in os.walk(d):
            rel_dir = os.path.relpath(dirpath, ROOT).replace("\\", "/")
            group = top_dir(rel_dir)
            cap = CAPS.get(group)
            if cap is None:
                continue
            if args.dirs and not any(rel_dir == x or rel_dir.startswith(x.rstrip("/") + "/") or x.startswith(rel_dir) for x in args.dirs):
                continue
            for f in files:
                if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    targets.append((os.path.join(dirpath, f), os.path.join(rel_dir, f), cap))

    stat = defaultdict(lambda: [0, 0, 0, 0])  # files, touched, before, after
    for path, rel, cap in targets:
        src, new = optimize(path, cap, args.apply)
        g = top_dir(rel)
        stat[g][0] += 1
        stat[g][2] += src
        if new is None:
            stat[g][3] += src
        else:
            stat[g][1] += 1
            stat[g][3] += new

    tb = sum(v[2] for v in stat.values())
    ta = sum(v[3] for v in stat.values())
    mode = "APPLIED" if args.apply else "dry-run"
    out = ["== art optimize (%s)  quality=%d ==" % (mode, QUALITY)]
    for g in sorted(stat, key=lambda k: -(stat[k][2] - stat[k][3])):
        n, touched, before, after = stat[g]
        out.append("%-13s %4d files  %2d rewritten  %7.1f MB -> %7.1f MB  (%.2fx)" % (
            g, n, touched, before / 1048576.0, after / 1048576.0,
            before / max(1, after)))
    out.append("TOTAL         %4d files          %7.1f MB -> %7.1f MB  (%.2fx)" % (
        len(targets), tb / 1048576.0, ta / 1048576.0, tb / max(1, ta)))
    sys.stdout.buffer.write(("\n".join(out) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
