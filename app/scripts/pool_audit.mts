// ============================================================
// pool_audit.mts —— 池子三层审计（批次 D）
//   D1 资产层：cards/策|器|势|隐|gu 目录归属 vs 卡表 layer/suit
//   D2 数据层：trap 语义 / 悬空引用 / 资源卡合法性
//   D3 玩法层：每张玩家卡至少落一个「可用池」，输出"抽到用不上"清单
// 只读审计，不动数据。
// ============================================================
import { readdirSync } from "node:fs";
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

// ---------- 收集卡表 ----------
const playerCards = new Map<string, { sc: string; layer: string; suit?: string; trap?: string; resource?: number; rarity?: string; endingReward?: boolean; name: string }>();
const oppIds = new Set<string>();
for (const sc of scs) {
  for (const c of sc.cards) {
    playerCards.set(c.id, {
      sc: sc.id, layer: c.layer ?? "成术", suit: c.suit, trap: c.trap,
      resource: c.resource, rarity: c.rarity, endingReward: c.endingReward, name: c.name,
    });
  }
  for (const d of sc.duels ?? []) for (const oc of d.oppCards ?? []) oppIds.add(oc.id);
}

// ---------- D1 资产目录 ----------
const cardsDir = "src/assets/cards";
const dirFiles: Record<string, string[]> = {};
let rootFiles: string[] = [];
for (const e of readdirSync(cardsDir, { withFileTypes: true })) {
  if (e.isDirectory()) {
    dirFiles[e.name] = readdirSync(join(cardsDir, e.name)).filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, ""));
  } else if (e.name.endsWith(".jpg")) rootFiles.push(e.name.replace(/\.jpg$/, ""));
}
const SUIT_DIRS = ["策", "器", "势", "隐"] as const;
const problemsD1: string[] = [];
const dupIds = new Set<string>();
const seen = new Set<string>();
const expectDir = (id: string): string => {
  const c = playerCards.get(id);
  if (!c) return "gu"; // 未知（对手等）默认 gu
  return c.layer === "成术" && c.suit ? c.suit : "gu";
};
for (const [dir, files] of Object.entries(dirFiles)) {
  for (const id of files) {
    if (seen.has(id)) { dupIds.add(id); problemsD1.push(`跨目录重复: ${id}（${dir} 与 ${[...seenDirs(id)]}）`); }
    seen.add(id);
    const exp = expectDir(id);
    if (SUIT_DIRS.includes(dir as any) && dir !== exp && !oppIds.has(id)) {
      // 成术图应在其 suit 目录；gu 类图不应出现在四色目录（对手牌除外）
      problemsD1.push(`目录错位: ${id}（layer=${playerCards.get(id)?.layer} suit=${playerCards.get(id)?.suit}）应在「${exp}」，实际在「${dir}」`);
    }
  }
}
function seenDirs(id: string): string { return [...Object.entries(dirFiles)].filter(([, fs]) => fs.includes(id)).map(([d]) => d).join(","); }
if (rootFiles.length) problemsD1.push(`根目录散放 ${rootFiles.length} 张: ${rootFiles.slice(0, 20).join(",")}`);

// D1b：卡表↔资产（玩家卡缺图/多余）
const allAssetIds = new Set<string>([...Object.values(dirFiles).flat(), ...rootFiles]);
const playerNoImg = [...playerCards.keys()].filter((id) => !allAssetIds.has(id) && !oppIds.has(id));
const oppNoImg = [...oppIds].filter((id) => !allAssetIds.has(id));
const extraImg = [...allAssetIds].filter((id) => !playerCards.has(id) && !oppIds.has(id));

