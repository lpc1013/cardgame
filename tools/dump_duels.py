"""列出每一场对局的对手名与所在剧本，用来定「谁值得画一张立绘」。

只统计 duels: [ ... ] 数组里的 id/opponent —— 剧本里 d_ 前缀的卡牌 id 会被误伤，
所以先按 duels: 切段再在段内找。
"""
import re
import io
import glob
import os

lines = []
for p in sorted(glob.glob('src/data/*.ts')):
    t = open(p, encoding='utf-8').read()
    m = re.search(r'\n  duels: \[(.*?)\n  \],\n', t, re.S)
    if not m:
        continue
    body = m.group(1)
    rows = []
    for dm in re.finditer(r'\{\s*\n\s*id:\s*"(d_[a-z0-9_]+)",(.*?)\n      opponent:\s*\{\s*name:\s*"([^"]+)",\s*desc:\s*"([^"]*)"', body, re.S):
        head = dm.group(2)
        mode = 'emotion' if 'mode: "emotion"' in head else ('pressure' if 'mode: "pressure"' in head else '?')
        rows.append((dm.group(1), dm.group(3), mode, dm.group(4)))
    if rows:
        lines.append('== %s (%d 局)' % (os.path.basename(p)[:-3], len(rows)))
        for r in rows:
            lines.append('   %-18s %-14s %-8s %s' % (r[0], r[1], r[2], r[3][:40]))

io.open('../_qa/duels.txt', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('wrote', len(lines), 'lines')
