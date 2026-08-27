import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";
import type { Scenario } from "../src/engine/types.ts";

const cases: { name: string; sc: Scenario }[] = [
  { name: "fuma", sc: fuma }, { name: "qiuwei", sc: qiuwei }, { name: "sichou", sc: sichou },
  { name: "xie", sc: xie }, { name: "qinhuai", sc: qinhuai },
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
  console.log(`【${name}】${sc.title} mode=${sc.mode} 卡数=${cards.length}`);
  console.log(`  层: ${JSON.stringify(byLayer)}`);
  console.log(`  花色: ${JSON.stringify(bySuit)}`);
  console.log(`  品级: ${JSON.stringify(byRarity)}`);
  // 四色覆盖（裸卡组要求）
  const suits = new Set(cards.filter(c => (c.layer ?? "成术") === "成术" && c.suit).map(c => c.suit));
  console.log(`  成术四色覆盖: ${[...suits].join("/")}`);
  // 场景数/枢纽
  const shops = sc.scenes.filter(s => s.shop).length;
  const minis = sc.scenes.filter(s => s.minigame).length;
  console.log(`  商店=${shops} 小游戏=${minis} 场景数=${sc.scenes.length}`);
  console.log("");
}
