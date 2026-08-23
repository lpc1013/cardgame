import type { DuelConfig, CardDef, Suit, ItemEffect } from "./types";

// ============================================================
// 双规则卡牌对局引擎（v2）
//
// 四色相克环（单向）：策克势 · 势克器 · 器克隐 · 隐克策。
//
// 经典模式（rules 缺省 / "classic"）：
//   情绪匹配制：同色共鸣 / 克色破防 / 错色失言。
//   气力压制制：比点伤气；势牌×2 反噬 1；连出同张「招式用老」-2。
//
// v2 模式（rules: "v2"，卡牌系统剧本）：
//   - 卡组抽牌：开局从编组卡组抽 4 张为手牌，打出进弃牌堆，每回合补至 4 张；
//     牌库抽空调洗弃牌堆回填。人物卡不进牌库，开局即场外提供被动。
//   - 情绪制：出牌不耗行动力（无限出牌），靠手牌轮换与四色克制博弈。
//   - 压制制：每回合行动力 3 点，卡牌费用缺省 1；克制对手牌色 +1 点，被克 -1 点。
//   - 物品卡：打出即触发 itemEffect，本局消耗（不进弃牌堆）。
// ============================================================

/** 四色相克环：RESTRAIN[X] = X 所克制的颜色（策克势·势克器·器克隐·隐克策） */
export const RESTRAIN: Record<Suit, Suit> = { 策: "势", 势: "器", 器: "隐", 隐: "策" };

export interface DuelState {
  cfg: DuelConfig;
  mode: "emotion" | "pressure";
  rules: "classic" | "v2";
  round: number;
  // emotion
  rapport: number;       // 共鸣
  guard: number;         // 对手防备
  qi: number;            // 我方气力
  opponentShown: Suit | null;
  lastResult: { text: string; kind: "match" | "press" | "miss" | "win" | "lose" | "item" } | null;
  // pressure
  hpPlayer: number;
  hpOpponent: number;
  lastPlay: { playerCard?: CardDef; oppCard?: CardDef; damage: number; to: "p" | "o" | "none"; stale?: boolean; edge?: number } | null;
  finished: "win" | "lose" | null;
  // ---- v2 ----
  library: string[];     // 牌库（剩余）
  hand: string[];        // 手牌
  discard: string[];     // 弃牌堆
  ap: number;            // 本回合行动力
  usedCards: string[];   // 本局已消耗（物品）
  buffPower: number;     // 「强牌」加成（下一张成术）
  lastCardId?: string;   // 招式用老判定
  passives: { suit?: Suit; power: number; qi: number; draw: number }[]; // 解析后的人物被动
}

/** 帝国开局加成（由 App 从 RunState.boosts 解析后传入，均可缺省） */
export interface DuelBoosts {
  qi?: number;   // 气力上限 +n
  ap?: number;   // 压制制初始行动力 +n
  draw?: number; // v2 起手多抽 n 张
}

export function initDuel(cfg: DuelConfig, deck: string[], allCards: CardDef[], boosts?: DuelBoosts): DuelState {
  if (!cfg.script?.length) throw new Error(`对局配置错误「${cfg.id}」: script 为空`);
  const rules = cfg.rules ?? "classic";
  const passives = rules === "v2"
    ? deck
        .map((id) => allCards.find((c) => c.id === id))
        .filter((c): c is CardDef => !!c?.passive)
        .map((c) => ({
          suit: c.passive!.bonusSuit,
          power: c.passive!.bonusPower ?? 1,
          qi: c.passive!.bonusQi ?? 0,
          draw: c.passive!.extraDraw ?? 0,
        }))
    : [];
  const bonusQi = passives.reduce((s, p) => s + p.qi, 0);
  // 人物卡不进牌库：开局即场外生效（被动已在上方解析）
  const library = rules === "v2" ? shuffleFn(deck.filter((id) => (allCards.find((c) => c.id === id)?.layer ?? "成术") !== "人物")) : [];
  const st: DuelState = {
    cfg,
    mode: cfg.mode,
    rules,
    round: 0,
    rapport: 0,
    guard: 3,
    qi: 3,
    opponentShown: null,
    lastResult: null,
    hpPlayer: (cfg.hp?.player ?? 10) + bonusQi + (boosts?.qi ?? 0),
    hpOpponent: cfg.hp?.opponent ?? 10,
    lastPlay: null,
    finished: null,
    library,
    hand: [],
    discard: [],
    ap: 3 + (boosts?.ap ?? 0),
    usedCards: [],
    buffPower: 0,
    passives,
  };
  if (rules === "v2") drawUp(st, 4 + (boosts?.draw ?? 0));
  return st;
}

