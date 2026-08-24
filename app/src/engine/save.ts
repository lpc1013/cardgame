import type { RunState } from "./runtime";
import type { DuelState } from "./duel";
import type { CardDef } from "./types";

// ============================================================
// 存档与图鉴（localStorage）
//   - 存档：版本号 + 形状校验 + 对局进度持久化
//   - 图鉴：全局记录已解锁结局
// ============================================================

const SAVE_VERSION = 3;
const SAVE_KEY = "dicun_save_v3";
const GALLERY_KEY = "dicun_gallery_v1";

/** 线格式：flags 序列化为数组（RunState 运行时是 Set） */
interface SaveStateWire extends Omit<RunState, "flags"> {
  flags: string[];
}
interface DuelWire {
  cfgId: string;
  /** DuelState 去掉 cfg 后的纯数据 */
  data: Omit<DuelState, "cfg">;
}
export interface SaveData {
  version: number;
  scenarioId: string;
  state: RunState;
  duel?: DuelWire;
  savedAt: number;
}

export function saveGame(scenarioId: string, state: RunState, duel?: DuelWire): void {
  try {
    const wire: SaveStateWire = { ...state, flags: Array.from(state.flags) };
    const data = { version: SAVE_VERSION, scenarioId, state: wire, duel, savedAt: Date.now() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch { /* 隐私模式等场景静默失败 */ }
}

function isValidRunState(s: unknown): s is SaveStateWire {
  if (typeof s !== "object" || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.scenarioId === "string" &&
    typeof o.sceneId === "string" &&
    typeof o.lineIndex === "number" && o.lineIndex >= 0 &&
    Array.isArray(o.flags) && o.flags.every((f) => typeof f === "string") &&
    (o.stats === undefined || typeof o.stats === "object") &&
    Array.isArray(o.clues) && Array.isArray(o.cards) && Array.isArray(o.visited)
  );
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d.version !== SAVE_VERSION || !isValidRunState(d.state)) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    const wire = d.state as SaveStateWire;
    const state: RunState = { ...wire, flags: new Set(wire.flags), boosts: Array.isArray(wire.boosts) ? wire.boosts : [] };
    let duel: DuelWire | undefined;
    if (d.duel && typeof d.duel === "object" && typeof (d.duel as DuelWire).cfgId === "string") {
      duel = d.duel as DuelWire;
    }
    return { version: SAVE_VERSION, scenarioId: d.scenarioId as string, state, duel, savedAt: d.savedAt as number };
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// ---------- 卡牌图鉴 ----------
const CARD_SEEN_KEY = "dicun_cards_v1";
type CardSeenData = Record<string, string[]>; // scenarioId -> 已见卡 id

export function recordCardsSeen(scenarioId: string, ids: string[]): void {
  try {
    const all = getCardSeen();
    const set = new Set([...(all[scenarioId] ?? []), ...ids]);
    all[scenarioId] = [...set];
    localStorage.setItem(CARD_SEEN_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function getCardSeen(): CardSeenData {
  try {
    return JSON.parse(localStorage.getItem(CARD_SEEN_KEY) ?? "{}") as CardSeenData;
  } catch {
    return {};
  }
}

// ---------- 结局图鉴 ----------
export interface GalleryEntry {
  scenarioId: string;
  endingName: string;
  rank: string;
  at: number;
}

export function unlockEnding(e: Omit<GalleryEntry, "at">): void {
  try {
    const all = getGallery();
    if (all.some((x) => x.scenarioId === e.scenarioId && x.endingName === e.endingName)) return;
    all.push({ ...e, at: Date.now() });
    localStorage.setItem(GALLERY_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function getGallery(): GalleryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(GALLERY_KEY) ?? "[]") as GalleryEntry[];
  } catch {
    return [];
  }
}

// ---------- 剧情树 ----------
const TREE_KEY = "dicun_tree_v1";
type TreeData = Record<string, string[]>; // scenarioId -> 已见场景 id

export function recordTreeVisit(scenarioId: string, sceneId: string): void {
  try {
    const all = getTree();
    const list = all[scenarioId] ?? [];
    if (!list.includes(sceneId)) {
      list.push(sceneId);
      all[scenarioId] = list;
      localStorage.setItem(TREE_KEY, JSON.stringify(all));
    }
  } catch { /* ignore */ }
}

export function getTree(): TreeData {
  try {
    return JSON.parse(localStorage.getItem(TREE_KEY) ?? "{}") as TreeData;
  } catch {
    return {};
  }
}

// ---------- 帝国：墨铤 / 开局加成 / 跨剧本仓库 / 主题 ----------
const EMPIRE_KEY = "dicun_empire_v1";
/** 每个新解锁结局奖励的墨铤 */
export const INK_PER_ENDING = 20;

export interface EmpireData {
  ink: number;                 // 墨铤余额（全局货币）
  grantedEnds: number;         // 已发放过奖励的结局数（防重复发放）
  warehouse: string[];         // 跨剧本仓库：全局卡 id（仅旧档兼容读取；行囊已改自动收藏，不再写入）
  themes: string[];            // 已购主题 id
  theme: string;               // 当前主题（"" = 默认）
  boosts: Record<string, number>; // 开局加成库存 id -> 数量
  brokenSeals: string[];       // 花墨铤提前破封的剧本 id（链式解锁之外的特批）
}

const EMPIRE_DEFAULT: EmpireData = { ink: 0, grantedEnds: 0, warehouse: [], themes: [], theme: "", boosts: {}, brokenSeals: [] };

function readEmpire(): EmpireData {
  try {
    const raw = localStorage.getItem(EMPIRE_KEY);
    if (!raw) return { ...EMPIRE_DEFAULT };
    return { ...EMPIRE_DEFAULT, ...(JSON.parse(raw) as Partial<EmpireData>) };
  } catch {
    return { ...EMPIRE_DEFAULT };
  }
}

function writeEmpire(e: EmpireData): void {
  try { localStorage.setItem(EMPIRE_KEY, JSON.stringify(e)); } catch { /* ignore */ }
}

/** 读取帝国数据；同时按「新解锁结局 × 20」补发墨铤（幂等） */
export function settleEmpire(): EmpireData {
  const e = readEmpire();
  const ends = getGallery().length;
  if (ends > e.grantedEnds) {
    e.ink += (ends - e.grantedEnds) * INK_PER_ENDING;
    e.grantedEnds = ends;
    writeEmpire(e);
  }
  return e;
}

/** 花费墨铤；余额不足返回 false */
export function spendInk(n: number): boolean {
  const e = settleEmpire();
  if (e.ink < n) return false;
  e.ink -= n;
  writeEmpire(e);
  return true;
}

/** 购入开局加成 +1 */
export function gainBoost(id: string): void {
  const e = settleEmpire();
  e.boosts[id] = (e.boosts[id] ?? 0) + 1;
  writeEmpire(e);
}

/** 消耗指定加成各一件，返回实际消耗的 id 列表 */
export function consumeBoosts(ids: string[]): string[] {
  const e = settleEmpire();
  const used: string[] = [];
  for (const id of ids) {
    const n = e.boosts[id] ?? 0;
    if (n > 0) { e.boosts[id] = n - 1; used.push(id); }
  }
  writeEmpire(e);
  return used;
}

/** 解锁主题 */
export function unlockTheme(id: string): void {
  const e = settleEmpire();
  if (!e.themes.includes(id)) e.themes.push(id);
  writeEmpire(e);
}

export function setTheme(id: string): void {
  const e = settleEmpire();
  e.theme = id;
  writeEmpire(e);
}

/** 提前破封所需墨铤 */
export const UNSEAL_COST = 60;

/** 花墨铤提前破封指定剧本；余额不足返回 false */
export function unsealScenario(id: string): boolean {
  const e = settleEmpire();
  if (e.brokenSeals.includes(id)) return true;
  if (e.ink < UNSEAL_COST) return false;
  e.ink -= UNSEAL_COST;
  e.brokenSeals.push(id);
  writeEmpire(e);
  return true;
}

// ---------- 全局卡注册表（跨剧本携带物品的定义快照） ----------
const GLOBAL_CARDS_KEY = "dicun_global_cards_v1";
type GlobalCards = Record<string, CardDef>;

export function registerGlobalCards(defs: CardDef[]): void {
  try {
    const all = getGlobalCards();
    let changed = false;
    for (const d of defs) {
      if (!all[d.id]) { all[d.id] = d; changed = true; }
    }
    if (changed) localStorage.setItem(GLOBAL_CARDS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function getGlobalCards(): GlobalCards {
  try {
    return JSON.parse(localStorage.getItem(GLOBAL_CARDS_KEY) ?? "{}") as GlobalCards;
  } catch {
    return {};
  }
}

export function getGlobalCard(id: string): CardDef | undefined {
  return getGlobalCards()[id];
}
