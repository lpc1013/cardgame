import type { RunState } from "./runtime";
import type { DuelState } from "./duel";
import type { CardDef } from "./types";

// ============================================================
// 存档与图鉴（localStorage）
//   - 存档：版本号 + 形状校验 + 对局进度持久化
//   - 图鉴：全局记录已解锁结局
// ============================================================

const SAVE_VERSION = 4;
const SAVE_KEY = "dicun_save_v4";
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
    Array.isArray(o.clues) && Array.isArray(o.bag) && Array.isArray(o.deck) && Array.isArray(o.boosts) && Array.isArray(o.visited)
  );
}

export function loadGame(): SaveData | null {
  try {
    // 兼容旧 key（v3 之前）：读不到新档时回退旧档，低版本经迁移后由 saveGame 写回新 key
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem("dicun_save_v3");
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    const ver = typeof d.version === "number" ? d.version : 0;
    if (ver > SAVE_VERSION || !isValidRunState(d.state)) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    const wire = d.state as SaveStateWire;
    const state: RunState = { ...wire, flags: new Set(wire.flags), boosts: Array.isArray(wire.boosts) ? wire.boosts : [], retinue: Array.isArray(wire.retinue) ? wire.retinue : [], usedCards: Array.isArray(wire.usedCards) ? wire.usedCards : [] };
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

// ---------- 成就 ----------
const ACH_KEY = "dicun_achievements_v1";

export function getAchievements(): string[] {
  try {
    const raw = localStorage.getItem(ACH_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 解锁成就（幂等），返回是否首次解锁 */
export function unlockAchievement(id: string): boolean {
  try {
    const cur = getAchievements();
    if (cur.includes(id)) return false;
    cur.push(id);
    localStorage.setItem(ACH_KEY, JSON.stringify(cur));
    return true;
  } catch {
    return false;
  }
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

// ---------- 番外（弱卡钥匙解锁的剧情插曲） ----------
const BONUS_KEY = "dicun_bonus_v1";
export function getBonuses(): string[] {
  try {
    return JSON.parse(localStorage.getItem(BONUS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
/** 解锁番外（幂等：已解锁返回 false） */
export function unlockBonus(id: string): boolean {
  const xs = getBonuses();
  if (xs.includes(id)) return false;
  localStorage.setItem(BONUS_KEY, JSON.stringify([...xs, id]));
  return true;
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
  retinue: string[];           // 帝国随从池：跨剧本持有的随从人物卡 id（全局 ≤3）
  warLoses: string[];          // 输过战争对局（劫与烬）的剧本 id——败过才解锁「岁币之约」
  peaceDeal: boolean;          // 已购「岁币之约」（帝国商市，墨铤 60）
  achCounters: Record<string, number>; // 成就跨局计数（破招次数/胜局/小游戏胜利等）
  endMile: number;             // 结局进度条已领最高档位（0-5），幂等发放
  luggageSlots: number;        // 随身位扩容次数（商市 300 墨铤/次，上限 2 次 → 5 格）
  spareSilver: number;         // 银两储备（商市墨铤 1:1 兑换，出征时注入剧本）
  titles: string[];            // 已获称号（成就奖励授予）
}

const EMPIRE_DEFAULT: EmpireData = { ink: 0, grantedEnds: 0, warehouse: [], themes: [], theme: "", boosts: {}, brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {}, endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [] };

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

/** 结局进度条里程碑：完成度 → 额外墨铤（一次性，幂等；六档密集 700） */
export const END_MILES: { pct: number; ink: number }[] = [
  { pct: 0.25, ink: 40 }, { pct: 0.4, ink: 70 }, { pct: 0.5, ink: 100 },
  { pct: 0.66, ink: 130 }, { pct: 0.75, ink: 160 }, { pct: 1, ink: 200 },
];
/** 全剧本结局总数（进度条/里程碑分母）。App 启动时按注册剧本动态注入，
 *  取代旧手工常量——避免新增结局后分母漂移（2026-08-27 审计 A-3） */
let totalEnds = 0;
export function setTotalEnds(n: number): void { if (n > totalEnds) totalEnds = n; }
export function getTotalEnds(): number { return totalEnds || 1; }

/** 读取帝国数据；同时按「新解锁结局 × 20」补发墨铤（幂等） */
export function settleEmpire(): EmpireData {
  const e = readEmpire();
  let dirty = false;
  const ends = getGallery().length;
  if (ends > e.grantedEnds) {
    e.ink += (ends - e.grantedEnds) * INK_PER_ENDING;
    e.grantedEnds = ends;
    dirty = true;
  }
  if (dirty) writeEmpire(e);
  return e;
}

/** 进度条里程碑：已达成但未领取的最高档位（endMile = 已领最高档位索引+1） */
export function claimableMile(): { idx: number; ink: number; pct: number } | null {
  const e = readEmpire();
  const ends = getGallery().length;
  for (let i = e.endMile; i < END_MILES.length; i++) {
    if (ends >= Math.ceil(getTotalEnds() * END_MILES[i]!.pct)) {
      return { idx: i, ink: END_MILES[i]!.ink, pct: END_MILES[i]!.pct };
    }
  }
  return null;
}

/** 领取下一档里程碑奖励；无档可领返回 false */
export function claimMile(): boolean {
  const m = claimableMile();
  if (!m) return false;
  const e = readEmpire();
  e.ink += m.ink;
  e.endMile = m.idx + 1;
  writeEmpire(e);
  return true;
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

/** 随从入帝国池（跨剧本持有，全局 ≤3）；满员返回 false */
export function addRetinue(id: string): boolean {
  const e = settleEmpire();
  if (e.retinue.includes(id)) return true;
  if (e.retinue.length >= 3) return false;
  e.retinue.push(id);
  writeEmpire(e);
  return true;
}

/** 记录一场战争对局失败（败过才解锁「岁币之约」购买） */
export function recordWarLoss(scenarioId: string): void {
  const e = settleEmpire();
  if (!e.warLoses.includes(scenarioId)) e.warLoses.push(scenarioId);
  writeEmpire(e);
}

/** 购买「岁币之约」（墨铤 60；劫与烬除外——大明不和亲、不赔款、不称臣） */
export function buyPeaceDeal(): boolean {
  const e = settleEmpire();
  if (e.peaceDeal) return true;
  if (e.ink < 60) return false;
  e.ink -= 60;
  e.peaceDeal = true;
  writeEmpire(e);
  return true;
}

/** 成就跨局计数 +n，返回新值（破招次数/胜局/小游戏胜利等） */
export function bumpCounter(key: string, n = 1): number {
  const e = settleEmpire();
  e.achCounters[key] = (e.achCounters[key] ?? 0) + n;
  writeEmpire(e);
  return e.achCounters[key]!;
}

export function getCounter(key: string): number {
  return settleEmpire().achCounters[key] ?? 0;
}

/** 随身位 +1（永久扩容，300 墨铤/次，上限 2 次 → 共 5 格） */
export function buyLuggageSlot(): boolean {
  const e = settleEmpire();
  if (e.luggageSlots >= 2) return false;
  if (e.ink < 300) return false;
  e.ink -= 300;
  e.luggageSlots += 1;
  writeEmpire(e);
  return true;
}

/** 墨铤 1:1 兑换银两储备（出征时注入剧本） */
export function exchangeSilver(n: number): boolean {
  const e = settleEmpire();
  if (n <= 0 || e.ink < n) return false;
  e.ink -= n;
  e.spareSilver += n;
  writeEmpire(e);
  return true;
}

/** 出征注入：取走全部银两储备并清零（返回注入量） */
export function consumeSpareSilver(): number {
  const e = settleEmpire();
  const n = e.spareSilver;
  if (n > 0) {
    e.spareSilver = 0;
    writeEmpire(e);
  }
  return n;
}

/** 授予称号（成就奖励联动） */
export function grantTitle(name: string): void {
  const e = settleEmpire();
  if (!e.titles.includes(name)) {
    e.titles.push(name);
    writeEmpire(e);
  }
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
