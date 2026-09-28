import fs from 'fs';

const dir = 'app/src/data';
const skip = new Set(['sceneSettings.ts', 'achievements.ts', 'bonus.ts', 'empireShop.ts', 'cardThemes.ts']);
const arts = new Set(fs.readdirSync('app/src/assets/endings').map((f) => f.replace(/\.(jpg|png|webp)$/i, '')));

// 按大括号配对切出 scenes 数组里的每个场景对象（旧版要求 ending: 前面是 { 或 ,，
// 但数据里常见 `],\n  next: "..."\n  ending: {` 这种前一行以 ] 收尾的写法，会漏）
function scenesOf(t: string) {
  const start = t.indexOf('scenes:');
  if (start < 0) return [];
  let p = t.indexOf('[', start);
  const out: { id: string; frag: string }[] = [];
  let depth = 0, objStart = -1;
  for (; p < t.length; p++) {
    const c = t[p];
    if (c === '{') { if (depth === 0) objStart = p; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) { out.push({ id: '', frag: t.slice(objStart, p + 1) }); objStart = -1; }
    } else if (c === ']' && depth === 0) break;
  }
  for (const s of out) {
    const m = s.frag.match(/^\{\s*id:\s*['"]([a-zA-Z_0-9]+)['"]/);
    s.id = m ? m[1] : '?';
  }
  return out;
}

let total = 0; const missing: string[] = []; const seen = new Set<string>();
for (const f of fs.readdirSync(dir).filter((f) => /\.ts$/.test(f) && !skip.has(f))) {
  const t = fs.readFileSync(`${dir}/${f}`, 'utf8');
  const sid = (t.match(/id:\s*['"]([a-z_]+)['"]/) || [, f.replace('.ts', '')])[1];
  for (const s of scenesOf(t)) {
    // 只看对象自己那一层的 ending 键（嵌套在 options 里的不算结局幕）
    if (!/(^|[\s{,])ending:\s*\{/.test(s.frag)) continue;
    const key = `end_${sid}_${s.id}`;
    total++; seen.add(key);
    if (!arts.has(key)) missing.push(`${sid}/${s.id} -> ${key}.jpg`);
  }
}
const orphan = [...arts].filter((a) => !seen.has(a));
console.log(`结局幕: ${total}   缺图: ${missing.length}   落单资产: ${orphan.length}`);
for (const m of missing) console.log('  缺:', m);
for (const o of orphan) console.log('  孤:', o);
