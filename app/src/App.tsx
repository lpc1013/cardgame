import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import type { Scenario, CardDef, DuelConfig } from "./engine/types";
import { initState, findScene, visibleChoices, applyEffects, registerScenarios, checkCond, resolveSceneLines, cloneRunState, type RunState } from "./engine/runtime";
import {
  type Phase, resolveScenePhase, availableActions, takeChoice, enterScene, lastRealLine,
  peaceApplies, peaceConsumedButDoomed, peaceSkipState, peaceConsumeOnly,
} from "./engine/transition";
import { initDuel, revealEmotion, EMOTION_YANLI_MAX, DEFAULT_AP, type DuelState } from "./engine/duel";
import { saveGame, loadGame, clearSave, consumeSaveRejectReason, unlockEnding, getGallery, recordTreeVisit, getTree, getCardSeen, settleEmpire, consumeBoosts, recordWarLoss, bumpCounter, getCounter, END_MILES, setTotalEnds, getTotalEnds, grantTitle, consumeSpareSilver, claimMile, getGlobalCard, INK_PER_ENDING, unsealScenario, UNSEAL_COST, getBonuses, unlockBonus } from "./engine/save";
import {  } from "./data/sceneSettings";
import { hasMap } from "./data/locations";
import { foundSpots, surveyLeft, surveyOf, type SurveySpot } from "./data/survey";
import { SHOP_THEMES } from "./data/empireShop";
import { ACHIEVEMENTS, checkDuelAchievements, checkMinigameAchievements, checkEndingAchievements } from "./data/achievements";
import { getAchievements, unlockAchievement } from "./engine/save";
import { bonusListOfScenario, isBonusUnlocked, bonusUnlockDesc } from "./data/bonus";
import { TreeView } from "./components/TreeView";
import { achArt, coverOf, coverThumbOf, endArt, narratorArt, sceneArt, sceneMotion } from "./ui/art";
import { AchSeal, IngotIcon } from "./ui/icons";
import { TCard } from "./ui/cards";
import { duelBoostsOf, allCardsFor, noteCards, luggageDefs, type PrepChoice } from "./ui/shared";
import { sfx } from "./engine/sfx";

import { SCENARIOS } from "./data/scenarios";
import { CASE_SCENARIOS } from "./data/narrators";
import { LocationMap } from "./ui/panels/LocationMap";
import { SurveyLayer } from "./ui/panels/SurveyLayer";
import { TopBar } from "./ui/panels/TopBar";
import { BagView } from "./ui/panels/BagView";
import { ShopView } from "./ui/panels/ShopView";
import { DuelView } from "./ui/panels/DuelView";
import { MiniGameView } from "./ui/panels/MiniGameView";
import { CardGallery } from "./ui/panels/CardGallery";
import { AlbumPanel } from "./ui/panels/Album";
import { AchievementsPanel } from "./ui/panels/AchievementsPanel";
import { EmporiumPanel, LuggagePanel } from "./ui/panels/Emporium";
import { GalleryPanel } from "./ui/panels/GalleryPanel";
import { SettingsPanel } from "./ui/panels/SettingsPanel";
import { PrepModal } from "./ui/panels/Prep";
import { ViewpointModal } from "./ui/panels/Viewpoint";
import "./app.css";
// 审计 A10：ui-audit.css（2026-08-27 那批补丁）已整体并入 app.css 末尾，
// "靠第二个文件后加载来覆盖前一个文件"这条跨文件顺序依赖取消；层叠结果与并入前逐字等价。

registerScenarios(SCENARIOS);
// 番外 dual 解锁判定：剧本各视角 → 归属结局名列表（ending.name）
function vpEndingsOf(scId: string): Record<string, string[]> {
  const sc = SCENARIOS.find((s) => s.id === scId);
  const m: Record<string, string[]> = {};
  for (const v of sc?.viewpoints ?? []) {
    m[v.id] = (v.endings ?? [])
      .map((eid) => sc?.scenes.find((s) => s.id === eid)?.ending?.name ?? "")
      .filter(Boolean);
  }
  return m;
}
// 结局进度分母动态注入：以数据实有结局场景数为准（A-3 防漂移）
setTotalEnds(SCENARIOS.reduce((n, s) => n + s.scenes.filter(x => x.ending).length, 0));

/** 浅/深模式持久化键（与 dicun_save_v4 解耦——它是显示偏好，不属于周目进度） */
const MODE_KEY = "dicun_mode_v1";
/** 对白档（视觉小说式）持久化键：开=一屏只留当前一段，关=长卷累积 */
const DLG_KEY = "dicun_dlg_v1";
/** 情绪制气力上限（B-2 成就按模式分流：emotion 局耗 qi 而非 hpPlayer；与 duel.ts 回气钳制/QiBar 显示一致） */
const EMOTION_QI_MAX = 10;
/** 对话演出：把「」/“”里的直接引语拆出来着暖色，与叙述文分开——
 *  台词是小说化第一人称（"我说：高。"），没有说话人字段，故只标引语不标人 */
function saidSpans(l: string): ReactNode {
  const parts = l.split(/([「“][^」”]*[」”])/g);
  if (parts.length === 1) return l;
  return parts.map((p, i) =>
    /^[「“]/.test(p) && /[」”]$/.test(p) ? <i key={i} className="said">{p}</i> : p);
}
/** 购买防抖（L-1）：600ms 内的重复购买点击直接吞掉，防止双击双扣费 */


/** M7（审计 P1-6）：藏牌局合同（与 DuelView 的 oppHidden 判定同口径）——战报须脱敏对手卡名 */
function duelHidesOpp(sc: Scenario, cfg: DuelConfig): boolean {
  if (cfg.mode !== "pressure") return false;
  const see = cfg.seeOpp ?? (sc.mode === "case" && (cfg.rules ?? "classic") === "v2" ? "hidden" : "open");
  return see === "hidden";
}

/** 链式解锁：首案自由；前案任一结局解锁即开下一案；已有进度/破封特批不受限 */
function scenarioUnlocked(
  idx: number,
  gallery: { scenarioId: string }[],
  tree: Record<string, string[]>,
  saveScenarioId: string | undefined,
  brokenSeals: string[],
): boolean {
  if (idx <= 0) return true;
  const s = SCENARIOS[idx];
  if (!s) return false;
  if ((tree[s.id]?.length ?? 0) > 0) return true;
  if (gallery.some((g) => g.scenarioId === s.id)) return true;
  if (saveScenarioId === s.id) return true;
  if (brokenSeals.includes(s.id)) return true;
  const prev = SCENARIOS[idx - 1];
  return prev ? gallery.some((g) => g.scenarioId === prev.id) : true;
}


/** W-3/F-8：退回上一幕快照——场景坐标 + 全量 RunState（flags 序列化为数组，恢复时重建 Set） */
type PrevScene = {
  scenarioId: string; sceneId: string; lineIndex: number;
  snapshot?: Omit<RunState, "flags"> & { flags: string[] };
};

/** 帝国开局加成 id 列表 → 对局引擎参数 */


/** Phase 已收进 engine/transition.ts——界面相位只由 resolveScenePhase 一处决定 */

