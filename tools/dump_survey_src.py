"""把五桩案的线索表与勘查幕正文抽出来，供写热点观察句时对照（不改动任何数据文件）。"""
import re
import io

def block(sc, want):
    t = open('src/data/%s.ts' % sc, encoding='utf-8').read()
    out = ['##### %s clues' % sc]
    m = re.search(r'\n  clues: \[(.*?)\n  \],', t, re.S)
    if m:
        for cid, name, kind in re.findall(r'\{ id: "([^"]+)", name: "([^"]+)", kind: "([^"]+)"', m.group(1)):
            out.append('  %s [%s] %s' % (cid, kind, name))
    parts = re.split(r'\n    \{\n      id: "([a-z0-9_]+)",\n', t)
    for i in range(1, len(parts), 2):
        if parts[i] not in want:
            continue
        body = parts[i + 1]
        lm = re.search(r'lines: \[(.*?)\n\],', body, re.S)
        out.append('--- %s.%s lines:' % (sc, parts[i]))
        if lm:
            out.append('   ' + re.sub(r'"\s*,\s*\n\s*"', ' / ', lm.group(1)).strip())
        out.append('   unlocks: ' + ','.join(sorted(set(re.findall(r'unlockClue:\s*"([^"]+)"', body)))))
    return '\n'.join(out)

one = '\n\n'.join([block('fuma', {'search'}), block('xie', {'search'})])
two = '\n\n'.join([
    block('sichou', {'dike'}),
    block('qinhuai', {'dike'}),
    block('qiuwei', {'shutan', 'market_gate'}),
])
io.open('../_qa/survey_src1.txt', 'w', encoding='utf-8').write(one)
io.open('../_qa/survey_src2.txt', 'w', encoding='utf-8').write(two)
print('wrote', len(one), len(two))
