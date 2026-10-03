// ============================================================
// 展示层共享常量（从 App.tsx 抽出）：四色相克环（UI 展示用）
// ============================================================
/** 四色相克环（展示用）：X 克 Y */
export const RESTRAIN_UI: Record<string, string> = { 策: "势", 势: "器", 器: "隐", 隐: "策" };
/** 反查（M7 审计 P0-4）：X 被何色所克——提示「出谁可克敌」必须用这张表，用 RESTRAIN_UI 会恰好指向被敌克的色 */
export const RESTRAINED_BY: Record<string, string> = { 势: "策", 器: "势", 隐: "器", 策: "隐" };

// ============================================================
// 出征/行囊共享帮手（从 App.tsx 抽出）：面板与 App 主流程同源
// ============================================================
import type { CardDef, Scenario } from "../engine/types";
import type { DuelBoosts } from "../engine/duel";
import {
  recordCardsSeen, registerGlobalCards, getCardSeen, getGlobalCard, getGlobalCards, settleEmpire,
} from "../engine/save";
import { SCENARIOS } from "../data/scenarios";


export function duelBoostsOf(ids: string[]): DuelBoosts {
  return {
    qi: ids.includes("b_qi") ? 2 : undefined,
    ap: ids.includes("b_ap") ? 1 : undefined,
    draw: ids.includes("b_draw") ? 1 : undefined,
  };
}

/** 剧本卡定义 ∪ 全局注册表（行囊携带的跨剧本物品） */
export function allCardsFor(sc: Scenario, extraIds: string[]): CardDef[] {
  const known = new Set(sc.cards.map((c) => c.id));
  const extra: CardDef[] = [];
  const reg = getGlobalCards();
  for (const id of extraIds) {
    if (!known.has(id) && reg[id]) { extra.push(reg[id]); known.add(id); }
  }
  return extra.length ? [...sc.cards, ...extra] : sc.cards;
}

export function noteCards(sc: Scenario, ids: string[]): void {
  recordCardsSeen(sc.id, ids);
  registerGlobalCards(sc.cards.filter((c) => ids.includes(c.id)));
}

export function luggageDefs(): CardDef[] {
  const seen = getCardSeen();
  const defs: CardDef[] = [];
  const known = new Set<string>();
  for (const s of SCENARIOS) {
    const got = new Set(seen[s.id] ?? []);
    for (const c of s.cards) {
      if ((c.layer ?? "成术") !== "物品" || !got.has(c.id) || known.has(c.id)) continue;
      known.add(c.id);
      defs.push(c);
    }
  }
  for (const id of settleEmpire().warehouse) {
    if (known.has(id)) continue;
    const d = getGlobalCard(id);
    if (d) { known.add(id); defs.push(d); }
  }
  return defs;
}

export function retinueDefs(): CardDef[] {
  const ids = settleEmpire().retinue;
  const defs: CardDef[] = [];
  for (const id of ids) {
    let d = getGlobalCard(id);
    if (!d) {
      for (const s of SCENARIOS) {
        const c = s.cards.find((x) => x.id === id);
        if (c) { d = c; break; }
      }
    }
    if (d) defs.push(d);
  }
  return defs;
}

export function endingRewardDefs(): CardDef[] {
  const seen = getCardSeen();
  const defs: CardDef[] = [];
  for (const s of SCENARIOS) {
    const got = new Set(seen[s.id] ?? []);
    for (const c of s.cards) {
      if (!c.endingReward || !got.has(c.id)) continue;
      if (defs.some((x) => x.id === c.id)) continue;
      defs.push(c);
    }
  }
  return defs;
}

/** 出征准备：勾选的开局加成 + 携带的仓库物品 */
export interface PrepChoice { boosts: string[]; carry: string[]; retinue: string[]; deckBonus: string[]; peaceDeal?: boolean }

/** 随从准入（与 canAddRetinue 同口径）：人物卡且带斥候/内应被动 */
export const isRetinueCard = (c: CardDef) => (c.layer ?? "成术") === "人物" && ((c.passive?.scout ?? 0) > 0 || (c.passive?.insider ?? 0) > 0);
