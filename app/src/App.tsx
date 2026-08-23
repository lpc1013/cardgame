import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import type { Scenario, CardDef } from "./engine/types";
import { initState, findScene, visibleChoices, applyEffects, registerScenarios, type RunState } from "./engine/runtime";
import { initDuel, revealEmotion, playEmotion, playPressure, endTurn, cardCost, type DuelState, type DuelBoosts } from "./engine/duel";
import {
  saveGame, loadGame, clearSave, unlockEnding, getGallery, recordTreeVisit, getTree, recordCardsSeen, getCardSeen,
  settleEmpire, spendInk, gainBoost, consumeBoosts, unlockTheme, setTheme as saveTheme,
  registerGlobalCards, getGlobalCard, getGlobalCards, INK_PER_ENDING,
  unsealScenario, UNSEAL_COST,
} from "./engine/save";
import { SHOP_BOOSTS, SHOP_THEMES } from "./data/empireShop";
import { TreeView } from "./components/TreeView";
import { sfx, sfxEnabled, toggleSfx } from "./engine/sfx";
import { initSicbo, sicboRoll, sicboPayout, sicboSetBet, initPuzzle, puzzlePlay, initJiuling, jiulingDraw, jiulingPlay, type SicboState, type PuzzleState, type JiulingState } from "./engine/minigames";
import { fuma } from "./data/fuma";
import { qiuwei } from "./data/qiuwei";
import { sichou } from "./data/sichou";
import { xie } from "./data/xie";
import { qinhuai } from "./data/qinhuai";
import { jieyu } from "./data/jieyu";
import { shumian } from "./data/shumian";
import { changjiang } from "./data/changjiang";
import { diaolan } from "./data/diaolan";
import { changhen } from "./data/changhen";
import { jianfeng } from "./data/jianfeng";
import { xingxing } from "./data/xingxing";
import { touming } from "./data/touming";
import { themeOf } from "./data/cardThemes";
import "./app.css";

const SCENARIOS: Scenario[] = [
  fuma, qiuwei, sichou, xie, qinhuai,
  jieyu, shumian, changjiang,
  diaolan, changhen, jianfeng, touming, xingxing,
];
registerScenarios(SCENARIOS);

// ============================================================
// 美术接入（皮）：运行时按 id 载入 src/assets/{cards,portraits,scenes}/<id>.png
// 图片缺失（外部生成尚未落位）则不出图，文本布局照常，游戏完全不受影响。
// 甲·去字化纹章：父分类只作色相 + 非汉字 SVG 纹章，绝不渲染「策/器/势」字面。
// 乙·双轴门类：卡面主类目由 cardThemes 查表给出（~13 词），替代四字重复。
// ============================================================
const _CARD_ART = import.meta.glob("./assets/cards/*.png", { eager: true, import: "default" }) as Record<string, string>;
const _PORTRAIT_ART = import.meta.glob("./assets/portraits/*.png", { eager: true, import: "default" }) as Record<string, string>;
const _SCENE_ART = import.meta.glob("./assets/scenes/*.png", { eager: true, import: "default" }) as Record<string, string>;
const _COVER_ART = import.meta.glob("./assets/covers/*.png", { eager: true, import: "default" }) as Record<string, string>;
const _END_ART = import.meta.glob("./assets/endings/*.png", { eager: true, import: "default" }) as Record<string, string>;
function _artUrl(map: Record<string, string>, id: string): string | undefined {
  const key = Object.keys(map).find((p) => p.endsWith("/" + id + ".png"));
  return key ? map[key] : undefined;
}
function cardArt(id: string): string | undefined {
  return _artUrl(_CARD_ART, id) ?? _artUrl(_PORTRAIT_ART, id);
}
function sceneArt(scenarioId: string, id: string): string | undefined {
  // 优先「剧本前缀」命名（跨剧本场景 id 会重名，如 start）；兼容旧的 scn_* 全局唯一命名
  return _artUrl(_SCENE_ART, `${scenarioId}_${id}`) ?? _artUrl(_SCENE_ART, id);
}
/** 结局插画：src/assets/endings/end_<剧本id>_<结局场景id>.png */
function endArt(scenarioId: string, sceneId: string): string | undefined {
  return _artUrl(_END_ART, `end_${scenarioId}_${sceneId}`);
}

// 四类非汉字纹章（策=锦囊 / 器=方孔钱 / 势=官印 / 隐=蒙眼密纹），currentColor 由 .s-* 上色
const SUIT_GLYPH: Record<string, ReactNode> = {
  策: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><path d="M7 10 Q12 6 17 10 L16 16 Q12 19 8 16 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M10 8 Q12 5.5 14 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>),
  器: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><rect x="9.5" y="9.5" width="5" height="5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>),
  势: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><rect x="6" y="9" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><rect x="10" y="5" width="4" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" /><line x1="9" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.3" /><line x1="9" y1="16" x2="15" y2="16" stroke="currentColor" strokeWidth="1.3" /></svg>),
  隐: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><path d="M4.5 12 Q12 5.5 19.5 12 Q12 18.5 4.5 12 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth="1.3" /></svg>),
};

function SuitSeal({ suit }: { suit?: string }) {
  if (!suit || !(suit in SUIT_GLYPH)) return null;
  return <span className={`pc-suit s-${suit}`}>{SUIT_GLYPH[suit]}</span>;
}

/** 四色相克环（展示用）：X 克 Y */
const RESTRAIN_UI: Record<string, string> = { 策: "势", 势: "器", 器: "隐", 隐: "策" };

/** 剧本封面（出征轮播大图） */
function coverOf(id: string): string | undefined {
  return _artUrl(_COVER_ART, "cover_" + id);
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

/** 墨铤小图标（元宝/墨锭形） */
function IngotIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="ingot-icon">
      <path d="M4 10 Q12 4.5 20 10 L17.5 17.5 Q12 20.5 6.5 17.5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 10.5 Q12 8.5 15 10.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** 出征准备：勾选的开局加成 + 携带的仓库物品 */
interface PrepChoice { boosts: string[]; carry: string[] }

/** 帝国开局加成 id 列表 → 对局引擎参数 */
function duelBoostsOf(ids: string[]): DuelBoosts {
  return {
    qi: ids.includes("b_qi") ? 2 : undefined,
    ap: ids.includes("b_ap") ? 1 : undefined,
    draw: ids.includes("b_draw") ? 1 : undefined,
  };
}

/** 剧本卡定义 ∪ 全局注册表（行囊携带的跨剧本物品） */
function allCardsFor(sc: Scenario, extraIds: string[]): CardDef[] {
  const known = new Set(sc.cards.map((c) => c.id));
  const extra: CardDef[] = [];
  const reg = getGlobalCards();
  for (const id of extraIds) {
    if (!known.has(id) && reg[id]) { extra.push(reg[id]); known.add(id); }
  }
  return extra.length ? [...sc.cards, ...extra] : sc.cards;
}

/** 新卡入袋：记图鉴 + 注册全局卡定义（供跨剧本携带） */
function noteCards(sc: Scenario, ids: string[]): void {
  recordCardsSeen(sc.id, ids);
  registerGlobalCards(sc.cards.filter((c) => ids.includes(c.id)));
}

/** 行囊：各剧本中获得过的物品卡自动入囊（无需手动存入），兼容旧存档手动存入的条目 */
function luggageDefs(): CardDef[] {
  const seen = getCardSeen();
  const defs: CardDef[] = [];
  const known = new Set<string>();
  for (const s of SCENARIOS) {
    const got = new Set(seen[s.id] ?? []);
    for (const c of s.cards) {
      if ((c.layer ?? "成术") !== "物品" || !got.has(c.id) || known.has(c.id)) continue;
      known.add(c.id);
      defs.push(c);
    }
  }
  for (const id of settleEmpire().warehouse) {
    if (known.has(id)) continue;
    const d = getGlobalCard(id);
    if (d) { known.add(id); defs.push(d); }
  }
  return defs;
}

/** 气力条 */
function QiBar({ cur, max, foe }: { cur: number; max: number; foe?: boolean }) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return (
    <span className={`qi-bar ${foe ? "foe" : ""} ${pct <= 30 ? "low" : ""}`}>
      <i style={{ width: `${pct}%` }} />
      <span className="qi-num" style={{ position: "relative" }}>{Math.max(0, cur)}/{max}</span>
    </span>
  );
}

function ThemeTag({ id, suit }: { id: string; suit?: string }) {
  return <span className="theme-tag">{themeOf(id, suit)}</span>;
}

function CardArt({ id, name, compact }: { id: string; name: string; compact?: boolean }) {
  const src = cardArt(id);
  if (!src) return null;
  return (
    <img
      className={compact ? "card-art card-art-compact" : "card-art"}
      src={src}
      alt={name}
      loading="lazy"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
  );
}

