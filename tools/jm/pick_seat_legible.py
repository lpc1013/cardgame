"""给 16 个 tag 的 64 张候选打分：按牌桌席位真实尺寸（44x58，手机横屏那一档）
把每张实缩一遍，量"主体与纸底分不分得开"。
为什么这么挑：席位只有 96x128 / 64x85 / 44x58 三个显示尺寸且没有放大查看口，
五官在 44x58 下必然消失，能留下的只有整块剪影与浅底之间的明暗差。
所以这里不打分"画得好不好看"，只打分"缩到 44x58 还认不认得出主体"。
"""
import glob
import os
import sys
import numpy as np
from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'incoming',
                   sys.argv[1] if len(sys.argv) > 1 else 'opponents2')
SEAT = (44, 58)          # 最严苛的一档：手机横屏
PAPER = 205.0            # 宣纸底大致亮度，用来估"主体相对纸底暗多少"


def score(path):
    im = Image.open(path).convert('L').resize(SEAT, Image.LANCZOS)
    a = np.asarray(im, dtype=float)
    dark = a < 128
    frac = float(dark.mean())                       # 主体占画面比例
    # 主体与纸底的亮度差：取暗部的平均，越暗、占比越接近"一个整块"越好
    gap = float(PAPER - a[dark].mean()) if frac > 0.02 else 0.0
    # 碎片度：暗部连通块越少越像"一个剪影"。用行投影的跳变数近似，避免引 scipy
    cols = (dark.mean(axis=0) > 0.15).astype(int)
    runs = int(np.abs(np.diff(cols)).sum() // 2)
    return frac, gap, runs


def cand_files(tag):
    # 必须整段匹配 `{tag}_<数字>.png`：`opp_d_daoge_*.png` 会把 `opp_d_daoge_nan_1.png`
    # 一起吃进来（deliver / deliver_fast 同理），于是"7 张候选"其实是两个 tag 混在一起排的分。
    # 只校验"结尾是数字"挡不住——那些文件本来就以数字结尾。
    out = []
    for f in glob.glob(f'{SRC}/{tag}_*.png'):
        base = os.path.basename(f)
        rest = base[len(tag) + 1:-len('.png')]
        if rest.isdigit():
            out.append(f)
    return sorted(out)


rows = []
for tag in sorted({os.path.basename(f).rsplit('_', 1)[0] for f in glob.glob(f'{SRC}/*.png')}):
    for f in cand_files(tag):
        frac, gap, runs = score(f)
        n = os.path.basename(f).rsplit('_', 1)[1].split('.')[0]
        # 综合分：暗得下去(gap)、占得住画面(frac 越接近 .35 越像单个主体)、不成碎片(runs)
        fit = 1 - min(abs(frac - 0.35) / 0.35, 1.0)
        s = (gap / 128.0) * 0.5 + fit * 0.35 + max(0.0, 1 - (runs - 1) * 0.18) * 0.15
        rows.append((tag, int(n), frac, gap, runs, s))

cur = None
for tag, n, frac, gap, runs, s in sorted(rows, key=lambda r: (r[0], -r[5])):
    if tag != cur:
        sys.stdout.buffer.write(('\n%s  (%d 张候选)\n' % (tag, len(cand_files(tag)))).encode('utf-8'))
        cur = tag
    sys.stdout.buffer.write(('   #%d  占比%.2f 亮度降%3.0f 连通%d  分%.3f\n' % (n, frac, gap, runs, s)).encode('utf-8'))

sys.stdout.buffer.write(b'\n')
