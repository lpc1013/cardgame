"""把选定的对手立绘候选落进 assets/portraits/，命名 opp_<对局id>.jpg。

App.tsx 的 opponentArt() 先查 opp_<对局id>，再回落 r_<去掉 d_ 前缀>，
所以文件名即接线——落位不需要改任何剧本数据。
源图 540x720（3:4），牌桌席位画 96x128，四倍余量，不放大也不收高清。
"""
import os
import sys
from PIL import Image

SRC = 'tools/jm/incoming/opponents'
DST = 'app/src/assets/portraits'
PICKS = {
    'opp_d_sima': 3,
    'opp_d_qipan': 4,
    'opp_d_sipan_chai': 1,
    'opp_d_laststand': 1,
    'opp_d_chaobian': 3,
    'opp_d_baiyu': 3,
    'opp_d_li_yuan': 3,
    'opp_d_chai_tea': 3,
    'opp_d_geban': 1,
}
# 十面埋伏有两局对手都是项羽（d_baiyu 与 d_guling），共用一张，复制而非重抽
ALIAS = {'opp_d_guling': 'opp_d_baiyu'}

rows = []
for tag, n in sorted(PICKS.items()):
    src = os.path.join(SRC, '%s_%d.png' % (tag, n))
    if not os.path.exists(src):
        rows.append('MISSING %s' % src)
        continue
    im = Image.open(src).convert('RGB')
    out = os.path.join(DST, '%s.jpg' % tag)
    im.save(out, 'JPEG', quality=84, optimize=True)
    rows.append('%-22s %s %dx%d %dKB' % (tag + '.jpg', im.size, im.size[0], im.size[1], os.path.getsize(out) // 1024))

for dst, src in ALIAS.items():
    s = os.path.join(DST, '%s.jpg' % src)
    if os.path.exists(s):
        Image.open(s).convert('RGB').save(os.path.join(DST, '%s.jpg' % dst), 'JPEG', quality=84, optimize=True)
        rows.append('%-22s 复用 %s' % (dst + '.jpg', src))

sys.stdout.buffer.write(('\n'.join(rows) + '\n').encode('utf-8'))
