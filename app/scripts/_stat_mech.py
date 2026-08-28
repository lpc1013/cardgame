import re, os

total = 0; mech = 0; mechIds = []
for f in os.listdir('src/data'):
    if not f.endswith('.ts') or f in ('index.ts', 'types.ts', 'cardThemes.ts', 'bonus.ts'):
        continue
    s = open('src/data/' + f, encoding='utf8').read()
    ids = re.findall(r'id:\s*"([^"]+)"', s)
    total += len(ids)
    pat = re.compile(r'id:\s*"([^"]+)"[^{}]{0,200}?(situational|sacrifice|drawOnPlay|trap\s*:\s*\{|reveal\s*:\s*"(card|suit))', re.S)
    for m in pat.finditer(s):
        mech += 1; mechIds.append(m.group(1))
print('卡定义约', total, '机制位约', mech, '占比 %.0f%%' % (mech / total * 100))
print(','.join(mechIds))
