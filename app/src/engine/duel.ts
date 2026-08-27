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
//
// 博弈机制（cfg.gambit，第三批；全部确定性可穷举，设计性死局禁用）：
//   - 情绪制·虚张/读牌：对手每三招亮一次假色（亮其真色所克之色，跟假色即撞枪口）；
//     玩家可「读牌」耗 1 气力拆穿真色。
//   - 压制制·蓄势/破招：蓄势耗 1 行动力（classic 则以一回合敌方出牌为代价）叠蓄力层，
//     下张成术每层 +2 点；破招宣言敌方本招花色，押中则该招作废。
// ============================================================

/** 四色相克环：RESTRAIN[X] = X 所克制的颜色（策克势·势克器·器克隐·隐克策） */
export const RESTRAIN: Record<Suit, Suit> = { 策: "势", 势: "器", 器: "隐", 隐: "策" };

/** 情绪制缺省共鸣目标（引擎判定与 UI 渲染共用，避免缺省值分裂） */
export const DEFAULT_GOAL = 5;
/** 压制制缺省每回合行动力（帝国加成在 baseAp 上叠加，换气后不丢） */
export const DEFAULT_AP = 3;

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
  opponentTrue: Suit | null;  // 对手真色（博弈·虚张时与 shown 分离）
  bluffed: boolean;      // 当前亮色是否为虚张（读牌后拆穿置 false）
  lastResult: { text: string; kind: "match" | "press" | "miss" | "win" | "lose" | "item" | "gambit" } | null;
  // pressure
  hpPlayer: number;
  hpOpponent: number;
  hpMax: number;         // 我方气力上限（含加成）：回气钳制与气力条显示共用
  charge: number;        // 蓄势层（下张成术每层 +2，上限 2）
  foresuit: Suit | null; // 破招宣言（押中敌方本招花色则敌招作废）
  /** 隐色陷阱（盖放区，限 1 张）：下一轮对手出牌时自动触发 */
  trap: { cardId: string; name: string; effect: "反伤" | "抵消" | "蓄锋" } | null;
  lastPlay: { playerCard?: CardDef; oppCard?: CardDef; damage: number; to: "p" | "o" | "none"; stale?: boolean; edge?: number; broke?: boolean } | null;
  finished: "win" | "lose" | null;
  // ---- v2 ----
  library: string[];     // 牌库（剩余）
  hand: string[];        // 手牌
  discard: string[];     // 弃牌堆
  ap: number;            // 本回合行动力
  baseAp: number;        // 行动力基准（含帝国加成，换气回补用）
  usedCards: string[];   // 本局已消耗（物品）
  buffPower: number;     // 「强牌」加成（下一张成术）
  lastCardId?: string;   // 招式用老判定
  /** 洞察·看破粒度：当前已知的对手下一手（压制制；"none"=无知） */
  seeNext: "none" | "suit" | "card" | "power";
  passives: { suit?: Suit; power: number; qi: number; draw: number; peek?: number; scan?: boolean }[]; // 解析后的人物被动
  // ---- 随从（斥候/内应）----
  scoutLeft: number;     // 刺探剩余次数
  insiderLeft: number;   // 收买剩余次数
  sharedUsed: number;    // 共用次数已用（精/传级随从）
  sharedTotal: number;   // 共用次数上限（0=斥候/内应各自独立）
  insiderActive: boolean;// 收买已发动：对手下一招作废
  retinueNames: string[];// 随从名（UI 展示）
}

/** 帝国开局加成（由 App 从 RunState.boosts 解析后传入，均可缺省） */
export interface DuelBoosts {
  qi?: number;   // 气力上限 +n
  ap?: number;   // 压制制初始行动力 +n
  draw?: number; // v2 起手多抽 n 张
}