let shuffleFn: <T>(a: T[]) => T[] = <T>(arr: T[]): T[] => shuffle(arr);
/** 测试注入：确定性牌库顺序 */
export function setDuelShuffle(fn: <T>(a: T[]) => T[]): void { shuffleFn = fn; }
function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = arr[i]!; arr[i] = arr[j]!; arr[j] = x;
  }
  return arr;
}

/** 抽牌至 n 张（含被动加抽；牌库抽空调洗弃牌堆回填） */
export function drawUp(st: DuelState, n?: number): void {
  if (st.rules !== "v2") return;
  const extra = st.passives.reduce((s, p) => s + p.draw, 0);
  const target = (n ?? 4) + (n === undefined ? extra : 0);
  while (st.hand.length < target) {
    if (st.library.length === 0) {
      if (st.discard.length === 0) break;
      st.library = shuffleFn([...st.discard]);
      st.discard = [];
    }
    st.hand.push(st.library.shift()!);
  }
}

/** 成术卡行动力费用（压制制）：缺省 1，显式 cost 覆写保留调平衡余地 */
export function cardCost(c: CardDef): number {
  return c.cost ?? 1;
}
function cardLayerIs(c: CardDef, layer: string): boolean {
  return (c.layer ?? "成术") === layer;
}

export function suitBonus(st: DuelState, c: CardDef): number {
  if (!c.suit) return 0;
  return st.passives.filter((p) => p.suit === c.suit).reduce((s, p) => s + p.power, 0);
}

function opponentSuitAt(cfg: DuelConfig, round: number): Suit {
  const s = cfg.script[round % cfg.script.length];
  return s as Suit;
}

/** 情绪匹配制：开局亮出对手情绪 */
export function revealEmotion(st: DuelState): void {
  if (st.mode !== "emotion" || st.finished) return;
  st.opponentShown = opponentSuitAt(st.cfg, st.round);
  st.lastResult = null;
}

function finishCheck(st: DuelState, goal: number): void {
  if (st.rapport >= goal) {
    st.finished = "win";
    st.lastResult = { text: "话已说尽，事已办成。", kind: "win" };
  } else if (st.qi <= 0) {
    st.finished = "lose";
    st.lastResult = { text: "你词穷气短，这一局，没能拿下。", kind: "lose" };
  }
}

/** 情绪匹配制：我方出牌结算（v2 出牌不耗行动力；返回 false 表示不可打出） */
export function playEmotion(st: DuelState, card: CardDef): boolean {
  if (st.mode !== "emotion" || st.finished || !st.opponentShown) return false;
  if (st.rules === "v2") {
    if (cardLayerIs(card, "物品")) return playItem(st, card);
    if (cardLayerIs(card, "人物")) return false;
    // 成术卡：打出进弃牌堆（情绪制不耗行动力）
    st.hand = st.hand.filter((c) => c !== card.id);
    st.discard.push(card.id);
  }
  const shown = st.opponentShown;
  const goal = st.cfg.goal ?? 5;
  if (card.suit === shown) {
    st.rapport += 1;
    st.lastResult = { text: `你顺着对方的意，一句「${card.name}」接得严丝合缝。`, kind: "match" };
  } else if (card.suit && RESTRAIN[card.suit] === shown) {
    st.guard -= 1;
    st.lastResult = { text: `你反其道而行，一句话戳在他软处，他的防备松动了。`, kind: "press" };
    if (st.guard <= 0) {
      st.guard = 3;
      st.rapport += 1;
      st.lastResult.text += "他绷不住了，话说到了兴头上。";
    }
  } else if (card.suit && RESTRAIN[shown] === card.suit) {
    st.qi -= 2;
    st.lastResult = { text: `话说岔了，正撞在他枪口上。他眼神一冷，你心里一沉。（气力-2）`, kind: "miss" };
  } else {
    st.qi -= 1;
    st.lastResult = { text: `话说岔了。他的眼神冷了下来，你心里一紧。`, kind: "miss" };
  }
  st.round += 1;
  st.opponentShown = null;
  finishCheck(st, goal);
  afterTurn(st);
  return true;
}

/** v2：结束本回合（压制制：回行动力 + 补牌至 4） */
export function endTurn(st: DuelState): void {
  if (st.rules !== "v2" || st.finished) return;
  st.ap = 3;
  drawUp(st, 4);
}

function afterTurn(st: DuelState): void {
  if (st.rules === "v2") {
    drawUp(st, 4);
  }
}

