import io, os
from PIL import Image

OUT = "_qa"
SKINS = ["default", "bianjun", "jiangnan"]
CW, CH = 520, 325          # 单元格：1440x900 等比缩到 520x325
GAP, LABEL = 8, 26


def montage(screen, tag):
    rows = []
    for s in SKINS:
        cells = []
        for mode in ("light", "dark"):
            f = f"{OUT}/t_{s}_{mode}_{screen}.png"
            im = Image.open(f).convert("RGB").resize((CW, CH), Image.LANCZOS)
            cells.append(im)
        rows.append((s, cells))

    W = GAP + (CW + GAP) * 2
    H = GAP + (CH + LABEL + GAP) * len(rows)
    sheet = Image.new("RGB", (W, H), (24, 22, 20))
    try:
        from PIL import ImageDraw, ImageFont
        dr = ImageDraw.Draw(sheet)
        try:
            font = ImageFont.truetype("arial.ttf", 18)
        except Exception:
            font = ImageFont.load_default()
    except Exception:
        dr = None
        font = None

    y = GAP
    for s, cells in rows:
        x = GAP
        for im in cells:
            sheet.paste(im, (x, y))
            x += CW + GAP
        if dr:
            dr.text((GAP, y + CH + 4), f"{s}   (light | dark)", fill=(240, 230, 210), font=font)
        y += CH + LABEL + GAP
    p = f"{OUT}/montage_{tag}.png"
    sheet.save(p)
    print(p, sheet.size)


montage("title", "title_v3")
montage("story", "story_v3")
