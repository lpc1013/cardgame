import type { RunState } from "./runtime";
import type { DuelState } from "./duel";

// ============================================================
// 存档与图鉴（localStorage）
//   - 存档：版本号 + 形状校验 + 对局进度持久化
//   - 图鉴：全局记录已解锁结局
// ============================================================

const SAVE_VERSION = 2;
const SAVE_KEY = "dicun_save_v2";
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
    const state: RunState = { ...wire, flags: new Set(wire.flags) };
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
