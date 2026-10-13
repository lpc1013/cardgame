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
/** 历史存档键：迁移与清档都必须连带处理。审计 A08——旧实现只在读不到当前键时回退读 v3，
 *  clearSave 却只删当前键，于是「放弃存档」之后 loadGame 又从 v3 把进度捞回来。 */
const LEGACY_SAVE_KEYS = ["dicun_save_v3"];
/** 校验失败时把原文备份到这里（不静默销毁玩家进度，也便于事后对账） */
const BAD_SAVE_KEY = "dicun_save_bad_v4";
const GALLERY_KEY = "dicun_gallery_v1";

/** 线格式：flags 序列化为数组（RunState 运行时是 Set） */
interface SaveStateWire extends Omit<RunState, "flags"> {
  flags: string[];
}
interface DuelWire {
  cfgId: string;
  /** DuelState 去掉 cfg 后的纯数据 */
  data: Omit<DuelState, "cfg">;
  /** M7（审计 P1-10）：本局押注银两入档——旧实现只存 App state，败局前刷新即免单 */
  wager?: number;
}
export interface SaveData {
  version: number;
  scenarioId: string;
  state: RunState;
  duel?: DuelWire;
  savedAt: number;
  /** C-6：存档版本高于当前 SAVE_VERSION 时置 true（不删除，由 UI 提示升级，避免误删新版本进度） */
  future?: boolean;
}

