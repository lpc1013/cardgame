import fs from 'fs';
import path from 'path';

const dir = 'app/src/data';
const artDir = 'app/src/assets/endings';
const skip = new Set(['sceneSettings.ts', 'achievements.ts', 'bonus.ts', 'empireShop.ts', 'cardThemes.ts']);
const arts = new Set(fs.readdirSync(artDir).map((f) => f.replace(/\.(jpg|png|webp)$/i, '')));

const missingArt: string[] = [];
const orphanArt: string[] = [...arts];
let total = 0;

for (const f of fs.readdirSync(dir).filter((f) => /\.ts$/.test(f) && !skip.has(f))) {
  const t = fs.readFileSync(`${dir}/${f}`, 'utf8');
  const sid = (t.match(/id:\s*['"]([a-z_]+)['"]/) || [, f.replace('.ts', '')])[1];
  const start = t.indexOf('scenes:');
  if (start < 0) continue;
  let depth = 0, objStart = -1;
  for (const c of []) void c;
  for (let p = t.indexOf('[', start); p < t.length; p++) {
    const c = t[p];
    if (c === '{') { if (depth === 0) objStart = p; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        const frag = t.slice(objStart, p + 1);
        const idm = frag.match(/^\{\s*id:\s*['"]([a-zA-Z_0-9]+)['"]/);
        if (idm && /[,{]\s*ending:/.test(frag)) {
          const key = `end_${sid}_${idm[1]}`;
          total++;
          if (arts.has(key)) { const i = orphanArt.indexOf(key); if (i >= 0) orphanArt.splice(i, 1); }
          else missingArt.push(`${sid}/${idm[1]}  (期望 ${key}.jpg)`);
        }
        objStart = -1;
      }
    } else if (c === ']' && depth === 0) break;
  }
}

console.log(`结局幕总数: ${total}   有图: ${total - missingArt.length}   缺图: ${missingArt.length}`);
for (const m of missingArt) console.log('  缺:', m);
console.log(`\n落单资产（有图但对不上任何结局幕）: ${orphanArt.length}`);
for (const o of orphanArt.slice(0, 20)) console.log('  孤:', o);
