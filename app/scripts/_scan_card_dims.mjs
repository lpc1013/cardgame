// 扫描 src/assets/cards/**/*.jpg 的实际像素尺寸，列出非主规格 1728×2304 的残留
// （2026-08-27 审计 C-1②：2:3 残留清单，供分批重裁参考）
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/assets/cards";
const jpegSize = (buf) => {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
};

let total = 0;
let bad = 0;
const report = [];
for (const dir of readdirSync(ROOT)) {
  const full = join(ROOT, dir);
  let files;
  try { files = readdirSync(full); } catch { continue; }
  for (const f of files) {
    if (!f.endsWith(".jpg")) continue;
    total++;
    const size = jpegSize(readFileSync(join(full, f)));
    if (!size || size.w !== 1728 || size.h !== 2304) {
      bad++;
      report.push(`${dir}/${f}  ${size ? `${size.w}×${size.h}` : "解析失败"}`);
    }
  }
}
console.log(`扫描 ${total} 张卡图：主规格 ${total - bad} / 非主规格 ${bad}`);
for (const r of report.slice(0, 40)) console.log("  " + r);
if (report.length > 40) console.log(`  …其余 ${report.length - 40} 条略`);
