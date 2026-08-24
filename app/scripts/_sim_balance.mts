// ============================================================
// 平衡性摸查（第三批 D）：node --experimental-strip-types scripts/_sim_balance.mts
//  每配置 5000 局随机模拟（随机洗牌 + 玩家启发式策略），统计胜率/张力/博弈动作使用率，
//  输出《平衡性摸查报告.md》。
//  玩家模型：
//   - 信息诚实：虚张未拆穿只知假色；v2 压制博弈局对手藏牌，玩家不知敌招花色（破招=盲猜）；
//   - 情绪制：同色 > 克色 > 中性（避被克）；虚张嫌疑时按概率读牌；
//   - 压制制：出可负担的最高点数牌（避免招式用老）；gambit 局按概率蓄势/破招；
//   - v2 行动力耗尽则换气。
// ============================================================
import fs from "node:fs";
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
import type { Scenario, CardDef, Suit } from "../src/engine/types.ts";
import { initDuel, revealEmotion, playEmotion, playPressure, readEmotion, chargeUp, breakMove, endTurn, cardCost, setDuelShuffle, RESTRAIN, type DuelState } from "../src/engine/duel.ts";

const N = 5000;
const SUITS: Suit[] = ["策", "器", "势", "隐"];
const ALL: Scenario[] = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];

