# -*- coding: utf-8 -*-
# 五类卡框 PNG 生成器 v2：策/势/器/隐/孤
# 加宽框带 + 珠链/回纹带饰 + 大角章（卷草+扇弧+铆钉），中心透明
# 输出: app/src/assets/frames/frame_{ce,shi,qi,yin,gu}.png  （720x960, 2x 超采样）
import math, os
from PIL import Image, ImageDraw, ImageFilter

SS = 2
W, H = 720 * SS, 960 * SS
OUT = r"E:\CardGame\app\src\assets\frames"
os.makedirs(OUT, exist_ok=True)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))

def ring(d, box, radius, color, width):
    d.rounded_rectangle(box, radius=max(4, min(radius, (box[2] - box[0]) // 2, (box[3] - box[1]) // 2)), outline=color, width=width)

def metal_band(d, box, r0, w, light, mid, dark):
    """三层金属带：亮脊在外 1/3，暗槽在内，中间主色 —— 立体浮雕"""
    x0, y0, x1, y1 = box
    for i in range(w):
        t = i / max(1, w - 1)
        c = lerp(light, mid, t * 2) if t < 0.5 else lerp(mid, dark, (t - 0.5) * 2)
        d.rounded_rectangle([x0 + i, y0 + i, x1 - i, y1 - i], radius=max(2, r0 - i), outline=c, width=1)

def spiral(d, cx, cy, r0, r1, a0, turns, color, width, dir=1):
    n = int(120 * turns)
    pts = []
    for i in range(n + 1):
        t = i / n
        th = a0 + dir * turns * 2 * math.pi * t
        r = r0 + (r1 - r0) * t
        pts.append((cx + r * math.cos(th), cy + r * math.sin(th)))
    d.line(pts, fill=color, width=width, joint="curve")

def stud(d, cx, cy, r, base, hi, dark):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=base, outline=dark, width=2)
    d.arc([cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2], 200, 320, fill=hi, width=2)

def bead_chain(d, box, r0, inset, bead_r, color, hi, dark, skip=110):
    """框带中线的珠链：四边等距圆珠，靠角 skip 半径内不放"""
    x0, y0, x1, y1 = box
    bx0, by0, bx1, by1 = x0 + inset, y0 + inset, x1 - inset, y1 - inset
    rr = r0 - inset
    def beads(a, b, horizontal=True):
        L = (b - a)
        n = max(2, int(L // skip))
        for i in range(n + 1):
            t = a + (L) * i / n
            if horizontal: yield t, None
            else: yield None, t
    # 上边/下边
    for x in [x for x, _ in beads(bx0 + rr * 0.2, bx1 - rr * 0.2)]:
        for y in (by0, by1):
            if abs(x - bx0) > skip * 0.6 and abs(x - bx1) > skip * 0.6:
                stud(d, x, y, bead_r, color, hi, dark)
    # 左边/右边
    ys = [y for _, y in beads(by0 + rr * 0.2, by1 - rr * 0.2, horizontal=False)]
    for y in ys:
        for x in (bx0, bx1):
            if abs(y - by0) > skip * 0.6 and abs(y - by1) > skip * 0.6:
                stud(d, x, y, bead_r, color, hi, dark)

def meander(d, box, inset, color, unit=26, thick=3):
    """回纹带饰（简化）：框带中线上的连续方折纹"""
    x0, y0, x1, y1 = box
    bx0, by0 = x0 + inset, y0 + inset
    bx1, by1 = x1 - inset, y1 - inset
    def run(a, b, c, horizontal=True):
        pos = a
        flip = 1
        while pos + unit < c:
            if horizontal:
                d.line([(pos, b), (pos + unit * 0.6, b)], fill=color, width=thick)
                d.line([(pos + unit * 0.6, b), (pos + unit * 0.6, b + flip * unit * 0.5)], fill=color, width=thick)
                d.line([(pos + unit * 0.6, b + flip * unit * 0.5), (pos + unit, b + flip * unit * 0.5)], fill=color, width=thick)
            else:
                d.line([(b, pos), (b, pos + unit * 0.6)], fill=color, width=thick)
                d.line([(b, pos + unit * 0.6), (b + flip * unit * 0.5, pos + unit * 0.6)], fill=color, width=thick)
                d.line([(b + flip * unit * 0.5, pos + unit * 0.6), (b + flip * unit * 0.5, pos + unit)], fill=color, width=thick)
            pos += unit
            flip = -flip
    run(bx0, by0, bx1, True); run(bx0, by1, bx1, True)
    run(by0, bx0, by1, False); run(by0, bx1, by1, False)

def corner_medal(d, cx, cy, dir_x, dir_y, color, hi, dark, scale=1.0):
    """大角章：同心扇弧 + 双卷草 + 中央铆钉（朝卡内方向展开）"""
    r = 46 * SS * scale
    for i, rr in enumerate([r, r * 0.72, r * 0.45]):
        bbox = [cx - rr, cy - rr, cx + rr, cy + rr]
        a0 = 0 if dir_x > 0 else math.pi
        a1 = math.pi / 2 if dir_y > 0 else -math.pi / 2
        # 朝卡内的象限画扇弧
        start = a0 if dir_y > 0 else a0
        if dir_x > 0 and dir_y > 0: s, e = 0, 90
        elif dir_x < 0 and dir_y > 0: s, e = 90, 180
        elif dir_x < 0 and dir_y < 0: s, e = 180, 270
        else: s, e = 270, 360
        d.arc(bbox, s, e, fill=lerp(hi, color, i / 2) if i else hi, width=(4 if i == 0 else 2))
    spiral(d, cx + dir_x * 10 * SS, cy + dir_y * 10 * SS, 3 * SS, 20 * SS * scale, 0, 1.5, color, 3, dir=dir_x * dir_y)
    spiral(d, cx + dir_x * 14 * SS, cy + dir_y * 14 * SS, 6 * SS, 28 * SS * scale, math.pi, 1.1, lerp(color, dark, 0.4), 2, dir=-dir_x * dir_y)
    stud(d, cx, cy, 6 * SS * scale, hi, (255, 240, 200, 255), dark)

def finish(img, name):
    img = img.resize((W // SS, H // SS), Image.LANCZOS)
    img.save(os.path.join(OUT, name), "PNG", optimize=True)
    print(name, img.size, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")

M = 10 * SS
R = 44 * SS

# ============================================================
# 策 · 青蓝 · 棋枰（轻框：双线带 + 细珠链 + 小角章）
# ============================================================
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
BW = 26 * SS
metal_band(d, [M, M, W - M, H - M], R, BW, (150, 186, 220, 255), (91, 143, 184, 255), (44, 76, 110, 255))
bead_chain(d, [M, M, W - M, H - M], R, BW // 2, 3 * SS, (178, 208, 236, 255), (220, 236, 252, 255), (40, 70, 102, 255), skip=72 * SS)
for (cx, cy, dx, dy) in [(M + BW * .7, M + BW * .7, 1, 1), (W - M - BW * .7, M + BW * .7, -1, 1),
                         (M + BW * .7, H - M - BW * .7, 1, -1), (W - M - BW * .7, H - M - BW * .7, -1, -1)]:
    corner_medal(d, cx, cy, dx, dy, (120, 165, 205, 255), (190, 218, 244, 255), (36, 62, 92, 255), scale=0.8)
ring(d, [M + BW + 4 * SS, M + BW + 4 * SS, W - M - BW - 4 * SS, H - M - BW - 4 * SS], R - BW, (91, 143, 184, 120), 1 * SS)
finish(img, "frame_ce.png")

# ============================================================
# 势 · 朱红 · 兵符（重框：厚带 + 回纹 + 大角章 + 边中兽钉）
# ============================================================
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
BW = 40 * SS
metal_band(d, [M, M, W - M, H - M], R, BW, (230, 148, 120, 255), (178, 82, 58, 255), (96, 36, 24, 255))
meander(d, [M, M, W - M, H - M], BW // 2, (237, 162, 140, 200), unit=30 * SS, thick=3 * SS)
for (cx, cy, dx, dy) in [(M + BW * .8, M + BW * .8, 1, 1), (W - M - BW * .8, M + BW * .8, -1, 1),
                         (M + BW * .8, H - M - BW * .8, 1, -1), (W - M - BW * .8, H - M - BW * .8, -1, -1)]:
    corner_medal(d, cx, cy, dx, dy, (201, 107, 87, 255), (237, 162, 140, 255), (90, 34, 22, 255), scale=1.1)
for cx, cy in [(W // 2, M + BW // 2), (W // 2, H - M - BW // 2)]:
    stud(d, cx, cy, 6 * SS, (201, 107, 87, 255), (237, 162, 140, 255), (90, 34, 22, 255))
ring(d, [M + BW + 4 * SS, M + BW + 4 * SS, W - M - BW - 4 * SS, H - M - BW - 4 * SS], R - BW, (201, 107, 87, 140), 1 * SS)
finish(img, "frame_shi.png")

# ============================================================
# 器 · 鎏金 · 青铜（厚带 + 珠链 + 大角章）
# ============================================================
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
BW = 40 * SS
metal_band(d, [M, M, W - M, H - M], R, BW, (240, 216, 150, 255), (201, 161, 58, 255), (116, 86, 26, 255))
bead_chain(d, [M, M, W - M, H - M], R, BW // 2, 4 * SS, (216, 178, 90, 255), (248, 224, 168, 255), (96, 70, 18, 255), skip=64 * SS)
for (cx, cy, dx, dy) in [(M + BW * .8, M + BW * .8, 1, 1), (W - M - BW * .8, M + BW * .8, -1, 1),
                         (M + BW * .8, H - M - BW * .8, 1, -1), (W - M - BW * .8, H - M - BW * .8, -1, -1)]:
    corner_medal(d, cx, cy, dx, dy, (208, 170, 84, 255), (244, 220, 160, 255), (100, 74, 22, 255), scale=1.1)
ring(d, [M + BW + 4 * SS, M + BW + 4 * SS, W - M - BW - 4 * SS, H - M - BW - 4 * SS], R - BW, (201, 161, 58, 140), 1 * SS)
finish(img, "frame_qi.png")

# ============================================================
# 隐 · 黛紫 · 雾隐（半透外纱 + 珠链细框 + 卷雾角章 + 内缘雾光）
# ============================================================
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
veil = Image.new("RGBA", (W, H), (0, 0, 0, 0))
dv = ImageDraw.Draw(veil)
BW = 26 * SS
dv.rounded_rectangle([M, M, W - M, H - M], radius=R, fill=(154, 114, 192, 60))
veil = veil.filter(ImageFilter.GaussianBlur(4 * SS))
img = Image.alpha_composite(img, veil)
d = ImageDraw.Draw(img)
metal_band(d, [M + 2 * SS, M + 2 * SS, W - M - 2 * SS, H - M - 2 * SS], R, BW - 4 * SS,
           (201, 174, 230, 235), (154, 114, 192, 235), (86, 58, 124, 235))
bead_chain(d, [M + 2 * SS, M + 2 * SS, W - M - 2 * SS, H - M - 2 * SS], R, (BW - 4 * SS) // 2, 3 * SS,
           (196, 168, 226, 235), (226, 208, 246, 235), (80, 54, 118, 235), skip=76 * SS)
for (cx, cy, dx, dy) in [(M + BW * .75, M + BW * .75, 1, 1), (W - M - BW * .75, M + BW * .75, -1, 1),
                         (M + BW * .75, H - M - BW * .75, 1, -1), (W - M - BW * .75, H - M - BW * .75, -1, -1)]:
    corner_medal(d, cx, cy, dx, dy, (169, 132, 204, 240), (212, 188, 238, 240), (76, 50, 112, 240), scale=0.9)
ring(d, [M + BW + 4 * SS, M + BW + 4 * SS, W - M - BW - 4 * SS, H - M - BW - 4 * SS], R - BW, (154, 114, 192, 110), 1 * SS)
finish(img, "frame_yin.png")

# ============================================================
# 孤 · 朱砂鎏金 · 传世孤本（双色厚带 + 回纹 + 最大角章 + 菱饰 + 双内衬）
# ============================================================
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
BW = 52 * SS
metal_band(d, [M, M, W - M, H - M], R, BW, (222, 116, 92, 255), (150, 52, 36, 255), (74, 22, 14, 255))
# 带面鎏金回纹
meander(d, [M, M, W - M, H - M], BW // 2, (232, 196, 122, 215), unit=34 * SS, thick=3 * SS)
# 四角大金章
for (cx, cy, dx, dy) in [(M + BW * .85, M + BW * .85, 1, 1), (W - M - BW * .85, M + BW * .85, -1, 1),
                         (M + BW * .85, H - M - BW * .85, 1, -1), (W - M - BW * .85, H - M - BW * .85, -1, -1)]:
    corner_medal(d, cx, cy, dx, dy, (224, 176, 112, 255), (248, 224, 168, 255), (110, 74, 28, 255), scale=1.35)
# 四边中点菱形金饰
for cx, cy in [(W // 2, M + BW // 2), (W // 2, H - M - BW // 2), (M + BW // 2, H // 2), (W - M - BW // 2, H // 2)]:
    d.polygon([(cx, cy - 9 * SS), (cx + 9 * SS, cy), (cx, cy + 9 * SS), (cx - 9 * SS, cy)],
              fill=(232, 196, 122, 255), outline=(120, 80, 30, 255), width=2)
# 双内衬金线
ring(d, [M + BW + 3 * SS, M + BW + 3 * SS, W - M - BW - 3 * SS, H - M - BW - 3 * SS], R - BW, (224, 176, 112, 200), 2 * SS)
ring(d, [M + BW + 10 * SS, M + BW + 10 * SS, W - M - BW - 10 * SS, H - M - BW - 10 * SS], R - BW, (224, 176, 112, 90), 1 * SS)
finish(img, "frame_gu.png")

print("done")
