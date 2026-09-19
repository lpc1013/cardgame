// 花色归类审计：types.ts:7-8 规范 —— 人物卡归势；物品/资源归器；陷阱(trap)归隐；成术卡主归策（借势类例外归势），器/隐不应出现在成术
// 附加：卡 id 前缀(t_=隐陷阱, i_=器物品, p_=势人物, c_=成术)与花色互证；assets/cards/<目录> 与 suit 一致性
// 用法：node --experimental-strip-types scripts/audit-suits.mts
import { readdirSync, existsSync } from "node:fs";
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
import { touming } from "../src/data/touming.ts";
import { xingxing } from "../src/data/xingxing.ts";

const SCENARIOS = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, touming, xingxing];
const ASSETS = join(import.meta.dirname, "../src/assets/cards");

// 卡 id 基名 → 所在花色目录
const artDir = new Map<string, string>();
if (existsSync(ASSETS)) {
  for (const sub of readdirSync(ASSETS, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    for (const f of readdirSync(join(ASSETS, sub.name))) {
      artDir.set(f.slice(0, f.lastIndexOf(".")), sub.name);
    }
  }
}

const issues: string[] = [];
const stats = new Map<string, number>();
let total = 0;

for (const sc of SCENARIOS as any[]) {
  const seen = new Set<string>();
  const cards: any[] = [...(sc.cards ?? []), ...(sc.duels ?? []).flatMap((d: any) => (d.oppCards ?? []).map((o: any) => (typeof o === "string" ? { id: o } : o)))];
  for (const c of cards) {
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    const full = (sc.cards ?? []).find((x: any) => x.id === c.id) ?? c;
    if (!full.suit && full.id !== c.id) continue; // oppCards 只引用 id，无独立归类意义
    total++;
    const layer = full.layer ?? "成术";
    const suit = full.suit;
    const gu = full.rarity === "孤品";
    stats.set(`${layer}/${suit ?? "-"}`, (stats.get(`${layer}/${suit ?? "-"}`) ?? 0) + 1);
    const tag = `${sc.id ?? sc.name}/${full.id}(${full.name})`;
    if (gu) continue; // 孤品不在四色内
    if (!suit) { issues.push(`缺花色 ${tag} layer=${layer}`); continue; }
    if (layer === "人物" && suit !== "势") issues.push(`人物卡应归势 → 实为${suit} ${tag}`);
    if ((layer === "物品" || layer === "资源") && suit !== "器") issues.push(`${layer}卡应归器 → 实为${suit} ${tag}`);
    if (layer === "成术") {
      if (full.trap && suit !== "隐") issues.push(`陷阱卡应归隐（引擎 duel.ts:647 硬门槛）→ 实为${suit} ${tag}`);
      const dir = artDir.get(full.id);
      if (dir && dir !== "gu" && dir !== suit) issues.push(`素材在${dir}/ 但花色=${suit} ${tag}`);
    }
  }
}

console.log(`共审 ${total} 张卡；分布：`);
for (const [k, v] of [...stats.entries()].sort()) console.log(`  ${k}: ${v}`);
console.log(issues.length ? `\n疑似归类问题 ${issues.length} 项：` : "\n✅ 无归类问题");
for (const i of issues) console.log("  · " + i);
