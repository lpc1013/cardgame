import type { DuelConfig, CardDef, Suit, ItemEffect, TrapEffect, TrapTrigger } from "./types";

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
/** M1 数值止血（审计第七篇 P0-1/P0-3）：单次交换的伤害差值上限。
 *  蓄势×势的乘算爆发曾对 8 血 v2 压制局构成首回合斩杀；乘算改 ×1.5 后以此钳制兜底。 */
export const TURN_DAMAGE_CAP = 6;
/** M0：战报环形缓冲上限（M6 上 UI 时展示最近 N 条） */
export const DUEL_LOG_CAP = 5;
/** M0：战报记账（幂等：旧档无 log 字段时惰性建表） */
function pushLog(st: DuelState, text: string, kind: string): void {
  if (!st.log) st.log = [];
  st.log.push({ round: st.round, text, kind });
  if (st.log.length > DUEL_LOG_CAP) st.log.splice(0, st.log.length - DUEL_LOG_CAP);
}

/** W-2 言力免费出牌数：情绪制前 N 张成术免费，第 N 张后每张耗 1 言力（防无限链出的轻预算）。
 *  N=5 + yanliMax=7 → 每局成术上限 12 手：覆盖最长情绪制胜线（赣州强攻 12 步），
 *  同时终结无限刷共鸣（原 9 手上限把赣州从可胜 12 步压成死局，故放宽——2026-08-27 复核）。 */
export const EMOTION_FREE_PLAYS = 5;

