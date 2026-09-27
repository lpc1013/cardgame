#!/usr/bin/env python3
"""把 anim-forge 烘出的 PNG 帧序列编成可无缝循环的 animated WebP。

无缝原理：Godot 多渲 preroll 帧（源序列 s[0..N+B-1]），成片取
  P[j]      = s[j+B]                      j < N-B
  P[N-B+k]  = mix(s[N+k], s[k], k/(B-1))  k < B
于是 P[N-1] 落在 s[B-1]，与 P[0]=s[B] 恰好是源里的相邻两帧，循环点不跳。
"""
import argparse
import json
import os
import sys

from PIL import Image

import numpy as np


def unpremultiply(im):
    """Godot 透明 SubViewport 存的是预乘 alpha（白粒子 68% → RGB=178）。
    webp/PNG 按直通 alpha 存，不还原会被浏览器再乘一次，浅色粒子全变灰。"""
    arr = np.asarray(im).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    rgb = np.where(a > 0.004, arr[..., :3] / np.maximum(a, 1e-4), 0.0)
    arr[..., :3] = np.clip(rgb, 0.0, 255.0)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def natural_key(name):
    return name


def load_frames(frames_dir, size=None, alpha_floor=0):
    names = sorted(
        (f for f in os.listdir(frames_dir) if f.lower().endswith(".png")),
        key=natural_key,
    )
    if not names:
        sys.exit(f"no png frames in {frames_dir}")
    out = []
    for n in names:
        im = Image.open(os.path.join(frames_dir, n))
        # 特效层带 alpha，不能提前拍平到底色上
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        if im.mode == "RGBA":
            im = unpremultiply(im)
        if size:
            im = im.resize(size, Image.LANCZOS)
        if alpha_floor and im.mode == "RGBA":
            # 极淡的雾晕是 animated webp 的字节大头：压成全透明，大面积交给 CSS  haze
            a = im.getchannel("A").point(lambda v: 0 if v < alpha_floor else v)
            im.putalpha(a)
        out.append(im)
    return out


def build_loop(src, body, preroll):
    """src 是 N+B 帧；返回 N 帧的无缝成片。"""
    if preroll <= 0 or len(src) < body + preroll:
        return src[:body]
    blend = []
    for j in range(body - preroll):
        blend.append(src[j + preroll])
    for k in range(preroll):
        tail = src[body + k]
        head = src[k]
        t = k / float(preroll - 1) if preroll > 1 else 1.0
        blend.append(Image.blend(tail, head, t))
    return blend


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", required=True, help="manifest json，取 fps/seconds/preroll")
    ap.add_argument("--frames", required=True, help="Godot 输出的帧目录")
    ap.add_argument("--out", required=True, help="输出 .webp 路径")
    ap.add_argument("--width", type=int, default=0, help="交付宽度（等比缩放）")
    ap.add_argument("--height", type=int, default=0, help="交付高度")
    ap.add_argument("--quality", type=int, default=72)
    ap.add_argument("--method", type=int, default=4, help="webp 压缩 effort，6 极慢")
    ap.add_argument("--alpha-floor", type=int, default=14,
                    help="低于此 alpha 直接压成透明，砍掉雾晕字节")
    args = ap.parse_args()

    with open(args.job, encoding="utf-8") as fh:
        job = json.load(fh)
    fps = float(job.get("fps", 20))
    body = int(round(fps * float(job.get("seconds", 6.0))))
    preroll = int(job.get("preroll", 0))

    size = (args.width, args.height) if args.width and args.height else None
    src = load_frames(args.frames, size, args.alpha_floor)
    print(f"loaded {len(src)} frames (body={body} preroll={preroll})")
    if len(src) < body + preroll:
        sys.exit(f"expected >= {body + preroll} frames, got {len(src)}")

    frames = build_loop(src, body, preroll)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    frames[0].save(
        args.out,
        save_all=True,
        append_images=frames[1:],
        duration=int(round(1000.0 / fps)),
        loop=0,
        quality=args.quality,
        method=args.method,
    )
    kb = os.path.getsize(args.out) / 1024.0
    # libwebp 会静默少写帧，必须回读校验，不能信 save 没抛异常
    written = open(args.out, "rb").read().count(b"ANMF")
    print(f"wrote {args.out}  {len(frames)}f  {frames[0].size}  {kb:.0f} KB  ANMF={written}")
    if written != len(frames):
        sys.exit(f"TRUNCATED: encoded {written} of {len(frames)} frames")


if __name__ == "__main__":
    main()
