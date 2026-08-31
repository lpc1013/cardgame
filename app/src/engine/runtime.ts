import type { Scenario, Scene, Choice, Cond, Effect } from "./types";

// ============================================================
// 叙事运行时：状态 + 条件判定 + 效果结算
// ============================================================

export interface RunState {
  scenarioId: string;
  sceneId: string;
  /** 多视角剧本：当前主视角 id（单视角剧本缺省） */
  viewpoint?: string;
  flags: Set<string>;
  stats: Record<string, number>;
  clues: string[];        // 已解锁线索 id
  // ---- 卡牌系统 v2 ----
  bag: string[];          // 背包（收集到的所有非资源卡）
  deck: string[];         // 编组卡组（对局可用，上限 deckLimit）
  silver: number;         // 银两（资源本位）
  lineIndex: number;      // 当前场景已读段落
  visited: string[];      // 场景历史
  boosts: string[];       // 本局生效的帝国开局加成 id（出征时消耗）
  retinue: string[];      // 本局随从（斥候/内应人物卡，进 deck 场外生效，占用随身位）
  usedCards: string[];    // 本剧所有进过 deck 的卡（对局开始时并入）——剧本级成就判定（弱卡点名）依据
}

export function initState(sc: Scenario, viewpointId?: string): RunState {
  const stats: Record<string, number> = {};
  sc.stats?.forEach((s) => (stats[s.key] = s.init));
  const vp = viewpointId ? sc.viewpoints?.find((v) => v.id === viewpointId) : undefined;
  const allCards = sc.cards.map((c) => c.id);
  // 视角专属起手卡 > 剧本全局默认（经典模式全卡 / 卡牌系统初始卡组）
  const bag = vp?.initialDeck
    ? [...vp.initialDeck]
    : sc.cardSystem ? (sc.initialDeck ? [...sc.initialDeck] : []) : allCards;
  return {
    scenarioId: sc.id,
    sceneId: vp?.startScene ?? sc.startScene,
    viewpoint: vp?.id,
    flags: new Set(),
    stats,
    clues: [],
    bag,
    deck: [...bag],
    silver: sc.initialSilver ?? 0,
    lineIndex: 0,
    visited: [],
    boosts: [],
    retinue: [],
    usedCards: [],
  };
}

export function cardLayer(c: { layer?: string }): string {
  return c.layer ?? "成术";
}

export function checkCond(cond: Cond | undefined, st: RunState): boolean {
  if (!cond) return true;
  if (cond.flag && !st.flags.has(cond.flag)) return false;
  if (cond.flag2 && !st.flags.has(cond.flag2)) return false;
  if (cond.notFlag && st.flags.has(cond.notFlag)) return false;
  if (cond.clue && !st.clues.includes(cond.clue)) return false;
  if (cond.cluesAtLeast !== undefined && st.clues.length < cond.cluesAtLeast) return false;
  if (cond.card && !st.bag.includes(cond.card)) return false;
  if (cond.notCard && st.bag.includes(cond.notCard)) return false;
  if (cond.resourceAtLeast !== undefined && st.silver < cond.resourceAtLeast) return false;
  if (cond.statAtLeast) {
    for (const [k, v] of Object.entries(cond.statAtLeast)) {
      if ((st.stats[k] ?? 0) < v) return false;
    }
  }
  return true;
}

export function applyEffects(effects: Effect[] | undefined, st: RunState): void {
  if (!effects) return;
  for (const e of effects) {
    if (e.setFlag) st.flags.add(e.setFlag);
    if (e.stat) {
      for (const [k, v] of Object.entries(e.stat)) {
        st.stats[k] = (st.stats[k] ?? 0) + v;
      }
    }
    if (e.unlockClue && !st.clues.includes(e.unlockClue)) st.clues.push(e.unlockClue);
    if (e.unlockCard) {
      // F-6（2026-08-29 审计）：资源卡=银两面额，不入袋不入组，获得即折银——
      // 旧实现进 bag 并自动入组，占 12 卡组额度、对局中被抽到当 1 点白板牌
      const card = cardScenario(st.scenarioId)?.cards.find((c) => c.id === e.unlockCard);
      if ((card?.layer ?? "成术") === "资源") {
        st.silver += card?.resource ?? 0;
      } else {
        if (!st.bag.includes(e.unlockCard)) st.bag.push(e.unlockCard);
        // 新卡自动进编组（若未满）
        const sc = cardScenario(st.scenarioId);
        const limit = sc?.deckLimit ?? 12;
        if (!st.deck.includes(e.unlockCard) && st.deck.length < limit) st.deck.push(e.unlockCard);
      }
    }
    if (e.removeCard) {
      st.bag = st.bag.filter((c) => c !== e.removeCard);
      st.deck = st.deck.filter((c) => c !== e.removeCard);
    }
    if (e.gainSilver) st.silver += e.gainSilver;
    if (e.spendSilver) st.silver = Math.max(0, st.silver - e.spendSilver);
  }
}

/** 运行时剧本注册表（App 挂载；供 applyEffects 查 deckLimit） */
const scenarioRegistry = new Map<string, Scenario>();
export function registerScenarios(list: Scenario[]): void {
  scenarioRegistry.clear();
  list.forEach((s) => scenarioRegistry.set(s.id, s));
}
function cardScenario(id: string): Scenario | undefined {
  return scenarioRegistry.get(id);
}

export function findScene(sc: Scenario, id: string): Scene {
  const s = sc.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`场景不存在: ${id}`);
  return s;
}

export function visibleChoices(scene: Scene, st: RunState): Choice[] {
  // 有 altNext 的选项（真结局硬门槛降级）恒显示——cond 不满足时点击落入降级结局
  return (scene.choices ?? []).filter((c) => checkCond(c.cond, st) || !!c.altNext);
}

/**
 * 解析场景实际正文：variantLines 按 cond 顺序匹配，首个满足者的 lines 追加到默认正文末尾；
 * 全部不满足 → 仅默认 lines（无条件兜底，保证可达性）。
 */
export function resolveSceneLines(scene: Scene, st: RunState): string[] {
  for (const v of scene.variantLines ?? []) {
    if (checkCond(v.cond, st)) return [...scene.lines, ...v.lines];
  }
  return scene.lines;
}
