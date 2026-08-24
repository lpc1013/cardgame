// 临时审计：资产覆盖率核实（卡图/立绘/场景/封面/结局），按 <id>.{jpg,png} 精确匹配
import { readdirSync } from "node:fs";
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
import type { Scenario } from "../src/engine/types.ts";

const ALL: Scenario[] = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];
const dir = (p: string) => new Set(readdirSync(p).filter((f) => /\.(png|jpe?g)$/.test(f)).map((f) => f.replace(/\.(png|jpe?g)$/, "")));
const cards = dir("src/assets/cards");
const portraits = dir("src/assets/portraits");
const scenes = dir("src/assets/scenes");
const covers = dir("src/assets/covers");
const endings = dir("src/assets/endings");

const missingCard: string[] = [];
const missingScene: string[] = [];
const missingCover: string[] = [];
const missingEnd: string[] = [];

for (const sc of ALL) {
  if (!covers.has("cover_" + sc.id)) missingCover.push(sc.id);
  for (const c of sc.cards) {
    const layer = c.layer ?? "成术";
    if (layer === "资源") continue;
    if (!cards.has(c.id) && !portraits.has(c.id)) missingCard.push(`${sc.id}/${c.id}(${layer},${c.rarity ?? "凡"},${c.name})`);
  }
  for (const s of sc.scenes) {
    if (!scenes.has(`${sc.id}_${s.id}`) && !scenes.has(s.id) && !scenes.has(`scn_${s.id}`)) missingScene.push(`${sc.id}/${s.id}`);
    if (s.ending && !endings.has(`end_${sc.id}_${s.id}`)) missingEnd.push(`${sc.id}/${s.id}`);
  }
}

console.log(`卡图/立绘缺失 ${missingCard.length}：`);
for (const m of missingCard) console.log("  " + m);
console.log(`\n场景图缺失 ${missingScene.length}（按剧本统计）：`);
const bySc = new Map<string, number>();
for (const m of missingScene) bySc.set(m.split("/")[0], (bySc.get(m.split("/")[0]) ?? 0) + 1);
for (const [k, v] of bySc) console.log(`  ${k}: ${v}`);
console.log(`\n封面缺失 ${missingCover.length}：${missingCover.join(",") || "无"}`);
console.log(`结局图缺失 ${missingEnd.length}：${missingEnd.join(",") || "无"}`);
console.log(`\n资产库存：卡图${cards.size} 立绘${portraits.size} 场景${scenes.size} 封面${covers.size} 结局${endings.size}`);