export function initDuel(cfg: DuelConfig, deck: string[], allCards: CardDef[], boosts?: DuelBoosts): DuelState {
  // script 常驻扰动：有变体池时开局随机选一个作为本局 script（副本写回，UI/引擎读同一来源）
  if (cfg.scriptVariants?.length) {
    cfg = { ...cfg, script: cfg.scriptVariants[Math.floor(Math.random() * cfg.scriptVariants.length)]! };
  }
  if (!cfg.script?.length) throw new Error(`对局配置错误「${cfg.id}」: script 为空`);
  const rules = cfg.rules ?? "classic";
  // 人物被动：classic 与 v2 统一解析（叙事剧本 deck 中若有随从同样生效）
  const passives = deck
    .map((id) => allCards.find((c) => c.id === id))
    .filter((c): c is CardDef => !!c?.passive)
    .map((c) => ({
      suit: c.passive!.bonusSuit,
      power: c.passive!.bonusPower ?? 1,
      qi: c.passive!.bonusQi ?? 0,
      draw: c.passive!.extraDraw ?? 0,
      peek: c.passive!.peekEvery ?? 0,
      scan: !!c.passive!.readScript,
    }));
  // 随从（斥候/内应）聚合：凡=斥候1 · 良=内应1 · 精=双能共1 · 传=双能共2
  const retinueCards = deck
    .map((id) => allCards.find((c) => c.id === id))
    .filter((c): c is CardDef => !!c?.passive && ((c.passive!.scout ?? 0) > 0 || (c.passive!.insider ?? 0) > 0));
  const scoutTotal = retinueCards.reduce((s, c) => s + (c.passive!.scout ?? 0), 0);
  const insiderTotal = retinueCards.reduce((s, c) => s + (c.passive!.insider ?? 0), 0);
  // 共用次数：多张共用随从取各张 sharedTotal 之和
  const sharedTotal = retinueCards.reduce((s, c) => s + (c.passive!.sharedTotal ?? 0), 0);

  const bonusQi = passives.reduce((s, p) => s + p.qi, 0);
  // 人物卡不进牌库：开局即场外生效（被动已在上方解析）
  // 局外被动物品（clueReveal / shopPeek 等无 itemEffect）也不进牌库：对局内不可用，抽到即死牌
  const library = rules === "v2" ? shuffleFn(deck.filter((id) => {
    const c = allCards.find((x) => x.id === id);
    const layer = c?.layer ?? "成术";
    if (layer === "人物") return false;
    if (layer === "物品" && !c?.itemEffect) return false;
    return true;
  })) : [];
  const hpBase = (cfg.hp?.player ?? 10) + bonusQi + (boosts?.qi ?? 0);
  const st: DuelState = {
    cfg,
    mode: cfg.mode,
    rules,
    round: 0,
    rapport: 0,
    guard: 3,
    qi: 3,
    opponentShown: null,
    opponentTrue: null,
    bluffed: false,
    lastResult: null,
    hpPlayer: hpBase,
    hpOpponent: cfg.hp?.opponent ?? 10,
    hpMax: hpBase,
    charge: 0,
    foresuit: null,
    trap: null,
    lastPlay: null,
    finished: null,
    library,
    hand: [],
    discard: [],
    ap: DEFAULT_AP + (boosts?.ap ?? 0),
    baseAp: DEFAULT_AP + (boosts?.ap ?? 0),
    usedCards: [],
    buffPower: 0,
    seeNext: "none",
    passives,
    scoutLeft: scoutTotal,
    insiderLeft: insiderTotal,
    sharedUsed: 0,
    sharedTotal,
    insiderActive: false,
    retinueNames: retinueCards.map((c) => c.name),
  };
  if (rules === "v2") drawUp(st, 4 + (boosts?.draw ?? 0) + passives.reduce((s, p) => s + p.draw, 0));
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

/** 抽牌至 n 张（牌库抽空调洗弃牌堆回填；被动加抽由调用方计入目标值） */
export function drawUp(st: DuelState, n: number = 4): void {
  if (st.rules !== "v2") return;
  while (st.hand.length < n) {
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

/** 情绪匹配制：开局/每招后亮出对手情绪（博弈局：每三招亮一次假色——亮其真色所克之色，跟假色即撞枪口）。
 *  幂等：已亮色时不重复（读牌结果不被覆盖）。 */
export function revealEmotion(st: DuelState): void {
  if (st.mode !== "emotion" || st.finished || st.opponentShown) return;
  const truth = opponentSuitAt(st.cfg, st.round);
  const bluff = !!st.cfg.gambit && st.round % 3 === 2;
  st.opponentTrue = truth;
  st.bluffed = bluff;
  st.opponentShown = bluff ? RESTRAIN[truth] : truth;
}

/** 博弈·读牌（情绪制）：耗 1 气力验色——是虚张则拆穿亮真色，无虚张则确认无误；不推进回合。气尽则败。 */
export function readEmotion(st: DuelState): boolean {
  if (st.mode !== "emotion" || st.finished || !st.cfg.gambit || !st.opponentShown) return false;
  if (st.qi < 1) return false;
  st.qi -= 1;
  const wasBluff = st.bluffed;
  st.opponentShown = st.opponentTrue;
  st.bluffed = false;
  st.lastResult = wasBluff
    ? { text: `你不动声色地一试——果然，那色是装出来的，真意在此。（气力-1）`, kind: "gambit" }
    : { text: `你仔细掂了掂——这色不假，没有虚张。（气力-1）`, kind: "gambit" };
  finishCheck(st, st.cfg.goal ?? DEFAULT_GOAL);
  return true;
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
  // 虚张未拆穿时，结算以真色为准：跟假色（=真色所克之色）即撞枪口（被克 -2）
  const shown = (st.bluffed && st.opponentTrue) || st.opponentShown;
  const goal = st.cfg.goal ?? DEFAULT_GOAL;
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
  // 强牌（物品「强牌」）：下一言掷地有声——接住/破防的下一手额外共鸣+1
  // 情绪制无点数，故以「额外共鸣」等价兑现；一次性消费后清零。
  if (st.buffPower > 0 && (card.suit === shown || (card.suit && RESTRAIN[card.suit] === shown))) {
    st.rapport += 1;
    if (st.lastResult) st.lastResult.text += "（强牌·掷地有声，共鸣+1）";
  }
  st.buffPower = 0;
  st.round += 1;
  st.opponentShown = null;
  finishCheck(st, goal);
  afterTurn(st);
  return true;
}

/** v2：结束本回合（压制制：回行动力至基准 + 补牌至 4+被动；破招宣言不跨回合） */
export function endTurn(st: DuelState): void {
  if (st.rules !== "v2" || st.finished) return;
  st.ap = st.baseAp;
  st.foresuit = null;
  drawUp(st, 4 + st.passives.reduce((s, p) => s + p.draw, 0));
}

/** 博弈·蓄势（压制制）：叠一层蓄力（上限 2），下张成术每层 +2 点。
 *  v2 耗 1 行动力不推进回合；classic 以敌方一招为代价（敌方出牌、我方蓄力）。 */
export function chargeUp(st: DuelState, oppCardId: string, cardOf: (id: string) => CardDef): boolean {
  if (st.mode !== "pressure" || st.finished || !st.cfg.gambit || st.charge >= 2) return false;
  if (st.rules === "v2") {
    if (st.ap < 1) return false;
    st.ap -= 1;
    st.charge += 1;
    st.lastResult = { text: `你按兵不动，吐纳蓄力，把锋芒收进袖中。（蓄势+1层）`, kind: "gambit" };
    return true;
  }
  const opp = cardOf(oppCardId);
  const o = opp.power ?? 1;
  st.hpPlayer -= o;
  st.charge += 1;
  st.round += 1;
  st.lastPlay = { oppCard: opp, damage: o, to: "p" };
  st.lastResult = { text: `你硬接了他一招，不退反蓄。（受 ${o} 点，蓄势+1层）`, kind: "gambit" };
  if (st.hpPlayer <= 0) st.finished = "lose";
  return true;
}

/** 博弈·破招（压制制）：宣言敌方本招花色，押中则该招作废。
 *  v2 耗 1 行动力、本回合首张出牌结算时生效；classic 立即结算敌方一招（押中免伤）。 */
export function breakMove(st: DuelState, suit: Suit, oppCardId: string, cardOf: (id: string) => CardDef): boolean {
  if (st.mode !== "pressure" || st.finished || !st.cfg.gambit || st.foresuit) return false;
  if (st.rules === "v2") {
    if (st.ap < 1) return false;
    st.ap -= 1;
    st.foresuit = suit;
    st.lastResult = { text: `你眯起眼：「下一招，你必出『${suit}』。」`, kind: "gambit" };
    return true;
  }
  const opp = cardOf(oppCardId);
  const broke = opp.suit === suit;
  const o = broke ? 0 : (opp.power ?? 1);
  st.hpPlayer -= o;
  st.round += 1;
  st.lastPlay = { oppCard: opp, damage: o, to: broke ? "none" : "p", broke };
  st.lastResult = broke
    ? { text: `押中了——他这招「${opp.name}」被你一眼看破，半途而废。`, kind: "gambit" }
    : { text: `押岔了。他出的不是「${suit}」，一招结实落在你身上。（-${o}）`, kind: "gambit" };
  if (st.hpPlayer <= 0) st.finished = "lose";
  return true;
}

function afterTurn(st: DuelState): void {
  if (st.rules === "v2") {
    drawUp(st, 4 + st.passives.reduce((s, p) => s + p.draw, 0));
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
  if (st.mode === "emotion") finishCheck(st, st.cfg.goal ?? DEFAULT_GOAL);
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
      // 钳制上限：情绪制气力上限 10（与 QiBar 显示一致）；压制制不超开局上限，防止数值越界展示
      if (st.mode === "emotion") st.qi = Math.min(10, st.qi + 3);
      else st.hpPlayer = Math.min(st.hpMax ?? (st.cfg.hp?.player ?? 10), st.hpPlayer + 3);
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
      // 牌库抽空时洗回弃牌堆（与 drawUp 一致），避免空库抽到 0 张变成死卡
      if (st.library.length === 0 && st.discard.length > 0) {
        st.library = shuffleFn([...st.discard]);
        st.discard = [];
      }
      const got: string[] = [];
      for (let i = 0; i < 2 && st.library.length > 0; i++) got.push(st.library.shift()!);
      st.hand.push(...got);
      st.lastResult = { text: `你翻检「${name}」，又摸出 ${got.length} 张可用的牌。`, kind: "item" };
      break;
    }
    case "观牌":
      st.seeNext = "card";
      st.lastResult = { text: `你借「${name}」的镜光一照——他下一手落进了你眼里。`, kind: "item" };
      break;
    case "观色":
      st.seeNext = "suit";
      st.lastResult = { text: `你凝神听风辨位——他下一手的路数，你心里有数了。`, kind: "item" };
      break;
    case "观点":
      st.seeNext = "power";
      st.lastResult = { text: `你掂了掂他腕上的劲道——他下一手的深浅，你估出了大概。`, kind: "item" };
      break;
  }
}

/** 气力压制制：双方同时出牌结算（四色克制：克敌+1 / 被克-1） */
export function playPressure(st: DuelState, playerCard: CardDef, oppCardId: string, cardOf: (id: string) => CardDef): boolean {
  if (st.mode !== "pressure" || st.finished) return false;
  // 隐色陷阱：打出即盖放（本轮不结算，对手本轮也不出手——布局回合），下一轮自动触发
  if (playerCard.trap && playerCard.suit === "隐") {
    if (st.trap) { st.lastResult = { text: "案上已经扣着一张牌了——只能盖一张。", kind: "miss" }; return false; }
    if (st.rules === "v2") {
      if (st.ap < cardCost(playerCard)) return false;
      st.ap -= cardCost(playerCard);
      st.hand = st.hand.filter((c) => c !== playerCard.id);
      st.discard.push(playerCard.id);
    }
    st.trap = { cardId: playerCard.id, name: playerCard.name, effect: playerCard.trap };
    st.lastPlay = null;
    st.lastCardId = playerCard.id; // 招式用老只盯成术，陷阱不计入
    st.lastResult = { text: `你把「${playerCard.name}」反扣在案上——不急着亮。`, kind: "gambit" };
    st.round += 1;
    if (st.seeNext !== "none") st.seeNext = "none";
    afterTurn(st);
    return true;
  }
  if (st.rules === "v2") {
    if (cardLayerIs(playerCard, "物品")) return playItem(st, playerCard);
    if (cardLayerIs(playerCard, "人物")) return false;
    if (st.ap < cardCost(playerCard)) return false;
    st.ap -= cardCost(playerCard);
    st.hand = st.hand.filter((c) => c !== playerCard.id);
    st.discard.push(playerCard.id);
  }
  const opp = cardOf(oppCardId);
  // 触发已盖陷阱（本轮对手出牌时）
  const trap = st.trap;
  st.trap = null;
  if (trap?.effect === "蓄锋") st.buffPower += 2;
  let p = (playerCard.power ?? 1) + suitBonus(st, playerCard) + st.buffPower + st.charge * 2;
  st.buffPower = 0;
  st.charge = 0;
  let o = opp.power ?? 1;
  let broke = false;
  // 收买·内应：对手本招作废（先于破招判定）
  if (st.insiderActive) { o = 0; broke = true; st.insiderActive = false; }
  if (st.foresuit) {
    if (opp.suit === st.foresuit) { o = 0; broke = true; }
    st.foresuit = null;
  }
  if (trap?.effect === "抵消") { o = 0; broke = true; }
  let selfHarm = 0;
  const stale = st.lastCardId === playerCard.id;
  if (stale) p -= 2;
  let edge = 0;
  if (playerCard.suit && opp.suit) {
    if (RESTRAIN[playerCard.suit] === opp.suit) edge = 1;
    else if (RESTRAIN[opp.suit] === playerCard.suit) edge = -1;
  }
  p += edge;
  // 情境位：对手为该花色时 +bonus（普通卡功能位，叠加在克制之外）
  if (playerCard.situational && opp.suit === playerCard.situational.suit) p += playerCard.situational.bonus;
  // 机制位·牺牲：自伤 N 点换 +2N（零交互）
  if (playerCard.sacrifice && playerCard.sacrifice > 0) {
    p += playerCard.sacrifice * 2;
    selfHarm += playerCard.sacrifice;
  }
  if (playerCard.suit === "势") {
    p *= 2;
    selfHarm = 1;
  }
  // 机制位·抽牌：打出时抽 N 张（v2；每张抽牌卡各自触发一次）
  if (playerCard.drawOnPlay && st.rules === "v2" && playerCard.drawOnPlay > 0) {
    drawUp(st, playerCard.drawOnPlay);
  }
  st.lastPlay = { playerCard, oppCard: opp, damage: 0, to: "none", stale, edge, broke };
  st.lastCardId = playerCard.id;
  if (p > o) {
    const d = p - o;
    st.hpOpponent -= d;
    st.lastPlay = { ...st.lastPlay, damage: d, to: "o" };
  } else if (o > p) {
    const d = o - p;
    // 反伤陷阱：本轮受的伤害原样弹回对手
    if (trap?.effect === "反伤") {
      st.hpOpponent -= d;
      st.lastPlay = { ...st.lastPlay, damage: d, to: "o", broke: true };
    } else {
      st.hpPlayer -= d;
      st.lastPlay = { ...st.lastPlay, damage: d, to: "p" };
    }
  } else {
    st.hpPlayer -= 1;
    st.hpOpponent -= 1;
    st.lastPlay = { ...st.lastPlay, damage: 1, to: "none" };
  }
  st.hpPlayer -= selfHarm;
  st.round += 1;
  // 洞察·揭示（成术「诈问」）：结算后揭示下一手花色/全牌（先于胜负判定，仅信息型不参与判定）
  if (playerCard.reveal) st.seeNext = playerCard.reveal === "card" ? "card" : "suit";
  // 洞察情报在结算后过期（观牌揭示的正是本轮刚结算的那手）
  else if (st.seeNext !== "none") st.seeNext = "none";
  if (st.hpOpponent <= 0 && st.hpPlayer > 0) st.finished = "win";
  else if (st.hpPlayer <= 0) st.finished = "lose";
  afterTurn(st);
  return true;
}

// ============================================================
// 随从·刺探/收买（压制制对局内动作——须携带斥候/内应随从）
//   刺探：看破对手下一手全牌（seeNext="card"）
//   收买：对手下一招作废（insiderActive）
//   银两只用于「雇随从」（黑市/剧情），对局内动作只消耗随从次数、不耗银两
//   次数：凡=斥候1 · 良=内应1 · 精=双能共1(sharedTotal=1) · 传=双能共2(sharedTotal=2)
// ============================================================
export const SCOUT_COST = 10;
export const INSIDER_COST = 20;

export function duelSpend(
  st: DuelState,
  kind: "scout" | "insider",
): { ok: boolean; log?: string } {
  if (st.mode !== "pressure" || st.finished) return { ok: false, log: "对局已结束。" };
  // 刺探/收买必须由随从执行：无随从不可用
  if (st.retinueNames.length === 0) {
    return { ok: false, log: "无随从随行——需先雇斥候/内应。" };
  }
  if (st.sharedTotal > 0 && st.sharedUsed >= st.sharedTotal) {
    return { ok: false, log: "随从已用尽了力气。" };
  }
  if (kind === "scout" && st.scoutLeft <= 0) {
    return { ok: false, log: "斥候已无余力再探。" };
  }
  if (kind === "insider" && st.insiderLeft <= 0) {
    return { ok: false, log: "内应已无余力再动。" };
  }
  if (kind === "scout") {
    st.seeNext = "card";
    st.scoutLeft -= 1;
  } else {
    st.insiderActive = true;
    st.insiderLeft -= 1;
  }
  st.sharedUsed += 1;
  return { ok: true, log: kind === "scout" ? "斥候探得军情——看清对手下一手。" : "内应已买通——对手下一招将成空。" };
}
