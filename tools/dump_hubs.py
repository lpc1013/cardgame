"""摸清五桩大理寺案的 hub（选地点）幕：有没有 lines、几个选项、每个选项去哪、这一幕在哪个地点。

只读不改——配文要往哪个位置插、插几个字段，先看准了再动。
"""
import re
import sys

CASES = ['fuma', 'qiuwei', 'sichou', 'xie', 'qinhuai']

# 先取 SCENE_SETTING，判断某幕落在哪个地点（决定 hub 有没有底图可站）
sett_src = open('src/data/sceneSettings.ts', encoding='utf-8').read()
settings = {}
for m in re.finditer(r'\n "([a-z]+)": \{(.*?)\n \},', sett_src, re.S):
    settings[m.group(1)] = dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', m.group(2)))

out = []
for sc in CASES:
    t = open('src/data/%s.ts' % sc, encoding='utf-8').read()
    parts = re.split(r'\n    \{\n      id: "([a-z0-9_]+)",\n', t)
    for i in range(1, len(parts), 2):
        sid, body = parts[i], parts[i + 1]
        chs = re.findall(r'\{ text: "([^"]{1,60})"(?:, hint: "[^"]*")?(?:, cond: \{([^}]*)\})?,? ?(?:effects: \[[^\]]*\], )?next: "([a-z0-9_]+)"', body)
        if len(chs) < 3:
            continue  # 不是"挑地方"的枢纽幕
        has_lines = 'lines: [' in body
        out.append('== %s.%s  lines=%s  地点=%s  选项=%d' % (sc, sid, has_lines, settings.get(sc, {}).get(sid, '?'), len(chs)))
        for text, cond, nxt in chs:
            out.append('     %-52s -> %-16s %s' % (text[:52], nxt, (cond or '').strip()[:40]))
sys.stdout.buffer.write(('\n'.join(out) + '\n').encode('utf-8'))
