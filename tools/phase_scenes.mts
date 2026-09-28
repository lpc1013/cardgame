import fs from 'fs';

const dir = 'app/src/data';
const files = fs.readdirSync(dir).filter((f) => /\.ts$/.test(f) && f !== 'sceneSettings.ts' && f !== 'achievements.ts' && f !== 'bonus.ts' && f !== 'empireShop.ts' && f !== 'cardThemes.ts');

const FLAGS = ['minigame', 'shop', 'cardPick', 'ending'];
const report = {};

for (const f of files) {
  const t = fs.readFileSync(`${dir}/${f}`, 'utf8');
  const sid = (t.match(/id:\s*['"]([a-z_]+)['"]/) || [, f.replace('.ts', '')])[1];
  const found = {};
  // 扫 scenes 数组里的每个场景对象：按 depth 找 `{` 起点，配对到 `}`，在片段里查标志
  const start = t.indexOf('scenes:');
  if (start < 0) continue;
  let i = t.indexOf('[', start);
  let depth = 0, objStart = -1;
  for (let p = i; p < t.length; p++) {
    const c = t[p];
    if (c === '{') { if (depth === 0) objStart = p; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        const frag = t.slice(objStart, p + 1);
        const idm = frag.match(/^\{\s*id:\s*['"]([a-zA-Z_0-9]+)['"]/);
        if (idm) {
          for (const flag of FLAGS) {
            if (new RegExp(`[,{]\\s*${flag}:`).test(frag)) (found[flag] = found[flag] || []).push(idm[1]);
          }
        }
        objStart = -1;
      }
    } else if (c === ']' && depth === 0) break;
  }
  const vm = t.match(/verdict:\s*\{\s*scene:\s*['"]([a-zA-Z_0-9]+)['"]/);
  if (vm) found.verdict = [vm[1]];
  if (Object.keys(found).length) report[sid] = found;
}

for (const [sc, by] of Object.entries(report)) {
  console.log(`== ${sc}`);
  for (const [k, v] of Object.entries(by)) console.log(`   ${k.padEnd(9)} ${v.slice(0, 4).join(', ')}${v.length > 4 ? ` (+${v.length - 4})` : ''}`);
}