// ---------- D2 数据层 ----------
const problemsD2: string[] = [];
// trap 语义：只能隐色成术
for (const [id, c] of playerCards) {
  if (c.trap && (c.suit !== "隐" || c.layer !== "成术")) {
    problemsD2.push(`陷阱错位: ${id} trap=${c.trap} suit=${c.suit} layer=${c.layer}（陷阱只应出现在隐色成术）`);
  }
}
// 资源卡合法性
for (const [id, c] of playerCards) {
  if (c.layer === "资源" && !c.resource) problemsD2.push(`资源卡缺 resource 字段: ${id}`);
}
// 悬空引用
const refs: string[] = [];
for (const sc of scs) {
  if (sc.initialDeck) refs.push(...sc.initialDeck.map((x) => `${sc.id}.initialDeck:${x}`));
  for (const v of sc.viewpoints ?? []) if (v.initialDeck) refs.push(...v.initialDeck.map((x) => `${sc.id}.vp.${v.id}:${x}`));
  for (const d of sc.duels ?? []) {
    refs.push(...d.deck.map((x) => `${sc.id}.duel.${d.id}.deck:${x}`));
    for (const oc of d.oppCards ?? []) refs.push(...[oc.id].map((x) => `${sc.id}.duel.${d.id}.opp:${x}`));
  }
  for (const scn of sc.scenes ?? []) {
    if (scn.shop) {
      refs.push(...scn.shop.stock.map((x) => `${sc.id}.scene.${scn.id}.stock:${x}`));
      for (const p of scn.shop.packs ?? []) refs.push(...p.pool.map((x) => `${sc.id}.scene.${scn.id}.pack.${p.id}:${x}`));
      for (const h of scn.shop.hiddenStock ?? []) refs.push(`${sc.id}.scene.${scn.id}.hidden:${h.id}`);
    }
    if (scn.cardPick) refs.push(...scn.cardPick.options.map((x) => `${sc.id}.scene.${scn.id}.pick:${x}`));
    if (scn.ending?.reward) refs.push(`${sc.id}.scene.${scn.id}.reward:${scn.ending.reward}`);
    if (scn.effects) refs.push(...scn.effects.map((ef) => [ef.unlockCard, ef.removeCard].filter(Boolean).map((x) => `${sc.id}.scene.${scn.id}.effect:${x}`)).flat());
    for (const ch of scn.choices ?? []) {
      if (ch.effects) refs.push(...ch.effects.map((ef) => [ef.unlockCard, ef.removeCard].filter(Boolean).map((x) => `${sc.id}.scene.${scn.id}.${ch.text.slice(0, 8)}:${x}`)).flat());
      if (ch.cond?.card) refs.push(`${sc.id}.scene.${scn.id}.cond:${ch.cond.card}`);
      if (ch.cond?.notCard) refs.push(`${sc.id}.scene.${scn.id}.cond:${ch.cond.notCard}`);
    }
  }
}
const dangling = refs.filter((r) => {
  const id = r.split(":").slice(1).join(":");
  return !playerCards.has(id) && !oppIds.has(id);
});

// ---------- D3 玩法层可用池 ----------
const usablePool = new Set<string>();
const usableSrc = new Map<string, string[]>();
const addUsable = (id: string, src: string) => {
  usablePool.add(id);
  if (!usableSrc.has(id)) usableSrc.set(id, []);
  usableSrc.get(id)!.push(src);
};
for (const sc of scs) {
  const isCardSystem = sc.cardSystem === true;
  for (const id of sc.initialDeck ?? []) addUsable(id, `${sc.id}:初始卡组`);
  for (const v of sc.viewpoints ?? []) for (const id of v.initialDeck ?? []) addUsable(id, `${sc.id}:视角卡组`);
  for (const d of sc.duels ?? []) for (const id of d.deck) addUsable(id, `${sc.id}:对局${d.id}`);
  for (const scn of sc.scenes ?? []) {
    if (scn.shop) {
      for (const id of scn.shop.stock) addUsable(id, `${sc.id}:商店`);
      for (const p of scn.shop.packs ?? []) for (const id of p.pool) addUsable(id, `${sc.id}:卡包${p.id}`);
      for (const h of scn.shop.hiddenStock ?? []) addUsable(id2(h.id), `${sc.id}:暗柜`);
    }
    if (scn.cardPick) for (const id of scn.cardPick.options) addUsable(id, `${sc.id}:翻牌`);
    if (scn.ending?.reward) addUsable(scn.ending.reward, `${sc.id}:结局奖励`);
    if (scn.effects) for (const ef of scn.effects) if (ef.unlockCard) addUsable(ef.unlockCard, `${sc.id}:剧情`);
    for (const ch of scn.choices ?? []) {
      if (ch.effects) for (const ef of ch.effects) if (ef.unlockCard) addUsable(ef.unlockCard, `${sc.id}:剧情`);
    }
  }
  // 物品/人物：获得后随身携带天然可用（案件卡系统 & 叙事均成立）
  for (const [id, c] of playerCards) {
    if (c.sc === sc.id && (c.layer === "物品" || c.layer === "人物")) addUsable(id, `${sc.id}:随身携带`);
  }
}
function id2(h: { id: string }): string { return h.id; }

