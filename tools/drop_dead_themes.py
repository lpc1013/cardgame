import io, re, sys

P = 'app/src/app.css'
DEAD = ['zhusha', 'daiqing', 'liujin', 'celadon', 'indigo', 'luxury']

lines = io.open(P, encoding='utf-8').read().split('\n')
sel = re.compile(r'^\[data-theme="(' + '|'.join(DEAD) + r')"')

out = []
i = 0
removed_blocks = 0
removed_lines = 0
while i < len(lines):
    ln = lines[i]
    if sel.match(ln):
        # 连带它上面紧邻的注释块（描述这些规则的，删了不留孤儿注释）
        j = len(out)
        tail = []
        while j > 0 and (out[j - 1].strip().startswith('*') or out[j - 1].strip().startswith('/*') or out[j - 1].strip().endswith('*/')):
            tail.insert(0, out[j - 1])
            j -= 1
        # 只有成对的 /* ... */ 才算它的注释头
        if tail and ''.join(tail).count('/*') == ''.join(tail).count('*/') and '/*' in ''.join(tail):
            removed_lines += len(out) - j
            del out[j:]
        depth = 0
        started = False
        k = i
        while k < len(lines):
            for ch in lines[k]:
                if ch == '{':
                    depth += 1
                    started = True
                elif ch == '}':
                    depth -= 1
            if started and depth <= 0:
                break
            k += 1
        removed_blocks += 1
        removed_lines += k - i + 1
        i = k + 1
        continue
    out.append(ln)
    i += 1

txt = '\n'.join(out)
io.open(P, 'w', encoding='utf-8', newline='\n').write(txt)
print(f'removed {removed_blocks} blocks / {removed_lines} lines')
left = len(re.findall(r'\[data-theme="(zhusha|daiqing|liujin|celadon|indigo|luxury)"', txt))
print('剩余引用（应为 0）:', left)
print('braces balance:', txt.count('{') - txt.count('}'))