/** 物品卡：对局内使用（本局消耗；情绪制不耗行动力，压制制耗费） */
export function playItem(st: DuelState, card: CardDef): boolean {
  const eff = card.itemEffect;
  if (!eff) return false;
  if (st.rules === "v2") {
    if (st.mode === "pressure") {
      if (st.ap < cardCost(card)) return false;
      st.ap -= cardCost(card);
    }
    st.usedCards.push(card.id);
    st.hand = st.hand.filter((c) => c !== card.id);
    st.library = st.library.filter((c) => c !== card.id);
  }
  applyItemEffect(st, eff, card.name);
  if (st.mode === "emotion") finishCheck(st, st.cfg.goal ?? 5);
  else {
    if (st.hpOpponent <= 0 && st.hpPlayer > 0) st.finished = "win";
    else if (st.hpPlayer <= 0) st.finished = "lose";
  }
  return true;
}

function applyItemEffect(st: DuelState, eff: ItemEffect, name: string): void {
  switch (eff) {
    case "破防":
      if (st.mode === "emotion") {
        st.guard = 0; st.rapport += 1;
        st.lastResult = { text: `你亮出「${name}」。他脸色骤变，防备尽碎，话匣子再也关不上了。`, kind: "item" };
      } else {
        st.hpOpponent -= 4;
        st.lastResult = { text: `你掷出「${name}」——正中要害，他折了 4 点气力！`, kind: "item" };
        st.lastPlay = { damage: 4, to: "o" };
      }
      break;
    case "回气":
      if (st.mode === "emotion") st.qi += 3;
      else st.hpPlayer += 3;
      st.lastResult = { text: `「${name}」入袖，你缓过一口气来。（+3）`, kind: "item" };
      break;
    case "强牌":
      st.buffPower = 3;
      st.lastResult = { text: `「${name}」在手，下一句话必将掷地有声。（下张成术+3）`, kind: "item" };
      break;
    case "共鸣":
      if (st.mode === "emotion") {
        st.rapport += 2;
        st.lastResult = { text: `「${name}」一出，满座动容。共鸣大进！（+2）`, kind: "item" };
      } else {
        st.hpOpponent -= 3;
        st.lastResult = { text: `「${name}」掷出，他乱了阵脚！（-3 气力）`, kind: "item" };
        st.lastPlay = { damage: 3, to: "o" };
      }
      break;
    case "抽牌":
    {
      const got: string[] = [];
      for (let i = 0; i < 2 && st.library.length > 0; i++) got.push(st.library.shift()!);
      st.hand.push(...got);
      st.lastResult = { text: `你翻检「${name}」，又摸出两张可用的牌。`, kind: "item" };
      break;
    }
  }
}

/** 气力压制制：双方同时出牌结算（四色克制：克敌+1 / 被克-1） */
export function playPressure(st: DuelState, playerCard: CardDef, oppCardId: string, cardOf: (id: string) => CardDef): boolean {
  if (st.mode !== "pressure" || st.finished) return false;
  if (st.rules === "v2") {
    if (cardLayerIs(playerCard, "物品")) return playItem(st, playerCard);
    if (cardLayerIs(playerCard, "人物")) return false;
    if (st.ap < cardCost(playerCard)) return false;
    st.ap -= cardCost(playerCard);
    st.hand = st.hand.filter((c) => c !== playerCard.id);
    st.discard.push(playerCard.id);
  }
  const opp = cardOf(oppCardId);
  let p = (playerCard.power ?? 1) + suitBonus(st, playerCard) + st.buffPower;
  st.buffPower = 0;
  const o = opp.power ?? 1;
  let selfHarm = 0;
  const stale = st.lastCardId === playerCard.id;
  if (stale) p -= 2;
  let edge = 0;
  if (playerCard.suit && opp.suit) {
    if (RESTRAIN[playerCard.suit] === opp.suit) edge = 1;
    else if (RESTRAIN[opp.suit] === playerCard.suit) edge = -1;
  }
  p += edge;
  if (playerCard.suit === "势") {
    p *= 2;
    selfHarm = 1;
  }
  st.lastPlay = { playerCard, oppCard: opp, damage: 0, to: "none", stale, edge };
  st.lastCardId = playerCard.id;
  if (p > o) {
    const d = p - o;
    st.hpOpponent -= d;
    st.lastPlay = { ...st.lastPlay, damage: d, to: "o" };
  } else if (o > p) {
    const d = o - p;
    st.hpPlayer -= d;
    st.lastPlay = { ...st.lastPlay, damage: d, to: "p" };
  } else {
    st.hpPlayer -= 1;
    st.hpOpponent -= 1;
    st.lastPlay = { ...st.lastPlay, damage: 1, to: "none" };
  }
  st.hpPlayer -= selfHarm;
  st.round += 1;
  if (st.hpOpponent <= 0 && st.hpPlayer > 0) st.finished = "win";
  else if (st.hpPlayer <= 0) st.finished = "lose";
  afterTurn(st);
  return true;
}
