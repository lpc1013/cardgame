// 把 vibe_images/ 里新生成的卡面（<卡id>_<时间戳>.png）转 jpg 落位到 src/assets/cards/<花色>/
// 用法：node scripts/place_vibe_arts.mjs   （先跑 app/docs/MISSING_CARD_ART.md 的提示词出图）
import { readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

const VIBE = join(import.meta.dirname, "../../vibe_images");
const CARDS = join(import.meta.dirname, "../src/assets/cards");
// 卡 id → 花色目录；新增卡时在此登记
const TARGETS = {
  t_youji: "隐", t_jieli: "隐", t_huosheng: "隐", t_kongcheng: "隐", t_shengdong: "隐", t_tieqiu: "隐",
  i_jiedi: "器",
};

if (!existsSync(VIBE)) { console.log("vibe_images/ 不存在，无需落位"); process.exit(0); }
let placed = 0;
for (const f of readdirSync(VIBE)) {
  const id = Object.keys(TARGETS).find((k) => f.startsWith(k + "_"));
  if (!id || !/\.(png|jpg|jpeg|webp)$/i.test(f)) continue;
  const out = join(CARDS, TARGETS[id], `${id}.jpg`);
  execSync(`python -c "from PIL import Image; im=Image.open(r'${join(VIBE, f)}').convert('RGB'); im.save(r'${out}', quality=90)"`);
  console.log(`✓ ${basename(f)} → cards/${TARGETS[id]}/${id}.jpg`);
  placed++;
}
console.log(placed ? `落位 ${placed} 张` : "vibe_images/ 里暂无待落位卡面");