export function saveGame(scenarioId: string, state: RunState, duel?: DuelWire): void {
  try {
    const wire: SaveStateWire = { ...clonePlainRunState(state), flags: Array.from(state.flags) };
    const data = { version: SAVE_VERSION, scenarioId, state: wire, duel, savedAt: Date.now() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch { /* 隐私模式等场景静默失败 */ }
}

/** 写入前脱 Set：JSON 序列化时 flags 必须是数组，其余内层集合原样（都是 plain 结构） */
function clonePlainRunState(state: RunState): Omit<RunState, "flags"> {
  const { flags, ...rest } = state;
  void flags;
  return rest;
}

// ---------- 运行时 schema 校验（审计 A04）----------
// 形状检查≠数据契约。旧实现只判 `typeof stats === "object"`，而 null 与 [] 同样 typeof==="object"：
// stats:null 一路混进 checkCond 的 `st.stats[k]` 取值、bag 里的非字符串卡 id 混进 TCard 的 def 查询，
// 报错点离污染点隔了三四个界面。这类问题不该记在「玩家改档作弊」头上——版本升级、
// 浏览器写入被中断、迁移脚本出错都会造出同样形状错的数据，即使是纯单机也要挡住。
const isStr = (x: unknown): x is string => typeof x === "string";
const isStrArray = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
/** 数值表：允许空对象，但不许 null / 数组 / 值不是有限数 */
function isStatTable(x: unknown): x is Record<string, number> {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  return Object.values(x as Record<string, unknown>).every(isNum);
}
/** 勘查账：sceneId → 已入卷热点 id 数组 */
function isSurveyLedger(x: unknown): x is Record<string, string[]> {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  return Object.values(x as Record<string, unknown>).every(isStrArray);
}

/** 对局存档校验：只验「恢复时会被直接读走」的那些字段——
 *  mode/finished 决定分派与结算，round/ap/血量决定界面，数组决定牌库操作。
 *  其余字段（charge/foresuit/passives…）由 App 的旧档兜底补全，缺了不致命。 */
function isValidDuelWire(x: unknown): x is DuelWire {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.cfgId !== "string" || !o.cfgId) return false;
  const d = o.data;
  if (typeof d !== "object" || d === null || Array.isArray(d)) return false;
  const s = d as Record<string, unknown>;
  if (s.mode !== "emotion" && s.mode !== "pressure") return false;
  if (s.finished !== null && s.finished !== "win" && s.finished !== "lose") return false;
  if (!isNum(s.round) || s.round < 0) return false;
  if (!isNum(s.hpPlayer) || !isNum(s.hpOpponent)) return false;
  if (!isStr(s.cfgId ?? o.cfgId) && s.cfgId !== undefined) return false;
  for (const k of ["hand", "library", "discard", "usedCards", "playerLeadSuits", "retinueNames"]) {
    if (s[k] !== undefined && !isStrArray(s[k])) return false;
  }
  for (const k of ["ap", "baseAp", "yanli", "yanliMax", "qi", "rapport", "charge", "buffPower"]) {
    if (s[k] !== undefined && s[k] !== null && !isNum(s[k])) return false;
  }
  if (o.wager !== undefined && (!isNum(o.wager) || o.wager < 0)) return false;
  return true;
}

/** 存档 wire 校验：返回 null=通过，否则返回第一条拒绝理由（用于给玩家的提示与备份记录） */
function rejectReasonOf(o: Record<string, unknown>): string | null {
  const s = o.state;
  if (typeof s !== "object" || s === null || Array.isArray(s)) return "state 不是对象";
  const r = s as Record<string, unknown>;
  if (!isStr(r.scenarioId) || !r.scenarioId) return "scenarioId 缺失";
  if (!isStr(r.sceneId) || !r.sceneId) return "sceneId 缺失";
  if (!isNum(r.lineIndex) || r.lineIndex < 0 || !Number.isInteger(r.lineIndex)) return "lineIndex 非法";
  if (!isStrArray(r.flags)) return "flags 不是字符串数组";
  if (!isStatTable(r.stats)) return "stats 不是数值表";
  for (const k of ["clues", "bag", "deck", "boosts", "visited"] as const) {
    if (!isStrArray(r[k])) return `${k} 不是字符串数组`;
  }
  for (const k of ["retinue", "usedCards"] as const) {
    if (r[k] !== undefined && !isStrArray(r[k])) return `${k} 不是字符串数组`;
  }
  if (!isNum(r.silver)) return "silver 不是有限数值";
  if (r.wagers !== undefined && (!isNum(r.wagers) || r.wagers < 0 || !Number.isInteger(r.wagers))) return "wagers 非法";
  if (r.survey !== undefined && !isSurveyLedger(r.survey)) return "survey 账本格式异常";
  if (o.duel !== undefined && o.duel !== null && !isValidDuelWire(o.duel)) return "duel 存档结构非法";
  return null;
}

/** 校验失败时的待播报原因（一次性）：loadGame 只在真正拒绝了坏档时写，UI 取走即清 */
let pendingReject: string | null = null;
export function consumeSaveRejectReason(): string | null {
  const r = pendingReject;
  pendingReject = null;
  return r;
}

/** 把坏档原文挪到 dicun_save_bad_v4 再从存档位摘掉——既不带着脏数据进游戏，也不销毁它 */
function quarantine(raw: string, reason: string): void {
  try {
    localStorage.setItem(BAD_SAVE_KEY, JSON.stringify({ at: Date.now(), reason, raw }));
    localStorage.removeItem(SAVE_KEY);
    for (const k of LEGACY_SAVE_KEYS) localStorage.removeItem(k);
  } catch { /* 隐私模式：至少内存里这次不再用它 */ }
  pendingReject = reason;
}

export function loadGame(): SaveData | null {
  try {
    // 兼容旧 key：读不到新档时回退旧档；旧档一旦读通就立刻改写回当前键并删除旧键（审计 A08）——
    // 否则「当前键」永远不是唯一来源，清档也就永远清不干净。
    const rawCur = localStorage.getItem(SAVE_KEY);
    const legacyKey = rawCur ? null : LEGACY_SAVE_KEYS.find((k) => localStorage.getItem(k));
    const raw = rawCur ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    const ver = typeof d.version === "number" ? d.version : 0;
    if (ver > SAVE_VERSION) {
      // C-6 高版本存档不销毁：原样返回并标记 future，交 UI 提示「存档来自更新版本」；
      // 仅形状校验失败（损坏/旧格式）才隔离。
      return {
        version: ver,
        scenarioId: d.scenarioId as string,
        state: d.state as RunState,
        duel: d.duel as DuelWire | undefined,
        savedAt: d.savedAt as number,
        future: true,
      };
    }
    const reason = rejectReasonOf(d);
    if (reason) {
      quarantine(raw, reason);
      return null;
    }
    const wire = d.state as SaveStateWire;
    const state: RunState = { ...wire, flags: new Set(wire.flags), stats: wire.stats ?? {}, boosts: Array.isArray(wire.boosts) ? wire.boosts : [], retinue: Array.isArray(wire.retinue) ? wire.retinue : [], usedCards: Array.isArray(wire.usedCards) ? wire.usedCards : [] };
    const duel = d.duel !== undefined && d.duel !== null ? d.duel as DuelWire : undefined;
    const scenarioId = d.scenarioId as string;
    if (legacyKey) {
      // 迁移落新键：读到的瞬间就把进度搬到当前版本，旧键随即作废（A08 的另一半——
      // 只在 clearSave 里删旧键的话，玩家从没点过「放弃存档」就永远带着两本账）
      saveGame(scenarioId, state, duel);
      try { localStorage.removeItem(legacyKey); } catch { /* ignore */ }
    }
    return { version: SAVE_VERSION, scenarioId, state, duel, savedAt: d.savedAt as number };
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    // 审计 A08：连带删历史键，否则「放弃存档」后 loadGame 又从 v3 把同一份进度捞回来
    for (const k of LEGACY_SAVE_KEYS) localStorage.removeItem(k);
  } catch { /* ignore */ }
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
    const raw = JSON.parse(localStorage.getItem(GALLERY_KEY) ?? "[]");
    // 只留结构正确的条目：手改/半写入的 gallery 里混进 null 或非对象时，
    // 下游全是 g.scenarioId / g.endingName 的直接取值（结局计数、番外解锁、13 部全通成就）
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is GalleryEntry =>
      !!x && typeof x === "object" && isStr((x as GalleryEntry).scenarioId) && isStr((x as GalleryEntry).endingName));
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

// DEV-ONLY-999 ⚠ 本地预览临时值：ink 原本是 0，上线前必须改回 0（全局搜 "DEV-ONLY-999"）
const EMPIRE_DEFAULT: EmpireData = { ink: 999, grantedEnds: 0, warehouse: [], themes: [], theme: "", boosts: {}, brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {}, endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [] };

function readEmpire(): EmpireData {
  try {
    const raw = localStorage.getItem(EMPIRE_KEY);
    // DEV-ONLY-999 ⚠ 本地预览临时值，上线前连同上面那行一起删：
    // 浏览器里已存过 dicun_empire_v1 的话，存过的 ink 会盖掉 EMPIRE_DEFAULT，
    // 光改默认值看不到 999，所以这里再兜一次。
    const e = raw ? { ...EMPIRE_DEFAULT, ...(JSON.parse(raw) as Partial<EmpireData>) } : { ...EMPIRE_DEFAULT };
    e.ink = Math.max(e.ink, 999);
    return e;
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

/** M8（审计 P0-2）：购买前预检——满员且不在册则不该花这笔银 */
export function canAddRetinue(id: string): boolean {
  const e = settleEmpire();
  return e.retinue.includes(id) || e.retinue.length < 3;
}

/** M8（审计 P0-2）：随从卡出售后同步出册——银两收回去了，人不能再白留着 */
export function removeRetinue(id: string): void {
  const e = settleEmpire();
  const i = e.retinue.indexOf(id);
  if (i >= 0) {
    e.retinue.splice(i, 1);
    writeEmpire(e);
  }
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
