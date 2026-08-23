// 临时审计脚本：美术资产覆盖率核查
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
import { readdirSync } from "node:fs";

const ALL = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];
const names = (dir: string) => new Set(readdirSync(new URL(`../src/assets/${dir}`, import.meta.url)).filter(f => f.endsWith(".png")));
const cards = names("cards"), portraits = names("portraits"), scenes = names("scenes"), covers = names("covers"), ends = names("endings");

let missCard: string[] = [], missScene: string[] = [], missEnd: string[] = [], missCover: string[] = [];
for (const sc of ALL) {
  if (!covers.has(`cover_${sc.id}.png`)) missCover.push(sc.id);
  for (const c of sc.cards) {
    if (!cards.has(`${c.id}.png`) && !portraits.has(`${c.id}.png`)) missCard.push(`${sc.id}/${c.id}(${c.layer ?? "成术"})`);
  }
  for (const s of sc.scenes) {
    if (!scenes.has(`${sc.id}_${s.id}.png`) && !scenes.has(`${s.id}.png`)) missScene.push(`${sc.id}/${s.id}`);
    if (s.ending && !ends.has(`end_${sc.id}_${s.id}.png`)) missEnd.push(`${sc.id}/${s.id}`);
  }
}
console.log("缺卡图:", missCard.length, missCard.join(", "));
console.log("缺场景图:", missScene.length, missScene.join(", "));
console.log("缺结局图:", missEnd.length, missEnd.join(", "));
console.log("缺封面:", missCover.join(", ") || "无");

// 数据层交叉检查：市集/翻牌/对局引用完整性 + 可卖钥匙卡风险
for (const sc of ALL) {
  for (const s of sc.scenes) {
    if (s.shop) for (const id of s.shop.stock) if (!sc.cards.find(c => c.id === id)) console.log(`[市集悬空] ${sc.id}/${s.id} 货架引用不存在卡 ${id}`);
    if (s.cardPick) for (const id of s.cardPick.options) if (!sc.cards.find(c => c.id === id)) console.log(`[翻牌悬空] ${sc.id}/${s.id} 翻牌引用不存在卡 ${id}`);
  }
  // 可被卖掉的「钥匙卡」：后续有 cond.card 引用的卡出现在市集货架
  const keyed = new Set<string>();
  for (const s of sc.scenes) for (const c of s.choices ?? []) if (c.cond?.card) keyed.add(c.cond.card);
  for (const s of sc.scenes) {
    if (!s.shop) continue;
    for (const id of s.shop.stock) if (keyed.has(id)) console.log(`[钥匙卡可卖] ${sc.id} 市集货架含条件钥匙卡 ${id}（可被玩家卖掉导致分支永久关闭）`);
  }
  // 情绪局 goal 缺省一致性
  for (const d of sc.duels) if (d.mode === "emotion" && !d.goal) console.log(`[goal缺省] ${sc.id}/${d.id} 情绪局未设 goal（引擎默认5，UI默认3）`);
}
