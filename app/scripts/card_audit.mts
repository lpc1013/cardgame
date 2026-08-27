import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";
import { jieyu } from "../src/data/jieyu.ts";
import { shumian } from "../src/data/shumian.ts";
import { changjiang } from "../src/data/changjiang.ts";
import { diaolan } from "../src/data/diaolan.ts";
import { changhen } from "../src/data/changhen.ts";
import { jianfeng } from "../src/data/jianfeng.ts";
import { xingxing } from "../src/data/xingxing.ts";
import { touming } from "../src/data/touming.ts";

const scs = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];

// 全部卡牌（含对手专属 oppCards）
const cardIds = new Set<string>();
const layerCount: Record<string, number> = {};
const suitCount: Record<string, number> = {};
const rarityCount: Record<string, number> = {};
for (const sc of scs) {
  for (const c of sc.cards) {
    cardIds.add(c.id);
    const layer = c.layer ?? "成术";
    layerCount[layer] = (layerCount[layer] ?? 0) + 1;
    if (c.suit) suitCount[c.suit] = (suitCount[c.suit] ?? 0) + 1;
    if (c.rarity) rarityCount[c.rarity] = (rarityCount[c.rarity] ?? 0) + 1;
  }
  for (const d of sc.duels ?? []) {
    for (const oc of d.oppCards ?? []) cardIds.add(oc.id);
  }
}

// 资产目录
const cardsDir = "src/assets/cards";
const assetIds = new Set<string>();
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".jpg")) assetIds.add(e.name.replace(/\.jpg$/, ""));
  }
};
walk(cardsDir);

const missing = [...cardIds].filter((id) => !assetIds.has(id));
const extra = [...assetIds].filter((id) => !cardIds.has(id));

console.log(`== 卡表总数: ${cardIds.size}（玩家卡 + 对手专属）`);
console.log(`== 分层: ${JSON.stringify(layerCount)}`);
console.log(`== 分花色: ${JSON.stringify(suitCount)}`);
console.log(`== 分品级: ${JSON.stringify(rarityCount)}`);
console.log("");
console.log(`== 资产 jpg: ${assetIds.size}`);
console.log(`== 缺图（卡表有/资产无）: ${missing.length}`);
missing.forEach((id) => console.log(`  MISSING: ${id}`));
console.log(`== 多余（资产有/卡表无）: ${extra.length}`);
extra.forEach((id) => console.log(`  EXTRA: ${id}`));