function shuffle(a: string[]): string[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function v2Loadout(sc: Scenario): string[] {
  return sc.cards.filter((c) => (c.layer ?? "成术") !== "资源").map((c) => c.id);
}

interface DuelResult { win: boolean; rounds: number; margin: number; reads: number; charges: number; breaks: number; brokeHits: number; wagerEv: number }

function cardOfFor(sc: Scenario, cfg: (typeof sc.duels)[number]) {
  return (id: string): CardDef => {
    const c = sc.cards.find((x) => x.id === id) ?? cfg.oppCards?.find((x) => x.id === id);
    if (!c) throw new Error(`卡牌不存在: ${id}（对局 ${cfg.id}）`);
    return c;
  };
}

/** 出牌价值估计：势牌×2（扣反噬）、用老-2、物品卡加成 */
let lastPlayed: string | null = null;
function effPow(c: CardDef): number {
  let p = c.power ?? 0;
  if (c.suit === "势") p = p * 2 - 1;
  if (c.id === lastPlayed) p -= 2;
  if (c.itemEffect) p += 2;
  return p;
}

/** 玩家当前「所信」对手色：拆穿/非虚张=真色；虚张未拆穿=假色 */
function believedShown(d: DuelState): Suit | null {
  return d.opponentShown;
}

function simEmotion(sc: Scenario, cfg: (typeof sc.duels)[number], cfn: (id: string) => CardDef, pool: string[]): DuelResult {
  const isV2 = cfg.rules === "v2";
  const d = initDuel(cfg, pool, sc.cards);
  revealEmotion(d);
  let reads = 0;
  for (let i = 0; !d.finished && i < 300; i++) {
    // 虚张嫌疑（亮色可能是假色，玩家无从确知）→ 按概率读牌；未读则按所信色行事（可能撞枪口）
    if (cfg.gambit && d.bluffed && d.qi >= 2 && Math.random() < 0.8 && readEmotion(d)) { reads++; continue; }
    const shown = believedShown(d)!;
    const hand = isV2 ? [...d.hand] : pool;
    const cards = hand.map((id) => cfn(id)).filter((c) => (c.layer ?? "成术") === "成术");
    const pick =
      cards.find((c) => c.suit === shown) ??
      cards.find((c) => c.suit && RESTRAIN[c.suit] === shown) ??
      cards.find((c) => c.suit && RESTRAIN[shown] !== c.suit) ??
      cards[0];
    if (!pick || !playEmotion(d, pick)) break;
    if (!d.finished) revealEmotion(d);
  }
  return {
    win: d.finished === "win", rounds: d.round,
    margin: d.finished === "win" ? d.qi : -1,
    reads, charges: 0, breaks: 0, brokeHits: 0, wagerEv: 0,
  };
}

function simPressure(sc: Scenario, cfg: (typeof sc.duels)[number], cfn: (id: string) => CardDef, pool: string[]): DuelResult {
  const isV2 = cfg.rules === "v2";
  const d = initDuel(cfg, pool, sc.cards);
  lastPlayed = null;
  let charges = 0, breaks = 0, brokeHits = 0;
  for (let i = 0; !d.finished && i < 300; i++) {
    const oppId = cfg.script[d.round % cfg.script.length] ?? cfg.script[0]!;
    // 博弈动作（仅 gambit 局，按概率）：v2 博弈局对手藏牌，破招=盲猜 1/4；玩家不知敌招点数与花色，蓄势同样基于估计
    if (cfg.gambit && isV2 && d.ap >= 2) {
      if (!d.foresuit && Math.random() < 0.25) {
        const suit = SUITS[Math.floor(Math.random() * 4)]!; // 盲猜 1/4
        if (breakMove(d, suit, oppId, cfn)) { breaks++; continue; }
      }
      if (d.charge < 2 && Math.random() < 0.15 && chargeUp(d, oppId, cfn)) { charges++; continue; }
    } else if (cfg.gambit && !isV2) {
      if (!d.foresuit && Math.random() < 0.25) {
        const suit = SUITS[Math.floor(Math.random() * 4)]!;
        if (breakMove(d, suit, oppId, cfn)) { breaks++; if (d.lastPlay?.broke) brokeHits++; continue; }
      }
      if (d.charge < 2 && d.hpPlayer > 4 && Math.random() < 0.12) {
        if (chargeUp(d, oppId, cfn)) { charges++; continue; }
      }
    }
    // 出牌：可负担的最高点数牌；避免招式用老（上张同牌-2）；v2 博弈局玩家不知敌色，无法择克色
    const hand = isV2 ? [...d.hand] : pool;
    const cards = hand.map((id) => cfn(id)).filter((c) => (c.layer ?? "成术") !== "人物")
      .filter((c) => !isV2 || d.ap >= cardCost(c))
      .sort((a, b) => effPow(b) - effPow(a));
    const pick = cards[0];
    if (!pick || !playPressure(d, pick, oppId, cfn)) {
      if (isV2 && !d.finished) { endTurn(d); continue; }
      break;
    }
    lastPlayed = pick.id;
    if (d.lastPlay?.broke) brokeHits++;
  }
  return {
    win: d.finished === "win", rounds: d.round,
    margin: d.hpPlayer,
    reads: 0, charges, breaks, brokeHits, wagerEv: 0,
  };
}

interface Row {
  scenario: string; duel: string; title: string; mode: string; rules: string; gambit: boolean;
  winRate: number; avgRounds: number; avgMargin: number; totalMargin: number;
  reads: number; charges: number; breaks: number; brokeHits: number; wagerEv: number; designed_lose: boolean;
}

const rows: Row[] = [];
for (const sc of ALL) {
  for (const cfg of sc.duels) {
    const cfn = cardOfFor(sc, cfg);
    const pool = cfg.rules === "v2" ? v2Loadout(sc) : cfg.deck;
    let wins = 0, rounds = 0, marginSum = 0, reads = 0, charges = 0, breaks = 0, brokeHits = 0, wagerGain = 0;
    for (let i = 0; i < N; i++) {
      setDuelShuffle(shuffle);
      const r = cfg.mode === "emotion" ? simEmotion(sc, cfg, cfn, pool) : simPressure(sc, cfg, cfn, pool);
      if (r.win) wins++;
      rounds += r.rounds;
      marginSum += Math.max(0, r.margin);
      reads += r.reads; charges += r.charges; breaks += r.breaks; brokeHits += r.brokeHits;
      if (cfg.gambit) wagerGain += r.win ? 20 : -20; // 每局押 20 两的期望
    }
    rows.push({
      scenario: sc.id, duel: cfg.id, title: cfg.title, mode: cfg.mode, rules: cfg.rules ?? "classic",
      gambit: !!cfg.gambit,
      winRate: wins / N, avgRounds: rounds / N, avgMargin: marginSum / N, totalMargin: marginSum,
      reads, charges, breaks, brokeHits, wagerEv: wagerGain / N,
      designed_lose: !cfg.gambit && cfg.mode === "pressure" && ["d_defense", "d_deliver", "d_piancoup", "d_ambush"].includes(cfg.id),
    });
  }
}

// ---------- 输出报告 ----------
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const L: string[] = [];
L.push("# 平衡性摸查报告");
L.push("");
L.push(`- 模拟规模：每配置 ${N} 局（随机洗牌 + 启发式玩家策略），共 ${rows.length} 个对局配置、${rows.length * N} 局。`);
L.push("- 玩家模型：信息诚实（虚张未拆穿只知假色；v2 博弈压制局对手藏牌，破招为 1/4 盲猜）；情绪制同色优先，虚张嫌疑时 80% 概率读牌；压制制出估计最高价值牌（避用老），gambit 局 25% 破招/约 12~15% 蓄势；行动力尽则换气。");
L.push("- 注意：启发式模型弱于 verify 的 BFS 最优穷举。「严苛」分级仅反映普通玩家体感预期，可胜性以 verify 全绿为准。");
L.push("- 押注期望：假设每局固定押 20 两（胜入 40、败失 20）。");
L.push("");
L.push("## 分级结论");
const playable = rows.filter((r) => !r.designed_lose);
const tooEasy = playable.filter((r) => r.winRate >= 0.97);
const sweet = playable.filter((r) => r.winRate >= 0.8 && r.winRate < 0.97);
const tense = playable.filter((r) => r.winRate >= 0.5 && r.winRate < 0.8);
const harsh = playable.filter((r) => r.winRate < 0.5);
L.push(`- 设计性死局（必败叙事，不参评）：${rows.filter((r) => r.designed_lose).map((r) => r.title).join("、")}`);
L.push(`- 宽松（胜率≥97%）：${tooEasy.length ? tooEasy.map((r) => `${r.title}（${pct(r.winRate)}）`).join("、") : "无"}`);
L.push(`- 舒适（80%~97%）：${sweet.length ? sweet.map((r) => `${r.title}（${pct(r.winRate)}）`).join("、") : "无"}`);
L.push(`- 张力（50%~80%）：${tense.length ? tense.map((r) => `${r.title}（${pct(r.winRate)}）`).join("、") : "无"}`);
L.push(`- 严苛（<50%，需关注）：${harsh.length ? harsh.map((r) => `${r.title}（${pct(r.winRate)}）`).join("、") : "无"}`);
L.push("");
L.push("## 明细");
L.push("");
L.push("| 剧本 | 对局 | 规则 | 博弈 | 胜率 | 平均回合 | 平均剩余 | 读牌/蓄势/破招(命中) | 押20两期望 |");
L.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  const gambitUse = r.mode === "emotion"
    ? `${r.reads}/—/—`
    : `—/${r.charges}/${r.breaks}(${r.brokeHits})`;
  L.push(`| ${r.scenario} | ${r.title} | ${r.rules} | ${r.designed_lose ? "死局" : r.gambit ? "是" : "否"} | ${pct(r.winRate)} | ${r.avgRounds.toFixed(1)} | ${r.avgMargin.toFixed(1)} | ${r.designed_lose ? "—" : gambitUse} | ${r.designed_lose || !r.gambit ? "—" : r.wagerEv >= 0 ? `+${r.wagerEv.toFixed(1)}` : r.wagerEv.toFixed(1)} |`);
}
L.push("");
L.push("## 调参备忘");
L.push("");
L.push("- 胜率异常项优先手段（Q13 允许微调，以 verify 全绿为闸）：调 `hp`/`goal`/`script` 花色顺序、卡牌点数，或该局关闭 `gambit`。");
L.push("- 押注期望恒正则玩家无押注意愿；若全表期望显著为正，可下调赔付或提高押注门槛。");
fs.writeFileSync("../平衡性摸查报告.md", L.join("\n"), "utf8");
console.log(`报告已写入 平衡性摸查报告.md（${rows.length} 配置 × ${N} 局）`);
for (const r of rows) {
  const tag = r.designed_lose ? "○死局" : r.winRate >= 0.97 ? "宽松" : r.winRate >= 0.8 ? "舒适" : r.winRate >= 0.5 ? "张力" : "严苛";
  console.log(`[${tag}] ${r.scenario}/${r.duel} ${r.title} 胜率${pct(r.winRate)} 回合${r.avgRounds.toFixed(1)} 余${r.avgMargin.toFixed(1)}`);
}