export interface DuelState {
  cfg: DuelConfig;
  mode: "emotion" | "pressure";
  rules: "classic" | "v2";
  round: number;
  /** 本局选中的 script 变体（scriptVariants 随机选中后写回；断点续局时供 App 还原 cfg.script） */
  variantScript?: string[];
  // emotion
  rapport: number;       // 共鸣
  guard: number;         // 对手防备
  qi: number;            // 我方气力
  /** W-2 言力预算（情绪制）：剩余言力，前 EMOTION_FREE_PLAYS 张成术免费，此后每张 -1；pressure 置 0 不生效 */
  yanli: number;
  /** W-2 言力上限（emotion=4；pressure=0） */
  yanliMax: number;
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
  /** 隐色陷阱（盖放区，限 1 张）：M4 起伏击对手主攻，满足 trigger 条件时生效（缺省 always） */
  trap: { cardId: string; name: string; effect: TrapEffect; trigger?: TrapTrigger } | null;
  lastPlay: { playerCard?: CardDef; oppCard?: CardDef; damage: number; to: "p" | "o" | "none"; stale?: boolean; edge?: number; broke?: boolean; trapNote?: string; selfBroke?: boolean } | null;
  finished: "win" | "lose" | null;
  /** M0：情绪制气力上限（含人物 bonusQi / 备战加成；旧档缺省按 10） */
  qiMax?: number;
  /** M0：战报环形缓冲（M6 上 UI；先在引擎侧记账，cap 见 DUEL_LOG_CAP） */
  log?: { round: number; text: string; kind: string }[];
  /** M0：存档合同版本（duel 断点续局结构变更时递增；旧档缺省视为 1） */
  schema?: number;
  /** M0/M2：回合制结构开关——legacy=按出手推进（现状）；phased=交替回合（M2 启用） */
  turnSchema?: "legacy" | "phased";
  // ---- M2 交替回合（turnSchema === "phased" 时启用；legacy 局保持缺省不参与存档兼容问题）----
  /** 回合数（从 1 起；我方主阶段开始时递增） */
  turnNo?: number;
  /** 当前阶段：pMain=我方主阶段；oppTurn=对手回合（等待我方应手） */
  phase?: "pMain" | "oppTurn";
  /** 轻回合（classic 压制局 phased 化）：无手牌无行动力，每回合一个主行动，出完自动交先手 */
  light?: boolean;
  /** 对手本回合主行动意图（对手回合开始时决定并公示动作类型；出招时等待应手） */
  oppIntent?: { kind: "attack" | "charge" | "trap" | "break"; cardId?: string; suit?: Suit } | null;
  /** 对手蓄力层（可视；他主攻时释放，每层 +2） */
  oppCharge?: number;
  /** 对手盖放的陷阱（对我方主攻生效；UI 只给暗示，刺探/揭底可破） */
  oppTrap?: { name: string; effect: TrapEffect; trigger?: TrapTrigger } | null;
  /** M4：对手本局是否已用过埋伏（拆掉/触发后不得再盖） */
  oppTrapUsed?: boolean;
  /** M4：刺探陷阱——看破对手暗算的名称与效果 */
  seeTrap?: boolean;
  /** 对手破招宣言（押中我方下一手主攻花色则我方该手作废） */
  oppForesuit?: Suit | null;
  /** M3 反背板：我方最近主攻花色历史（尾部最新） */
  playerLeadSuits?: Suit[];
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
  /** C-1 独立次数分桶：凡级斥候（sharedTotal=0）独立剩余次数——不受共享上限封死 */
  indScoutLeft: number;
  /** C-1 独立次数分桶：良级内应（sharedTotal=0）独立剩余次数——不受共享上限封死 */
  indInsiderLeft: number;
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
  // script 常驻扰动：有变体池时开局随机选一个作为本局 script（副本写回，UI/引擎读同一来源）。
  // B-1：选中变体同时写入 st.variantScript，随 Omit<DuelState,"cfg"> 序列化持久化，供断点续局时还原 cfg.script。
  let variantScript: string[] | undefined;
  if (cfg.scriptVariants?.length) {
    const chosen = cfg.scriptVariants[Math.floor(Math.random() * cfg.scriptVariants.length)]!;
    cfg = { ...cfg, script: chosen };
    variantScript = chosen;
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
  // C-1 独立次数分桶：凡级斥候/良级内应（sharedTotal=0 的卡）各自独立计次，与共享池分开记账
  const indScoutTotal = retinueCards.filter((c) => (c.passive!.sharedTotal ?? 0) <= 0).reduce((s, c) => s + (c.passive!.scout ?? 0), 0);
  const indInsiderTotal = retinueCards.filter((c) => (c.passive!.sharedTotal ?? 0) <= 0).reduce((s, c) => s + (c.passive!.insider ?? 0), 0);

  const bonusQi = passives.reduce((s, p) => s + p.qi, 0);
  const boostQi = boosts?.qi ?? 0;
  // 人物卡不进牌库：开局即场外生效（被动已在上方解析）
  // 局外被动物品（clueReveal / shopPeek 等无 itemEffect）也不进牌库：对局内不可用，抽到即死牌
  // F-6：资源卡同样不进牌库（老存档 deck 里可能残留，防御性过滤——资源卡翻到即折银，非对局牌）
  const library = rules === "v2" ? shuffleFn(deck.filter((id) => {
    const c = allCards.find((x) => x.id === id);
    const layer = c?.layer ?? "成术";
    if (layer === "人物") return false;
    if (layer === "资源") return false;
    if (layer === "物品" && !c?.itemEffect) return false;
    return true;
  })) : [];
  const hpBase = (cfg.hp?.player ?? 10) + bonusQi + boostQi;
  // W-2 言力预算：仅情绪制生效（轻上限 7，共 12 手），pressure 置 0 完全不受影响
  const yanliMax = cfg.mode === "emotion" ? 7 : 0;
  // M1（审计 4.2）：人物 bonusQi / 备战 b_qi 原本只喂 hpBase（压制局专属）——情绪局 qi=3 写死，
  // 被动形同虚设。现改为情绪局起始气力与上限同步抬升（上限仍留 10 基准的余量供回气）。
  const emotionQiMax = cfg.mode === "emotion" ? 10 + bonusQi + boostQi : 0;
  const st: DuelState = {
    cfg,
    mode: cfg.mode,
    rules,
    round: 0,
    variantScript,
    rapport: 0,
    guard: 3,
    qi: cfg.mode === "emotion" ? 3 + bonusQi + boostQi : 3,
    qiMax: cfg.mode === "emotion" ? emotionQiMax : undefined,
    yanli: yanliMax,
    yanliMax,
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
    turnSchema: cfg.turnSchema ?? "legacy",
    schema: 2,
    // M2 交替回合字段（legacy 局保持缺省值，行为不变）
    turnNo: 1,
    phase: "pMain",
    light: (cfg.turnSchema ?? "legacy") === "phased" && rules !== "v2" ? true : undefined,
    oppIntent: null,
    oppCharge: 0,
    oppTrap: null,
    oppForesuit: null,
    playerLeadSuits: [],
    scoutLeft: scoutTotal,
    insiderLeft: insiderTotal,
    indScoutLeft: indScoutTotal,
    indInsiderLeft: indInsiderTotal,
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

/** F-5：真·抽 n 张（与 drawUp「补至 n 张」不同——手牌越补越多）。
 *  机制位 drawOnPlay 语义：打出时抽 N 张；牌库抽空自动洗回弃牌堆。 */
function drawN(st: DuelState, n: number): void {
  if (st.rules !== "v2") return;
  for (let i = 0; i < n; i++) {
    if (st.library.length === 0) {
      if (st.discard.length === 0) break;
      st.library = shuffleFn([...st.discard]);
      st.discard = [];
    }
    if (st.library.length === 0) break;
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

const ALL_SUITS: Suit[] = ["策", "器", "势", "隐"];

/** M5 虚张去周期化（审计 2.1/P1-2）：以 (对局id, 回合) 为种子的伪随机虚张——
 *  玩家无法再由回合数推算真色（原 round%3 周期被免费模运算破解，读牌被支配），虚张概率约 1/3。 */
function seedHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function isBluffRound(cfgId: string, round: number): boolean {
  return seedHash(cfgId + "|" + round) % 100 < 33;
}
/** M5.2：该虚张轮是否作老式虚张（二八开——偶有「亮真色所克之色」的经典虚张保留
 *  「跟假撞枪口-2」的教学时刻；多数亮无关假色，环序反推失效，反着出对半赌撞枪口）。 */
function isClassicFeint(cfgId: string, round: number): boolean {
  return seedHash(cfgId + "#" + round) % 100 < 20;
}

/** 情绪匹配制：开局/每招后亮出对手情绪（博弈局：按种子伪随机虚张——亮其真色所克之色，跟假色即撞枪口）。
 *  幂等：已亮色时不重复（读牌结果不被覆盖）。 */
export function revealEmotion(st: DuelState): void {
  if (st.mode !== "emotion" || st.finished || st.opponentShown) return;
  const truth = opponentSuitAt(st.cfg, st.round);
  const bluff = !!st.cfg.gambit && isBluffRound(st.cfg.id, st.round);
  st.opponentTrue = truth;
  st.bluffed = bluff;
  if (!bluff) { st.opponentShown = truth; return; }
  const feint = RESTRAIN[truth];
  if (isClassicFeint(st.cfg.id, st.round)) { st.opponentShown = feint; return; }
  // 无关假色：既非真色、也非真色所克之色——反推与反打都成了赌
  const wild = ALL_SUITS.filter((s) => s !== truth && s !== feint);
  st.opponentShown = wild[seedHash(st.cfg.id + "%" + st.round) % 2]!;
}

/** 博弈·读牌（情绪制）：耗 1 言力验色——是虚张则拆穿亮真色，无虚张则确认无误；不推进回合。
 *  M5.2：虚张不可反推后，读牌是唯一可靠验色手段，改价言力（与额外出牌共享预算）——
 *  知情线（读+接）在 goal5/6 下 10~12 点言力内可胜；无脑反打线被气力风险与预算两头挤死。 */
export function readEmotion(st: DuelState): boolean {
  if (st.mode !== "emotion" || st.finished || !st.cfg.gambit || !st.opponentShown) return false;
  if ((st.yanli ?? 0) <= 0) return false;
  st.yanli -= 1;
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
  }
  // W-2 言力预算（情绪制防无限链出的轻预算；规则见 initDuel）：
  //   前 EMOTION_FREE_PLAYS 张成术免费；此后每出一张成术耗 1 言力；yanli 耗尽则不可再出。
  //   物品不耗言力（上方已早退）；pressure 模式 yanliMax=0 且不走本函数，完全不受影响。
  //   旧档无言力字段时保持旧行为不设限（typeof 守卫）。
  if (typeof st.yanli === "number") {
    if (st.round >= EMOTION_FREE_PLAYS) {
      if (st.yanli <= 0) return false;
      st.yanli -= 1;
    }
  }
  if (st.rules === "v2") {
    // 成术卡：打出进弃牌堆（情绪制不耗行动力）
    st.hand = st.hand.filter((c) => c !== card.id);
    st.discard.push(card.id);
  }
  // 虚张未拆穿时，结算以真色为准：跟假色（=真色所克之色）即撞枪口（被克 -2）
  const shown = (st.bluffed && st.opponentTrue) || st.opponentShown;
  const goal = st.cfg.goal ?? DEFAULT_GOAL;
  // M5 内容化：卡牌话题命中本手话头 → 无论花色都算接话（卡名参与结算；未配置 emotionTopics 的局纯花色）
  const roundTopics = st.cfg.emotionTopics?.[st.round % st.cfg.emotionTopics.length];
  const contentMatch = !!roundTopics?.length && !!card.topics?.some((tp) => roundTopics.includes(tp));
  if (card.suit === shown || contentMatch) {
    st.rapport += 1;
    st.lastResult = { text: `你顺着对方的意，一句「${card.name}」接得严丝合缝。`, kind: "match" };
  } else if (card.suit && RESTRAIN[card.suit] === shown) {
    st.guard -= 1;
    st.lastResult = { text: `你反其道而行，一句话戳在他软处，他的防备松动了。`, kind: "press" };
    if (st.guard <= 0) {
      st.guard = 3;
      st.rapport += 1;
      // M5.1（审计第七篇 2.1 收尾）：破防伤神——硬掰开他的防备也要耗自己的气力。
      // 「永远反着出」的零风险口诀线依赖 2~3 次破防凑共鸣，3 点起始气力自此成为真实约束；
      // 知情线（同色接话）不经过破防，零气耗不受影响。
      st.qi -= 1;
      st.lastResult.text += "他绷不住了，话说到了兴头上。（破防伤神，气力-1）";
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
  // F-5：机制位·抽牌（情绪制 v2 同样结算——此前仅压制制实现）
  if (card.drawOnPlay && st.rules === "v2" && card.drawOnPlay > 0) {
    drawN(st, card.drawOnPlay);
    if (st.lastResult) st.lastResult.text += `（抽${card.drawOnPlay}张）`;
  }
  st.round += 1;
  st.opponentShown = null;
  finishCheck(st, goal);
  afterTurn(st);
  if (st.lastResult) pushLog(st, st.lastResult.text, st.lastResult.kind);
  return true;
}

/** M2 轻回合：我方主攻的先手加成（弥补 classic 局每回合一手对出手次数的限制） */
export const LIGHT_LEAD_BONUS = 1;

/** M2：结束我方主阶段。
 *  legacy v2：回行动力 + 补牌（旧语义，迁移期旧存档仍走此路）。
 *  phased：交出先手——对手意图即刻决定，出招则等待我方应手，蓄势/盖放即时结算后回到我方新回合。 */
export function endTurn(st: DuelState): void {
  if (st.mode !== "pressure" || st.finished) return;
  if ((st.turnSchema ?? "legacy") === "phased") {
    if (st.phase !== "pMain") return;
    handOffToOpponent(st);
    return;
  }
  if (st.rules !== "v2") return;
  st.ap = st.baseAp;
  st.foresuit = null;
  drawUp(st, 4 + st.passives.reduce((s, p) => s + p.draw, 0));
}

/** M2：对手回合结束 → 我方新回合开始（回合开始钩子：行动力回补 + v2 补牌；未兑现的破招宣言作废） */
function finishOppTurn(st: DuelState): void {
  st.oppIntent = null;
  st.foresuit = null;
  st.phase = "pMain";
  st.turnNo = (st.turnNo ?? 1) + 1;
  if (!st.light) st.ap = st.baseAp;
  drawUp(st, 4 + st.passives.reduce((s, p) => s + p.draw, 0));
}

/** M3：对手主行动意图——条件规则集（优先级从高到低，均确定性，verify 可穷举）：
 *  1) 杀招节奏：蓄力满 2 层必放（意图可见，我方有一整回合的防御窗口）；
 *  2) 反背板：我方连出两手同色 → 宣言破招该色（惩罚可预测性，与「招式用老」互补；仅博弈局）；
 *  3) 血线反应：自身气力低于 defensiveHpPct（缺省 30%）且未满蓄力 → 蓄势转入防守；
 *  4) 兜底：按脚本出招。per-duel 可用 cfg.ai 覆写（剧本性格：霸王必强攻、司马懿必虚张）。 */
function decideOppIntent(st: DuelState): void {
  const cardId = st.cfg.script[st.round % st.cfg.script.length] ?? st.cfg.script[0]!;
  const ai = st.cfg.ai ?? {};
  const oc = st.oppCharge ?? 0;
  if ((ai.finisherCharge ?? true) && oc >= 2) {
    st.oppIntent = { kind: "attack", cardId };
    return;
  }
  const hist = st.playerLeadSuits ?? [];
  if ((ai.counterRepeat ?? !!st.cfg.gambit) && hist.length >= 2 && hist[hist.length - 1] === hist[hist.length - 2]) {
    st.oppIntent = { kind: "break", suit: hist[hist.length - 1] };
    return;
  }
  const defPct = ai.defensiveHpPct ?? 0.3;
  const oppHpMax = st.cfg.hp?.opponent ?? 10;
  // M4 对手埋伏：中盘（其气力 <60%）且本局未盖过 → 盖一张暗算（我方下一手主攻作废；喂废牌/揭底可破）
  if ((ai.oppTraps ?? true) && !st.oppTrap && !(st.oppTrapUsed) && oc < 2 && st.hpOpponent > 0 && st.hpOpponent < oppHpMax * 0.6) {
    st.oppIntent = { kind: "trap" };
    return;
  }
  if (defPct > 0 && oc < 2 && st.hpOpponent > 0 && st.hpOpponent < oppHpMax * defPct) {
    st.oppIntent = { kind: "charge" };
    return;
  }
  st.oppIntent = { kind: "attack", cardId };
}

/** M2：我方回合结束 → 进入对手回合。
 *  出招意图：保持 oppTurn 等待 respondOpponent；蓄势/盖放意图：即时结算后直接回到我方新回合。 */
function handOffToOpponent(st: DuelState): void {
  st.phase = "oppTurn";
  decideOppIntent(st);
  const intent = st.oppIntent!;
  if (intent.kind === "charge") {
    st.oppCharge = Math.min(2, (st.oppCharge ?? 0) + 1);
    st.lastResult = { text: `他按兵不动，气息一沉——竟也在蓄力。（敌方蓄势 ${st.oppCharge} 层）`, kind: "gambit" };
    pushLog(st, st.lastResult.text, st.lastResult.kind);
    finishOppTurn(st);
  } else if (intent.kind === "trap") {
    // M4：对手盖放暗算（只给暗示不给内容——刺探/揭底可破，喂废牌可拆）
    st.oppTrap = { name: "袖中暗算", effect: "抵消" };
    st.oppTrapUsed = true;
    st.lastResult = { text: "他袖手一掩，案下似有异动——他也在算你。", kind: "gambit" };
    pushLog(st, st.lastResult.text, st.lastResult.kind);
    finishOppTurn(st);
  } else if (intent.kind === "break") {
    // M3 反背板：对手宣言我方下一手主攻的花色——押中则该手作废（p=0）
    st.oppForesuit = intent.suit ?? null;
    st.lastResult = { text: `他冷笑一声：「你下一手，必出『${intent.suit}』。」`, kind: "gambit" };
    pushLog(st, st.lastResult.text, st.lastResult.kind);
    finishOppTurn(st);
  }
  // attack：停留 oppTurn，等待我方应手
}

/** M4：陷阱触发条件判定（条件未满足则陷阱保持盖放不消耗） */
function trapArmed(tr: TrapTrigger | undefined, st: DuelState, opp: CardDef): boolean {
  if (!tr || tr.kind === "always") return true;
  if (tr.kind === "oppSuit") return opp.suit === tr.suit;
  if (tr.kind === "oppPowerAtLeast") return (opp.power ?? 1) >= tr.n;
  return st.hpPlayer <= tr.n;
}

/** M4：陷阱效果结算（返回文案；调用方已判定 trapArmed） */
function applyTrapEffect(effect: TrapEffect, st: DuelState, opp: CardDef, byOpponent: boolean): { note: string; o: number; zero: boolean } {
  // zero=其招作废；o 追加值（对手蓄力等由调用方处理）
  switch (effect) {
    case "抵消":
    case "落空":
      return { note: byOpponent ? "你的主攻撞上了他的暗算——这手落了空！" : "他的招式被你案下的暗牌废了！", o: 0, zero: true };
    case "反伤":
      if (byOpponent) st.hpPlayer -= 2; else st.hpOpponent -= 2;
      return { note: byOpponent ? "他反扣的暗刺划了你 2 点气力！" : "案下暗刺发难，他又折了 2 点气力！", o: 0, zero: false };
    case "蓄锋":
      st.buffPower += 2;
      return { note: "暗牌蓄锋——你的下一手主攻 +2。", o: 0, zero: false };
    case "借力":
      st.buffPower += Math.floor((opp.power ?? 1) / 2);
      return { note: `借他这一击的力道——你下一手主攻 +${Math.floor((opp.power ?? 1) / 2)}。`, o: 0, zero: false };
    case "回生":
      st.hpPlayer = Math.min(st.hpMax ?? (st.cfg.hp?.player ?? 10), st.hpPlayer + 4);
      return { note: "暗扣一按，金蝉脱壳——你缓回 4 点气力。", o: 0, zero: false };
  }
}

/** M2 交替回合：对手主攻，我方从手牌（v2）/整副（轻回合）选一张「应手」比点。
 *  守方应手 +1（先手价值的根，拍板项 1）；应手不引爆发动位（牺牲/蓄力/势翻倍/抽牌均不结算）。
 *  我方盖放的陷阱在此触发（伏击窗口=对手主攻）。 */
export function respondOpponent(st: DuelState, playerCard: CardDef, cardOf: (id: string) => CardDef): boolean {
  if ((st.turnSchema ?? "legacy") !== "phased" || st.phase !== "oppTurn" || st.finished) return false;
  const intent = st.oppIntent;
  if (!intent || intent.kind !== "attack" || !intent.cardId) return false;
  if ((playerCard.layer ?? "成术") !== "成术" || playerCard.trap) return false;
  if (st.rules === "v2") {
    st.hand = st.hand.filter((c) => c !== playerCard.id);
    st.discard.push(playerCard.id);
  }
  const opp = cardOf(intent.cardId);
  // M4：陷阱按触发条件判定——条件未满足则保持盖放不消耗
  const trap = st.trap;
  const trapActive = !!trap && trapArmed(trap.trigger, st, opp);
  if (trap) st.trap = trapActive ? null : trap;
  // 势倍率与主攻同口径（牌面写 ×1.5，应手同样兑现；防守姿态不引反噬）
  const rbase = (playerCard.power ?? 1) + suitBonus(st, playerCard);
  let p = rbase + 1;
  if (playerCard.suit === "势") p = Math.floor(rbase * 1.5) + 1;
  let o = opp.power ?? 1;
  let broke = false;
  let trapNote: string | undefined;
  let trapZero = false;
  if (trapActive) {
    const res = applyTrapEffect(trap.effect, st, opp, false);
    trapNote = res.note;
    trapZero = res.zero;
  }
  // 收买·内应：对手主攻作废（先于破招判定）
  if (st.insiderActive) { o = 0; broke = true; st.insiderActive = false; }
  // 我方破招宣言：押中他主攻花色则该招作废
  if (st.foresuit) {
    if (opp.suit === st.foresuit) { o = 0; broke = true; }
    st.foresuit = null;
  }
  if (trapZero) { o = 0; broke = true; }
  let edge = 0;
  if (playerCard.suit && opp.suit) {
    if (RESTRAIN[playerCard.suit] === opp.suit) edge = 1;
    else if (RESTRAIN[opp.suit] === playerCard.suit) edge = -1;
  }
  p += edge;
  if (playerCard.situational && opp.suit === playerCard.situational.suit) p += playerCard.situational.bonus;
  // 对手蓄力层随主攻释放（每层 +2）
  const oc = st.oppCharge ?? 0;
  if (oc > 0) { o += oc * 2; st.oppCharge = 0; }
  st.lastPlay = { playerCard, oppCard: opp, damage: 0, to: "none", edge, broke };
  st.lastCardId = playerCard.id;
  if (p > o) {
    // M2 调参：应手的反击差值减半（守势转换不如主攻高效）——否则玩家在我方与敌方两个回合都全额赚差值，
    // 轻回合局的张力崩塌，且剧情杀数值防线被守方加成击穿。赢 1 点差保底 1 伤（不许出现「折了 0 点」）。
    const d = Math.min(Math.max(1, Math.floor((p - o) / 2)), TURN_DAMAGE_CAP);
    st.hpOpponent -= d;
    st.lastPlay = { ...st.lastPlay, damage: d, to: "o" };
  } else if (o > p) {
    const d = Math.min(o - p, TURN_DAMAGE_CAP);
    st.hpPlayer -= d;
    st.lastPlay = { ...st.lastPlay, damage: d, to: "p" };
  } else {
    st.hpPlayer -= 1;
    st.hpOpponent -= 1;
    st.lastPlay = { ...st.lastPlay, damage: 1, to: "none" };
  }
  if (trapNote) st.lastPlay = { ...st.lastPlay, trapNote };
  if (trapActive) st.seeTrap = false;
  st.round += 1;
  // 洞察情报随对手这次主攻结算过期
  if (st.seeNext !== "none") st.seeNext = "none";
  if (st.hpOpponent <= 0 && st.hpPlayer > 0) st.finished = "win";
  else if (st.hpPlayer <= 0) st.finished = "lose";
  {
    const lp = st.lastPlay;
    const dest = lp?.to === "o" ? `他折了 ${lp?.damage} 点` : lp?.to === "p" ? `你折了 ${lp?.damage} 点` : "两败俱伤";
    pushLog(st, `他主攻「${opp.name}」，你以「${playerCard.name}」应手——${dest}${trapNote ? `（${trapNote}）` : ""}`, "press");
  }
  finishOppTurn(st);
  return true;
}

/** M2：盖放陷阱（phased 专属动作；legacy 仍走 playPressure 的盖放分支）。
 *  phased 语义：陷阱伏击「对手的主攻」——在我方主阶段盖下，他回合出招时触发。 */
export function setTrap(st: DuelState, card: CardDef): boolean {
  if ((st.turnSchema ?? "legacy") !== "phased" || st.mode !== "pressure" || st.finished) return false;
  if (!card.trap || card.suit !== "隐") return false;
  if (st.phase !== "pMain") return false;
  if (st.trap) { st.lastResult = { text: "案上已经扣着一张牌了——只能盖一张。", kind: "miss" }; return false; }
  if (st.rules === "v2") {
    if (!st.light && st.ap < cardCost(card)) return false;
    if (!st.light) st.ap -= cardCost(card);
    st.hand = st.hand.filter((c) => c !== card.id);
    st.discard.push(card.id);
  }
  st.trap = { cardId: card.id, name: card.name, effect: card.trap, trigger: card.trapTrigger };
  st.lastCardId = card.id;
  st.lastResult = { text: `你把「${card.name}」反扣在案上——单等他的招式撞上来。`, kind: "gambit" };
  pushLog(st, st.lastResult.text, st.lastResult.kind);
  if (st.light) handOffToOpponent(st);
  return true;
}

/** 博弈·蓄势（压制制）：叠一层蓄力（上限 2），下张成术每层 +2 点。
 *  v2 耗 1 行动力不推进回合；classic 以敌方一招为代价（敌方出牌、我方蓄力）。 */
export function chargeUp(st: DuelState, oppCardId: string, cardOf: (id: string) => CardDef): boolean {
  if (st.mode !== "pressure" || st.finished || !st.cfg.gambit || st.charge >= 2) return false;
  if ((st.turnSchema ?? "legacy") === "phased") {
    // M2：phased 蓄势=我方主阶段的一个动作（轻回合免 AP 且自动交先手；v2 耗 1 行动力）
    if (st.phase !== "pMain") return false;
    if (!st.light) {
      if (st.ap < 1) return false;
      st.ap -= 1;
    }
    st.charge += 1;
    st.lastResult = { text: `你按兵不动，吐纳蓄力，把锋芒收进袖中。（蓄势+1层）`, kind: "gambit" };
    pushLog(st, st.lastResult.text, st.lastResult.kind);
    if (st.light) handOffToOpponent(st);
    return true;
  }
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
  if ((st.turnSchema ?? "legacy") === "phased") {
    // M2：phased 破招=宣言对手本次主攻的花色（非攻意图则宣言作废——博弈成本）；轻回合免 AP
    if (st.phase !== "pMain") return false;
    if (!st.light) {
      if (st.ap < 1) return false;
      st.ap -= 1;
    }
    st.foresuit = suit;
    st.lastResult = { text: `你眯起眼：「下一招，你必出『${suit}』。」`, kind: "gambit" };
    pushLog(st, st.lastResult.text, st.lastResult.kind);
    if (st.light) handOffToOpponent(st);
    return true;
  }
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
  // M2：交替回合下物品只在我方主阶段可用（对手回合只允许应手）
  if ((st.turnSchema ?? "legacy") === "phased" && st.phase !== "pMain") return false;
  // M1（审计 4.2）：观牌/观色/观点/揭底只服务压制制情报层——情绪制无任何消费路径（UI 不渲染），
  // 旧实现照常结算=打出即死卡还倒贴一手牌。情绪局直接拒绝打出。
  if (st.mode === "emotion" && (eff === "观牌" || eff === "观色" || eff === "观点" || eff === "揭底")) return false;
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
      // 钳制上限：情绪制气力上限随人物/备战加成抬升（qiMax，M1）；压制制不超开局上限，防止数值越界展示
      if (st.mode === "emotion") st.qi = Math.min(st.qiMax ?? 10, st.qi + 3);
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
    case "揭底":
      if (st.oppTrap) {
        st.oppTrap = null;
        st.oppTrapUsed = true;
        st.lastResult = { text: `「${name}」往案下一探——他的暗算被你连底拆了，本局他再盖不成。`, kind: "item" };
      } else {
        st.oppTrapUsed = true;
        st.lastResult = { text: `「${name}」探遍案下——并无暗算，且他本局不敢再盖。`, kind: "item" };
      }
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

/** 气力压制制：双方同时出牌结算（四色克制：克敌+1 / 被克-1）。
 *  phased 语义下本函数=「我方主攻」：对手按脚本应答；陷阱伏击与破招宣言均针对对手主攻，
 *  在 respondOpponent 中结算——我方主攻不消耗二者。 */
export function playPressure(st: DuelState, playerCard: CardDef, oppCardId: string, cardOf: (id: string) => CardDef): boolean {
  if (st.mode !== "pressure" || st.finished) return false;
  const phased = (st.turnSchema ?? "legacy") === "phased";
  // 隐色陷阱：打出即盖放（本轮不结算，对手本轮也不出手——布局回合），下一轮对手出牌时自动触发
  if (playerCard.trap && playerCard.suit === "隐") {
    if (phased) return setTrap(st, playerCard);
    if (st.trap) { st.lastResult = { text: "案上已经扣着一张牌了——只能盖一张。", kind: "miss" }; return false; }
    if (st.rules === "v2") {
      if (st.ap < cardCost(playerCard)) return false;
      st.ap -= cardCost(playerCard);
      st.hand = st.hand.filter((c) => c !== playerCard.id);
      st.discard.push(playerCard.id);
    }
    st.trap = { cardId: playerCard.id, name: playerCard.name, effect: playerCard.trap };
    st.lastPlay = null;
    // 招式用老盯的是「上一张实际打出的牌」，盖放同样算——同牌再出按招式用老计（-2）
    st.lastCardId = playerCard.id;
    st.lastResult = { text: `你把「${playerCard.name}」反扣在案上——不急着亮。`, kind: "gambit" };
    st.round += 1;
    // C-2 陷阱是「盖放消耗」而非真实交手：刺探买到的 seeNext 情报不清空，
    // 保留至下一次真实交手结算后（playPressure 结算段 525 行左右）才过期。
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
  // 触发已盖陷阱（本轮对手出牌时）——phased 下陷阱伏击的是对手主攻（respondOpponent），我方主攻不触发
  const trap = phased ? null : st.trap;
  if (!phased) st.trap = null;
  if (trap?.effect === "蓄锋") st.buffPower += 2;
  // M1 数值止血（审计第七篇 P0-3）：势的加成只作用于基础点数（power+人物被动）——
  // 蓄力层/强牌 buff/克制/情境/牺牲全部移到乘算区之后加算。
  // 旧实现 (power+charge*2+buff)*2 首回合可打出 14~20 点，对 8 血 v2 压制局构成无解 OTK。
  const base = (playerCard.power ?? 1) + suitBonus(st, playerCard);
  let p = base + st.buffPower + st.charge * 2;
  st.buffPower = 0;
  st.charge = 0;
  let o = opp.power ?? 1;
  let broke = false;
  // 收买·内应：对手本招作废（先于破招判定）
  if (st.insiderActive) { o = 0; broke = true; st.insiderActive = false; }
  // 破招宣言：legacy=押对手下一手（含应答）；phased=宣言针对对手主攻，我方主攻不消费
  if (st.foresuit && !phased) {
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
    p = Math.floor(base * 1.5) + (p - base);
    selfHarm = 1;
  }
  // M2 轻回合：我方主攻享先手加成（位次加成不进势的乘算）
  if (st.light) p += LIGHT_LEAD_BONUS;
  // M3 反背板兑现：对手宣言押中我方主攻花色 → 该手作废（p=0，硬吃其点数）
  let selfBroke = false;
  let trapNoteOpp: string | undefined;
  if (phased && st.oppForesuit) {
    if (playerCard.suit && playerCard.suit === st.oppForesuit) { p = 0; selfBroke = true; }
    st.oppForesuit = null;
  }
  // M4 对手埋伏兑现：我方主攻撞上他的暗算 → 该手作废（喂废牌即可拆雷——博弈核心）
  if (phased && st.oppTrap && trapArmed(st.oppTrap.trigger, st, opp)) {
    selfBroke = true;
    st.oppTrap = null;
    st.oppTrapUsed = true;
    trapNoteOpp = "他案下的暗算让你的主攻落了空！";
  }
  // 机制位·抽牌：打出时抽 N 张（v2；每张抽牌卡各自触发一次；情绪制同样生效）
  if (playerCard.drawOnPlay && st.rules === "v2" && playerCard.drawOnPlay > 0) {
    drawN(st, playerCard.drawOnPlay);
  }
  st.lastPlay = { playerCard, oppCard: opp, damage: 0, to: "none", stale, edge, broke, selfBroke };
  st.lastCardId = playerCard.id;
  // M3 反背板数据源：记我方主攻花色（phased）
  if (phased && playerCard.suit) {
    st.playerLeadSuits = [...(st.playerLeadSuits ?? []), playerCard.suit].slice(-4);
  }
  if (p > o) {
    const d = Math.min(p - o, TURN_DAMAGE_CAP);
    st.hpOpponent -= d;
    st.lastPlay = { ...st.lastPlay, damage: d, to: "o" };
  } else if (o > p) {
    const d = Math.min(o - p, TURN_DAMAGE_CAP);
    st.hpPlayer -= d;
    st.lastPlay = { ...st.lastPlay, damage: d, to: "p" };
  } else {
    st.hpPlayer -= 1;
    st.hpOpponent -= 1;
    st.lastPlay = { ...st.lastPlay, damage: 1, to: "none" };
  }
  // 反伤陷阱（M1 重做，审计 2.2）：旧实现把「输掉的差值」全额弹回对手——最优解变成故意出
  // 废牌送掉交换（激励倒置）。改为触发即对对手造成固定 2 点，交换本身照常结算。
  let trapNote: string | undefined;
  if (trap?.effect === "反伤") {
    st.hpOpponent -= 2;
    trapNote = "案下暗刺发难，他又折了 2 点气力！";
    st.lastPlay = { ...st.lastPlay, trapNote };
  }
  st.hpPlayer -= selfHarm;
  st.round += 1;
  // 洞察·揭示（成术「诈问」）：结算后揭示下一手花色/全牌（先于胜负判定，仅信息型不参与判定）
  if (playerCard.reveal) st.seeNext = playerCard.reveal === "card" ? "card" : "suit";
  // 洞察情报在结算后过期（观牌揭示的正是本轮刚结算的那手）
  else if (st.seeNext !== "none") st.seeNext = "none";
  if (st.hpOpponent <= 0 && st.hpPlayer > 0) st.finished = "win";
  else if (st.hpPlayer <= 0) st.finished = "lose";
  // M0 战报记账：压制制结算行（UI 的 lastPlay 行是展示层合成，缓冲区存引擎侧同源文本）
  {
    const lp = st.lastPlay;
    const note = trapNoteOpp ?? trapNote;
    if (note) st.lastPlay = { ...st.lastPlay, trapNote: note };
    const dest = lp?.to === "o" ? `他折了 ${lp?.damage} 点` : lp?.to === "p" ? `你折了 ${lp?.damage} 点` : "两败俱伤";
    pushLog(st, `你出「${playerCard.name}」，他出「${opp.name}」——${dest}${note ? `（${note}）` : ""}`, "press");
  }
  // M2 轻回合：每回合一个主行动，出完自动交出先手（对局未结束时）
  if (phased && st.light && !st.finished) handOffToOpponent(st);
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
  kind: "scout" | "insider" | "scoutTrap",
): { ok: boolean; log?: string } {
  if (st.mode !== "pressure" || st.finished) return { ok: false, log: "对局已结束。" };
  // M2：随从动作只在我方主阶段可用（对手回合只允许应手）
  if ((st.turnSchema ?? "legacy") === "phased" && st.phase !== "pMain") {
    return { ok: false, log: "他招式已出——此刻腾不出手。" };
  }
  // 刺探/收买必须由随从执行：无随从不可用
  if (st.retinueNames.length === 0) {
    return { ok: false, log: "无随从随行——需先雇斥候/内应。" };
  }
  // C-1 次数分桶：共享（精/传，sharedTotal>0）与独立（凡/良）分开记账。
  //   - 共享池有余量时优先从共享池出（精/传的共用次数先耗，保住独立次数作兜底）；
  //   - 共享池耗尽则回退独立次数（凡/良各自 indScoutLeft/indInsiderLeft），
  //     因此独立次数不会被共享上限封死（原实现任何随从动作都 sharedUsed+=1）。
  const isScoutKind = kind === "scout" || kind === "scoutTrap";
  const indLeft = isScoutKind ? (st.indScoutLeft ?? 0) : (st.indInsiderLeft ?? 0);
  const usedShared = st.sharedTotal > 0 && st.sharedUsed < st.sharedTotal;
  if (!usedShared && indLeft <= 0) {
    return { ok: false, log: st.sharedTotal > 0 ? "随从已用尽了力气。" : (kind === "scout" ? "斥候已无余力再探。" : "内应已无余力再动。") };
  }
  if (isScoutKind && st.scoutLeft <= 0) {
    return { ok: false, log: "斥候已无余力再探。" };
  }
  if (kind === "insider" && st.insiderLeft <= 0) {
    return { ok: false, log: "内应已无余力再动。" };
  }
  if (isScoutKind) {
    // M4：刺探二选一——探「下一手」全牌，或探「案下暗算」（phased 局）
    if (kind === "scout") st.seeNext = "card";
    else st.seeTrap = true;
    st.scoutLeft -= 1;
  } else {
    st.insiderActive = true;
    st.insiderLeft -= 1;
  }
  if (usedShared) st.sharedUsed += 1;
  else if (isScoutKind) st.indScoutLeft = (st.indScoutLeft ?? 0) - 1;
  else st.indInsiderLeft = (st.indInsiderLeft ?? 0) - 1;
  return { ok: true, log: kind === "scout" ? "斥候探得军情——看清对手下一手。" : kind === "scoutTrap" ? "斥候摸清了案下的名堂。" : "内应已买通——对手下一招将成空。" };
}
