# -*- coding: utf-8 -*-
"""
五类卡牌花纹框合成器
1. 把 noseal_*.jpg 白底扣成透明 PNG
2. 生成统一风格的圆形徽章（刻字）
3. 把徽章精确贴到左上角（圆心在卡外，约 1/4 圆凸出）
4. 输出最终 frame_suit_*.png
"""
import os, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FRAMES_DIR = r"E:\CardGame\app\src\assets\frames"
OUT_DIR = FRAMES_DIR  # 输出到同目录

CARD_W, CARD_H = 1728, 2304
SEAL_DIAMETER = 200   # 圆章直径（px），约占卡宽 11.6%
SEAL_OFFSET = -70     # 圆章圆心相对卡左上角的偏移（负值=凸出卡外）

SUITS = [
    ("ce", "策",   (150, 130, 100)),   # 策 · 暗银青铜
    ("shi", "势",  (140, 100, 70)),    # 势 · 铁青铜
    ("qi", "器",   (160, 130, 70)),    # 器 · 黄铜
    ("yin", "隐",  (170, 170, 180)),   # 隐 · 银锡
    ("gu", "孤",   (180, 145, 70)),    # 孤 · 鎏金
]


def remove_white_bg(img, threshold=240):
    """把近白色背景抠成透明"""
    img = img.convert("RGBA")
    datas = img.getdata()
    new_data = []
    for r, g, b, a in datas:
        if r > threshold and g > threshold and b > threshold:
            # 白色 → 全透明
            new_data.append((r, g, b, 0))
        else:
            new_data.append((r, g, b, 255))
    img.putdata(new_data)
    return img


def make_seal(char, base_color, diameter=SEAL_DIAMETER):
    """生成一枚圆形古铜印章，中心刻一个汉字"""
    d = diameter
    img = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = d // 2, d // 2
    r = d // 2 - 2

    # 底色渐变（模拟金属浮雕）
    for i in range(r, 0, -1):
        t = i / r
        # 外圈偏暗，内圈偏亮
        factor = 0.55 + 0.45 * (1 - t * t)
        cr = int(base_color[0] * factor + 40 * (1 - factor))
        cg = int(base_color[1] * factor + 35 * (1 - factor))
        cb = int(base_color[2] * factor + 30 * (1 - factor))
        draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(cr, cg, cb, 255))

    # 外圈双环（深色勾边）
    draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                 outline=(int(base_color[0] * 0.4), int(base_color[1] * 0.4), int(base_color[2] * 0.4), 255), width=3)
    draw.ellipse([cx - r + 8, cy - r + 8, cx + r - 8, cy + r - 8],
                 outline=(int(base_color[0] * 0.5), int(base_color[1] * 0.5), int(base_color[2] * 0.5), 255), width=2)

    # 内圈亮线
    draw.ellipse([cx - r + 14, cy - r + 14, cx + r - 14, cy + r - 14],
                 outline=(int(base_color[0] * 1.1), int(base_color[1] * 1.05), int(base_color[2] * 0.9), 180), width=1)

    # 刻字 —— 尝试找中文字体
    font = None
    font_size = int(d * 0.55)
    for font_path in [
        "C:/Windows/Fonts/simkai.ttf",       # 楷体
        "C:/Windows/Fonts/simhei.ttf",       # 黑体
        "C:/Windows/Fonts/msyh.ttc",         # 雅黑
        "C:/Windows/Fonts/simsun.ttc",       # 宋体
    ]:
        if os.path.exists(font_path):
            try:
                font = ImageFont.truetype(font_path, font_size)
                break
            except:
                continue
    if font is None:
        font = ImageFont.load_default()

    # 文字：凹陷效果（先画深色阴影，再画亮色主体）
    bbox = draw.textbbox((0, 0), char, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = cx - tw // 2 - bbox[0]
    ty = cy - th // 2 - bbox[1]

    # 阴影（凹陷感）
    draw.text((tx + 2, ty + 2), char, fill=(int(base_color[0] * 0.3), int(base_color[1] * 0.3), int(base_color[2] * 0.3), 200), font=font)
    # 主字色（比底色稍亮的金属色）
    draw.text((tx, ty), char, fill=(int(base_color[0] * 1.15), int(base_color[1] * 1.1), int(base_color[2] * 0.95), 255), font=font)

    # 轻微模糊柔化边缘
    img = img.filter(ImageFilter.GaussianBlur(0.5))
    return img


def compose_frame(suit_key, char, base_color):
    """合成单张卡框"""
    # 1. 加载底图并抠白底
    src_path = os.path.join(FRAMES_DIR, f"noseal_{suit_key}.jpg")
    if not os.path.exists(src_path):
        print(f"  跳过 {suit_key}: 源图不存在")
        return

    frame = remove_white_bg(Image.open(src_path))

    # 2. 生成圆章
    seal = make_seal(char, base_color)

    # 3. 贴到左上角：圆心在 (SEAL_OFFSET, SEAL_OFFSET)
    #    圆章左上角坐标 = 圆心 - 半径
    sx = SEAL_OFFSET - seal.width // 2
    sy = SEAL_OFFSET - seal.height // 2

    # 创建新画布（可能比卡体大，因为圆章凸出）
    # 计算需要的额外空间
    extra_w = max(0, -sx)
    extra_h = max(0, -sy)
    # 只在左上扩展，右下不变
    new_w = CARD_W + extra_w
    new_h = CARD_H + extra_h

    canvas = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 0))
    # 卡体放在偏移后的位置
    card_x = extra_w
    card_y = extra_h
    canvas.paste(frame, (card_x, card_y), frame)

    # 贴圆章
    seal_x = card_x + sx
    seal_y = card_y + sy
    canvas.paste(seal, (seal_x, seal_y), seal)

    # 4. 输出
    out_path = os.path.join(OUT_DIR, f"frame_suit_{suit_key}.png")
    canvas.save(out_path, "PNG", optimize=True)
    size_kb = os.path.getsize(out_path) // 1024
    print(f"  ✅ {suit_key} ({char}) → {canvas.size[0]}x{canvas.size[1]}  {size_kb}KB")

    # 额外输出一个 2x 缩版（720x960 基准）
    small = canvas.copy()
    small.thumbnail((720, 960), Image.LANCZOS)
    small_path = os.path.join(OUT_DIR, f"frame_suit_{suit_key}_sm.png")
    small.save(small_path, "PNG", optimize=True)


def main():
    print("=" * 60)
    print("五类卡牌花纹框合成")
    print("=" * 60)
    os.makedirs(OUT_DIR, exist_ok=True)

    for key, char, color in SUITS:
        compose_frame(key, char, color)

    print("\n完成！输出目录:", OUT_DIR)


if __name__ == "__main__":
    main()