/** 竖向实体卡：底层卡图 + 上卡名 + 下介绍，底色随稀有度（图鉴/背包/市集/翻牌/开包共用） */
function TCard({ c, unknown, onClick, corner, footer }: {
  c: CardDef; unknown?: boolean; onClick?: () => void;
  corner?: ReactNode; footer?: ReactNode;
}) {
  const src = cardArt(c.id);
  const cls = `tcard rarity-${c.rarity ?? "凡"} ${c.suit ? `suit-${c.suit}` : ""} ${unknown ? "card-unknown" : ""} ${onClick ? "clickable" : ""}`;
  return (
    <div className={cls} onClick={onClick}>
      <div className="tcard-art">{!unknown && src ? <img src={src} alt={c.name} loading="lazy" /> : null}</div>
      {corner && <span className="tcard-corner">{corner}</span>}
      <div className="tcard-top">{!unknown && c.suit ? <SuitSeal suit={c.suit} /> : null}<span className="tcard-name">{unknown ? "？？？" : c.name}</span></div>
      <div className="tcard-bottom">{unknown ? "尚未收录" : c.text}</div>
      {footer && <div className="tcard-footer">{footer}</div>}
    </div>
  );
}

type Phase = "title" | "story" | "duel" | "ending" | "verdict" | "shop" | "pick" | "minigame";

