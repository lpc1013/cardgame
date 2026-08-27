import { jieyu } from "../src/data/jieyu.ts";
import { shumian } from "../src/data/shumian.ts";
import { changjiang } from "../src/data/changjiang.ts";
import { diaolan } from "../src/data/diaolan.ts";
import { changhen } from "../src/data/changhen.ts";
import { jianfeng } from "../src/data/jianfeng.ts";
import { xingxing } from "../src/data/xingxing.ts";
import { touming } from "../src/data/touming.ts";
import type { Scenario } from "../src/engine/types.ts";

const cases: { name: string; sc: Scenario }[] = [
  { name: "jieyu", sc: jieyu }, { name: "shumian", sc: shumian }, { name: "changjiang", sc: changjiang },
  { name: "diaolan", sc: diaolan }, { name: "changhen", sc: changhen }, { name: "jianfeng", sc: jianfeng },
  { name: "xingxing", sc: xingxing }, { name: "touming", sc: touming },
];

for (const { name, sc } of cases) {
  const cards = sc.cards;
  const byLayer: Record<string, number> = {};
  const bySuit: Record<string, number> = {};
  const byRarity: Record<string, number> = {};
  for (const c of cards) {
    const layer = c.layer ?? "成术";
    byLayer[layer] = (byLayer[layer] ?? 0) + 1;
    if (c.suit) bySuit[c.suit] = (bySuit[c.suit] ?? 0) + 1;
    if (c.rarity) byRarity[c.rarity] = (byRarity[c.rarity] ?? 0) + 1;
  }
  const suits = new Set(cards.filter((c) => (c.layer ?? "成术") === "成术" && c.suit).map((c) => c.suit));
  const sl = JSON.stringify(byLayer), ss = JSON.stringify(bySuit), sr = JSON.stringify(byRarity);
  console.log(`【${name}】${sc.title} mode=${sc.mode} 卡数=${cards.length}`);
  console.log(`  层=${sl} 花色=${ss} 品级=${sr} 成术色=[${[...suits].join("/")}]`);
}
