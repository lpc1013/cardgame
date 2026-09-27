#!/usr/bin/env python3
"""生成 anim-forge 用的粒子精灵图（花瓣/叶/火星）。
超采样后缩小得到软边，比在 GDScript 里逐像素算场更快也更可控。"""
import argparse
import math
import os

from PIL import Image, ImageDraw

SS = 4  # 超采样倍数


def petal(size, tint, width=0.86, length=0.92, notch=0.13):
    """桃花/樱花瓣：基部窄、往顶端渐宽的倒卵形，顶端微凹。"""
    big = size * SS
    im = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(im)
    top = big * (1 - length) / 2
    bot = big * (1 + length) / 2
    cx = big / 2.0
    span = bot - top
    pts = []
    steps = 96

    def half_w(t):
        # t=0 是瓣尖（带凹口那端），t=1 是基部：最宽处落在靠瓣尖，基部收成短柄
        prof = ((1.0 - t) ** 0.45) * (t ** 0.10) / 0.764
        return width * big * 0.5 * (0.14 + 0.86 * min(prof, 1.0))

    for i in range(steps + 1):
        t = i / float(steps)
        pts.append((cx - half_w(t), top + t * span))
    for i in range(steps, -1, -1):
        t = i / float(steps)
        pts.append((cx + half_w(t), top + t * span))
    d.polygon(pts, fill=255)
    # 顶端凹口：从上面咬一个圆
    nr = notch * big
    d.ellipse([cx - nr, top - nr * 1.15, cx + nr, top + nr * 0.85], fill=0)
    im = im.resize((size, size), Image.LANCZOS)
    # 基部到顶端做一条明暗渐变，避免看起来是平面色块
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = im.load()
    o = out.load()
    for y in range(size):
        t = y / float(size - 1)  # 0 = 顶端, 1 = 基部
        deep = 0.70 + 0.30 * t
        for x in range(size):
            a = px[x, y]
            if a == 0:
                continue
            o[x, y] = (int(tint[0] * deep), int(tint[1] * deep), int(tint[2] * deep), a)
    return out


def disc(size, color, soft):
    big = size * SS
    im = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(im)
    d.ellipse([0, 0, big - 1, big - 1], fill=255)
    im = im.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(big * soft * 0.12))
    im = im.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size))
    px = im.load()
    o = out.load()
    for y in range(size):
        for x in range(size):
            o[x, y] = (color[0], color[1], color[2], px[x, y])
    return out


def streak(size, h, color):
    """风雪拉丝：扁长软条，比圆点更像被风吹着的雪。
    只糊 alpha 掩膜——直接糊 RGBA 会把颜色通道朝透明黑拖走，出来是灰痕。"""
    from PIL import ImageFilter
    mask = Image.new("L", (size, h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, h * 0.30, size - 1, h * 0.70], radius=h * 0.2, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(h * 0.22))
    out = Image.new("RGBA", (size, h), color + (0,))
    out.putalpha(mask)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.dirname(os.path.abspath(__file__)) + "/sprites")
    args = ap.parse_args()
    os.makedirs(args.dir, exist_ok=True)
    jobs = [
        ("petal_pink.png", petal(96, (255, 214, 224))),
        ("petal_white.png", petal(96, (252, 248, 246), width=0.78, notch=0.10)),
        ("leaf.png", petal(96, (196, 214, 186), width=0.40, length=0.96, notch=0.03)),
        ("mote.png", disc(48, (255, 255, 255), 0.6)),
        ("streak.png", streak(96, 20, (255, 255, 255))),
        ("blob.png", disc(96, (255, 255, 255), 1.0)),
    ]
    for name, im in jobs:
        p = os.path.join(args.dir, name)
        im.save(p)
        print(f"{p}  {im.size}")


if __name__ == "__main__":
    main()
