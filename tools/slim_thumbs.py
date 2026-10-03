"""缩略图产线：给「大图塞小格」的三处现场离线产小图，落到 assets/thumbs/<kind>/。

为什么要这一趟：封面缩略条 96x54 的格子拉 1400x800 全图、图鉴结局瓦片与卡墙
也在用全尺寸图——字节是格子的几十倍，浏览器每张都在做不必要的缩放解码。
本脚本按「格子 CSS px x 2（高 DPR）再留余量」产 thumbs，原图一个字节都不动。

三条硬约束（与 optimize_art.py 同源，都是会静默坏事的那种）：
1. 只缩不放大。原文件已经比目标还小的，直接跳过。
2. 幂等：thumbs/<kind>/<id>.jpg 已存在且源文件未变（mtime+size）就跳过，重跑零成本。
3. 缩略图永远落 .jpg（UI 侧按固定路径直查，缺文件回退原图——回退链路不能有第二种格式歧义）。

跑法：python tools/slim_thumbs.py [--apply]
默认只报告不改文件（dry-run），加 --apply 才落盘。
"""
import argparse
import os

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "src", "assets")

# kind → (源目录列表, 目标长边上限 px, JPEG 质量)
# 上限 = 渲染槽位 CSS px x 2（DPR）再留余量：cover 条 96、结局瓦片 ~240、卡格 184
KINDS = {
    "covers": (["covers"], 288, 78),
    "endings": (["endings"], 480, 78),
    "cards": (["cards/策", "cards/器", "cards/势", "cards/隐", "cards/gu"], 384, 78),
}
QUALITY = 78


def source_files(dirs):
    for d in dirs:
        base = os.path.join(ROOT, d)
        for name in sorted(os.listdir(base)):
            if name.lower().endswith((".jpg", ".jpeg", ".png")):
                yield os.path.join(base, name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="落盘（缺省 dry-run）")
    args = ap.parse_args()

    made = skipped = fresh = 0
    bytes_before = bytes_after = 0
    for kind, (dirs, cap, _q) in KINDS.items():
        out_dir = os.path.join(ROOT, "thumbs", kind)
        for src in source_files(dirs):
            stem = os.path.splitext(os.path.basename(src))[0]
            out = os.path.join(out_dir, stem + ".jpg")
            src_stat = os.stat(src)
            if os.path.exists(out):
                # 源未变即视为新鲜（thumb 没有独立的源 of record，mtime+size 足够稳）
                out_stat = os.stat(out)
                if out_stat.st_mtime >= src_stat.st_mtime and out_stat.st_size > 0:
                    fresh += 1
                    continue
            with Image.open(src) as im:
                im = im.convert("RGB")
                w, h = im.size
                if max(w, h) <= cap:
                    skipped += 1  # 原图本就在限内，缩它无利可图
                    continue
                scale = cap / max(w, h)
                tw, th = round(w * scale), round(h * scale)
                small = im.resize((tw, th), Image.LANCZOS)
                if not args.apply:
                    import io
                    buf = io.BytesIO()
                    small.save(buf, "JPEG", quality=QUALITY, optimize=True)
                    bytes_before += src_stat.st_size
                    bytes_after += buf.tell()
                    made += 1
                    continue
                os.makedirs(out_dir, exist_ok=True)
                small.save(out, "JPEG", quality=QUALITY, optimize=True)
                # 把 thumb 的 mtime 压到源之后，保证幂等判定成立
                os.utime(out, (src_stat.st_atime, src_stat.st_mtime + 1))
                bytes_before += src_stat.st_size
                bytes_after += os.stat(out).st_size
                made += 1

    verb = "产出" if args.apply else "将产出(dry-run)"
    print(f"{verb} {made} 张，已新鲜 {fresh} 张，限内跳过 {skipped} 张")
    if made:
        print(f"对应槽位原图 {bytes_before/1048576:.1f} MB → 缩略图 {bytes_after/1048576:.1f} MB（{bytes_before/max(bytes_after,1):.1f}x）")


if __name__ == "__main__":
    main()