export default function App() {
  const [phase, setPhase] = useState<Phase>("title");
  const [sc, setSc] = useState<Scenario | null>(null);
  const [st, setSt] = useState<RunState | null>(null);
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [showClues, setShowClues] = useState(false);
  const [showBag, setShowBag] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [treeOf, setTreeOf] = useState<Scenario | null>(null);
  const [cardsOf, setCardsOf] = useState<Scenario | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [titleTick, setTitleTick] = useState(0);
  const [pickScene, setPickScene] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [empTick, setEmpTick] = useState(0);
  const [panel, setPanel] = useState<"shop" | "bag" | "gallery" | "settings" | null>(null);
  const [prepFor, setPrepFor] = useState<Scenario | null>(null);
  const [coverIdx, setCoverIdx] = useState(0);
  const thumbsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 缩略图条自动跟随：当前选中项始终保持在可视区（隐藏滑轮，平滑滚动）
    const el = thumbsRef.current?.children[coverIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [coverIdx]);
  const empire = useMemo(() => settleEmpire(), [empTick, titleTick, phase]);

  useEffect(() => {
    document.documentElement.dataset.theme = empire.theme;
  }, [empire.theme]);

  const closePanel = () => { setPanel(null); setEmpTick((t) => t + 1); };

  const cardDef = useCallback((id: string): CardDef | undefined => sc?.cards.find((c) => c.id === id), [sc]);

  // 核心状态转移：纯计算 next state → 一次性 setSt
  const gotoFrom = useCallback(
    (base: RunState, id: string, opts?: { autoRead?: boolean }) => {
      if (!sc) return;
      const target = findScene(sc, id);
      recordTreeVisit(sc.id, id);
      const next: RunState = {
        ...base, sceneId: id,
        lineIndex: opts?.autoRead ? Math.max(0, target.lines.length - 1) : 0,
        visited: [...base.visited, base.sceneId],
      };
      applyEffects(target.effects, next);
      noteCards(sc, next.bag);
      setSt(next);
      if (target.duel) {
        const cfg = sc.duels.find((d) => d.id === target.duel);
        if (cfg) {
          const loadout = sc.cardSystem ? next.deck : cfg.deck;
          const d = initDuel(cfg, loadout, allCardsFor(sc, next.deck), duelBoostsOf(next.boosts));
          revealEmotion(d);
          setDuel(d);
          setPhase("duel");
          return;
        }
      }
      if (target.cardPick) { setPickScene(id); setPhase("pick"); return; }
      if (target.shop) { setPhase("shop"); return; }
      if (target.minigame) { setPhase("minigame"); return; }
      if (sc.verdict && id === sc.verdict.scene) { setPhase("verdict"); return; }
      setPhase(target.ending ? "ending" : "story");
    },
    [sc]
  );

  const goto = useCallback((id: string) => { if (st) gotoFrom(st, id); }, [st, gotoFrom]);

  // 对局结束 → 跳转结算场景
  useEffect(() => {
    if (duel?.finished && sc && st) {
      const target = duel.finished === "win" ? duel.cfg.winScene : duel.cfg.loseScene;
      const t = setTimeout(() => {
        goto(target);
        setDuel(null);
      }, 1600);
      return () => clearTimeout(t);
    }
  }, [duel?.finished, goto]);

  // 翻牌/市集完成后继续
  const afterPick = (chosenId: string) => {
    if (!sc || !st || !pickScene) return;
    const scene = findScene(sc, pickScene);
    const def = cardDef(chosenId);
    const next = { ...st };
    if (def?.resource) {
      next.silver += def.resource;
      setToast(`资源卡「${def.name}」入袋 +${def.resource} 两`);
    } else {
      applyEffects([{ unlockCard: chosenId }], next);
      setToast(`获得卡牌「${def?.name ?? chosenId}」`);
    }
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

  const start = (scenario: Scenario, prep?: PrepChoice) => {
    setSc(scenario);
    const s = initState(scenario);
    if (prep?.boosts.length) {
      s.boosts = consumeBoosts(prep.boosts);
      if (s.boosts.includes("b_silver")) s.silver += 10;
    }
    if (scenario.cardSystem && prep?.carry.length) {
      for (const id of prep.carry) {
        if (!s.bag.includes(id)) s.bag.push(id);
        if (!s.deck.includes(id) && s.deck.length < (scenario.deckLimit ?? 12)) s.deck.push(id);
      }
    }
    const scene = findScene(scenario, s.sceneId);
    applyEffects(scene.effects, s);
    recordTreeVisit(scenario.id, s.sceneId);
    noteCards(scenario, s.bag);
    setSt(s);
    setPhase("story");
  };

  const advance = () => {
    if (!sc || !st) return;
    const scene = findScene(sc, st.sceneId);
    if (st.lineIndex < scene.lines.length - 1) {
      sfx.page();
      setSt({ ...st, lineIndex: st.lineIndex + 1 });
    } else if (scene.next && !scene.choices?.length && !scene.cardPick && !scene.shop) {
      sfx.page();
      goto(scene.next);
    }
  };

  const choose = (i: number) => {
    if (!sc || !st) return;
    const scene = findScene(sc, st.sceneId);
    const chs = visibleChoices(scene, st);
    const c = chs[i];
    if (!c) return;
    sfx.choice();
    const next: RunState = { ...st };
    applyEffects(c.effects, next);
    gotoFrom(next, c.next);
  };

  const doVerdict = () => {
    if (!sc?.verdict || !st) return;
    const v = sc.verdict;
    const hasCore = picked.includes(v.coreClue);
    const trueCount = picked.filter((id) => sc.clues?.find((c) => c.id === id && c.kind === "true")).length;
    goto(hasCore && trueCount >= v.minTrue ? v.winScene : v.loseScene);
    setPicked([]);
  };

  // 自动存档
  useEffect(() => {
    if (st && sc && phase !== "title" && phase !== "ending" && duel) {
      const { cfg, ...rest } = duel;
      if (!rest.finished) saveGame(sc.id, st, { cfgId: cfg.id, data: rest });
      else saveGame(sc.id, st);
    } else if (st && sc && phase !== "title" && phase !== "ending") {
      saveGame(sc.id, st);
    }
  }, [st, phase, duel?.round, duel?.finished]);

  // 结局入图鉴 + 清档
  useEffect(() => {
    if (phase === "ending" && sc && st) {
      const s = findScene(sc, st.sceneId);
      if (s.ending) {
        unlockEnding({ scenarioId: sc.id, endingName: s.ending.name, rank: s.ending.rank });
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
    const scene = findScene(sc, st.sceneId);
    const atEnd = st.lineIndex >= scene.lines.length - 1;
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      advance();
    } else if (/^Digit[1-9]$/.test(e.code) && atEnd) {
      const idx = Number(e.code.slice(5)) - 1;
      const chs = visibleChoices(scene, st);
      if (chs[idx]) choose(idx);
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

  const resume = () => {
    const save = loadGame();
    if (!save) { setTitleTick((t) => t + 1); return; }
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
    setSt(state);
    if (save.duel) {
      const cfg = scenario.duels.find((d) => d.id === save.duel!.cfgId);
      if (cfg) {
        const d = { ...save.duel.data, cfg };
        if (d.mode === "emotion" && !d.opponentShown && !d.finished) revealEmotion(d);
        setDuel(d);
        setPhase("duel");
        return;
      }
    }
    const scene = findScene(scenario, save.state.sceneId);
    if (scene.duel) {
      const cfg = scenario.duels.find((d) => d.id === scene.duel);
      if (cfg) {
        const loadout = scenario.cardSystem ? save.state.deck : cfg.deck;
        const d = initDuel(cfg, loadout, allCardsFor(scenario, save.state.deck), duelBoostsOf(state.boosts));
        revealEmotion(d);
        setDuel(d);
        setPhase("duel");
        return;
      }
    }
    if (scene.cardPick) { setPickScene(scene.id); setPhase("pick"); return; }
    if (scene.shop) { setPhase("shop"); return; }
    setPhase(scene.ending ? "ending" : scenario.verdict && scene.id === scenario.verdict.scene ? "verdict" : "story");
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
    return (
      <div className="title-screen title-v2">
        <nav className="title-nav">
          <span className="nav-logo">帝成观止</span>
          <span className="ink-chip" title={`每解锁一个结局奖励 ${INK_PER_ENDING} 墨铤`}><IngotIcon /> 墨铤 {empire.ink}</span>
          <div className="nav-btns">
            <button onClick={() => { sfx.choice(); setPanel("shop"); }}>商市</button>
            <button onClick={() => { sfx.choice(); setPanel("bag"); }}>行囊</button>
            <button onClick={() => { sfx.choice(); setPanel("gallery"); }}>图鉴</button>
            <button onClick={() => { sfx.choice(); setShowGuide(true); }}>规则书</button>
            <button onClick={() => { sfx.choice(); setPanel("settings"); }}>设置</button>
          </div>
        </nav>
        {save && (
          <div className="resume-box resume-inline">
            <button className="btn-main" onClick={resume}>
              继续上次 · {SCENARIOS.find((s) => s.id === save.scenarioId)?.title ?? save.scenarioId}
            </button>
            <button className="link-btn" onClick={() => { clearSave(); setTitleTick((t) => t + 1); }}>放弃存档</button>
          </div>
        )}
        <div className="cover-stage">
          <button className="cover-arrow" aria-label="上一个" onClick={() => { sfx.choice(); setCoverIdx((coverIdx + SCENARIOS.length - 1) % SCENARIOS.length); }}>‹</button>
          <div className={`cover-main ${unlocked ? "" : "sealed"}`}>
            {coverOf(cur.id) ? (
              <img className="cover-img" src={coverOf(cur.id)} alt={cur.title} />
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
                  <button className="btn-cta" onClick={() => { sfx.choice(); setPrepFor(cur); }}>出征 · 开审此案</button>
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
        <div className="cover-thumbs" ref={thumbsRef}>
          {SCENARIOS.map((s, i) => {
            const n = gallery.filter((g) => g.scenarioId === s.id).length;
            const locked = !scenarioUnlocked(i, gallery, getTree(), save?.scenarioId, empire.brokenSeals);
            return (
              <button key={s.id} className={`cover-thumb ${i === coverIdx ? "on" : ""} ${locked ? "sealed" : ""}`} title={locked ? `${s.title}（悬案未破）` : s.title} onClick={() => { sfx.choice(); setCoverIdx(i); }}>
                {coverOf(s.id) ? <img src={coverOf(s.id)} alt={s.title} /> : <span className="thumb-fallback" />}
                {locked && <span className="thumb-seal">悬案未破</span>}
                {!locked && n > 0 && <span className="thumb-ends">{n}</span>}
                {!locked && s.cardSystem && <span className="thumb-v2">✦</span>}
              </button>
            );
          })}
        </div>
        <p className="foot-tip">点击画面推进文本 · 空格推进/数字选支 · 进度自动保存 · ✦ = 含卡牌系统 v2 · 解锁结局可获墨铤 · 案件按序解封，可花 {UNSEAL_COST} 墨铤提前破封</p>
        {showGuide && (
          <div className="clue-overlay" onClick={() => setShowGuide(false)}>
            <div className="clue-overlay-panel" onClick={(e) => e.stopPropagation()}>
              <h3>玩法速览</h3>
              <div className="guide-sec"><b>基础</b>：点击画面推进文字；选项决定走向；空格=推进，数字键=选支。进度自动保存。</div>
              <div className="guide-sec"><b>案件模式</b>：调查取证 → 结案陈词拣选线索（真/伪/核心）→ 定谳。核心线索+足够实据 = 完整结局。</div>
              <div className="guide-sec"><b>对局·情绪匹配制</b>：对手亮出手段（策/器/势/隐）。同色接话=共鸣；克色（相克环：策克势·势克器·器克隐·隐克策）=破防；被克=大失言（气力-2），错色=失言。共鸣满则胜。v2 情绪局出牌不耗行动力。</div>
              <div className="guide-sec"><b>对局·气力压制制</b>：出牌比点，点差即伤害；克敌牌色+1点、被克-1点；势牌×2但反噬1；连出同一张「招式用老」-2。打空对方气力即胜。</div>
              <div className="guide-sec"><b>✦ 卡牌系统 v2</b>：四层卡——成术（对局四色牌）/ 物品（对局道具，用后消耗，也是剧情钥匙）/ 人物（携带被动，开局场外生效）/ 资源（即银两）。市集买卡卖卡开卡包；翻牌三选一；顶栏「背包」随时编组（上限 12，资源不占槽）。压制局出牌耗行动力，可「换气」回力补牌；打出的牌进弃牌堆，牌库抽空调洗回填。</div>
              <div className="guide-sec"><b>帝国商市</b>：解锁结局奖励墨铤；商市可购开局加成（出征时勾选）与主题外观。</div>
              <div className="guide-sec"><b>行囊</b>：剧本中获得的物品卡自动收入行囊，无需手动存放；出征卡牌剧本时可勾选携带至多 2 件，跨剧本生效。</div>
              <div className="guide-sec"><b>收集</b>：结局图鉴 · 剧情树（未探明的"？？？"就是多周目的方向）· 卡牌图鉴（孤品现世计数）。</div>
              <button className="btn-main" onClick={() => setShowGuide(false)}>开始查案</button>
            </div>
          </div>
        )}
        {panel === "shop" && <EmporiumPanel onClose={closePanel} toast={setToast} onTheme={() => setEmpTick((t) => t + 1)} />}
        {panel === "bag" && <LuggagePanel onClose={closePanel} />}
        {panel === "gallery" && <GalleryPanel gallery={gallery} onClose={closePanel} onCardGallery={(s) => setCardsOf(s)} />}
        {panel === "settings" && <SettingsPanel onClose={closePanel} onCleared={() => { clearSave(); setTitleTick((t) => t + 1); }} />}
        {prepFor && (
          <PrepModal
            sc={prepFor}
            empire={empire}
            onCancel={() => setPrepFor(null)}
            onGo={(prep) => { const s = prepFor; setPrepFor(null); setEmpTick((t) => t + 1); start(s, prep); }}
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
    return <DuelView sc={sc} duel={duel} setDuel={setDuel} toast={setToast} />;
  }

  // ---------- 三选一翻牌 ----------
  if (phase === "pick" && pickScene) {
    const scene = findScene(sc, pickScene);
    return (
      <div className="pick-root">
        <h2 className="pick-title">{scene.cardPick!.title}</h2>
        <p className="muted">三张牌，翻一张，余下的归入库房。</p>
        <div className="pick-row">
          {scene.cardPick!.options.map((id) => {
            const c = cardDef(id);
            if (!c) return null;
            return (
              <TCard
                key={id}
                c={c}
                onClick={() => afterPick(id)}
                corner={<span className="rarity-tag">{c.rarity ?? "凡"}</span>}
                footer={<span className="pc-layer">{c.layer ?? "成术"}<ThemeTag id={c.id} suit={c.suit} /></span>}
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
    return <ShopView sc={sc} st={st} shop={scene.shop!} onLeave={afterShop} toast={setToast} />;
  }

  // ---------- 结案复盘 ----------
  if (phase === "verdict" && sc.verdict) {
    const v = sc.verdict;
    return (
      <div className="story-root">
        <TopBar sc={sc} st={st} onClues={() => setShowClues(true)} onBag={() => setShowBag(true)} />
        <div className="story-panel" ref={panelRef}>
          <h2>结案陈词 · 拣选线索（{picked.length}/{v.mustPick}）</h2>
          <p className="muted">呈上御案的线索，将决定此案能否经得起百官诘难。</p>
          <div className="clue-grid">
            {st.clues.map((cid) => {
              const c = sc.clues?.find((x) => x.id === cid);
              if (!c) return null;
              const on = picked.includes(cid);
              return (
                <div key={cid} className={`clue-card ${on ? "on" : ""}`} onClick={() =>
                  setPicked((p) => (p.includes(cid) ? p.filter((x) => x !== cid) : p.length < v.mustPick ? [...p, cid] : p))
                }>
                  <div className="clue-name">{c.name}</div>
                  <div className="clue-desc">{c.desc}</div>
                </div>
              );
            })}
          </div>
          <button className="btn-main" disabled={picked.length !== v.mustPick} onClick={doVerdict}>呈上御案</button>
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
                    <span className={`kind k-${c.kind}`}>{c.kind === "core" ? "核心" : c.kind === "true" ? "实据" : "存疑"}</span>
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
    return <MiniGameView sc={sc} sceneId={scene.id} onFinish={(win, mutated) => {
      const base = mutated ?? st;
      gotoFrom(base, win ? scene.minigame!.winNext : scene.minigame!.loseNext);
    }} />;
  }

  // ---------- 结局 ----------
  if (phase === "ending" && scene.ending) {
    const endImg = endArt(sc.id, scene.id);
    return (
      <div className="story-root">
        <div className="story-panel ending" ref={panelRef}>
          {endImg && <img className="ending-art" src={endImg} alt={scene.ending.name} />}
          <div className="ending-rank">{scene.ending.rank}</div>
          <h2 className="ending-name">{scene.ending.name}</h2>
          {scene.lines.map((l, i) => (
            <p key={i} className="story-line show">{l}</p>
          ))}
          <p className="muted">{scene.ending.desc}</p>
          <div className="run-report">
            <div className="run-report-title">── 本局战报 ──</div>
            <div className="stat-report">
              {Object.entries(st.stats).map(([k, v]) => (
                <span key={k}>{sc.stats?.find((s) => s.key === k)?.name ?? k}：{v}</span>
              ))}
            </div>
            <div className="stat-report">
              <span>探索 {st.visited.length + 1} 幕</span>
              {st.clues.length > 0 && <span>线索 {st.clues.length} 条</span>}
              {sc.cardSystem && <span>藏卡 {st.bag.length} 张 · 余银 {st.silver} 两</span>}
            </div>
          </div>
          <button className="btn-main" onClick={() => { setPhase("title"); setSt(null); }}>
            回到卷宗架
          </button>
        </div>
      </div>
    );
  }

  const choices = visibleChoices(scene, st);
  const sceneBg = sceneArt(sc.id, scene.id);

  return (
    <div className="story-root" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
      <TopBar sc={sc} st={st} onClues={() => setShowClues(true)} onBag={() => setShowBag(true)} />
      {sceneBg && <div className="scene-bg" style={{ backgroundImage: `url(${sceneBg})` }} aria-hidden="true" />}
      <div className="story-panel" onClick={advance} ref={panelRef}>
        {scene.title && <div className="scene-title">{scene.title}</div>}
        {scene.lines.slice(0, st.lineIndex + 1).map((l, i) => (
          <p key={i} className={`story-line ${i === st.lineIndex ? "show" : ""}`}>{l}</p>
        ))}
        {st.lineIndex >= scene.lines.length - 1 && choices.length > 0 && (
          <div className="choices" onClick={(e) => e.stopPropagation()}>
            {choices.map((c, i) => (
              <button key={c.next + i} className="choice" onClick={() => choose(i)}>
                <span>{c.text}</span>
                {c.hint && <span className="hint">—— {c.hint}</span>}
              </button>
            ))}
          </div>
        )}
        {st.lineIndex >= scene.lines.length - 1 && choices.length === 0 && scene.next && (
          <div className="continue-tip">▼ 继续（点击画面 / 空格）</div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
      {showClues && st.clues.length > 0 && (
        <div className="clue-overlay" onClick={() => setShowClues(false)}>
          <div className="clue-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <h3>卷宗 · 已录线索</h3>
            {st.clues.map((cid) => {
              const c = sc.clues?.find((x) => x.id === cid);
              return c ? (
                <div key={cid} className="clue-row">
                  <b>{c.name}</b>
                  <span className={`kind k-${c.kind}`}>{c.kind === "core" ? "核心" : c.kind === "true" ? "实据" : "存疑"}</span>
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

function TopBar({ sc, st, onClues, onBag }: { sc: Scenario; st: RunState; onClues: () => void; onBag: () => void }) {
  const [snd, setSnd] = useState(sfxEnabled());
  return (
    <div className="top-bar">
      <span className="tb-title">{sc.title}</span>
      {sc.stats?.map((s) => (
        <span key={s.key} className="stat-chip">{s.name} {st.stats[s.key]}</span>
      ))}
      {sc.cardSystem && <span className="stat-chip chip-silver">银 {st.silver}</span>}
      {st.clues.length > 0 && (
        <button className="clue-btn" onClick={() => { sfx.choice(); onClues(); }}>卷宗（{st.clues.length}）</button>
      )}
      {sc.cardSystem && (
        <button className="clue-btn" onClick={() => { sfx.choice(); onBag(); }}>背包（{st.deck.length}/{sc.deckLimit ?? 12}）</button>
      )}
      <button className="clue-btn snd-btn" onClick={() => setSnd(toggleSfx())} title={snd ? "关闭音效" : "开启音效"}>
        {snd ? "♪" : "✕♪"}
      </button>
    </div>
  );
}

// ============================================================
// 背包 / 编组
// ============================================================
function BagView({ sc, st, onClose, onMutate, toast, readOnly }: {
  sc: Scenario; st: RunState; onClose: () => void; onMutate: (s: RunState) => void; toast: (m: string) => void; readOnly: boolean;
}) {
  const limit = sc.deckLimit ?? 12;
  const def = (id: string) => sc.cards.find((c) => c.id === id) ?? getGlobalCard(id);
  const toggleDeck = (id: string) => {
    if (readOnly) return;
    const next = { ...st, deck: [...st.deck], bag: [...st.bag] };
    if (next.deck.includes(id)) {
      next.deck = next.deck.filter((c) => c !== id);
    } else if (next.deck.length < limit) {
      next.deck.push(id);
    } else { toast(`卡组已满（${limit} 张）`); return; }
    sfx.card();
    onMutate(next);
  };
  const layerName = (id: string) => def(id)?.layer ?? "成术";
  const groups: { key: string; label: string }[] = [
    { key: "成术", label: "成术卡" }, { key: "物品", label: "物品卡" },
    { key: "人物", label: "人物卡" }, { key: "资源", label: "资源卡" },
  ];
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel" onClick={(e) => e.stopPropagation()}>
        <h3>背包 · 编组（卡组 {st.deck.length}/{limit}，资源卡不占槽）</h3>
        <p className="muted">{readOnly ? "（当前只读）" : "点击卡片上/下卡组；对局只能使用卡组中的牌"}</p>
        {groups.map((g) => {
          const ids = st.bag.filter((id) => layerName(id) === g.key);
          if (!ids.length) return null;
          return (
            <div key={g.key} className="bag-group">
              <div className="bag-group-title">{g.label}</div>
              <div className="bag-grid">
                {ids.map((id) => {
                  const c = def(id)!;
                  const on = st.deck.includes(id);
                  return (
                    <TCard
                      key={id}
                      c={c}
                      onClick={() => toggleDeck(id)}
                      corner={on ? <span className="deck-tag">在组</span> : undefined}
                      footer={
                        <>
                          {c.power !== undefined && <span className="pc-power">点 {c.power} · 费 {c.cost ?? cardCost(c)}</span>}
                        </>
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        <button className="btn-main" onClick={onClose}>合上背包</button>
      </div>
    </div>
  );
}

// ============================================================
// 市集：买卡 / 卖卡 / 卡包 / 编组
// ============================================================
function ShopView({ sc, st, shop, onLeave, toast }: {
  sc: Scenario; st: RunState; shop: NonNullable<Scenario["scenes"][number]["shop"]>;
  onLeave: (s: RunState) => void; toast: (m: string) => void;
}) {
  const [local, setLocal] = useState<RunState>({ ...st, bag: [...st.bag], deck: [...st.deck] });
  const [opened, setOpened] = useState<string[] | null>(null);
  const [tab, setTab] = useState<"buy" | "pack" | "deck" | "dice">("buy");
  const def = (id: string) => sc.cards.find((c) => c.id === id);
  const limit = sc.deckLimit ?? 12;

  const buy = (id: string) => {
    const c = def(id);
    if (!c) return;
    const price = c.price ?? 10;
    if (local.silver < price) { toast("银两不足"); return; }
    if (local.bag.includes(id)) { toast("已有此卡"); return; }
    const next = { ...local, silver: local.silver - price, bag: [...local.bag, id], deck: local.deck.length < limit ? [...local.deck, id] : local.deck };
    sfx.card();
    setLocal(next);
    toast(`购得「${c.name}」（-${price} 两）`);
  };
  const sell = (id: string) => {
    const c = def(id);
    if (!c) return;
    const gain = Math.floor((c.price ?? 10) / 2);
    const next = { ...local, silver: local.silver + gain, bag: local.bag.filter((x) => x !== id), deck: local.deck.filter((x) => x !== id) };
    sfx.choice();
    setLocal(next);
    toast(`卖出「${c.name}」（+${gain} 两）`);
  };
  const openPack = (packId: string) => {
    const p = shop.packs?.find((x) => x.id === packId);
    if (!p) return;
    if (local.silver < p.price) { toast("银两不足"); return; }
    const got: string[] = [];
    const next = { ...local, silver: local.silver - p.price, bag: [...local.bag], deck: [...local.deck] };
    for (let i = 0; i < p.draws; i++) {
      const id = p.pool[Math.floor(Math.random() * p.pool.length)]!;
      const c = def(id);
      if (c?.resource) next.silver += c.resource;
      else if (!next.bag.includes(id)) { next.bag.push(id); if (next.deck.length < limit) next.deck.push(id); }
      got.push(id);
    }
    sfx.win();
    setLocal(next);
    setOpened(got);
  };

  return (
    <div className="shop-root">
      <div className="shop-header">
        <h2>{shop.name}</h2>
        <span className="chip-silver stat-chip">银 {local.silver} 两</span>
        <div className="shop-tabs">
          {(["buy", "pack", "deck", "dice"] as const).map((t) => (
            <button key={t} className={`shop-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
              {t === "buy" ? "货架" : t === "pack" ? "卡包" : t === "deck" ? "编组" : "赌坊"}
            </button>
          ))}
        </div>
        <button className="btn-main" onClick={() => { setOpened(null); onLeave(local); }}>离市</button>
      </div>
      {shop.desc && <p className="muted shop-desc">{shop.desc}</p>}

      {opened && (
        <div className="pick-root overlay-mini">
          <h3>卡包开出</h3>
          <div className="pick-row">
            {opened.map((id, i) => {
              const c = def(id);
              if (!c) return null;
              return (
                <TCard
                  key={i}
                  c={c}
                  corner={<span className="rarity-tag">{c.rarity ?? "凡"}</span>}
                  footer={<span className="pc-layer">{c.layer ?? "成术"}{c.resource ? ` · +${c.resource} 两` : ""}</span>}
                />
              );
            })}
          </div>
          <button className="link-btn" onClick={() => setOpened(null)}>收起</button>
        </div>
      )}

      {tab === "buy" && (
        <div className="shop-grid">
          {shop.stock.map((id) => {
            const c = def(id);
            if (!c) return null;
            const owned = local.bag.includes(id);
            return (
              <TCard
                key={id}
                c={c}
                corner={owned ? <span className="rarity-tag corner-owned">已有</span> : undefined}
                footer={
                  <div className="shop-actions">
                    {/* 只标数字银两：买不起=置灰，已有=角标提示 */}
                    <button className="btn-main" disabled={owned || local.silver < (c.price ?? 10)} onClick={() => buy(id)}>
                      {c.price ?? 10} 两
                    </button>
                    {owned && <button className="link-btn" onClick={() => sell(id)}>{Math.floor((c.price ?? 10) / 2)} 两</button>}
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {tab === "pack" && (
        <div className="shop-grid">
          {shop.packs?.map((p) => (
            <div key={p.id} className="shop-card">
              <div className="bag-card-name">{p.name}</div>
              <div className="pc-text">随机 {p.draws} 张，出自 {p.pool.length} 种卡池。</div>
              <button className="btn-main" disabled={local.silver < p.price} onClick={() => openPack(p.id)}>{p.price} 两</button>
            </div>
          ))}
          {!shop.packs?.length && <p className="muted">此处没有卡包出售。</p>}
        </div>
      )}

      {tab === "dice" && <SicboPanel silver={local.silver} onSilver={(delta, msg) => {
        const next = { ...local, silver: Math.max(0, local.silver + delta) };
        setLocal(next);
        toast(msg);
      }} />}

      {tab === "deck" && (
        <BagView sc={sc} st={local} onClose={() => setTab("buy")} onMutate={setLocal} toast={toast} readOnly={false} />
      )}
    </div>
  );
}

// ============================================================
// 对局视图（v2：手牌 / 行动力 / 道具 / 被动；classic：原样）
// ============================================================
function DuelView({ sc, duel, setDuel, toast }: {
  sc: Scenario; duel: DuelState; setDuel: (d: DuelState) => void; toast: (m: string) => void;
}) {
  const cardOf = (id: string): CardDef => {
    const c = sc.cards.find((x) => x.id === id) ?? duel.cfg.oppCards?.find((x) => x.id === id) ?? getGlobalCard(id);
    if (!c) throw new Error(`卡牌不存在: ${id}（对局 ${duel.cfg.id}）`);
    return c;
  };

  const moodText = useMemo(() => {
    if (duel.mode !== "emotion" || !duel.opponentShown) return null;
    const mood: Record<string, string> = {
      策: "他目光闪动，话里藏着机锋，像在盘算什么。",
      器: "他摩挲着手边一件物事，话里尽是实打实的好处。",
      势: "他往椅背上一靠，气派先压了人半截。",
      隐: "他垂着眼，语焉不详——有些事，只能意会，不可明言。",
    };
    return mood[duel.opponentShown];
  }, [duel.mode, duel.opponentShown]);

  const passiveText = duel.passives.length
    ? duel.passives.map((p) => `${p.suit ? `${p.suit}牌+${p.power}` : ""}${p.qi ? ` 气力上限+${p.qi}` : ""}${p.draw ? ` 多抽${p.draw}` : ""}`.trim()).join("；")
    : null;

  const clickCard = (id: string) => {
    if (duel.finished) return;
    sfx.card();
    const card = cardOf(id);
    if (duel.mode === "emotion") {
      if (!duel.opponentShown) return;
      const ok = playEmotion(duel, card);
      if (!ok) { toast("人物卡是被动，不能打出"); return; }
      const kind = duel.lastResult?.kind;
      if (kind === "match") sfx.match();
      else if (kind === "press" || kind === "item") sfx.press();
      else if (kind === "miss") sfx.miss();
      else if (kind === "win") sfx.win();
      else if (kind === "lose") sfx.lose();
      if (duel.finished !== "win") revealEmotion(duel);
    } else {
      const oppId = duel.cfg.script[duel.round % duel.cfg.script.length] ?? duel.cfg.script[0]!;
      const ok = playPressure(duel, card, oppId, cardOf);
      if (!ok) { toast(card.layer === "人物" ? "人物卡是被动，不能打出" : "行动力不足"); return; }
      if (duel.finished) (duel.finished === "win" ? sfx.win : sfx.lose)();
      else sfx.press();
    }
    setDuel({ ...duel });
  };

  const doEndTurn = () => {
    sfx.choice();
    endTurn(duel);
    setDuel({ ...duel });
  };

  const v2 = duel.rules === "v2";
  const handIds = v2 ? duel.hand : duel.cfg.deck;

  return (
    <div className="duel-root">
      <div className="duel-header">
        <div className="duel-title">{duel.cfg.title}</div>
        <div className="muted">{duel.cfg.opponent.name} · {duel.cfg.opponent.desc}{v2 ? " · 【v2 手牌制】" : ""}</div>
        {passiveText && <div className="muted">携带被动：{passiveText}</div>}
      </div>

      <div className="duel-status">
        {duel.mode === "emotion" ? (
          <>
            <span className="rapport-dots">
              <span className="st-label">共鸣</span>
              {Array.from({ length: duel.cfg.goal ?? 3 }, (_, i) => (
                <i key={i} className={i < duel.rapport ? "on" : ""} />
              ))}
            </span>
            <span><span className="st-label">防备</span>{duel.guard}</span>
            <span><span className="st-label">气力</span><QiBar cur={duel.qi} max={10} /></span>
          </>
        ) : (
          <>
            <span><span className="st-label">我方气力</span><QiBar cur={duel.hpPlayer} max={duel.cfg.hp?.player ?? 10} /></span>
            <span><span className="st-label">{duel.cfg.opponent.name}气力</span><QiBar cur={duel.hpOpponent} max={duel.cfg.hp?.opponent ?? 10} foe /></span>
          </>
        )}
        {v2 && duel.mode === "pressure" && <span><span className="st-label">行动力</span>{duel.ap}</span>}
        {v2 && <span className="muted">牌库 {duel.library.length} · 手牌 {duel.hand.length} · 弃牌 {duel.discard.length}</span>}
      </div>

      <div className="duel-stage">
        {duel.mode === "emotion" && duel.opponentShown && (
          <div className={`mood-banner`} style={{ borderLeftColor: `var(--suit-${duel.opponentShown === "策" ? "ce" : duel.opponentShown === "器" ? "qi" : duel.opponentShown === "势" ? "shi" : "yin"})` }}>
            <SuitSeal suit={duel.opponentShown} />
            <span className={`mood-suit-name s-${duel.opponentShown}`}>所求 · {duel.opponentShown}</span>
            {moodText && <p className="opp-line">{moodText}</p>}
          </div>
        )}
        {duel.mode === "emotion" && !duel.opponentShown && moodText && <p className="opp-line">{moodText}</p>}
        {duel.mode === "pressure" && !v2 && (
          <p className="opp-line">对手蓄势待发……出牌比点，点高者伤敌；势牌点数翻倍，但反噬自身一点气力。</p>
        )}
        {v2 && duel.mode === "pressure" && (
          <p className="opp-line">
            对手下一手：「{cardOf(duel.cfg.script[duel.round % duel.cfg.script.length] ?? duel.cfg.script[0]!).name}」
            <SuitSeal suit={cardOf(duel.cfg.script[duel.round % duel.cfg.script.length] ?? duel.cfg.script[0]!).suit} />
            <span className="edge-hint">出「{RESTRAIN_UI[cardOf(duel.cfg.script[duel.round % duel.cfg.script.length] ?? duel.cfg.script[0]!).suit ?? ""]}」牌可克敌（+1）；每牌耗 1 行动力，行动力尽可【换气】。</span>
          </p>
        )}
        {duel.lastResult && <p className={`duel-log ${duel.lastResult.kind}`}>{duel.lastResult.text}</p>}
        {duel.lastPlay && duel.mode === "pressure" && !duel.lastResult?.kind.includes("item") && (
          <p className="duel-log press">
            {duel.lastPlay.stale && "（招式用老，点数-2！）"}
            {duel.lastPlay.edge === 1 && "（克敌牌色，点数+1）"}
            {duel.lastPlay.edge === -1 && "（被敌牌色所克，点数-1）"}
            你打出「{duel.lastPlay.playerCard?.name}」（{duel.lastPlay.playerCard?.power}{duel.lastPlay.playerCard?.suit === "势" ? "×2" : ""}{duel.lastPlay.stale ? "-2" : ""}{duel.lastPlay.edge ? (duel.lastPlay.edge > 0 ? "+1" : "-1") : ""}），他打出「{duel.lastPlay.oppCard?.name}」（{duel.lastPlay.oppCard?.power}）——
            {duel.lastPlay.to === "o"
              ? `他折了 ${duel.lastPlay.damage} 点气力！`
              : duel.lastPlay.to === "p"
                ? `你折了 ${duel.lastPlay.damage} 点气力！`
                : "两败俱伤。"}
          </p>
        )}
        {duel.finished && (
          <p className={`duel-log ${duel.finished}`}>{duel.finished === "win" ? "—— 此局，胜。" : "—— 此局，败。"}</p>
        )}
        {v2 && !duel.finished && duel.mode === "pressure" && (
          <button className="btn-main end-turn-btn" onClick={doEndTurn}>换气（结束本回合，补牌+行动力）</button>
        )}
      </div>

      <div className="hand">
        {handIds.map((id) => {
          const c = cardOf(id);
          const disabled = !!duel.finished || (duel.mode === "emotion" && !duel.opponentShown) || (v2 && duel.mode === "pressure" && duel.ap < cardCost(c));
          const isChar = (c.layer ?? "成术") === "人物";
          return (
            <button key={id} className={`play-card rarity-${c.rarity ?? "凡"} ${c.suit ? `suit-${c.suit}` : ""} ${isChar ? "char-card" : ""}`} disabled={disabled && !isChar ? true : !!duel.finished || (duel.mode === "emotion" && !duel.opponentShown)} onClick={() => clickCard(id)}>
              <CardArt id={c.id} name={c.name} compact />
              <div className="pc-top">
                {c.suit && <SuitSeal suit={c.suit} />}
                <span className="rarity-tag">{c.rarity ?? "凡"}</span>
                <ThemeTag id={c.id} suit={c.suit} />
                {v2 && duel.mode === "pressure" && <span className="cost-tag">费{cardCost(c)}</span>}
              </div>
              <div className="pc-name">{c.name}</div>
              <div className="pc-text">{c.text}</div>
              {c.power !== undefined && <div className="pc-power">点数 {c.power}{c.suit === "势" ? "×2（反噬1）" : ""}</div>}
              {isChar && <div className="pc-power">被动 · 不可打出</div>}
            </button>
          );
        })}
      </div>
      <p className="duel-rule muted">
        {duel.mode === "emotion"
          ? v2
            ? "v2 规则：出牌不耗行动力；打出的牌进弃牌堆，每轮补牌至 4 张。同色=共鸣+1；克色（策克势·势克器·器克隐·隐克策）=破防备；被克=失言气力-2，错色=失言气力-1。"
            : "规则：同色接话=共鸣+1；克色（策克势·势克器·器克隐·隐克策）=破其防备；被克=失言气力-2，错色=失言气力-1。共鸣满则胜，气力尽则败。"
          : v2
            ? "v2 规则：每牌耗费 1 行动力，点差即伤害；克敌牌色+1、被克-1；势×2反噬1；连出同张「招式用老」-2；物品卡一锤定音。"
            : "规则：每回合各出一牌比点，点差即伤害；势牌×2但反噬1；连出同一张牌招式用老-2。先打空对方气力者胜。"}
      </p>
    </div>
  );
}


// ============================================================
// 场景化小游戏
// ============================================================
function MiniGameView({ sc, sceneId, onFinish }: {
  sc: Scenario; sceneId: string; onFinish: (win: boolean, mutated?: RunState) => void;
}) {
  const scene = findScene(sc, sceneId);
  const mg = scene.minigame!;
  const [puzzle, setPuzzle] = useState<PuzzleState | null>(null);
  const [jiuling, setJiuling] = useState<JiulingState | null>(null);
  const [done, setDone] = useState(false);

  if (mg.type === "gobang" && !puzzle) setPuzzle(initPuzzle(mg.gobang!));
  if (mg.type === "jiuling" && !jiuling) setJiuling(initJiuling(mg.jiuling!));

  return (
    <div className="shop-root">
      <div className="shop-header">
        <h2>{mg.type === "gobang" ? (mg.gobang?.title ?? "手谈") : (mg.jiuling?.title ?? "行令")}</h2>
      </div>

      {mg.type === "gobang" && puzzle && (
        <div className="story-panel">
          {puzzle.status === "playing" && puzzle.puzzle.board && (
            <div className="gobang-wrap">
              <div className="gobang-board" aria-label="残局图">
                {puzzle.puzzle.board.map((row, r) => (
                  <div key={r} className="gobang-row">
                    {[...row].map((ch, ci) => (
                      <span key={ci} className={`gobang-cell ${ch === "B" ? "b" : ch === "W" ? "w" : ""}`} />
                    ))}
                  </div>
                ))}
              </div>
              {puzzle.puzzle.boardHint && <p className="muted gobang-hint">{puzzle.puzzle.boardHint}</p>}
            </div>
          )}
          <p className="story-line show">{puzzle.log}</p>
          {puzzle.status === "playing" && (
            <div className="choices">
              {puzzle.puzzle.steps[puzzle.step]?.options.map((o, i) => (
                <button key={i} className="choice" onClick={() => {
                  sfx.card();
                  puzzlePlay(puzzle, i);
                  if (puzzle.status === "win") sfx.win(); else if (puzzle.status === "lose") sfx.lose(); else sfx.match();
                  setPuzzle({ ...puzzle });
                }}>{o}</button>
              ))}
            </div>
          )}
          {puzzle.status !== "playing" && !done && (
            <button className="btn-main" onClick={() => { setDone(true); onFinish(puzzle.status === "win"); }}>{puzzle.status === "win" ? "收下彩头" : "拱手告退"}</button>
          )}
        </div>
      )}

      {mg.type === "jiuling" && jiuling && (
        <div className="story-panel">
          <div className="jiuling-hand" title="你手上的酒牌">
            {jiuling.hand.map((s, i) => <span key={i} className={`wine-chip suit-${s}`}>{s}</span>)}
          </div>
          <p className="story-line show">{jiuling.log}</p>
          <p className="muted">第 {Math.min(jiuling.round + 1, jiuling.cfg.rounds)} / {jiuling.cfg.rounds} 轮 · 得彩 {jiuling.score}</p>
          {jiuling.status === "playing" && !jiuling.drawn && (
            <button className="btn-main" onClick={() => { sfx.card(); jiulingDraw(jiuling); setJiuling({ ...jiuling }); }}>翻令签</button>
          )}
          {jiuling.status === "playing" && jiuling.drawn && (
            <div className="choices">
              {[...new Set(jiuling.hand)].map((s) => (
                <button key={s} className="choice" onClick={() => {
                  jiulingPlay(jiuling, s);
                  if (jiuling.status === "win") sfx.win(); else if (jiuling.status === "lose") sfx.lose(); else sfx.match();
                  setJiuling({ ...jiuling });
                }}>应令 · 出「{s}」牌</button>
              ))}
            </div>
          )}
          {jiuling.status !== "playing" && !done && (
            <button className="btn-main" onClick={() => { setDone(true); onFinish(jiuling.status === "win"); }}>{jiuling.status === "win" ? "领赏" : "落座"}</button>
          )}
        </div>
      )}

      {done && <p className="muted">（继续……）</p>}
    </div>
  );
}

function SicboPanel({ silver, onSilver }: { silver: number; onSilver: (delta: number, msg: string) => void }) {
  const [st, setSt] = useState<SicboState>(() => initSicbo());
  const [side, setSide] = useState<"大" | "小" | "豹">("大");
  const [cheat, setCheat] = useState(false);
  const roll = () => {
    if (st.bet <= 0 || st.bet > silver) { onSilver(0, "押注超过身家"); return; }
    sicboRoll(st, side, cheat);
    const pay = sicboPayout(st);
    sfx.card();
    if (st.result === "win") sfx.win(); else sfx.lose();
    setSt({ ...st });
    onSilver(pay, st.log + (pay !== 0 ? `（${pay > 0 ? "+" : ""}${pay} 两）` : ""));
  };
  return (
    <div className="story-panel" style={{ maxWidth: 640 }}>
      <p className="muted">三枚骰盅，买定离手。大（11-17）/ 小（4-10）一赔一，豹子（三同）一赔五。出千七成胜面——两成概率被抓，输双倍。</p>
      <div className="duel-status">
        <span>身家 {silver} 两</span>
        <span>押注 {st.bet} 两</span>
        <span>当前买：{side}{cheat ? "（出千）" : ""}</span>
      </div>
      {st.dice && <p className="story-line show">{st.log}</p>}
      <div className="choices">
        <button className="choice" onClick={() => { sicboSetBet(st, st.bet + 5, silver); setSt({ ...st }); }}>押注 +5</button>
        <button className="choice" onClick={() => { sicboSetBet(st, Math.max(5, st.bet - 5), silver); setSt({ ...st }); }}>押注 -5</button>
        {(["大", "小", "豹"] as const).map((s) => (
          <button key={s} className={`choice ${side === s ? "on-choice" : ""}`} onClick={() => setSide(s)}>买「{s}」</button>
        ))}
        <button className={`choice ${cheat ? "on-choice" : ""}`} onClick={() => setCheat(!cheat)}>{cheat ? "已备骱子（出千）" : "袖里藏骱（出千）"}</button>
        <button className="choice" onClick={roll} disabled={st.bet <= 0 || st.bet > silver}>{st.bet > silver ? "押注超过身家" : "摇盅！"}</button>
      </div>
    </div>
  );
}


// ============================================================
// 卡牌图鉴：收集进度（未见过 = ？？？）
// ============================================================
function CardGallery({ sc, onClose }: { sc: Scenario; onClose: () => void }) {
  const seen = new Set(getCardSeen()[sc.id] ?? []);
  const groups: { key: string; label: string }[] = [
    { key: "成术", label: "成术卡" }, { key: "物品", label: "物品卡" },
    { key: "人物", label: "人物卡" }, { key: "资源", label: "资源卡" },
  ];
  const collectible = sc.cards.filter((c) => (c.layer ?? "成术") !== "资源");
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel" onClick={(e) => e.stopPropagation()}>
        <h3>{sc.title} · 卡牌图鉴</h3>
        <p className="muted">已收录 {seen.size}/{sc.cards.length} 张（资源卡不计入收集）</p>
        {groups.map((g) => {
          const ids = sc.cards.filter((c) => (c.layer ?? "成术") === g.key);
          if (!ids.length) return null;
          return (
            <div key={g.key} className="bag-group">
              <div className="bag-group-title">{g.label}</div>
              <div className="bag-grid">
                {ids.map((c) => (
                  <TCard key={c.id} c={c} unknown={!seen.has(c.id)} />
                ))}
              </div>
            </div>
          );
        })}
        <button className="btn-main" onClick={onClose}>合上图鉴</button>
        <span className="muted" style={{ marginLeft: 12 }}>非卖品孤品 {collectible.filter(c => c.rarity === "孤品" && seen.has(c.id)).length}/{collectible.filter(c => c.rarity === "孤品").length} 张现世</span>
      </div>
    </div>
  );
}

// ============================================================
// 帝国：商市 / 行囊（跨剧本仓库）/ 图鉴集合 / 设置 / 出征准备
// ============================================================

/** 帝国商市：开局加成（消耗品）+ 主题外观（永久） */
function EmporiumPanel({ onClose, toast, onTheme }: { onClose: () => void; toast: (m: string) => void; onTheme: () => void }) {
  const [, setTick] = useState(0);
  const e = settleEmpire();
  const buyBoost = (b: { id: string; name: string; price: number }) => {
    if (!spendInk(b.price)) { toast("墨铤不足"); return; }
    gainBoost(b.id);
    sfx.card();
    toast(`已购「${b.name}」，出征时勾选生效`);
    setTick((t) => t + 1);
  };
  const applyTheme = (id: string) => { saveTheme(id); setTick((t) => t + 1); onTheme(); };
  const buyTheme = (t: { id: string; name: string; price: number }) => {
    if (!spendInk(t.price)) { toast("墨铤不足"); return; }
    unlockTheme(t.id);
    applyTheme(t.id);
    sfx.card();
    toast(`已解锁并换装「${t.name}」`);
  };
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel emporium" onClick={(ev) => ev.stopPropagation()}>
        <h3>帝国商市 <span className="ink-chip"><IngotIcon /> 墨铤 {e.ink}</span></h3>
        <p className="muted">解锁结局可获墨铤（每个 {INK_PER_ENDING}）。开局加成出征时勾选，用过即消耗。</p>
        <div className="bag-group">
          <div className="bag-group-title">开局加成</div>
          <div className="emporia-grid">
            {SHOP_BOOSTS.map((b) => (
              <div key={b.id} className="emporia-item">
                <div className="emporia-name">{b.name} {e.boosts[b.id] ? <span className="deck-tag">×{e.boosts[b.id]}</span> : null}</div>
                <div className="emporia-desc">{b.desc}</div>
                <button className="emporia-buy" onClick={() => buyBoost(b)} disabled={e.ink < b.price}>购 · {b.price} 墨铤</button>
              </div>
            ))}
          </div>
        </div>
        <div className="bag-group">
          <div className="bag-group-title">主题外观</div>
          <div className="emporia-grid">
            <div className={`emporia-item ${e.theme === "" ? "on" : ""}`}>
              <div className="emporia-name">墨褐古卷 {e.theme === "" && <span className="deck-tag">当前</span>}</div>
              <div className="emporia-desc">默认配色，暗底羊皮</div>
              <button className="emporia-buy" onClick={() => { applyTheme(""); sfx.card(); }}>换装</button>
            </div>
            {SHOP_THEMES.map((t) => {
              const owned = e.themes.includes(t.id);
              return (
                <div key={t.id} className={`emporia-item ${e.theme === t.id ? "on" : ""}`}>
                  <div className="emporia-name">{t.name} {e.theme === t.id && <span className="deck-tag">当前</span>}</div>
                  <div className="emporia-desc">{t.desc}</div>
                  {owned ? (
                    <button className="emporia-buy" onClick={() => { applyTheme(t.id); sfx.card(); }}>换装</button>
                  ) : (
                    <button className="emporia-buy" onClick={() => buyTheme(t)} disabled={e.ink < t.price}>购 · {t.price} 墨铤</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <button className="btn-main" onClick={onClose}>离市</button>
      </div>
    </div>
  );
}

/** 行囊：已获得物品卡的自动收藏，出征时可勾选携带 */
function LuggagePanel({ onClose }: { onClose: () => void }) {
  const defs = luggageDefs();
  const [zoom, setZoom] = useState<CardDef | null>(null);
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>行囊</h3>
        <p className="muted">剧本中获得的物品卡会自动收入此处，无需手动存放；出征新剧本时可勾选携带至多 2 件。点卡可展阅。</p>
        {defs.length === 0 ? (
          <p className="muted" style={{ padding: "24px 0" }}>行囊空空——先去剧本里攒几件趁手家伙。</p>
        ) : (
          <div className="bag-group">
            <div className="bag-group-title">在囊（{defs.length}）</div>
            <div className="bag-grid">
              {defs.map((c) => (
                <div key={c.id} className={`bag-card rarity-${c.rarity ?? "凡"} ${c.suit ? `suit-${c.suit}` : ""}`} onClick={() => { sfx.choice(); setZoom(c); }}>
                  <CardArt id={c.id} name={c.name} compact />
                  <div className="bag-card-head">
                    <SuitSeal suit={c.suit} />
                    <span className="bag-card-name">{c.name}</span>
                    <ThemeTag id={c.id} suit={c.suit} />
                  </div>
                  <div className="pc-text">{c.text}</div>
                  {c.lore && <div className="bag-lore">{c.lore}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        <button className="btn-main" onClick={onClose}>合上行囊</button>
      </div>
      {zoom && (
        <div className="clue-overlay luggage-zoom-overlay" onClick={() => setZoom(null)}>
          <div className={`bag-card bag-card-zoom rarity-${zoom.rarity ?? "凡"} ${zoom.suit ? `suit-${zoom.suit}` : ""}`} onClick={(ev) => ev.stopPropagation()}>
            <CardArt id={zoom.id} name={zoom.name} />
            <div className="bag-card-head">
              <SuitSeal suit={zoom.suit} />
              <span className="bag-card-name">{zoom.name}</span>
              <ThemeTag id={zoom.id} suit={zoom.suit} />
            </div>
            <div className="pc-text">{zoom.text}</div>
            {zoom.lore && <div className="bag-lore">{zoom.lore}</div>}
            <button className="btn-main" onClick={() => setZoom(null)}>收回行囊</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 图鉴集合：结局图鉴（可点入详情）+ 各剧本卡牌图鉴入口 */
function GalleryPanel({ gallery, onClose, onCardGallery }: {
  gallery: { scenarioId: string; endingName: string; rank: string }[];
  onClose: () => void;
  onCardGallery: (s: Scenario) => void;
}) {
  const [detail, setDetail] = useState<{ scId: string; name: string; rank: string } | null>(null);
  const dSc = detail ? SCENARIOS.find((s) => s.id === detail.scId) : undefined;
  const dScene = dSc?.scenes.find((x) => x.ending?.name === detail?.name);
  const dArt = dSc && dScene ? endArt(dSc.id, dScene.id) : undefined;
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel gallery-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>图鉴 · 天下事与天下牌</h3>
        <div className="bag-group">
          <div className="bag-group-title">结局图鉴（{gallery.length}）· 点击翻阅</div>
          {gallery.length === 0 ? (
            <p className="muted">尚未解锁任何结局。</p>
          ) : (
            <div className="gallery-ends">
              {SCENARIOS.map((s) => {
                const endScenes = s.scenes.filter((x) => x.ending);
                const unlockedNames = new Set(gallery.filter((g) => g.scenarioId === s.id).map((g) => g.endingName));
                if (!endScenes.length || !unlockedNames.size) return null;
                return (
                  <div key={s.id} className="gallery-end-row">
                    <div className="gallery-end-sc">{s.title}<span className="muted">{unlockedNames.size}/{endScenes.length}</span></div>
                    <div className="end-grid">
                      {endScenes.map((scene) => {
                        const on = unlockedNames.has(scene.ending!.name);
                        if (!on) {
                          return (
                            <div key={scene.id} className="end-tile end-tile-unknown">
                              <div className="end-tile-art">？？？</div>
                              <span className="end-tile-name">？？？</span>
                              <span className="end-tile-rank">未探明</span>
                            </div>
                          );
                        }
                        const art = endArt(s.id, scene.id);
                        return (
                          <button key={scene.id} className="end-tile" onClick={() => { sfx.choice(); setDetail({ scId: s.id, name: scene.ending!.name, rank: scene.ending!.rank }); }}>
                            {art ? (
                              <img className="end-tile-art" src={art} alt={scene.ending!.name} loading="lazy" />
                            ) : (
                              <div className="end-tile-art end-tile-noart">墨色尚缺</div>
                            )}
                            <span className="end-tile-name">{scene.ending!.name}</span>
                            <span className="end-tile-rank">{scene.ending!.rank}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="bag-group">
          <div className="bag-group-title">卡牌图鉴</div>
          <div className="gallery-sc-list">
            {SCENARIOS.filter((s) => s.cardSystem).map((s) => {
              const seen = (getCardSeen()[s.id] ?? []).length;
              const total = s.cards.filter((c) => (c.layer ?? "成术") !== "资源").length;
              return (
                <button key={s.id} className="gallery-sc-btn" onClick={() => { sfx.choice(); onCardGallery(s); }}>
                  {s.title}
                  <span className="gsc-progress"><i style={{ width: `${total ? Math.round((seen / total) * 100) : 0}%` }} /></span>
                  <span className="muted">{seen}/{total}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button className="btn-main" onClick={onClose}>合上图鉴</button>
      </div>
      {detail && (
        <div className="clue-overlay ending-detail-overlay" onClick={(ev) => { ev.stopPropagation(); setDetail(null); }}>
          <div className="bag-panel ending-detail" onClick={(ev) => ev.stopPropagation()}>
            {dArt ? (
              <img className="ending-detail-art" src={dArt} alt={detail.name} />
            ) : (
              <div className="ending-detail-art ending-detail-noart">卷轴空留 · 墨色尚缺</div>
            )}
            <div className="ending-detail-rank">{detail.rank}</div>
            <h3 className="ending-detail-name">{detail.name}</h3>
            <p className="ending-detail-sc">《{dSc?.title ?? detail.scId}》</p>
            {dScene?.ending?.desc && <p className="ending-detail-desc">{dScene.ending.desc}</p>}
            <button className="btn-main" onClick={() => setDetail(null)}>合上此页</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 设置：音效 / 存档管理 */
function SettingsPanel({ onClose, onCleared }: { onClose: () => void; onCleared: () => void }) {
  const [snd, setSnd] = useState(sfxEnabled());
  const [armed, setArmed] = useState(false);
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel settings-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>设置</h3>
        <div className="settings-row">
          <span>音效</span>
          <button className="emporia-buy" onClick={() => setSnd(toggleSfx())}>{snd ? "开（点关）" : "关（点开）"}</button>
        </div>
        <div className="settings-row">
          <span>存档</span>
          {armed ? (
            <span className="settings-confirm">
              确定放弃全部进度？
              <button className="emporia-buy danger" onClick={() => { onCleared(); onClose(); }}>确定放弃</button>
              <button className="emporia-buy" onClick={() => setArmed(false)}>反悔</button>
            </span>
          ) : (
            <button className="emporia-buy danger" onClick={() => setArmed(true)}>放弃存档</button>
          )}
        </div>
        <p className="muted">帝成观止 · 剧本引擎 × 卡牌系统 v2 × 四色相克（策克势·势克器·器克隐·隐克策）</p>
        <button className="btn-main" onClick={onClose}>合上</button>
      </div>
    </div>
  );
}

/** 出征准备：勾选开局加成 + 携带仓库物品 */
function PrepModal({ sc, onCancel, onGo }: {
  sc: Scenario; empire: ReturnType<typeof settleEmpire>;
  onCancel: () => void; onGo: (prep: PrepChoice) => void;
}) {
  const e = settleEmpire();
  const [boosts, setBoosts] = useState<string[]>([]);
  const [carry, setCarry] = useState<string[]>([]);
  const luggageItems = luggageDefs();
  const toggleBoost = (id: string) => {
    setBoosts((xs) => xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);
  };
  const toggleCarry = (id: string) => {
    setCarry((xs) => {
      if (xs.includes(id)) return xs.filter((x) => x !== id);
      if (xs.length >= 2) return xs;
      return [...xs, id];
    });
  };
  return (
    <div className="clue-overlay" onClick={onCancel}>
      <div className="bag-panel prep-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>出征 · {sc.title}</h3>
        <div className="bag-group">
          <div className="bag-group-title">开局加成（持有才可勾选，开审即消耗）</div>
          {SHOP_BOOSTS.every((b) => !(e.boosts[b.id] ?? 0)) ? (
            <p className="muted">暂无加成——去商市用墨铤购置。</p>
          ) : (
            <div className="prep-list">
              {SHOP_BOOSTS.filter((b) => (e.boosts[b.id] ?? 0) > 0).map((b) => (
                <label key={b.id} className="prep-item">
                  <input type="checkbox" checked={boosts.includes(b.id)} onChange={() => toggleBoost(b.id)} />
                  <span>{b.name} ×{e.boosts[b.id]} <span className="muted">· {b.desc}</span></span>
                </label>
              ))}
            </div>
          )}
        </div>
        {sc.cardSystem && (
          <div className="bag-group">
            <div className="bag-group-title">从行囊携带（至多 2 件）</div>
            {luggageItems.length === 0 ? (
              <p className="muted">行囊中没有可携带的物品——先在剧本里获得几件物品卡。</p>
            ) : (
              <div className="prep-list">
                {luggageItems.map((c) => (
                  <label key={c.id} className="prep-item">
                    <input type="checkbox" checked={carry.includes(c.id)} onChange={() => toggleCarry(c.id)} />
                    <span>{c.name} <span className="muted">· {c.text}</span></span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="prep-actions">
          <button className="btn-main" onClick={() => { sfx.card(); onGo({ boosts, carry }); }}>开审</button>
          <button className="link-btn" onClick={onCancel}>再想想</button>
        </div>
      </div>
    </div>
  );
}
