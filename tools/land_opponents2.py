"""把选定的对手立绘候选落进 assets/portraits/，命名 opp_<对局id>.jpg。

opponentArt() 先查 opp_<对局id>，再回落 r_<去掉 d_ 前缀>，所以文件名即接线，
落位不需要改任何剧本数据。源图 540x720（3:4），牌桌席位最大画到 96x128，
四倍余量，不放大也不收高清。

挑选口径不是"哪张最好看"，而是缩到席位真实尺寸（手机横屏 .dt-seat-img 44x58）
之后主体还认不认得出——打分器见 pick_seat_legible.py。
两个来源目录：opponents2 是首轮 16 个 tag，opponents2b 是其中三张的回炉；
回炉的 tag 优先取 2b，2b 没有才退回 2。
"""
import os
import sys
from PIL import Image

DIRS = ['tools/jm/incoming/opponents2b', 'tools/jm/incoming/opponents2']
DST = 'app/src/assets/portraits'
PICKS = {
    'opp_d_junxi': 3,
    'opp_d_tuchu': 2,
    'opp_d_piancoup': 1,
    'opp_d_gucheng': 3,
    'opp_d_defense': 1,
    'opp_d_deliver': 1,
    'opp_d_deliver_fast': 2,
    'opp_d_court': 4,
    'opp_d_daoge': 3,
    'opp_d_daoge_nan': 3,
    'opp_d_xinggu': 1,
    'opp_d_taopao': 2,
    'opp_d_chuge': 4,
    'opp_d_tuoxiang': 3,
    'opp_d_ambush': 1,
    'opp_d_city': 3,
}

rows = []
for tag, n in sorted(PICKS.items()):
    src = next((os.path.join(d, '%s_%d.png' % (tag, n)) for d in DIRS
                if os.path.exists(os.path.join(d, '%s_%d.png' % (tag, n)))), None)
    if not src:
        rows.append('MISSING %s_%d.png（两个来源目录都没有）' % (tag, n))
        continue
    im = Image.open(src).convert('RGB')
    if im.size != (540, 720):
        rows.append('SKIP %s 尺寸 %s 不是 540x720' % (tag, im.size))
        continue
    out = os.path.join(DST, '%s.jpg' % tag)
    im.save(out, 'JPEG', quality=84, optimize=True)
    rows.append('%-22s %s %dx%d %dKB' % (tag + '.jpg', os.path.basename(os.path.dirname(src)),
                                         im.size[0], im.size[1], os.path.getsize(out) // 1024))

sys.stdout.buffer.write(('\n'.join(rows) + '\n').encode('utf-8'))