export default function App() {
  const [phase, setPhase] = useState<Phase>("title");
  // L-4：移动端「书斋」聚合入口（行囊/图鉴/卡册/成就四面板共用一个按钮）
  const [showStudy, setShowStudy] = useState(false);
  const [sc, setSc] = useState<Scenario | null>(null);
  const [st, setSt] = useState<RunState | null>(null);
  const [duel, setDuel] = useState<DuelState | null>(null);
  // 博弈·押注层：仅对 gambit 局开放，胜得两倍、败失本金；对局结束即结算，换局清零
  const [wager, setWager] = useState(0);
  const [showClues, setShowClues] = useState(false);
  const [showBag, setShowBag] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [treeOf, setTreeOf] = useState<Scenario | null>(null);
  const [cardsOf, setCardsOf] = useState<Scenario | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [titleTick, setTitleTick] = useState(0);
  const [pickScene, setPickScene] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [empTick, setEmpTick] = useState(0);
  const [panel, setPanel] = useState<"shop" | "bag" | "gallery" | "album" | "achievements" | "settings" | null>(null);
  const [prepFor, setPrepFor] = useState<Scenario | null>(null);
  // 多视角剧本：先选视角，再进出征准备（vpId 传递到 start）
  const [vpFor, setVpFor] = useState<Scenario | null>(null);
  const [vpId, setVpId] = useState<string | undefined>(undefined);
  const [coverIdx, setCoverIdx] = useState(0);
  /** 对话演出：本批新揭示之前的 lineIndex（-1 = 刚进这一幕，整幕文字按序擦入） */
  const [revealFrom, setRevealFrom] = useState(-1);
  // 对白档：正文收进底部台词栏，一屏只留当前一段（视觉小说式）。默认开，可切回长卷
  const [dlg, setDlg] = useState<boolean>(() => { try { return localStorage.getItem(DLG_KEY) !== "0"; } catch { return true; } });
  const [showLog, setShowLog] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(DLG_KEY, dlg ? "1" : "0"); } catch { /* 隐私模式静默失败 */ }
  }, [dlg]);
  // 手机横屏悬浮胶囊（商市/书斋/规则书/设置+结局进度）展开态
  const [fabOpen, setFabOpen] = useState(false);
  const [coverZoom, setCoverZoom] = useState(false);
  const [bonusFor, setBonusFor] = useState<string | null>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 缩略图条自动跟随：当前选中项始终保持在可视区（隐藏滑轮，平滑滚动）
    const el = thumbsRef.current?.children[coverIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [coverIdx]);
  // 下一幕背景预加载：读段的几秒足够把 2560 的场景图拉完，翻页不再闪空白。
  // 放在组件顶部（phase 分支里有早退，hook 不准进条件）——按幕 id 记 deps，逐段揭示不重跑
  const sceneKey = sc && st ? `${sc.id}:${st.sceneId}` : "";
  useEffect(() => {
    if (!sceneKey || !sc || !st) return;
    const cur = findScene(sc, st.sceneId);
    if (!cur) return;
    const nexts = [cur.next, ...(cur.choices ?? []).map((c) => c.next)];
    for (const nid of nexts) {
      if (!nid) continue;
      const a = sceneArt(sc.id, nid);
      if (a) { const im = new Image(); im.src = a; }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);
  const empire = useMemo(() => settleEmpire(), [empTick, titleTick, phase]);

  useEffect(() => {
    // 老存档可能还穿着已下线的主题（朱砂/黛青/鎏金/青瓷/黛蓝/鎏金富贵）。
    // 对应 CSS 已删，照原样写进 dataset 会得到"穿着不存在的皮肤"：
    // 页面走默认配色，但商市里显示为已装备。这里按注册表白名单兜回默认。
    const known = empire.theme && SHOP_THEMES.some((t) => t.id === empire.theme);
    if (known) document.documentElement.dataset.theme = empire.theme;
    else delete document.documentElement.dataset.theme;
  }, [empire.theme]);

  // 浅/深模式：独立于墨铤解锁的主题，是基础偏好开关，默认浅（朝堂宣纸）
  const [mode, setMode] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem(MODE_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
  });
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* 隐私模式等场景静默失败 */ }
  }, [mode]);

  const closePanel = () => { setPanel(null); setEmpTick((t) => t + 1); };

  const cardDef = useCallback((id: string): CardDef | undefined => sc?.cards.find((c) => c.id === id), [sc]);

  // 对局状态写入唯一入口：任何一次 setDuel 同时递增修订号。
  // 审计 A05——自动存档原先手工枚举 duel?.round / ap / yanli / … 十几个字段做 deps，
  // 以后新增手牌、陷阱、战斗日志一类状态，忘补 deps 就是「状态变了、存档没更新」，
  // 而这条漏存只能靠刷新退款实测才看得见。修订号由写入方保证，与字段清单无关。
  const [duelRev, setDuelRev] = useState(0);
  const commitDuel = useCallback((d: DuelState | null) => {
    setDuel(d);
    setDuelRev((r) => r + 1);
  }, []);

  // 相位分派（唯一出口）：RunState 既定，这一屏落到哪个界面由 resolveScenePhase 一处决定。
  // 首次进入、读档、回退三条路径共用它——审计 A01 的根因正是三处各写了一份相似而不一致的分支
  // （回退那条最后无条件 setPhase("story")，把商市幕恢复成了没有选项、没有 next 的剧情屏）。
  const dispatchView = useCallback((scenario: Scenario, cur: RunState) => {
    const scene = findScene(scenario, cur.sceneId);
    const p = resolveScenePhase(scenario, scene);
    if (p !== "duel") {
      if (p === "pick") setPickScene(scene.id);
      setPhase(p);
      return;
    }
    const cfg = scenario.duels.find((d) => d.id === scene.duel)!;
    const loadout = scenario.cardSystem ? cur.deck : cfg.deck;
    const d = initDuel(cfg, loadout, allCardsFor(scenario, cur.deck), duelBoostsOf(cur.boosts));
    d.redactLog = duelHidesOpp(scenario, cfg);
    revealEmotion(d);
    commitDuel(d);
    setWager(0);
    setPhase("duel");
  }, [commitDuel]);

  // 核心状态转移：纯计算 next → 一次性 setSt；holdView 时相位延后由 dispatchView 分派（用于对局战果定格）
  const gotoFrom = useCallback(
    (baseIn: RunState, id: string, opts?: { autoRead?: boolean; holdView?: boolean }): void => {
      if (!sc) return;
      const target = findScene(sc, id);
      const cfg = target.duel ? sc.duels.find((d) => d.id === target.duel) : undefined;
      let base = baseIn;
      // W-4/F-3 和议之书：仅对本剧下一场「战争对局」免战（cfg.war 显式标记；审讯/对峙/宫变/截杀不算战争）
      if (peaceConsumedButDoomed(sc, base, cfg)) {
        // B-3：设计性死局（剧情杀）是叙事必需——和议之书在此无效，但照样消耗
        base = peaceConsumeOnly(base);
        setToast("项羽收了银子也不肯退兵——这仗躲不过。");
      } else if (peaceApplies(sc, base, cfg)) {
        // 和议生效：主声望类 stat 扣 3（无匹配键则跳过），该局奖励归零（结算侧天然跳过 + 结局奖励标记归零）。
        // F-3：归零旗标是随 RunState 走的通用标记——旧实现拼接 winScene 场景 id，winScene 非结局场景时
        // 旗标永不命中，7 处跳战点仅 1 处真正生效（sichou/shumian/changjiang/jianfeng 全部落空）。
        setToast("敌酋见银退兵——和议成了，仗没打。（威望有损 · 该局奖励归零）");
        // 走递归而不是就地分派：b_peace 已从状态里摘除，不会自环；上一幕快照由内层记录在「已花掉和议」的那一刻，
        // 玩家退回也不会把已经消耗的道具白退还回来。
        gotoFrom(peaceSkipState(sc, base), cfg!.winScene, opts);
        return;
      }
      // W-3：推进前存下当前相位快照（上一幕），供标题页「退回上一幕」恢复（每周目限 1 次）。
      // F-8：存全量 RunState（flags 序列化）——旧实现只存 sceneId+lineIndex，恢复时用 initState 全新状态重放，
      // 旗标/线索/银两/背包全清零，安全垫反而报废周目。
      // 审计 A02：快照必须与 base 断开引用，否则下一幕的效果会顺着共享的 Set/数组把这份快照一起改掉。
      prevSceneRef.current = {
        scenarioId: sc.id, sceneId: base.sceneId, lineIndex: base.lineIndex,
        snapshot: { ...cloneRunState(base), flags: Array.from(base.flags) },
      };
      try { sessionStorage.setItem("dicun_prev_v1", JSON.stringify(prevSceneRef.current)); } catch { /* 隐私模式等场景忽略 */ }
      recordTreeVisit(sc.id, id);
      const next = enterScene(base, target, { autoRead: opts?.autoRead });
      noteCards(sc, next.bag);
      setRevealFrom(-1);
      setShowLog(false);
      setShowMap(false);
      setShowSurvey(false);
      setSt(next);
      if (!opts?.holdView) dispatchView(sc, next);
    },
    [sc, dispatchView]
  );

  const goto = useCallback((id: string) => { if (st) gotoFrom(st, id); }, [st, gotoFrom]);

  // 最新 RunState 镜像（供延迟回调读取已推进状态）
  const stRef = useRef<RunState | null>(null);
  stRef.current = st;

  // W-3：退回上一幕安全垫——gotoFrom 推进前记录当前 sceneId+lineIndex+全量状态快照（F-8），双写内存 ref + sessionStorage
  const prevSceneRef = useRef<PrevScene | null>(null);

  // ---- 即时反馈层 ----
  // 此前所有回响都挤在一条 setToast 里，而 toast 只挂在故事屏那一个 return 上——
  // 结局结算、商市、翻牌、卷宗架里达成的成就，toast 被赋值了却根本没有渲染它的那棵树。
  // 这里拆成两层，并且每一层都自己带超时移除，不靠"下一条把它顶掉"：
  //  ① 中上方堆叠淡出：得到东西（线索入卷 / 卡入手）
  //  ② 右下角 Steam 式卡片：成就达成
  const [feed, setFeed] = useState<{ k: number; tag: string; cls: string; text: string }[]>([]);
  const [pops, setPops] = useState<{ k: number; id: string; name: string; reward: string }[]>([]);
  const fxSeq = useRef(0);
  const pushFeed = (tag: string, cls: string, text: string) => {
    const k = ++fxSeq.current;
    // 同屏上限按条高倒推（细条放四条），最旧的先走
    setFeed((f) => [...f.slice(-3), { k, tag, cls, text }]);
    window.setTimeout(() => setFeed((f) => f.filter((x) => x.k !== k)), 3200);
  };
  const pushAch = (id: string, name: string, reward: string) => {
    const k = ++fxSeq.current;
    setPops((p) => [...p.slice(-2), { k, id, name, reward }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.k !== k)), 5200);
  };
  // 差额触发，不在每个发奖点逐个点名——否则以后新增的发奖处必然漏
  const fxPrev = useRef<{ clues: string[]; bag: string[]; silver: number; stats: Record<string, number> } | null>(null);
  const fxScen = useRef<string | null>(null);
  useEffect(() => {
    if (!sc) return;
    const snap = () => {
      fxPrev.current = { clues: [...(st?.clues ?? [])], bag: [...(st?.bag ?? [])],
        silver: st?.silver ?? 0, stats: { ...(st?.stats ?? {}) } };
    };
    // 首次/换剧本：静默记下基线，不弹（读一个有 9 条线索的档进来会一次吐 9 条）。
    // 重置必须和记账在同一个 effect 里、且在同一趟内完成——原先拆成两个 effect，
    // 声明在后的重置会把前一个刚种好的基线清空，于是进档后的第一次获得被当成"基线"吞掉
    // （实测：选项把帝心 50→55，条子一条不出）。
    if (fxScen.current !== sc.id || !fxPrev.current) {
      fxScen.current = sc.id;
      snap();
      return;
    }
    const prev = fxPrev.current;
    for (const cid of st?.clues ?? []) {
      if (prev.clues.includes(cid)) continue;
      const c = sc.clues?.find((x) => x.id === cid);
      if (c) pushFeed("证", "fd-clue", `此证入卷 · ${c.name}`);
    }
    for (const bid of st?.bag ?? []) {
      if (prev.bag.includes(bid)) continue;
      const c = sc.cards.find((x) => x.id === bid) ?? getGlobalCard(bid);
      if (c) pushFeed("卡", `fd-card r-${c.rarity ?? "凡"}`, `新卡入手 · ${c.name}`);
    }
    const dSilver = (st?.silver ?? 0) - prev.silver;
    if (dSilver !== 0) pushFeed("银", "fd-silver", dSilver > 0 ? `银两 +${dSilver}` : `银两 ${dSilver}`);
    // 名望类数值只报涨的那一项：跌的时候剧情多半正在挨打，再补一条红字只是吵。
    // 且只认剧本声明过的 stat——revisit_left 这类账目计数也在 stats 里，弹出来会是天书
    for (const [k, v] of Object.entries(st?.stats ?? {})) {
      const def = sc.stats?.find((s) => s.key === k);
      const d = v - (prev.stats[k] ?? 0);
      if (def && d > 0) pushFeed("望", "fd-stat", `${def.name} +${d}`);
    }
    snap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, sc]);

  // toast 原先只挂在故事屏那一棵 return 上：牌桌、卷宗架、商市、结案、结局里赋的 toast
  // 全都没有渲染它的地方（十余处调用点静默）。挪进反馈层，七个界面一次接住。
  const feedback = (
    <>
      <div className="fx-feed" aria-live="polite">
        {feed.map((f) => (
          <div key={f.k} className={`fx-line ${f.cls}`}><span className="fx-tag">{f.tag}</span>{f.text}</div>
        ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
      <div className="fx-ach" aria-live="polite">
        {pops.map((p) => {
          const a = ACHIEVEMENTS.find((x) => x.id === p.id);
          const art = achArt(p.id);
          return (
            <div key={p.k} className="fx-ach-card">
              <span className="fx-ach-icon">{art ? <img src={art} alt="" /> : <AchSeal on hidden={!!a?.hidden} />}</span>
              <span className="fx-ach-body">
                <span className="fx-ach-kicker">成就达成</span>
                <span className="fx-ach-name">{p.name}</span>
                <span className="fx-ach-reward">{p.reward}</span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );

  // 成就解锁统一入口：记录 + 右下角成就卡 + 称号授予（奖励含「称号」时）
  const grantAch = (id: string, owned: Set<string>) => {
    if (owned.has(id)) return;
    owned.add(id);
    unlockAchievement(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    pushAch(id, a.name, a.reward);
    const m = a.reward.match(/称号「(.+?)」/);
    if (m) grantTitle(m[1]!);
  };

  // 对局结束 → 即刻推进至结算场景并存档（消除 1.6s 窗口期关页重打的竞态），战果文案定格至延迟结束后再切相位；押注同步结算入账
  useEffect(() => {
    if (duel?.finished && sc && st) {
      // M7（审计 P1-8）：unwinnable 剧情杀兜底——穷举/数值失准被打赢时，结算一律按败局走（胜也吞胜线不兑现），防死局标记腐烂变现
      const finAs: "win" | "lose" = duel.cfg.unwinnable && duel.finished === "win" ? "lose" : duel.finished;
      if (finAs !== duel.finished) setToast("天命难违——这一局，本就不许你赢。");
      // 对局成就（仅胜局判定）：卡组构成 / 行为（跨局计数）
      if (finAs === "win") {
        const owned = new Set(getAchievements());
        const rarityOf = (id: string) => allCardsFor(sc, st.deck).find((c) => c.id === id)?.rarity;
        const suitOf = (id: string) => allCardsFor(sc, st.deck).find((c) => c.id === id)?.suit;
        const layerOf = (id: string) => allCardsFor(sc, st.deck).find((c) => c.id === id)?.layer;
        // B-2：情绪制全程消耗 qi 而非 hpPlayer（hpPlayer/hpMax 恒等于开局值，会让「毫发无伤」恒真）——
        // 按模式分流：emotion 用 qi / 上限 qiMax（M7：含人物/备战加成，旧写死 10 让 10/12 也判满气）；pressure 用 hpPlayer/hpMax
        const achHpPlayer = duel.mode === "emotion" ? duel.qi : duel.hpPlayer;
        const achHpMax = duel.mode === "emotion" ? (duel.qiMax ?? EMOTION_QI_MAX) : duel.hpMax;
        const got = checkDuelAchievements({
          deck: st.deck,
          rarityOf,
          suitOf,
          layerOf,
          hpPlayer: achHpPlayer,
          hpMax: achHpMax,
          round: duel.round,
          retinueCount: st.retinue?.length ?? 0,
          duelId: duel.cfg.id,
          // F-7：卡组构成/形态成就仅 v2 卡牌剧本参与——classic 剧本 deck=剧本全卡集，非玩家编组
          v2: !!sc.cardSystem,
          // F-4：裸卡组（白手起家）——编组全部来自本剧初始卡，无任何外带/随从/奖励卡
          bareDeck: !!sc.cardSystem && st.deck.length > 0 && (() => {
            const init = initState(sc, st.viewpoint);
            return st.deck.every((id) => init.bag.includes(id));
          })(),
        }, owned);
        for (const id of got) grantAch(id, owned);
        // 跨局计数成就：胜局 / classic 胜 / 刺探 / 收买 / 陷阱触发 / 蓄势 / 破招
        const wins = bumpCounter("wins");
        const classicWins = duel.rules === "classic" ? bumpCounter("classic_wins") : getCounter("classic_wins");
        const behavior: [string, boolean][] = [
          ["win_20", wins >= 20],
          ["classic_5", classicWins >= 5],
          ["scout_win", getCounter("scouts") >= 1],
          ["insider_win", getCounter("insiders") >= 1],
          // F-7：陷阱大师按「陷阱触发」计（盖放 ≠ 触发），文案与实现同口径
          ["trap_kill", getCounter("trap_triggers") >= 1],
          ["charge_master", getCounter("charges") >= 5],
          ["break_ten", getCounter("breaks") >= 10],
        ];
        for (const [aid, cond] of behavior) if (cond) grantAch(aid, owned);
      }
      // 战争局失败：记录（解锁「岁币之约」购买）；劫与烬（北京保卫战）为唯一战争剧本，虽败亦不求和，但记录仍用于商市解锁判定
      if (finAs === "lose" && sc.id === "jieyu") recordWarLoss(sc.id);
      // 番外解锁：cards 型番外——携带本剧本番外钥匙卡（≥need 张）赢下对局 → 解锁（幂等）
      const noWinRoute = sc.duels.length > 0 && sc.duels.every((d) => d.unwinnable);
      for (const b of bonusListOfScenario(sc.id).filter((x) => x.unlock !== "ending" && x.unlock !== "dual")) {
        const hits = (b.keyCards ?? []).filter((k) => new Set(duel.cfg.deck).has(k)).length;
        const hitOk = finAs === "win" && (noWinRoute || hits >= (b.need ?? 2));
        const loseOk = noWinRoute && finAs === "lose";
        if (hitOk || loseOk) {
          if (unlockBonus(b.id)) setToast(`番外解锁：「${b.title}」——去剧本封面展阅。`);
        }
      }
      const target = finAs === "win" ? duel.cfg.winScene : duel.cfg.loseScene;
      // 押注结算（M1 风控，审计 4.3）：胜 1.6 倍、败失本金；每周目限 3 次——
      // 旧「两倍+无限次」在对局确定可胜的前提下是无风险双倍返（审计 W-1 同类经济裂缝）
      // M7（审计 P2）：wager 先落账再判 loseScene2 用同一份 base，条件败线的资源判定与转移不再两张皮
      let base = st;
      if (wager > 0) {
        const gain = finAs === "win" ? Math.round(wager * 1.6) : -wager;
        base = { ...st, silver: Math.max(0, st.silver + gain), wagers: (st.wagers ?? 0) + 1 };
        setToast(finAs === "win" ? `押注得手：本金 ${wager} 两，连彩头入账 ${Math.round(wager * 1.6)} 两` : `押注失手，${wager} 两银子打了水漂`);
        setWager(0);
      }
      const target2 = finAs === "lose" && duel.cfg.loseScene2 && checkCond(duel.cfg.loseScene2.cond, base)
        ? duel.cfg.loseScene2.scene
        : target;
      // 剧本级 usedCards：本剧进过 deck 的卡并入（弱卡点名成就判定依据；与上面的 base 副本合并）
      base = { ...base, usedCards: [...new Set([...(base.usedCards ?? []), ...base.deck])] };
      gotoFrom(base, target2, { holdView: true });
      const t = setTimeout(() => {
        commitDuel(null);
        if (stRef.current) dispatchView(sc, stRef.current);
      }, 1600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在 finished 置位时结算一次，避免 st 变更引发二次结算（效果重复生效）
  }, [duel?.finished]);

  // 翻牌/市集完成后继续
  const afterPick = (chosenId: string) => {
    if (!sc || !st || !pickScene) return;
    const scene = findScene(sc, pickScene);
    const def = cardDef(chosenId);
    // 资源卡直接折银（与 applyEffects 的 F-6 口径一致），非资源走同一条 unlockCard 效果。
    // 审计 A02：状态一律由纯函数产出新对象，不在 st 的浅拷贝上就地加银。
    const next = def?.resource
      ? { ...cloneRunState(st), silver: st.silver + def.resource }
      : applyEffects([{ unlockCard: chosenId }], st);
    setToast(def?.resource ? `资源卡「${def.name}」入袋 +${def.resource} 两` : `获得卡牌「${def?.name ?? chosenId}」`);
    sfx.clue();
    noteCards(sc, next.bag);
    setSt(next);
    setPickScene(null);
    gotoFrom(next, scene.cardPick!.next);
  };

  const afterShop = (mutated: RunState) => {
    if (!sc) return;
    const scene = findScene(sc, mutated.sceneId);
    setSt(mutated);
    gotoFrom(mutated, scene.next2 ?? scene.next ?? "", { autoRead: true });
  };

  const start = (scenario: Scenario, prep?: PrepChoice, viewpointId?: string) => {
    setSc(scenario);
    // W-3：新周目重置「退回上一幕」使用配额
    try { sessionStorage.removeItem("dicun_prev_used_v1"); } catch { /* ignore */ }
    const s = initState(scenario, viewpointId);
    if (prep?.boosts.length) {
      s.boosts = consumeBoosts(prep.boosts);
      if (s.boosts.includes("b_silver")) s.silver += 10;
    }
    // 和议之书：本剧下一场战争对局免战（奖励归零，威望有损）
    if (prep?.peaceDeal && scenario.id !== "jieyu") s.boosts.push("b_peace");
    // 银两储备：商市墨铤兑换，出征注入剧本（消耗制）
    s.silver += consumeSpareSilver();
    if (scenario.cardSystem && prep?.carry.length) {
      for (const id of prep.carry) {
        if (!s.bag.includes(id)) s.bag.push(id);
        if (!s.deck.includes(id) && s.deck.length < (scenario.deckLimit ?? 12)) s.deck.push(id);
      }
    }
    // 随从：进 deck 场外生效（人物卡不进牌库），classic/v2 均解析被动
    if (prep?.retinue.length) {
      s.retinue = [...prep.retinue];
      for (const id of prep.retinue) {
        if (!s.bag.includes(id)) s.bag.push(id);
        if (!s.deck.includes(id) && s.deck.length < (scenario.deckLimit ?? 12)) s.deck.push(id);
      }
    }
    // 结局奖励卡：跨剧本带进卡组（不占随身位）
    if (prep?.deckBonus.length) {
      for (const id of prep.deckBonus) {
        if (!s.bag.includes(id)) s.bag.push(id);
        if (!s.deck.includes(id) && s.deck.length < (scenario.deckLimit ?? 12)) s.deck.push(id);
      }
    }
    const scene = findScene(scenario, s.sceneId);
    const s0 = applyEffects(scene.effects, s);
    recordTreeVisit(scenario.id, s.sceneId);
    noteCards(scenario, s0.bag);
    setSt(s0);
    // 审计 A01：开局幕同样要过相位分派——起手幕若是对局/市集/翻牌，无条件进 story 会落成一屏死字
    dispatchView(scenario, s0);
  };

  // 单击全推：空行「""」只是段间排版分隔，不单独占一次推进——
  // 一次空格/点击直接亮出整段（推到下个空行为止），杜绝「按一下没反应、再按才出下段」
  // 审计 A06：「屏上提示能继续」与「点下去到底走不走」必须同源。原先渲染按可见选项数、
  // advance 按 scene.choices 原始长度判定——选项全被 cond 挡掉的幕就成了「提示亮着、点了没反应」。
  const advance = () => {
    if (!sc || !st) return;
    const scene = findScene(sc, st.sceneId);
    const act = availableActions(sc, scene, st, dlg);
    if (act.kind === "lines") {
      sfx.page();
      setRevealFrom(st.lineIndex);
      setSt({ ...st, lineIndex: act.to });
    } else if (act.kind === "next") {
      sfx.page();
      goto(act.sceneId);
    }
  };

  const choose = (i: number) => {
    if (!sc || !st) return;
    // 审计 A03：分支判定与效果结算的先后由 takeChoice 一处定死——cond 按「做选择之前」的状态算，
    // 门槛不够的选项不能靠自己的扣费/加属性把自己变成满足（真结局硬门槛尤其吃这一条）。
    const got = takeChoice(st, findScene(sc, st.sceneId), i);
    if (!got) return;
    sfx.choice();
    gotoFrom(got.next, got.targetSceneId);
  };

  const doVerdict = () => {
    if (!sc?.verdict || !st) return;
    const v = sc.verdict;
    const hasCore = picked.includes(v.coreClue);
    const trueCount = picked.filter((id) => sc.clues?.find((c) => c.id === id && c.kind === "true")).length;
    // 拣不满 mustPick 一律走败线：证据不足却靠"恰好抽中核心+真线索"翻盘，
    // 等于把 mustPick 这个门槛变成摆设——它现在也必须能点得动（见 verdict 屏的 need）
    const full = picked.length === v.mustPick;
    goto(full && hasCore && trueCount >= v.minTrue ? v.winScene : v.loseScene);
    setPicked([]);
  };

  // 存档写入口径（唯一）：对局未终则连对局一并存。自动存档与市集即时落账共用此函数，两处格式不许多套一套
  const saveRun = (state: RunState, d: DuelState | null) => {
    if (!sc || phase === "title" || phase === "ending") return;
    if (d) {
      const { cfg, ...rest } = d;
      if (!rest.finished) saveGame(sc.id, state, { cfgId: cfg.id, data: rest, wager });
      else saveGame(sc.id, state);
    } else saveGame(sc.id, state);
  };

  // 自动存档
  useEffect(() => {
    if (st) saveRun(st, duel);
    // 审计 A05：deps 原先手工枚举 duel?.round / ap / yanli / charge / … 十几个字段
    // （M7 那轮补过一批漏存的），字段清单本身才是根因——以后新增手牌、陷阱、战斗日志一类状态，
    // 忘补 deps 就是「状态变了、存档没落盘」，而它只会以「刷新把这一手白送」的形式被测出来。
    // 现在改由写入方递增的 duelRev 驱动：commitDuel 每调一次必存一次，与字段多少无关。
    // deps 不入 saveRun/duel 对象标识——入表等于每帧重写一次 localStorage，
    // oxlint 的 exhaustive-deps 提示在此为有意为之（同 gotoFrom 处的处理）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, phase, duelRev, duel?.finished, wager]);

  // 结局入图鉴 + 清档
  useEffect(() => {
    if (phase === "ending" && sc && st) {
      const s = findScene(sc, st.sceneId);
      if (s.ending) {
        // W-4：和议之书跳战的那局胜线——奖励归零（图鉴/墨铤/结局卡/结局成就全跳过），仅走叙事。
        // F-3：通用旗标随 RunState 走（本局战争被买断，本局结局不产奖励——一周目仅一个结局，无跨局误伤）。
        const peaceSkipped = st.flags.has("b_peace_skip");
        if (!peaceSkipped) {
          unlockEnding({ scenarioId: sc.id, endingName: s.ending.name, rank: s.ending.rank });
          // 结局奖励卡：唯一出处，获得后记图鉴 + 注册全局（跨周目可携带）
          if (s.ending.reward) noteCards(sc, [s.ending.reward]);
          // 结局成就
          const owned = new Set(getAchievements());
          const all = getGallery();
          const endsOf = (sid: string) => all.filter((g) => g.scenarioId === sid).length;
          const caseIds = ["fuma", "qiuwei", "sichou", "xie", "qinhuai"];
          const storyIds = ["jieyu", "shumian", "changjiang", "diaolan", "changhen", "jianfeng", "xingxing", "touming"];
          const got = checkEndingAchievements({
            scenarioId: sc.id,
            endingName: s.ending.name,
            usedCards: st.usedCards ?? [],
            silver: st.silver,
            stats: st.stats ?? {},
            caseEndsDone: caseIds.filter((cid) => endsOf(cid) > 0).length,
            storyEndsDone: storyIds.filter((sid) => endsOf(sid) > 0).length,
            // F-4：补齐此前无钩子的收集类成就——卡册达成率 / 行囊件数 / 13 部全通
            albumRatio: (() => {
              const seen = getCardSeen();
              let total = 0, gotN = 0;
              for (const s2 of SCENARIOS) for (const c of s2.cards) {
                if ((c.layer ?? "成术") === "资源") continue;
                total++;
                if ((seen[s2.id] ?? []).includes(c.id)) gotN++;
              }
              return total ? gotN / total : 0;
            })(),
            luggageCount: luggageDefs().length,
            allScenariosDone: SCENARIOS.every((s2) => all.some((g) => g.scenarioId === s2.id)),
          }, owned);
          for (const id of got) grantAch(id, owned);
        }
        sfx.ending();
        clearSave();
      }
    }
  }, [phase]);

  // 键盘
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === "story") rootRef.current?.focus();
  }, [phase, st?.sceneId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (phase !== "story" || showClues || showBag) return;
    if (!sc || !st) return;
    // 键盘与点击走同一个动作出口（审计 A06）：幕末有没有可见选项由 availableActions 判定，
    // 不再各自用「lines.length - 1」估——幕尾挂空行时那个估计会差一格。
    const act = availableActions(sc, findScene(sc, st.sceneId), st, dlg);
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      advance();
    } else if (/^Digit[1-9]$/.test(e.code) && act.kind === "choices") {
      choose(Number(e.code.slice(5)) - 1);
    }
  };

  // 正文自动滚到最新段
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 999999, behavior: "smooth" });
  }, [st?.sceneId, st?.lineIndex, phase]);

  // toast 自动消隐
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // 审计 A04：坏档不能只是「静默变成没存档」。loadGame 在校验失败时已把原文挪进
  // dicun_save_bad_v4 并从存档位摘掉（进度没被销毁，也没被带着脏数据放进游戏），
  // 这里补上玩家看得见的那半句——否则他只会以为游戏弄丢了进度。
  useEffect(() => {
    const reason = consumeSaveRejectReason();
    if (reason) setToast(`存档数据异常，已拒绝载入并备份（${reason}）`);
  }, [titleTick, phase]);

  const resume = () => {
    const save = loadGame();
    if (!save) { setTitleTick((t) => t + 1); return; }
    // C-6：高版本存档（更新版本生成，字段/玩法未知）——拒绝载入且不清档，玩家可自行处理
    if ((save as { future?: boolean }).future) {
      setToast("此存档来自更新版本，已拒绝载入");
      setTitleTick((t) => t + 1);
      return;
    }
    const scenario = SCENARIOS.find((s) => s.id === save.scenarioId);
    if (!scenario || !scenario.scenes.some((s) => s.id === save.state.sceneId)) {
      clearSave();
      setTitleTick((t) => t + 1);
      return;
    }
    setSc(scenario);
    // v2 剧本 + 旧版存档：补齐 bag/deck/silver 字段
    const state = { ...save.state };
    if (scenario.cardSystem) {
      const init = initState(scenario);
      state.bag = state.bag ?? init.bag;
      state.deck = state.deck ?? init.deck;
      state.silver = state.silver ?? init.silver;
    }
    state.retinue = state.retinue ?? [];
    setSt(state);
    if (save.duel) {
      const baseCfg = scenario.duels.find((d) => d.id === save.duel!.cfgId);
      if (baseCfg) {
        // B-1：带变体对局读档——用存档里的 variantScript 回填剧本基础 cfg.script，
        // 防止回档后 opponent 出牌序被剧本默认 script 偷换（字段不存在则走原 cfg）
        const savedVariant = (save.duel!.data as unknown as { variantScript?: string[] }).variantScript;
        const cfg = savedVariant?.length ? { ...baseCfg, script: savedVariant } : baseCfg;
        // 旧档兼容：博弈字段（charge/foresuit/opponentTrue/bluffed/trap）+ 随从字段（scoutLeft/insiderLeft/...）缺省补全（展开后兜底写回）
        const d: DuelState = { ...save.duel.data, cfg, charge: save.duel.data.charge ?? 0, foresuit: save.duel.data.foresuit ?? null, opponentTrue: save.duel.data.opponentTrue ?? null, bluffed: save.duel.data.bluffed ?? false, trap: save.duel.data.trap ?? null, scoutLeft: save.duel.data.scoutLeft ?? 0, insiderLeft: save.duel.data.insiderLeft ?? 0, sharedUsed: save.duel.data.sharedUsed ?? 0, sharedTotal: save.duel.data.sharedTotal ?? 0, insiderActive: save.duel.data.insiderActive ?? false, retinueNames: save.duel.data.retinueNames ?? [],
          // M7（审计 P1-7）：C-1 分桶与 v2 字段兜底——旧实现漏 these，老档 passives 缺失直接 TypeError、独立随从次数丢失
          indScoutLeft: save.duel.data.indScoutLeft ?? 0, indInsiderLeft: save.duel.data.indInsiderLeft ?? 0,
          passives: save.duel.data.passives ?? [], seeNext: save.duel.data.seeNext ?? "none",
          playerLeadSuits: save.duel.data.playerLeadSuits ?? [], hand: save.duel.data.hand ?? [], library: save.duel.data.library ?? [], discard: save.duel.data.discard ?? [], usedCards: save.duel.data.usedCards ?? [],
          ap: save.duel.data.ap ?? DEFAULT_AP, baseAp: save.duel.data.baseAp ?? DEFAULT_AP
        };
        // M7：情绪局旧档缺言力字段——补回预算（7），而非让引擎 typeof 守卫静默解除出牌上限
        if (d.mode === "emotion" && (typeof d.yanli !== "number" || typeof d.yanliMax !== "number")) {
          d.yanli = EMOTION_YANLI_MAX; d.yanliMax = EMOTION_YANLI_MAX;
        }
        // M7：phase 与 oppIntent 不一致（跨版本档/手改档）→ 自愈回我方主阶段，防「应手永假」死锁
        if ((d.turnSchema ?? "legacy") === "phased" && d.phase === "oppTurn" && (d.oppIntent?.kind !== "attack" || !d.oppIntent.cardId)) {
          d.phase = "pMain"; d.oppIntent = null;
        }
        d.redactLog = duelHidesOpp(scenario, cfg);
        if (d.mode === "emotion" && !d.opponentShown && !d.finished) revealEmotion(d);
        commitDuel(d);
        setWager(save.duel.wager ?? 0);
        setPhase("duel");
        return;
      }
    }
    // 审计 A01：读档尾部的相位分派与「首次进入 / 回退」同源——对局幕但存档里没带对局状态时，
    // dispatchView 会重新开局（局面不入档，残局从头再打，与 F-1 小游戏同一口径）。
    dispatchView(scenario, state);
  };

  // W-3：退回上一幕——读 sessionStorage（内存 ref 兜底）恢复上一场景相位，每周目限 1 次，恢复后清存储。
  // F-8：优先回放全量 RunState 快照（旗标/线索/银两/背包原样保留）；旧格式快照（无 snapshot 字段）回退 initState 重放。
  const restorePrev = () => {
    try {
      const raw = sessionStorage.getItem("dicun_prev_v1");
      const prev = raw ? (JSON.parse(raw) as PrevScene) : prevSceneRef.current;
      if (!prev || !prev.sceneId) { setToast("没有可退回的上一幕。"); return; }
      if (sessionStorage.getItem("dicun_prev_used_v1") === "1") { setToast("本局已用过「退回上一幕」。（每周目限 1 次）"); return; }
      const scenario = SCENARIOS.find((s) => s.id === prev.scenarioId);
      if (!scenario || !scenario.scenes.some((s) => s.id === prev.sceneId)) { setToast("退回位置已失效。"); return; }
      sessionStorage.setItem("dicun_prev_used_v1", "1");
      sessionStorage.removeItem("dicun_prev_v1");
      setSc(scenario);
      let s: RunState = initState(scenario);
      if (prev.snapshot && Array.isArray(prev.snapshot.flags)) {
        // 反序列化出来的内层集合本就是新对象，仍统一过 cloneRunState：与 initState 兜底那条分支同形，
        // 回退后拿到的状态不会和 prevSceneRef 里那份快照共用引用（审计 A02）
        s = cloneRunState({ ...(prev.snapshot as unknown as RunState), flags: new Set(prev.snapshot.flags) });
      }
      const target = findScene(scenario, prev.sceneId);
      s.sceneId = prev.sceneId;
      s.lineIndex = Math.max(0, Math.min(prev.lineIndex, lastRealLine(resolveSceneLines(target, s))));
      noteCards(scenario, s.bag);
      setSt(s);
      // 审计 A01：这一行是本轮最高优先级缺陷的正身——旧代码此处无条件 setPhase("story")，
      // 于是「夜市」这类商店幕被恢复成没有选项、没有 next 的剧情死屏。相位一律交 resolveScenePhase。
      dispatchView(scenario, s);
      setToast("已退回上一幕。");
    } catch {
      setToast("退回上一幕失败。");
    }
  };

  // ---------- 标题页（封面轮播 + 顶栏商市/行囊/图鉴/规则/设置） ----------
  if (phase === "title") {
    const save = loadGame();
    const gallery = getGallery();
    void titleTick;
    const cur = SCENARIOS[coverIdx % SCENARIOS.length]!;
    const curEnds = gallery.filter((g) => g.scenarioId === cur.id);
    const curTotalEnds = cur.scenes.filter((x) => x.ending).length;
    const curTree = getTree()[cur.id] ?? [];
    const unlocked = scenarioUnlocked(coverIdx % SCENARIOS.length, gallery, getTree(), save?.scenarioId, empire.brokenSeals);
    const prevSc = coverIdx > 0 ? SCENARIOS[coverIdx - 1] : null;
    const totalEnds = getTotalEnds();
    const mileClaimable = END_MILES.some(
      (m, i) => gallery.length >= Math.ceil(totalEnds * m.pct) && i >= empire.endMile,
    );
    // 结局进度条 JSX 复用：PC 左下角常驻一份，手机横屏在悬浮胶囊面板内再渲染一份（CSS 各显其一）
    const progressBar = (
      <div className="end-progress" title="结局进度：每解锁一结局 +20 墨铤；里程碑达标后可点击领取">
        <span className="end-progress-label">结局 <b>{gallery.length}</b>/{totalEnds}</span>
        <div className="end-progress-track">
          <div className="end-progress-fill" style={{ width: `${Math.min(100, (gallery.length / totalEnds) * 100)}%` }} />
          {END_MILES.map((m, i) => {
            const reached = gallery.length >= Math.ceil(totalEnds * m.pct);
            const claimed = i < empire.endMile;
            return (
              <button
                key={m.pct}
                className={`end-progress-mile ${reached ? "got" : ""} ${claimed ? "claimed" : ""} ${!reached ? "locked" : ""}`}
                style={{ left: `${m.pct * 100}%` }}
                title={claimed ? `已领取（${Math.round(m.pct * 100)}% · +${m.ink} 墨铤）` : reached ? `领取 ${m.ink} 墨铤（${Math.round(m.pct * 100)}%）` : `解锁 ${Math.round(m.pct * 100)}% 结局后领取 +${m.ink} 墨铤`}
                disabled={!reached || claimed}
                onClick={() => {
                  if (claimMile()) {
                    sfx.coin();
                    setToast(`里程碑达成 · 领取 ${m.ink} 墨铤`);
                    setEmpTick((t) => t + 1);
                  }
                }}
              >
                {claimed ? "✓" : reached ? "🎁" : ""}
              </button>
            );
          })}
        </div>
      </div>
    );
    return (
      <div className="title-screen title-v2">
        {feedback}
        <nav className="title-nav">
          <span className="seal-badge nav-seal" aria-hidden="true">帝</span>
          <span className="nav-logo">帝成观止</span>
          <span className="ink-chip" title={`每解锁一个结局奖励 ${INK_PER_ENDING} 墨铤`}><IngotIcon /> 墨铤 {empire.ink}</span>
          <div className="nav-btns">
            <button onClick={() => { sfx.choice(); setPanel("shop"); }}>商市</button>
            <button className="nav-book" onClick={() => { sfx.choice(); setShowStudy(true); }}>书斋</button>
            <span className="nav-assets">
              <button onClick={() => { sfx.choice(); setPanel("bag"); }}>行囊</button>
              <button onClick={() => { sfx.choice(); setPanel("gallery"); }}>图鉴</button>
              <button onClick={() => { sfx.choice(); setPanel("album"); }}>卡册</button>
              <button onClick={() => { sfx.choice(); setPanel("achievements"); }}>成就</button>
            </span>
            <span className="nav-sep" aria-hidden="true" />
            <button onClick={() => { sfx.choice(); setShowGuide(true); }}>规则书</button>
            <button onClick={() => { sfx.choice(); setMode((m) => (m === "light" ? "dark" : "light")); }}>
              {mode === "light" ? "转墨" : "还宣"}
            </button>
            <button onClick={() => { sfx.choice(); setPanel("settings"); }}>设置</button>
          </div>
        </nav>
        {showStudy && (
          <div className="study-overlay" onClick={() => setShowStudy(false)}>
            <div className="study-sheet" onClick={(ev) => ev.stopPropagation()}>
              <h3>书 斋</h3>
              <button className="study-item" onClick={() => { sfx.choice(); setShowStudy(false); setPanel("bag"); }}>行 囊</button>
              <button className="study-item" onClick={() => { sfx.choice(); setShowStudy(false); setPanel("gallery"); }}>图 鉴</button>
              <button className="study-item" onClick={() => { sfx.choice(); setShowStudy(false); setPanel("album"); }}>卡 册</button>
              <button className="study-item" onClick={() => { sfx.choice(); setShowStudy(false); setPanel("achievements"); }}>成 就</button>
            </div>
          </div>
        )}
        {save && (
          <div className="resume-box resume-inline">
            <button className="btn-main" onClick={resume}>
              继续上次 · {SCENARIOS.find((s) => s.id === save.scenarioId)?.title ?? save.scenarioId}
            </button>
            {/* L-5：标题页「放弃存档」不再直接删除——统一走设置面板的两段式确认（幽灵按钮→反悔/延迟确定） */}
            <button className="link-btn" onClick={() => { sfx.choice(); setPanel("settings"); }}>放弃存档</button>
          </div>
        )}
        {/* W-3：退回上一幕安全垫——低调入口，每周目限 1 次（PC 显示；手机横屏收进胶囊面板） */}
        <button className="link-btn fix-prev-ghost" onClick={() => { sfx.choice(); restorePrev(); }}>退回上一幕</button>
        {/* 手机横屏悬浮入口：继续上次 + 墨铤胶囊（点开下拉面板：商市/书斋/规则书/设置/退回上一幕/结局进度）；PC 隐藏走顶栏 */}
        <div className="fab-row">
          {save && (
            <button className="btn-main fab-resume" onClick={resume}>
              继续上次 · {SCENARIOS.find((s) => s.id === save.scenarioId)?.title ?? save.scenarioId}
            </button>
          )}
          <button
            className={`fab-capsule ${mileClaimable ? "has-claim" : ""}`}
            onClick={() => { sfx.choice(); setFabOpen((v) => !v); }}
          >
            <IngotIcon /> {empire.ink}
            <span className="fab-burger">☰</span>
            {mileClaimable && <span className="fab-dot" />}
          </button>
          {fabOpen && (
            <>
              <div className="fab-backdrop" onClick={() => setFabOpen(false)} />
              <div className="fab-panel">
                <div className="fab-panel-head">帝成观止</div>
                <div className="fab-grid">
                  <button onClick={() => { sfx.choice(); setPanel("shop"); setFabOpen(false); }}>商市</button>
                  <button onClick={() => { sfx.choice(); setFabOpen(false); setShowStudy(true); }}>书斋</button>
                  <button onClick={() => { sfx.choice(); setShowGuide(true); setFabOpen(false); }}>规则书</button>
                  <button onClick={() => { sfx.choice(); setPanel("settings"); setFabOpen(false); }}>设置</button>
                  {/* 横屏矮视口把 .title-nav 整条隐藏了，标题页的浅/深开关只有这条路能到 */}
                  <button onClick={() => { sfx.choice(); setMode((m) => (m === "light" ? "dark" : "light")); }}>
                    {mode === "light" ? "转墨" : "还宣"}
                  </button>
                  <button className="fab-tree-btn" onClick={() => { sfx.choice(); setFabOpen(false); restorePrev(); }}>退回上一幕</button>
                </div>
                <div className="fab-progress">{progressBar}</div>
              </div>
            </>
          )}
        </div>
        <div className="cover-layout">
        <div className="cover-stage">
          <button className="cover-arrow" aria-label="上一个" onClick={() => { sfx.choice(); setCoverIdx((coverIdx + SCENARIOS.length - 1) % SCENARIOS.length); }}>‹</button>
          <div className={`cover-main ${unlocked ? "" : "sealed"}`}>
            {coverOf(cur.id) ? (
              /* 审计·视觉布局篇「部分可交互图片缺少完整键盘语义」：onClick 原先挂在 <img> 上，
                 键盘/读屏用户到不了"点开大图"这个入口。换成真按钮 + 可访问名称；
                 按钮本身 display:contents，图片继续用它的绝对定位铺满 .cover-main，焦点环画在图上。 */
              <button type="button" className="cover-img-hit" aria-label={`展阅封面大图：${cur.title}`} onClick={() => { sfx.choice(); setCoverZoom(true); }}>
                <img className="cover-img" src={coverOf(cur.id)} alt={cur.title} decoding="async" />
              </button>
            ) : (
              <div className="cover-img cover-fallback" />
            )}
            {!unlocked && <div className="seal-strip">悬案未破 · 封</div>}
            <div className="cover-veil" />
            <div className="cover-info">
              <div className="cover-badges">
                <span className="badge badge-mode">{cur.mode === "case" ? "案件" : "叙事"}</span>
                {cur.cardSystem && <span className="badge badge-v2">✦ 卡牌 v2</span>}
                {unlocked ? (
                  <span className={`badge ${curEnds.length >= curTotalEnds && curTotalEnds > 0 ? "badge-done" : "badge-ends"}`}>结局 {curEnds.length}/{curTotalEnds}</span>
                ) : (
                  <span className="badge badge-sealed">悬案未破</span>
                )}
              </div>
              <h1>{cur.title}</h1>
              <p className="sub">{cur.subtitle}</p>
              {curEnds.length > 0 && <p className="cover-ends">已解锁：{curEnds.map((e) => e.endingName).join("、")}</p>}
              <div className="cover-actions">
                {unlocked ? (
                  <button className="btn-cta" onClick={() => { sfx.choice(); if (cur.viewpoints?.length) setVpFor(cur); else setPrepFor(cur); }}>出征 · 开审此案</button>
                ) : (
                  <>
                    <button
                      className="btn-cta cta-sealed"
                      disabled={empire.ink < UNSEAL_COST}
                      onClick={() => {
                        if (unsealScenario(cur.id)) {
                          sfx.card();
                          setToast(`封条已破 · 「${cur.title}」开封`);
                          setEmpTick((t) => t + 1);
                        } else {
                          setToast(`墨铤不足（需 ${UNSEAL_COST}）`);
                        }
                      }}
                    >
                      <IngotIcon /> 破封 · {UNSEAL_COST} 墨铤
                    </button>
                    {prevSc && <span className="muted seal-hint">先破前案《{prevSc.title}》任一结局即可解封，或花墨铤提前破封</span>}
                  </>
                )}
                {(curTree.length > 0 || curEnds.length > 0) && (
                  <button className="tree-btn" onClick={() => { sfx.choice(); setTreeOf(cur); }}>剧情树（{curTree.length}/{cur.scenes.length}）</button>
                )}
                {bonusListOfScenario(cur.id).length > 0 && (
                  <button className="tree-btn" onClick={() => { sfx.choice(); setBonusFor(cur.id); }}>
                    番外（{bonusListOfScenario(cur.id).filter((b) => isBonusUnlocked(b, gallery, vpEndingsOf(cur.id), getBonuses())).length}/{bonusListOfScenario(cur.id).length}）
                  </button>
                )}
                {cur.cardSystem && (
                  <button className="tree-btn" onClick={() => { sfx.choice(); setCardsOf(cur); }}>
                    卡牌图鉴（{(getCardSeen()[cur.id] ?? []).length}/{cur.cards.filter(c => (c.layer ?? "成术") !== "资源").length}）
                  </button>
                )}
              </div>
            </div>
          </div>
          <button className="cover-arrow" aria-label="下一个" onClick={() => { sfx.choice(); setCoverIdx((coverIdx + 1) % SCENARIOS.length); }}>›</button>
        </div>
        <div className="cover-thumbs-wrap">
          <button className="thumb-arrow prev" aria-label="上一个" onClick={() => { sfx.choice(); setCoverIdx((coverIdx + SCENARIOS.length - 1) % SCENARIOS.length); }}>‹</button>
          <div className="cover-thumbs" ref={thumbsRef}>
          {SCENARIOS.map((s, i) => {
            const n = gallery.filter((g) => g.scenarioId === s.id).length;
            const locked = !scenarioUnlocked(i, gallery, getTree(), save?.scenarioId, empire.brokenSeals);
            return (
              <button key={s.id} className={`cover-thumb ${i === coverIdx ? "on" : ""} ${locked ? "sealed" : ""}`} title={locked ? `${s.title}（悬案未破）` : s.title} onClick={() => { sfx.choice(); setCoverIdx(i); }}>
                {coverOf(s.id) ? <img src={coverThumbOf(s.id)} alt={s.title} loading="lazy" decoding="async" /> : <span className="thumb-fallback" />}
                {locked && <span className="thumb-seal">悬案未破</span>}
                {!locked && n > 0 && <span className="thumb-ends">{n}</span>}
                {!locked && s.cardSystem && <span className="thumb-v2">✦</span>}
              </button>
            );
          })}
          </div>
          <button className="thumb-arrow next" aria-label="下一个" onClick={() => { sfx.choice(); setCoverIdx((coverIdx + 1) % SCENARIOS.length); }}>›</button>
        </div>
        </div>{/* /.cover-layout */}
        {progressBar}
                {coverZoom && coverOf(cur.id) && (
          <div className="cover-zoom-overlay" onClick={() => setCoverZoom(false)}>
            <img src={coverOf(cur.id)} alt={cur.title} />
            <div className="cover-zoom-title">{cur.title} · {cur.subtitle}</div>
            {/* 入口既然是键盘点得开的（上面那个按钮），出口就不能只靠"点按任意处"——补一个真按钮，
                点它同样冒泡到遮罩关闭，不另写一套逻辑 */}
            <button type="button" className="cover-zoom-close" onClick={() => setCoverZoom(false)}>合卷</button>
            <p className="muted cover-zoom-hint">点按任意处或按住「合卷」退出</p>
          </div>
        )}
        <p className="foot-tip">点击画面推进文本 · 空格推进/数字选支 · 进度自动保存 · ✦ = 含卡牌系统 v2 · 解锁结局可获墨铤 · 案件按序解封，可花 {UNSEAL_COST} 墨铤提前破封</p>
        {bonusFor && (() => {
          const list = bonusListOfScenario(bonusFor);
          const curSc = SCENARIOS.find((s) => s.id === bonusFor);
          const vpNames = vpEndingsOf(bonusFor);
          return (
            <div className="clue-overlay bonus-read" onClick={() => setBonusFor(null)}>
              <div className="bag-panel bonus-read-panel" onClick={(e) => e.stopPropagation()}>
                <h3>番外 · {curSc?.title ?? bonusFor}</h3>
                <p className="muted">剧本外篇——达成条件后解锁，与主线剧情互不干扰。</p>
                {list.map((b) => {
                  const unlocked = isBonusUnlocked(b, gallery, vpNames, getBonuses());
                  return (
                    <div key={b.id} className="card-detail-sec">
                      <div className="card-detail-sec-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{b.title}</span>
                        {unlocked ? <span style={{ color: "var(--gold)" }}>已解锁</span> : <span className="muted">未解锁</span>}
                      </div>
                      <p className="detail-line muted">{b.desc}</p>
                      {unlocked ? (
                        <div className="bonus-lines">
                          {b.lines.map((l, i) => <p key={i} className="detail-line">{l}</p>)}
                        </div>
                      ) : (
                        <p className="detail-line muted">🔒 {bonusUnlockDesc(b)}</p>
                      )}
                    </div>
                  );
                })}
                <button className="btn-main" onClick={() => setBonusFor(null)}>合卷</button>
              </div>
            </div>
          );
        })()}
        {showGuide && (
          <div className="clue-overlay" onClick={() => setShowGuide(false)}>
            <div className="clue-overlay-panel guide-panel" onClick={(e) => e.stopPropagation()}>
              <h3>玩法速览</h3>
              <div className="guide-sec"><b>基础</b>：点击画面推进文字；选项决定走向；空格=推进，数字键=选支。进度自动保存。</div>
              <div className="guide-sec"><b>四色 · 探案模式</b>：策=策略、方法（审讯话术/破局思路）；势=人证（人物卡，携带被动，开局场外生效）；器=物证（实物与证据）；隐=隐秘的过往、道听途说的真相（暗线后手）。孤品=特殊收集，不在四色之内。</div>
              <div className="guide-sec"><b>四色 · 叙事模式</b>：同样成立，但此视角下——策=韬略、战术；势=人物、士族/文官集团；器=物品、火器、科技成果；隐=不为人知的反转、特殊手段。四色相克环（策克势·势克器·器克隐·隐克策）贯通两模式。</div>
              <div className="guide-sec"><b>隐 · 陷阱</b>：部分隐色卡是陷阱——打出即盖放（扣在案上），下一轮对手出牌时自动触发（反伤=伤害弹回 / 抵消=敌招作废 / 蓄锋=下张+2）。盖位限 1 张，盖了就是信息威慑。</div>
              <div className="guide-sec"><b>案件模式</b>：调查取证 → 结案陈词拣选线索（真/伪/核心）→ 定谳。核心线索+足够实据 = 完整结局。</div>
              {/* 舆图与现场勘查是后加的两层玩法，此前只存在于界面上、说明书里一个字没有——
                  第一次见到「勘查 5」这个按钮的人，不知道那个 5 是什么、也不知道它会花掉 */}
              <div className="guide-sec"><b>探案舆图</b>：大理寺五案中，顶栏「舆图」随时可开。朱色圆点=你此刻所在，金色发亮=这一幕就走得过去的去处，虚线=未至。<b>点图上的地方，等价于点这一幕对应的那条选项</b>——不另开近路，条件判定与选项完全同一套。一处地方挂着两件事时标「×2」，点它走第一条，剩下的仍在下面那排选项里。</div>
              <div className="guide-sec"><b>现场勘查</b>：五案各有一处现场可蹲——驸马案·复勘如意酒家雅间｜丝绸案·勘堤十里残口｜秀才案·复勘自燃巷口｜秦淮案·勘堤三里烂段｜秋闱案·夜行贡院外墙根。顶栏「勘查 n」的 <b>n 是剩余格数</b>：现场图上每一枚朱点都是一件证物，点中才读得到那句话、并可能当场入卷。格数有限，得挑要紧的看；<b>不入卷的闲看不占格</b>（标「看」的随便看，标「勘」的要花格）。已录的可回看。勘查不是任何线索的唯一来源——它只是让你更早看见现场。</div>
              <div className="guide-sec"><b>对局·情绪匹配制</b>：对手亮出手段（策/器/势/隐）。同色接话=共鸣；克色=破防；被克=大失言（气力-2），错色=失言。共鸣满则胜。v2 情绪局出牌不耗行动力。</div>
              <div className="guide-sec"><b>对局 · 博弈动作</b>（压制制）：蓄势（挨打换下张+2，上限2层）/ 破招（宣言对手花色，押中该手作废）/ 刺探·收买（需带斥候/内应随从，见下）。部分牌有情境加成（对手为某色时+2）/ 牺牲（自伤换强）/ 抽牌。</div>
              <div className="guide-sec"><b>✦ 卡牌系统 v2</b>：四层卡——成术（对局四色牌）/ 物品（对局道具，一局限用一次、局后仍在行囊，也是剧情钥匙）/ 人物（携带被动，开局场外生效）/ 资源（即银两）。市集买卡卖卡开卡包；翻牌三选一；顶栏「背包」随时编组（上限 12，资源不占槽）。压制局出牌耗行动力，可「换气」回力补牌；打出的牌进弃牌堆，牌库抽空调洗回填。手牌两段式：点一下先立起来看全卡面（桌面鼠标悬浮即预览），再点同一张才真正打出；手机横屏上滑仍可一步出牌。</div>
              <div className="guide-sec"><b>随从</b>：带斥候/内应被动的人物卡，黑市可雇，全局至多 3 人。对局内由随从执行「刺探」（看破对手下一手全牌）/「收买」（敌招作废）——消耗随从次数，不耗银两；银两只用于雇随从。凡=斥候1次 · 良=内应1次 · 精=双能共1 · 传=双能共2（任选搭配）。</div>
              <div className="guide-sec"><b>小游戏（五艺）</b>：驸马案·吟诗作对（补下联，辨工整）｜秋闱案·证词真假（仅 N 人说真话，逻辑排除）｜丝绸案·推牌九（押点博彩，同点庄赢）｜秀才案·棋局残局（多手正解，棋盘随步变化）｜秦淮案·宴会行令（翻令签对花色，留牌折算彩头）。败不可再战。</div>
              <div className="guide-sec"><b>帝国商市</b>：解锁结局奖励墨铤（每个 {INK_PER_ENDING}；结局进度条里程碑达标后**点击礼物领取**）；商市可购随身位扩容（+1 格，上限 5）、银两兑换（1 墨铤=1 两，出征注入）、开局加成、主题外观与「岁币之约」（败仗解锁，和议结局线，劫与烬除外）。</div>
              <div className="guide-sec"><b>行囊/随身位</b>：物品卡与结局奖励卡自动收入；出征时随身位（物/人争位，基础 3 格，商市可扩容）勾选携带，奖励卡直接进卡组不占位。</div>
              <div className="guide-sec"><b>成就</b>：卡组构成挑战（弱卡点名/禁强/形态）让普通卡成为入场券——打出特定结局、携带冷门卡通关、极限反杀都有墨铤与称号。</div>
              <div className="guide-sec"><b>收集</b>：结局图鉴 · 剧情树 · 卡牌图鉴 · 天下卡册（全卡三态）· 成就面板。</div>
              <button className="btn-main" onClick={() => setShowGuide(false)}>开始查案</button>
            </div>
          </div>
        )}
        {panel === "shop" && <EmporiumPanel onClose={closePanel} toast={setToast} onTheme={() => setEmpTick((t) => t + 1)} />}
        {panel === "bag" && <LuggagePanel onClose={closePanel} />}
        {panel === "gallery" && <GalleryPanel gallery={gallery} onClose={closePanel} onCardGallery={(s) => setCardsOf(s)} />}
        {panel === "album" && <AlbumPanel onClose={closePanel} />}
        {panel === "achievements" && <AchievementsPanel onClose={closePanel} />}
        {panel === "settings" && <SettingsPanel onClose={closePanel} onCleared={() => { clearSave(); setTitleTick((t) => t + 1); }} />}
        {prepFor && (
          <PrepModal
            sc={prepFor}
            empire={empire}
            onCancel={() => { setPrepFor(null); setVpId(undefined); }}
            onGo={(prep) => { const s = prepFor; const v = vpId; setPrepFor(null); setVpId(undefined); setEmpTick((t) => t + 1); start(s, prep, v); }}
          />
        )}
        {vpFor && (
          <ViewpointModal
            sc={vpFor}
            onCancel={() => setVpFor(null)}
            onPick={(id) => { const s = vpFor; setVpFor(null); setVpId(id); setPrepFor(s); }}
          />
        )}
        {treeOf && <TreeView sc={treeOf} onClose={() => setTreeOf(null)} />}
        {cardsOf && <CardGallery sc={cardsOf} onClose={() => setCardsOf(null)} />}
      </div>
    );
  }

  if (!st || !sc) return null;

  // ---------- 对局 ----------
  if (phase === "duel" && duel) {
    return (<>
      {feedback}
      <DuelView sc={sc} duel={duel} setDuel={commitDuel} toast={setToast} silver={st?.silver ?? 0} wager={wager} onWager={setWager} wagersLeft={3 - (st?.wagers ?? 0)} />
    </>);
  }

  // ---------- 三选一翻牌 ----------
  if (phase === "pick" && pickScene) {
    const scene = findScene(sc, pickScene);
    return (
      <div className="pick-root">
        {feedback}
        <h2 className="pick-title">{scene.cardPick!.title}</h2>
        <p className="muted pick-hint">三张牌，翻一张，余下的归入库房。</p>
        <div className="pick-row">
          {scene.cardPick!.options.map((id) => {
            const c = cardDef(id);
            if (!c) return null;
            return (
              <TCard
                key={id}
                c={c}
                onClick={() => afterPick(id)}
                footer={<span className="pc-layer">{c.layer ?? "成术"}</span>}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- 市集 ----------
  if (phase === "shop") {
    const scene = findScene(sc, st.sceneId);
    // 市集写穿：内存 st 与存档同一同步任务内落地。随从册（addRetinue/removeRetinue→writeEmpire）
    // 本来就是同步写 localStorage 的，RunState 只交给 effect 就会慢一拍——「人入册了、银两没扣」
    // 的刷新套利正是从这道缝里漏出去的（审计 P0-1、P0-2），故此处即时 flush。
    // 市集是每条卡牌周目都要路过的一屏，此前却是唯一一张"有列表没有地方"的屏——
    // 连结案屏都接上了场景底（见 verdict 那段），这里按同一档淡水印补齐。
    const shopBg = sceneArt(sc.id, scene.id);
    return (
      <div className="story-root shop-wrap">
        {feedback}
        {shopBg && <div className="scene-bg" style={{ backgroundImage: `url(${shopBg})` }} aria-hidden="true" />}
        <ShopView sc={sc} st={st} shop={scene.shop!} onLeave={afterShop} onSync={(s) => { setSt(s); saveRun(s, duel); }} toast={setToast} />
      </div>
    );
  }

  // ---------- 结案复盘 ----------
  if (phase === "verdict" && sc.verdict) {
    const v = sc.verdict;
    /** 照骨镜等洞察道具：持有即复盘标出核心/真线索 */
    const clueReveal = Math.max(0, ...(st?.bag ?? []).map((id) => sc.cards.find((c) => c.id === id)?.clueReveal ?? 0));
    // 手里线索凑不满 mustPick 时，"拣满才能呈"这条门槛永远过不去——
    // 零线索走进这里就是一间没有门的屋子（实测：按钮常哑，屏上没有任何出口）。
    // 上限改成"能拣几条拣几条"，拣不满的一律走败线（见 doVerdict 的 full 判定）。
    const need = Math.min(v.mustPick, st.clues.length);
    const short = st.clues.length < v.mustPick;
    // 这一幕在 SCENE_SETTING 里本来就有自己的地点（fuma.verdict → study_night），
    // 之前结案屏是唯一一张"没有画面"的屏——全游戏最素的一屏偏偏是收束屏。
    const vScene = sc.scenes.find((s) => s.id === v.scene);
    const vBg = vScene ? sceneArt(sc.id, vScene.id) : undefined;
    const coreHeld = !!v.coreClue && st.clues.includes(v.coreClue);
    return (
      <div className="story-root verdict-root">
        {feedback}
        {vBg && <div className="scene-bg" style={{ backgroundImage: `url(${vBg})` }} aria-hidden="true" />}
        <TopBar sc={sc} st={st} mode={mode} onMode={() => setMode((m) => (m === "light" ? "dark" : "light"))} dlg={dlg} onDlg={() => setDlg((d) => !d)} map={false} onMap={() => {}} surveyLabel={null} onSurvey={() => {}} onClues={() => setShowClues(true)} onBag={() => setShowBag(true)} />
        <div className="story-panel" ref={panelRef}>
          <h2>结案陈词 · 拣选线索（{picked.length}/{v.mustPick}）</h2>
          <p className="muted">呈上御案的线索，将决定此案能否经得起百官诘难。</p>
          <p className="verdict-hint">只从前文已解锁的线索中拣选（当前已解锁 {st.clues.length} 条；未走过、未触发的线索不予展示）。</p>
          {short && <p className="verdict-short">案卷单薄，凑不足 {v.mustPick} 条——勉强定谳只会被百官问倒。可退回上一幕续查，或就此呈上（此局难有完案）。</p>}
          {clueReveal >= 1 && <p className="clue-reveal-hint">〔照骨镜〕镜光直照案眼——核心线索上已亮起<span className="fix-term-tip" title="案眼：结案陈词必备的核心线索，拣选时不可遗漏">「案眼」</span>印记。</p>}
          <div className="clue-grid">
            {st.clues.map((cid, i) => {
              const c = sc.clues?.find((x) => x.id === cid);
              if (!c) return null;
              const on = picked.includes(cid);
              const isCore = clueReveal >= 1 && c.id === v.coreClue;
              const isTrue = clueReveal >= 2 && c.kind === "true";
              return (
                <div key={cid} className={`clue-card ${on ? "on" : ""} ${isCore ? "clue-core" : ""}`} onClick={() =>
                  setPicked((p) => (p.includes(cid) ? p.filter((x) => x !== cid) : p.length < need ? [...p, cid] : p))
                }>
                  <span className="clue-slip" aria-hidden="true">{["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][i] ?? i + 1}</span>
                  <div className="clue-name">{c.name} {isCore && <span className="clue-core-tag" title="案眼：结案陈词必备的核心线索，拣选时不可遗漏">案眼</span>}{isTrue && <span className="clue-true-tag">真</span>}</div>
                  <div className="clue-desc">{c.desc}</div>
                  {/* 拣选态不能只靠一圈描边：米色底上 --accent 的边框变化在浅皮几乎看不出来 */}
                  <span className="clue-mark" aria-hidden="true">{on ? "已拣" : "未拣"}</span>
                </div>
              );
            })}
          </div>
          <button className="btn-main" disabled={picked.length !== need} onClick={doVerdict}>
            {picked.length < need ? `再拣 ${need - picked.length} 条呈上御案（已拣 ${picked.length}/${need}）`
              : short ? "勉强呈上御案" : "呈上御案"}
          </button>
          {/* 案眼没拣到 = 一定不是完案。这条提示原来只在持有照骨镜时才说，普通线玩家点下去才知道 */}
          {picked.length === need && !coreHeld && v.coreClue && (
            <p className="verdict-short">卷宗里还有一条本案的案眼未曾拣入——如此呈上，纵有实据也难定谳。</p>
          )}
          {/* 出口：证据不足时不该被锁死在这一屏。每周目一次的「退回上一幕」在这里最有用 */}
          <button className="link-btn fix-prev-ghost" onClick={() => { sfx.choice(); restorePrev(); }}>退回上一幕，继续查案</button>
        </div>
        {showClues && st.clues.length > 0 && (
          <div className="clue-overlay" onClick={() => setShowClues(false)}>
            <div className="clue-overlay-panel" onClick={(e) => e.stopPropagation()}>
              <h3>卷宗 · 已录线索</h3>
              {st.clues.map((cid) => {
                const c = sc.clues?.find((x) => x.id === cid);
                return c ? (
                  <div key={cid} className="clue-row">
                    <b>{c.name}</b>
                    <div className="muted">{c.desc}</div>
                  </div>
                ) : null;
              })}
              <button className="btn-main" onClick={() => setShowClues(false)}>合上卷宗</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const scene = findScene(sc, st.sceneId);

  // ---------- 小游戏 ----------
  if (phase === "minigame" && scene.minigame) {
    return <MiniGameView sc={sc} sceneId={scene.id} onFinish={(win, mutated, info) => {
      const base = mutated ?? st;
      // 小游戏成就
      if (win) {
        const owned = new Set(getAchievements());
        // F-4：五艺俱全——每类小游戏胜利按 mg_<type> 计数，五类齐备即达成
        bumpCounter("mg_" + scene.minigame!.type);
        const fiveArts = ["duilian", "logic", "paijiu", "gobang", "jiuling"].every((t) => getCounter("mg_" + t) >= 1);
        const got = checkMinigameAchievements({ type: scene.minigame!.type, win, allRight: info?.allRight, netGain: info?.netGain, fiveArts }, owned);
        for (const id of got) grantAch(id, owned);
      }
      gotoFrom(base, win ? scene.minigame!.winNext : scene.minigame!.loseNext);
    }} />;
  }

  // ---------- 结局 ----------
  if (phase === "ending" && scene.ending) {
    const endImg = endArt(sc.id, scene.id);
    return (
      <div className="story-root ending-root">
        {feedback}
        <div className="story-panel ending" ref={panelRef}>
          {endImg && (
            <div className="ending-art-frame">
              <img className="ending-art" src={endImg} alt={scene.ending.name} />
            </div>
          )}
          {/* ending-body 在 PC 上 display:contents 保持原版居中排版；手机横屏转为右栏文本区（左图右文） */}
          <div className="ending-body">
            <div className="ending-rank">{scene.ending.rank}</div>
            <h2 className="ending-name">{scene.ending.name}</h2>
            {resolveSceneLines(scene, st).map((l, i) => (
              <p key={i} className="story-line show">{l}</p>
            ))}
            <p className="muted">{scene.ending.desc}</p>
            <div className="run-report">
              <div className="run-report-title">本局战报</div>
              <div className="stat-report">
                {/* 走剧本声明过的那张表，不遍历 st.stats：账目计数（revisit_left 这类）
                    也住在 stats 里，原先会把内部键名原样印在收束屏上。
                    字牌复用 .stat-chip——三套皮各自给它定过形，这里不再另画一套。 */}
                {(sc.stats ?? []).map((s) => (
                  <span key={s.key} className="stat-chip">{s.name}：{st.stats[s.key] ?? s.init}</span>
                ))}
              </div>
              <div className="stat-report">
                <span className="stat-chip">探索 {st.visited.length + 1} 幕</span>
                {st.clues.length > 0 && <span className="stat-chip">线索 {st.clues.length} 条</span>}
                {sc.cardSystem && <span className="stat-chip">藏卡 {st.bag.length} 张 · 余银 {st.silver} 两</span>}
              </div>
            </div>
            <button className="btn-main" onClick={() => { setPhase("title"); setSt(null); }}>
              回到卷宗架
            </button>
          </div>
        </div>
      </div>
    );
  }

  const choices = visibleChoices(scene, st);
  const sceneBg = sceneArt(sc.id, scene.id);
  const sceneFx = sceneMotion(sc.id, scene.id);
  const narrArt = narratorArt(sc.id, st.viewpoint);
  // 名牌只写游戏自己给过的称谓：多视角取 viewpoints 的 name，五桩案件取「大理寺卿」；
  // 其余单视角剧本通篇只有「朕/柴大人」，文本没给姓名就不编一个上去
  const narrName = sc.viewpoints?.find((v) => v.id === st.viewpoint)?.name ?? CASE_SCENARIOS[sc.id];
  const lines = resolveSceneLines(scene, st);
  // 幕尾的空行不算"还有内容没读"（判定收进 transition.lastRealLine）。
  // 审计 A06：屏上的推进记号、选项排布、点击/空格实际走不走，全部取同一个 availableActions——
  // 旧代码这里按「可见选项数」决定要不要显示「▼ 继续」，advance() 却按 scene.choices 原始长度决定能不能跳，
  // 选项全被 cond 挡掉的幕因此变成「提示亮着、点了没反应」。
  const act = availableActions(sc, scene, st, dlg);
  const atEnd = act.kind !== "lines";
  // 对白档一屏只留当前这一句（advance 已改成一次一句）；
  // 落在空行上时退回上一句，栏框不会空成一格。长卷档从幕首整段铺开。
  let dlgFrom = dlg ? st.lineIndex : 0;
  if (dlg) { while (dlgFrom > 0 && lines[dlgFrom] === "") dlgFrom--; }
  const shown = lines.slice(dlgFrom, st.lineIndex + 1);

  // 现场勘查：这一幕有现场可勘才挂钮，标签带剩余格数；格数花完降成「已勘」，仍可回看已录的
  const sv = surveyOf(sc.id, scene.id);
  const svFound = sv ? foundSpots(st.survey, scene.id) : [];
  const svLeft = sv ? surveyLeft(sv, svFound) : 0;
  const surveyLabel = sv ? (svLeft > 0 ? `勘查 ${svLeft}` : "已勘") : null;
  const takeSpot = (spot: SurveySpot) => {
    if (!sv) return;
    const shell: RunState = { ...cloneRunState(st), survey: { ...(st.survey ?? {}), [scene.id]: [...svFound, spot.id] } };
    const next = applyEffects(spot.effects, shell);
    noteCards(sc, next.bag);
    setSt(next);
    // 入卷的提示交给反馈层的差额判定（它会带上具体是哪条证物），这里不再自己弹一条，
    // 否则同一件事会有两种说法同时出现
    if (spot.effects?.some((e) => e.unlockClue)) sfx.clue();
    else sfx.page();
  };

  return (
    <div className={`story-root${narrArt ? " has-narrator" : ""}${dlg ? " dlg" : ""}`} ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
      {feedback}
      <TopBar sc={sc} st={st} mode={mode} onMode={() => setMode((m) => (m === "light" ? "dark" : "light"))}
        dlg={dlg} onDlg={() => setDlg((d) => !d)}
        map={hasMap(sc.id)} onMap={() => setShowMap(true)}
        surveyLabel={surveyLabel} onSurvey={() => setShowSurvey(true)}
        onClues={() => setShowClues(true)} onBag={() => setShowBag(true)} />
      {sceneBg && sceneFx ? (
        <div className="scene-stage" aria-hidden="true">
          <img className="scene-bg-img" src={sceneBg} alt="" />
          <div className="scene-scrim" />
          <img className="scene-fx-img" src={sceneFx} alt="" />
        </div>
      ) : (
        sceneBg && <div className="scene-bg" style={{ backgroundImage: `url(${sceneBg})` }} aria-hidden="true" />
      )}
      {narrArt && (
        <aside className="narrator" aria-hidden="true">
          <img className="narrator-art" src={narrArt} alt="" />
          {/* key=lineIndex：每揭一段就重挂载一次，说话的一闪因此能反复播 */}
          <span className="narrator-pulse" key={st.lineIndex} />
          {narrName && !dlg && <span className="narrator-name">{narrName}</span>}
        </aside>
      )}
      <div className="story-panel" onClick={advance} ref={panelRef} key={scene.id}>
        {/* 幕画心（scene.art 开关）：普通剧情幕复用结局画心框接住落单图；无图自动不渲染 */}
        {scene.art && (() => {
          const a = endArt(sc.id, scene.id);
          return a ? (
            <div className="ending-art-frame scene-art">
              <img className="ending-art" src={a} alt={scene.title ?? ""} decoding="async" />
            </div>
          ) : null;
        })()}
        {dlg && (
          <div className="dlg-head">
            {narrName && <span className="dlg-name">{narrName}</span>}
            {scene.title && <span className="dlg-scene">{scene.title}</span>}
            <button className="dlg-log-btn" onClick={(e) => { e.stopPropagation(); sfx.choice(); setShowLog((v) => !v); }}>
              {showLog ? "收起" : "回顾"}
            </button>
          </div>
        )}
        {!dlg && scene.title && <div className="scene-title">{scene.title}</div>}
        {scene.desc && <p className="scene-desc">{scene.desc}</p>}
        {shown.map((l, k) => {
          const i = dlgFrom + k;
          if (dlg && l === "") return null;
          const fresh = i > revealFrom;
          // 一幕可能一次揭出十几段（空行只作排版分隔），步长按批大小自适应，
          // 整批总时长封顶 ~1.1s，避免固定 110ms 让后段挤成一面文字墙
          const batch = Math.max(1, st.lineIndex - revealFrom);
          const step = Math.min(110, Math.round(1100 / batch));
          return (
            <p key={i} className={`story-line ${i === st.lineIndex ? "show" : ""}${fresh ? " fresh" : ""}`}
               style={fresh ? { animationDelay: `${(i - revealFrom - 1) * step}ms` } : undefined}>
              {saidSpans(l)}
            </p>
          );
        })}
        {act.kind === "choices" && (
          <div className="choices" onClick={(e) => e.stopPropagation()}>
            {choices.map((c, i) => (
              <button key={c.next + i} className="choice" onClick={() => choose(i)}>
                <span>{c.text}</span>
                {c.hint && <span className="hint">—— {c.hint}</span>}
              </button>
            ))}
          </div>
        )}
        {act.kind === "next" && (
          <div className="continue-tip">▼ 继续（点击画面 / 空格）</div>
        )}
        {act.kind === "lines" && <div className="next-tip">▼</div>}
      </div>
      {dlg && showLog && (
        <div className="dlg-log" onClick={() => setShowLog(false)}>
          <div className="dlg-log-list">
            {lines.slice(0, st.lineIndex + 1).map((l, i) => (
              l === ""
                ? <div key={i} className="dlg-log-gap" />
                : (
                  <p key={i} ref={i === st.lineIndex ? (el) => { if (el) el.scrollIntoView({ block: "center" }); } : undefined}
                     className={`dlg-log-line${i === st.lineIndex ? " now" : ""}`}>{saidSpans(l)}</p>
                )
            ))}
          </div>
          <div className="dlg-log-hint">点击任意处收起</div>
        </div>
      )}
      {showMap && hasMap(sc.id) && (
        <LocationMap sc={sc} st={st} scene={scene} canPick={atEnd} onPick={choose} onAdvance={advance} onClose={() => setShowMap(false)} />
      )}
      {showSurvey && sv && (
        <SurveyLayer st={st} scene={scene} sv={sv} art={sceneBg} onFound={takeSpot} onClose={() => setShowSurvey(false)} />
      )}
      {showClues && st.clues.length > 0 && (
        <div className="clue-overlay" onClick={() => setShowClues(false)}>
          <div className="clue-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <h3>卷宗 · 已录线索</h3>
            {st.clues.map((cid) => {
              const c = sc.clues?.find((x) => x.id === cid);
              return c ? (
                <div key={cid} className="clue-row">
                  <b>{c.name}</b>
                  <div className="muted">{c.desc}</div>
                </div>
              ) : null;
            })}
            <button className="btn-main" onClick={() => setShowClues(false)}>合上卷宗</button>
          </div>
        </div>
      )}
      {showBag && (
        <BagView sc={sc} st={st} onClose={() => setShowBag(false)} onMutate={setSt} toast={setToast} readOnly={false} />
      )}
    </div>
  );
}

/** 探案舆图：把这一幕去得了的地方画在一张图上。
 *  只做"眼下这一步"的导航——图上可点的节点等价于幕末那排选项、或线性续幕的下一站，
 *  不新开跳转口子，免得绕过剧情图（软锁与旗标读写都还归 choices / next 那条链）。 */