const unplayable = [...playerCards.keys()].filter((id) => !usablePool.has(id)).map((id) => {
  const c = playerCards.get(id)!;
  return { id, sc: c.sc, layer: c.layer, suit: c.suit ?? "-", trap: c.trap ?? "", name: c.name };
});

// ---------- 输出 ----------
const L = (s: string) => console.log(s);
L("========== 池子三层审计报告 ==========");
L(`卡表: 玩家卡 ${playerCards.size} + 对手专属 ${oppIds.size}`);
L(`资产: 四色+gu 共 ${allAssetIds.size} 张（根目录 ${rootFiles.length}）`);
L("");
L(`【D1 资产层】`);
L(`  玩家卡缺图: ${playerNoImg.length}${playerNoImg.length ? " → " + playerNoImg.join(",") : ""}`);
L(`  对手卡缺图(预期): ${oppNoImg.length}`);
L(`  资产多余(卡表无): ${extraImg.length}${extraImg.length ? " → " + extraImg.join(",") : ""}`);
L(`  目录错位: ${problemsD1.filter((p) => p.startsWith("目录错位")).length}`);
problemsD1.filter((p) => p.startsWith("目录错位")).forEach((p) => L(`    ${p}`));
L(`  根目录散放: ${problemsD1.filter((p) => p.startsWith("根目录")).length}`);
L(`  跨目录重复: ${dupIds.size}${dupIds.size ? " → " + [...dupIds].join(",") : ""}`);
L("");
L(`【D2 数据层】`);
L(`  陷阱错位: ${problemsD2.filter((p) => p.startsWith("陷阱错位")).length}${problemsD2.filter((p) => p.startsWith("陷阱错位")).length ? " → " + problemsD2.filter((p) => p.startsWith("陷阱错位")).join("；") : ""}`);
L(`  资源卡缺字段: ${problemsD2.filter((p) => p.startsWith("资源卡")).length}`);
L(`  悬空引用: ${dangling.length}`);
dangling.slice(0, 60).forEach((r) => L(`    DANGLING: ${r}`));
if (dangling.length > 60) L(`    …共 ${dangling.length} 条`);
L("");
L(`【D3 玩法层】「抽到/持有却无法上场」清单（无任何可用池）`);
if (unplayable.length === 0) {
  L(`  无 —— 全部玩家卡至少落一个可用池`);
} else {
  L(`  共 ${unplayable.length} 张:`);
  for (const u of unplayable) L(`    ${u.id} [${u.sc}] ${u.layer}/${u.suit}${u.trap ? " trap=" + u.trap : ""} ${u.name}`);
}
L("");
L(`【陷阱卡现状】`);
const traps = [...playerCards.entries()].filter(([, c]) => c.trap);
for (const [id, c] of traps) {
  const usable = usablePool.has(id) ? "可用(" + (usableSrc.get(id) ?? []).slice(0, 2).join(";") + ")" : "❌ 无可用池";
  L(`  ${id} [${c.sc}] ${c.trap} ${usable}`);
}
