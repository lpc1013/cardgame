import type { Scenario, Scene, Choice, Cond, Effect } from "./types";

// ============================================================
// 叙事运行时：状态 + 条件判定 + 效果结算
// ============================================================

export interface RunState {
  scenarioId: string;
  sceneId: string;
  flags: Set<string>;
  stats: Record<string, number>;
  clues: string[];        // 已解锁线索 id
  cards: string[];        // 当前卡池 card id（经典模式=全部可用）
  // ---- 卡牌系统 v2 ----
  bag: string[];          // 背包（收集到的所有非资源卡）
  deck: string[];         // 编组卡组（对局可用，上限 deckLimit）
  silver: number;         // 银两（资源本位）
  lineIndex: number;      // 当前场景已读段落
  visited: string[];      // 场景历史
}

export function initState(sc: Scenario): RunState {
  const stats: Record<string, number> = {};
  sc.stats?.forEach((s) => (stats[s.key] = s.init));
  const allCards = sc.cards.map((c) => c.id);
  return {
    scenarioId: sc.id,
    sceneId: sc.startScene,
    flags: new Set(),
    stats,
    clues: [],
    cards: allCards,
    bag: sc.cardSystem ? (sc.initialDeck ? [...sc.initialDeck] : []) : allCards,
    deck: sc.cardSystem ? (sc.initialDeck ? [...sc.initialDeck] : []) : allCards,
    silver: sc.initialSilver ?? 0,
    lineIndex: 0,
    visited: [],
  };
}

export function cardLayer(c: { layer?: string }): string {
  return c.layer ?? "成术";
}

export function checkCond(cond: Cond | undefined, st: RunState): boolean {
  if (!cond) return true;
  if (cond.flag && !st.flags.has(cond.flag)) return false;
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
      if (!st.bag.includes(e.unlockCard)) st.bag.push(e.unlockCard);
      // 新卡自动进编组（若未满）
      const sc = cardScenario(st.scenarioId);
      const limit = sc?.deckLimit ?? 12;
      if (!st.deck.includes(e.unlockCard) && st.deck.length < limit) st.deck.push(e.unlockCard);
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
  return (scene.choices ?? []).filter((c) => checkCond(c.cond, st));
}
