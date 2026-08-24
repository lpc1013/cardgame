import fs from 'node:fs';
const files = fs.readdirSync('src/data').filter(f => f.endsWith('.ts') && !f.includes('empire') && !f.includes('cardThemes'));
let out = '';
for (const f of files) {
  const src = fs.readFileSync('src/data/' + f, 'utf8');
  const blocks = src.split(/^\s*\{\s*$/m);
  for (const b of blocks) {
    if (!b.includes('ending:')) continue;
    const id = (b.match(/id:\s*"([^"]+)"/) || [, '?'])[1];
    const title = (b.match(/title:\s*"([^"]*)"/) || [, '?'])[1];
    const end = (b.match(/ending:\s*\{\s*name:\s*"([^"]*)",\s*rank:\s*"([^"]*)",\s*desc:\s*"([^"]*)"\s*\}/) || []);
    const lines = [...b.matchAll(/^\s*"((?:[^"\\]|\\.)*)",?$/gm)].map(m => m[1]);
    out += `\n##### [${f}] ${id} | ${title}\n◆ ${end[1]} | ${end[2]} | ${end[3]}\n正文：\n` + lines.map(l => '  ' + l).join('\n') + '\n';
  }
}
fs.writeFileSync('ends_dump.txt', out, 'utf8');
console.log('written, chars:', out.length);
