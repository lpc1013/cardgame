import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import type { Scenario, CardDef, Suit } from "./engine/types";
import { initState, findScene, visibleChoices, applyEffects, registerScenarios, checkCond, type RunState } from "./engine/runtime";
import { initDuel, revealEmotion, playEmotion, playPressure, endTurn, readEmotion, chargeUp, breakMove, cardCost, duelSpend, DEFAULT_GOAL, type DuelState, type DuelBoosts } from "./engine/duel";
import {
  saveGame, loadGame, clearSave, unlockEnding, getGallery, recordTreeVisit, getTree, recordCardsSeen, getCardSeen,
  settleEmpire, spendInk, gainBoost, consumeBoosts, unlockTheme, setTheme as saveTheme, addRetinue, recordWarLoss, buyPeaceDeal, bumpCounter, getCounter, END_MILES, setTotalEnds, getTotalEnds, buyLuggageSlot, exchangeSilver, grantTitle, consumeSpareSilver, claimMile,
  registerGlobalCards, getGlobalCard, getGlobalCards, INK_PER_ENDING,
  unsealScenario, UNSEAL_COST,
  getBonuses, unlockBonus,
} from "./engine/save";
import { SHOP_BOOSTS, SHOP_THEMES } from "./data/empireShop";
import { ACHIEVEMENTS, checkDuelAchievements, checkMinigameAchievements, checkEndingAchievements, type AchCategory, type AchievementDef } from "./data/achievements";
import { getAchievements, unlockAchievement } from "./engine/save";
import { bonusOfCard, bonusOfScenario } from "./data/bonus";
import { TreeView } from "./components/TreeView";
import { sfx, sfxEnabled, toggleSfx } from "./engine/sfx";
import { initSicbo, sicboRoll, sicboPayout, sicboSetBet, initPuzzle, puzzlePlay, initJiuling, jiulingDraw, jiulingPlay, initQuiz, quizAnswer, initPaijiu, paijiuBet, paijiuFold, type SicboState, type PuzzleState, type JiulingState, type QuizState, type PaijiuState } from "./engine/minigames";
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
import "./ui-audit.css";

const SCENARIOS: Scenario[] = [
  fuma, qiuwei, sichou, xie, qinhuai,
  jieyu, shumian, changjiang,
  diaolan, changhen, jianfeng, touming, xingxing,
];
registerScenarios(SCENARIOS);
// 结局进度分母动态注入：以数据实有结局场景数为准（A-3 防漂移）
setTotalEnds(SCENARIOS.reduce((n, s) => n + s.scenes.filter(x => x.ending).length, 0));

// ============================================================
// 美术接入（皮）：运行时按 id 载入 src/assets/{cards,portraits,scenes}/<id>.{jpg,png}
// 图片缺失（外部生成尚未落位）则不出图，文本布局照常，游戏完全不受影响。
// 甲·去字化纹章：父分类只作色相 + 非汉字 SVG 纹章，绝不渲染「策/器/势」字面。
// 乙·双轴门类：卡面主类目由 cardThemes 查表给出（~13 词），替代四字重复。
// ============================================================
const _CARD_ART = import.meta.glob("./assets/cards/*/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const _PORTRAIT_ART = import.meta.glob("./assets/portraits/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const _SCENE_ART = import.meta.glob("./assets/scenes/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const _COVER_ART = import.meta.glob("./assets/covers/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const _END_ART = import.meta.glob("./assets/endings/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
/** 成就图标：assets/achievements/ach_<id>.{jpg,png}（无图时 UI 用 emoji 兜底） */
const _ACH_ART = import.meta.glob("./assets/achievements/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const achArt = (id: string) => _ACH_ART[`./assets/achievements/ach_${id}.jpg`] ?? _ACH_ART[`./assets/achievements/ach_${id}.png`];
/** 按 id 查图：遍历全部 key 匹配 `/<id>.<ext>` 结尾（兼容 cards 五子目录/portraits/scenes 前缀命名等任意目录层级） */
function _artUrl(map: Record<string, string>, id: string): string | undefined {
  for (const ext of [".jpg", ".jpeg", ".png"]) {
    const hit = Object.entries(map).find(([k]) => k.endsWith(`/${id}${ext}`));
    if (hit) return hit[1];
  }
  return undefined;
}
function cardArt(id: string): string | undefined {
  return _artUrl(_CARD_ART, id) ?? _artUrl(_PORTRAIT_ART, id);
}
function sceneArt(scenarioId: string, id: string): string | undefined {
  // 优先「剧本前缀」命名（跨剧本场景 id 会重名，如 start）；兼容旧的 scn_* 全局唯一命名
  return _artUrl(_SCENE_ART, `${scenarioId}_${id}`) ?? _artUrl(_SCENE_ART, id);
}
/** 结局插画：src/assets/endings/end_<剧本id>_<结局场景id>.{jpg,png} */
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

/** 层徽（C-5）：非汉字形状语言——物品=方孔钱轮廓 / 人物=人形剪影 / 资源=银锭。currentColor 由 CSS 层上色 */
const LAYER_MARK: Record<string, ReactNode> = {
  物品: (<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="9.4" y="9.4" width="5.2" height="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>),
  人物: (<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.4" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M5.5 19 Q12 12.8 18.5 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>),
  资源: (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9 L17 9 L20 16.5 Q13 19 4 16.5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9.5 12.2 Q12 10.6 14.5 12.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>),
};

/** 购买防抖（L-1）：600ms 内的重复购买点击直接吞掉，防止双击双扣费 */
let _lastBuyAt = 0;
function buyGuard(fn: () => void): void {
  const now = Date.now();
  if (now - _lastBuyAt < 600) return;
  _lastBuyAt = now;
  fn();
}

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
interface PrepChoice { boosts: string[]; carry: string[]; retinue: string[]; deckBonus: string[]; peaceDeal?: boolean }

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

/** 帝国随从池：跨剧本持有的随从人物卡（斥候/内应被动，全局 ≤3） */
function retinueDefs(): CardDef[] {
  const ids = settleEmpire().retinue;
  const defs: CardDef[] = [];
  for (const id of ids) {
    let d = getGlobalCard(id);
    if (!d) {
      for (const s of SCENARIOS) {
        const c = s.cards.find((x) => x.id === id);
        if (c) { d = c; break; }
      }
    }
    if (d) defs.push(d);
  }
  return defs;
}

/** 结局奖励卡池：达成结局解锁的专属卡（endingReward 标记），跨周目可带进卡组 */
function endingRewardDefs(): CardDef[] {
  const seen = getCardSeen();
  const defs: CardDef[] = [];
  for (const s of SCENARIOS) {
    const got = new Set(seen[s.id] ?? []);
    for (const c of s.cards) {
      if (!c.endingReward || !got.has(c.id)) continue;
      if (defs.some((x) => x.id === c.id)) continue;
      defs.push(c);
    }
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

/** 花色汉字圈标：圈内直书花色汉字（策/器/势/隐），按花色色相上色 */
function BandSeal({ suit }: { suit?: string }) {
  if (!suit) return null;
  return <span className={`band-seal s-${suit}`}>{suit}</span>;
}

/** 花色楷体字（左上角圆形徽章内）：圈与字颜色由 CSS 按品级接管，系统楷体栈，缺字环境回退衬线 */
function SuitGlyph({ suit }: { suit: string }) {
  return <span className={`suit-glyph s-${suit}`}>{suit}</span>;
}

/** 花纹槽：压在卡图上缘的头部横带 —— 左花色圈标、中卡名、右小分类 */
function CardBand({ c, extra }: { c: CardDef; extra?: ReactNode }) {
  return (
    <div className="card-band">
      <BandSeal suit={c.suit} />
      <span className="band-name">{c.name}</span>
      {extra}
      <ThemeTag id={c.id} suit={c.suit} />
    </div>
  );
}

function CardArt({ id, name, compact }: { id: string; name: string; compact?: boolean }) {
  const src = cardArt(id);
  if (!src) return <CardArtPlaceholder name={name} compact={!!compact} />;
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

/** 美术缺失时的占位（保证卡牌可视化一致、行囊无黑底） */
function CardArtPlaceholder({ name, compact }: { name: string; compact: boolean }) {
  const initial = (name || "?").trim().charAt(0);
  return (
    <div className={`card-art card-art-placeholder ${compact ? "card-art-compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet">
        <rect x="2" y="2" width="96" height="136" rx="3" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.35" />
        <text x="50" y="78" textAnchor="middle" fontSize="42" fontFamily="serif" fill="currentColor" opacity="0.4">{initial}</text>
        <text x="50" y="128" textAnchor="middle" fontSize="6" fill="currentColor" opacity="0.3">暂无图</text>
      </svg>
    </div>
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
      {c.suit && <SuitGlyph suit={c.suit} />}
      {corner && <span className="tcard-corner">{corner}</span>}
      {!unknown && (() => {
        // C-3/C-5：右上角 = 「层语言」位——成术显点数（金），物品/人物显层徽，资源显银锭+面额
        const layer = c.layer ?? "成术";
        if (layer === "资源") return <span className="layer-mark l-资源" title={`资源 · ${c.resource ?? 0} 两（不占卡组槽）`}>{LAYER_MARK["资源"]}<b>{c.resource}</b></span>;
        if (layer === "物品") return <span className="layer-mark l-物品" title="物品 · 一次性道具">{LAYER_MARK["物品"]}</span>;
        if (layer === "人物") return <span className="layer-mark l-人物" title="人物 · 携带被动">{LAYER_MARK["人物"]}</span>;
        return typeof c.power === "number"
          ? <span className="tcard-power" title={`点数 ${c.power}${c.cost ? ` · 费 ${c.cost}` : ""}`}>{c.power}</span>
          : null;
      })()}
      <div className="tcard-top">
        {!unknown && c.suit ? <BandSeal suit={c.suit} /> : null}
        <span className="tcard-name">{unknown ? "？？？" : c.name}</span>
        {!unknown ? <ThemeTag id={c.id} suit={c.suit} /> : null}
      </div>
      <div className="tcard-bottom">{unknown ? "尚未收录" : c.text}</div>
      {footer && <div className="tcard-footer">{footer}</div>}
    </div>
  );
}

type Phase = "title" | "story" | "duel" | "ending" | "verdict" | "shop" | "pick" | "minigame";

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
  const [coverZoom, setCoverZoom] = useState(false);
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

  // 场景相位分派：根据目标场景类型切视图（不动 RunState）
  const enterSceneOf = useCallback(
    (cur: RunState, id: string) => {
      if (!sc) return;
      const target = findScene(sc, id);
      if (target.duel) {
        const cfg = sc.duels.find((d) => d.id === target.duel);
        if (cfg) {
          // 和议之书：非 jieyu 剧本下一场战争对局免战（敌酋见银退兵），直接进胜线；奖励归零由结算侧处理
          if (cur.boosts.includes("b_peace") && cfg.mode === "pressure" && sc.id !== "jieyu") {
            cur.boosts = cur.boosts.filter((b) => b !== "b_peace");
            setToast("敌酋见银退兵——和议成了，仗没打。");
            gotoFrom(cur, cfg.winScene);
            return;
          }
          const loadout = sc.cardSystem ? cur.deck : cfg.deck;
          const d = initDuel(cfg, loadout, allCardsFor(sc, cur.deck), duelBoostsOf(cur.boosts));
          revealEmotion(d);
          setDuel(d);
          setWager(0);
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

  // 核心状态转移：纯计算 next state → 一次性 setSt；holdView 时相位延后由 enterSceneOf 分派（用于对局战果定格）
  const gotoFrom = useCallback(
    (base: RunState, id: string, opts?: { autoRead?: boolean; holdView?: boolean }) => {
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
      if (!opts?.holdView) enterSceneOf(next, id);
    },
    [sc, enterSceneOf]
  );

  const goto = useCallback((id: string) => { if (st) gotoFrom(st, id); }, [st, gotoFrom]);

  // 最新 RunState 镜像（供延迟回调读取已推进状态）
  const stRef = useRef<RunState | null>(null);
  stRef.current = st;

  // 成就解锁统一入口：记录 + toast + 称号授予（奖励含「称号」时）
  const grantAch = (id: string, owned: Set<string>) => {
    if (owned.has(id)) return;
    owned.add(id);
    unlockAchievement(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    setToast(`成就达成「${a.name}」· ${a.reward}`);
    const m = a.reward.match(/称号「(.+?)」/);
    if (m) grantTitle(m[1]!);
  };

  // 对局结束 → 即刻推进至结算场景并存档（消除 1.6s 窗口期关页重打的竞态），战果文案定格至延迟结束后再切相位；押注同步结算入账
  useEffect(() => {
    if (duel?.finished && sc && st) {
      // 对局成就（仅胜局判定）：卡组构成 / 行为（跨局计数）
      if (duel.finished === "win") {
        const owned = new Set(getAchievements());
        const rarityOf = (id: string) => allCardsFor(sc, st.deck).find((c) => c.id === id)?.rarity;
        const suitOf = (id: string) => allCardsFor(sc, st.deck).find((c) => c.id === id)?.suit;
        const layerOf = (id: string) => allCardsFor(sc, st.deck).find((c) => c.id === id)?.layer;
        const got = checkDuelAchievements({
          deck: st.deck,
          rarityOf,
          suitOf,
          layerOf,
          hpPlayer: duel.hpPlayer,
          hpMax: duel.hpMax,
          round: duel.round,
          retinueCount: st.retinue?.length ?? 0,
          duelId: duel.cfg.id,
        }, owned);
        for (const id of got) grantAch(id, owned);
        // 跨局计数成就：胜局 / classic 胜 / 刺探 / 收买 / 陷阱 / 蓄势 / 破招
        const wins = bumpCounter("wins");
        const classicWins = duel.rules === "classic" ? bumpCounter("classic_wins") : getCounter("classic_wins");
        const behavior: [string, boolean][] = [
          ["win_20", wins >= 20],
          ["classic_5", classicWins >= 5],
          ["scout_win", getCounter("scouts") >= 1],
          ["insider_win", getCounter("insiders") >= 1],
          ["trap_kill", getCounter("traps") >= 3],
          ["charge_master", getCounter("charges") >= 5],
          ["break_ten", getCounter("breaks") >= 10],
        ];
        for (const [aid, cond] of behavior) if (cond) grantAch(aid, owned);
      }
      // 战争局失败：记录（解锁「岁币之约」购买）；劫与烬（北京保卫战）为唯一战争剧本，虽败亦不求和，但记录仍用于商市解锁判定
      if (duel.finished === "lose" && sc.id === "jieyu") recordWarLoss(sc.id);
      // 番外解锁：携带本剧本番外钥匙卡（≥need 张）赢下对局 → 解锁（幂等）
      if (duel.finished === "win") {
        const b = bonusOfScenario(sc.id);
        if (b) {
          const deckIds = new Set(duel.cfg.deck);
          const hits = b.keyCards.filter((k) => deckIds.has(k)).length;
          if (hits >= b.need) {
            if (unlockBonus(b.id)) setToast(`番外解锁：「${b.title}」——去卡册详情展阅。`);
          }
        }
      }
      const target = duel.finished === "win"
        ? duel.cfg.winScene
        : duel.cfg.loseScene2 && checkCond(duel.cfg.loseScene2.cond, st)
          ? duel.cfg.loseScene2.scene
          : duel.cfg.loseScene;
      // 押注结算：胜得两倍、败失本金（钳制不为负），随战果一并入账
      let base = st;
      if (wager > 0) {
        const gain = duel.finished === "win" ? wager * 2 : -wager;
        base = { ...st, silver: Math.max(0, st.silver + gain) };
        setToast(duel.finished === "win" ? `押注得手：本金 ${wager} 两，连本带利入账 ${wager * 2} 两` : `押注失手，${wager} 两银子打了水漂`);
        setWager(0);
      }
      // 剧本级 usedCards：本剧进过 deck 的卡并入（弱卡点名成就判定依据；与上面的 base 副本合并）
      base = { ...base, usedCards: [...new Set([...(base.usedCards ?? []), ...base.deck])] };
      gotoFrom(base, target, { holdView: true });
      const t = setTimeout(() => {
        setDuel(null);
        if (stRef.current) enterSceneOf(stRef.current, target);
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

  const start = (scenario: Scenario, prep?: PrepChoice, viewpointId?: string) => {
    setSc(scenario);
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
    // 真结局硬门槛降级：cond 不满足且定义了 altNext → 落入近似非真结局
    const target = checkCond(c.cond, st) ? c.next : (c.altNext ?? c.next);
    gotoFrom(next, target);
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
  }, [st, phase, duel?.round, duel?.finished, duel?.usedCards.length]);

  // 结局入图鉴 + 清档
  useEffect(() => {
    if (phase === "ending" && sc && st) {
      const s = findScene(sc, st.sceneId);
      if (s.ending) {
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
        }, owned);
        for (const id of got) grantAch(id, owned);
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
    state.retinue = state.retinue ?? [];
    setSt(state);
    if (save.duel) {
      const cfg = scenario.duels.find((d) => d.id === save.duel!.cfgId);
      if (cfg) {
        // 旧档兼容：博弈字段（charge/foresuit/opponentTrue/bluffed/trap）+ 随从字段（scoutLeft/insiderLeft/...）缺省补全（展开后兜底写回）
        const d = { ...save.duel.data, cfg, charge: save.duel.data.charge ?? 0, foresuit: save.duel.data.foresuit ?? null, opponentTrue: save.duel.data.opponentTrue ?? null, bluffed: save.duel.data.bluffed ?? false, trap: save.duel.data.trap ?? null, scoutLeft: save.duel.data.scoutLeft ?? 0, insiderLeft: save.duel.data.insiderLeft ?? 0, sharedUsed: save.duel.data.sharedUsed ?? 0, sharedTotal: save.duel.data.sharedTotal ?? 0, insiderActive: save.duel.data.insiderActive ?? false, retinueNames: save.duel.data.retinueNames ?? [] };
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
            <button className="nav-book" onClick={() => { sfx.choice(); setShowStudy(true); }}>书斋</button>
            <span className="nav-assets">
              <button onClick={() => { sfx.choice(); setPanel("bag"); }}>行囊</button>
              <button onClick={() => { sfx.choice(); setPanel("gallery"); }}>图鉴</button>
              <button onClick={() => { sfx.choice(); setPanel("album"); }}>卡册</button>
              <button onClick={() => { sfx.choice(); setPanel("achievements"); }}>成就</button>
            </span>
            <span className="nav-sep" aria-hidden="true" />
            <button onClick={() => { sfx.choice(); setShowGuide(true); }}>规则书</button>
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
            <button className="link-btn" onClick={() => { clearSave(); setTitleTick((t) => t + 1); }}>放弃存档</button>
          </div>
        )}
        <div className="cover-stage">
          <button className="cover-arrow" aria-label="上一个" onClick={() => { sfx.choice(); setCoverIdx((coverIdx + SCENARIOS.length - 1) % SCENARIOS.length); }}>‹</button>
          <div className={`cover-main ${unlocked ? "" : "sealed"}`}>
            {coverOf(cur.id) ? (
              <img className="cover-img" src={coverOf(cur.id)} alt={cur.title} onClick={() => setCoverZoom(true)} />
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
                {coverOf(s.id) ? <img src={coverOf(s.id)} alt={s.title} /> : <span className="thumb-fallback" />}
                {locked && <span className="thumb-seal">悬案未破</span>}
                {!locked && n > 0 && <span className="thumb-ends">{n}</span>}
                {!locked && s.cardSystem && <span className="thumb-v2">✦</span>}
              </button>
            );
          })}
          </div>
          <button className="thumb-arrow next" aria-label="下一个" onClick={() => { sfx.choice(); setCoverIdx((coverIdx + 1) % SCENARIOS.length); }}>›</button>
        </div>
        <div className="end-progress" title="结局进度：每解锁一结局 +20 墨铤；里程碑达标后可点击领取">
          <span className="end-progress-label">结局 <b>{gallery.length}</b>/{getTotalEnds()}</span>
          <div className="end-progress-track">
            <div className="end-progress-fill" style={{ width: `${Math.min(100, (gallery.length / getTotalEnds()) * 100)}%` }} />
            {END_MILES.map((m, i) => {
              const reached = gallery.length >= Math.ceil(getTotalEnds() * m.pct);
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
                {coverZoom && coverOf(cur.id) && (
          <div className="cover-zoom-overlay" onClick={() => setCoverZoom(false)}>
            <img src={coverOf(cur.id)} alt={cur.title} />
            <div className="cover-zoom-title">{cur.title} · {cur.subtitle}</div>
            <p className="muted cover-zoom-hint">点按任意处合卷</p>
          </div>
        )}
        <p className="foot-tip">点击画面推进文本 · 空格推进/数字选支 · 进度自动保存 · ✦ = 含卡牌系统 v2 · 解锁结局可获墨铤 · 案件按序解封，可花 {UNSEAL_COST} 墨铤提前破封</p>
        {showGuide && (
          <div className="clue-overlay" onClick={() => setShowGuide(false)}>
            <div className="clue-overlay-panel" onClick={(e) => e.stopPropagation()}>
              <h3>玩法速览</h3>
              <div className="guide-sec"><b>基础</b>：点击画面推进文字；选项决定走向；空格=推进，数字键=选支。进度自动保存。</div>
              <div className="guide-sec"><b>四色 · 探案模式</b>：策=策略、方法（审讯话术/破局思路）；势=人证（人物卡，携带被动，开局场外生效）；器=物证（实物与证据）；隐=隐秘的过往、道听途说的真相（暗线后手）。孤品=特殊收集，不在四色之内。</div>
              <div className="guide-sec"><b>四色 · 叙事模式</b>：同样成立，但此视角下——策=韬略、战术；势=人物、士族/文官集团；器=物品、火器、科技成果；隐=不为人知的反转、特殊手段。四色相克环（策克势·势克器·器克隐·隐克策）贯通两模式。</div>
              <div className="guide-sec"><b>隐 · 陷阱</b>：部分隐色卡是陷阱——打出即盖放（扣在案上），下一轮对手出牌时自动触发（反伤=伤害弹回 / 抵消=敌招作废 / 蓄锋=下张+2）。盖位限 1 张，盖了就是信息威慑。</div>
              <div className="guide-sec"><b>案件模式</b>：调查取证 → 结案陈词拣选线索（真/伪/核心）→ 定谳。核心线索+足够实据 = 完整结局。</div>
              <div className="guide-sec"><b>对局·情绪匹配制</b>：对手亮出手段（策/器/势/隐）。同色接话=共鸣；克色=破防；被克=大失言（气力-2），错色=失言。共鸣满则胜。v2 情绪局出牌不耗行动力。</div>
              <div className="guide-sec"><b>对局 · 博弈动作</b>（压制制）：蓄势（挨打换下张+2，上限2层）/ 破招（宣言对手花色，押中该手作废）/ 刺探·收买（需带斥候/内应随从，见下）。部分牌有情境加成（对手为某色时+2）/ 牺牲（自伤换强）/ 抽牌。</div>
              <div className="guide-sec"><b>✦ 卡牌系统 v2</b>：四层卡——成术（对局四色牌）/ 物品（对局道具，用后消耗，也是剧情钥匙）/ 人物（携带被动，开局场外生效）/ 资源（即银两）。市集买卡卖卡开卡包；翻牌三选一；顶栏「背包」随时编组（上限 12，资源不占槽）。压制局出牌耗行动力，可「换气」回力补牌；打出的牌进弃牌堆，牌库抽空调洗回填。</div>
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
    return <DuelView sc={sc} duel={duel} setDuel={setDuel} toast={setToast} silver={st?.silver ?? 0} wager={wager} onWager={setWager} />;
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
    return <ShopView sc={sc} st={st} shop={scene.shop!} onLeave={afterShop} toast={setToast} />;
  }

  // ---------- 结案复盘 ----------
  if (phase === "verdict" && sc.verdict) {
    const v = sc.verdict;
    /** 照骨镜等洞察道具：持有即复盘标出核心/真线索 */
    const clueReveal = Math.max(0, ...(st?.bag ?? []).map((id) => sc.cards.find((c) => c.id === id)?.clueReveal ?? 0));
    return (
      <div className="story-root">
        <TopBar sc={sc} st={st} onClues={() => setShowClues(true)} onBag={() => setShowBag(true)} />
        <div className="story-panel" ref={panelRef}>
          <h2>结案陈词 · 拣选线索（{picked.length}/{v.mustPick}）</h2>
          <p className="muted">呈上御案的线索，将决定此案能否经得起百官诘难。</p>
          <p className="verdict-hint">只从前文已解锁的线索中拣选（当前已解锁 {st.clues.length} 条；未走过、未触发的线索不予展示）。</p>
          {clueReveal >= 1 && <p className="clue-reveal-hint">〔照骨镜〕镜光直照案眼——核心线索上已亮起「案眼」印记。</p>}
          <div className="clue-grid">
            {st.clues.map((cid) => {
              const c = sc.clues?.find((x) => x.id === cid);
              if (!c) return null;
              const on = picked.includes(cid);
              const isCore = clueReveal >= 1 && c.id === v.coreClue;
              const isTrue = clueReveal >= 2 && c.kind === "true";
              return (
                <div key={cid} className={`clue-card ${on ? "on" : ""} ${isCore ? "clue-core" : ""}`} onClick={() =>
                  setPicked((p) => (p.includes(cid) ? p.filter((x) => x !== cid) : p.length < v.mustPick ? [...p, cid] : p))
                }>
                  <div className="clue-name">{c.name} {isCore && <span className="clue-core-tag">案眼</span>}{isTrue && <span className="clue-true-tag">真</span>}</div>
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
        const got = checkMinigameAchievements({ type: scene.minigame!.type, win, allRight: info?.allRight, netGain: info?.netGain }, owned);
        for (const id of got) grantAch(id, owned);
      }
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
        {scene.desc && <p className="scene-desc">{scene.desc}</p>}
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
      {st.viewpoint && sc.viewpoints?.find((v) => v.id === st.viewpoint) && (
        <span className="stat-chip chip-vp">{sc.viewpoints.find((v) => v.id === st.viewpoint)!.name}</span>
      )}
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
  const [opened, setOpened] = useState<{ ids: string[]; dup: Set<string> } | null>(null);
  const [tab, setTab] = useState<"buy" | "pack" | "deck" | "dice">("buy");
  const def = (id: string) => sc.cards.find((c) => c.id === id);
  const limit = sc.deckLimit ?? 12;
  // 钥匙卡：被剧情选项条件（card/notCard）引用的卡，卖出会永久关闭分支 → 禁卖
  const keyIds = new Set<string>();
  for (const s of sc.scenes) {
    for (const c of s.choices ?? []) {
      if (c.cond?.card) keyIds.add(c.cond.card);
      if (c.cond?.notCard) keyIds.add(c.cond.notCard);
    }
  }

  const buy = (id: string, priceOverride?: number) => {
    const c = def(id);
    if (!c) return;
    if (c.price === 0) { toast("此物非卖——人情不以银钱论"); return; }
    const price = priceOverride ?? c.price ?? 10;
    if (local.silver < price) { toast("银两不足"); return; }
    if (local.bag.includes(id)) { toast("已有此卡"); return; }
    const next = { ...local, silver: local.silver - price, bag: [...local.bag, id], deck: local.deck.length < limit ? [...local.deck, id] : local.deck };
    sfx.card();
    setLocal(next);
    // 随从卡（斥候/内应被动的人物卡）购买后入帝国随从池（全局 ≤3，供跨剧本出征携带）
    if ((c.layer ?? "成术") === "人物" && ((c.passive?.scout ?? 0) > 0 || (c.passive?.insider ?? 0) > 0)) {
      if (!addRetinue(id)) toast(`「${c.name}」入了随从册——但随从已满员（最多 3 人），需辞退一人才能随行。`);
      else toast(`购得「${c.name}」（-${price} 两），已入随从册（跨剧本可携带）`);
    } else {
      toast(`购得「${c.name}」（-${price} 两）`);
    }
  };
  const sell = (id: string) => {
    const c = def(id);
    if (!c) return;
    if (keyIds.has(id)) { toast("案关要物，不可发卖——卖了，前头的路就断了。"); return; }
    if (c.price === 0) { toast("此物非卖，亦不可售。"); return; }
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
    const dup = new Set<string>();
    const next = { ...local, silver: local.silver - p.price, bag: [...local.bag], deck: [...local.deck] };
    for (let i = 0; i < p.draws; i++) {
      const id = p.pool[Math.floor(Math.random() * p.pool.length)]!;
      const c = def(id);
      if (c?.resource) next.silver += c.resource;
      else if (!next.bag.includes(id)) { next.bag.push(id); if (next.deck.length < limit) next.deck.push(id); }
      else dup.add(id); // 重复开出：不入袋，开包结果上角标提示，避免静默吞银
      got.push(id);
    }
    sfx.win();
    setLocal(next);
    setOpened({ ids: got, dup });
  };
  /** 琉璃试珠：先验一封（只展示开出结果，不动银两/背包；看完再决定买不买） */
  const canPeek = local.bag.some((id) => def(id)?.shopPeek);
  const peekPack = (packId: string) => {
    const p = shop.packs?.find((x) => x.id === packId);
    if (!p) return;
    const got: string[] = [];
    const dup = new Set<string>();
    for (let i = 0; i < p.draws; i++) {
      const id = p.pool[Math.floor(Math.random() * p.pool.length)]!;
      got.push(id);
      if (local.bag.includes(id)) dup.add(id);
    }
    sfx.card();
    setOpened({ ids: got, dup });
    toast("琉璃试珠验了一封——看个究竟，再决定掏不掏银子。");
  };
  /** 暗柜（隐藏货架）：持有账房先生等密钥才陈列 */
  const hidden = (shop.hiddenStock ?? []).filter((h) =>
    (!h.needCard || local.bag.includes(h.needCard)) &&
    (!h.needSilver || local.silver >= h.needSilver)
  );

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
            {opened.ids.map((id, i) => {
              const c = def(id);
              if (!c) return null;
              return (
                <TCard
                  key={i}
                  c={c}
                  corner={opened.dup.has(id) ? <span className="rarity-tag corner-owned">已有 · 不入袋</span> : undefined}
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
                    <button className="btn-main" disabled={owned || c.price === 0 || local.silver < (c.price ?? 10)} onClick={() => buy(id)}>
                      {c.price === 0 ? "非卖" : `${c.price ?? 10} 两`}
                    </button>
                    {owned && (keyIds.has(id) ? (
                      <span className="link-btn sell-locked" title="剧情钥匙卡：卖出会永久关闭分支，不可发卖">案证</span>
                    ) : c.price === 0 ? (
                      <span className="link-btn sell-locked" title="非卖之物，不可发卖">非卖</span>
                    ) : (
                      <button className="link-btn" onClick={() => sell(id)}>{Math.floor((c.price ?? 10) / 2)} 两</button>
                    ))}
                  </div>
                }
              />
            );
          })}
          {hidden.length > 0 && (
            <div className="shop-hidden">
              <div className="shop-hidden-title">暗柜 · 好货不上明面</div>
              <div className="shop-grid">
                {hidden.map((h) => {
                  const c = def(h.id);
                  if (!c) return null;
                  const owned = local.bag.includes(h.id);
                  const price = h.price ?? c.price ?? 10;
                  return (
                    <TCard
                      key={h.id}
                      c={c}
                      corner={owned ? <span className="rarity-tag corner-owned">已有</span> : undefined}
                      footer={
                        <div className="shop-actions">
                          <button className="btn-main" disabled={owned || c.price === 0 || local.silver < price} onClick={() => buy(h.id, price)}>
                            {c.price === 0 ? "非卖" : `${price} 两`}
                          </button>
                          {owned && (
                            <span className="link-btn sell-locked" title="暗柜之物，不可发卖">暗柜</span>
                          )}
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "pack" && (
        <div className="shop-grid">
          {shop.packs?.map((p) => (
            <div key={p.id} className="shop-card">
              <div className="bag-card-name">{p.name}</div>
              <div className="pc-text">随机 {p.draws} 张，出自 {p.pool.length} 种卡池。</div>
              <button className="btn-main" disabled={local.silver < p.price} onClick={() => openPack(p.id)}>{p.price} 两</button>
              {canPeek && <button className="link-btn" onClick={() => peekPack(p.id)}>先验一封（白看）</button>}
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
function DuelView({ sc, duel, setDuel, toast, silver, wager, onWager }: {
  sc: Scenario; duel: DuelState; setDuel: (d: DuelState) => void; toast: (m: string) => void;
  silver: number;
  wager: number; onWager: (n: number) => void;
}) {
  const cardOf = (id: string): CardDef => {
    const c = sc.cards.find((x) => x.id === id) ?? duel.cfg.oppCards?.find((x) => x.id === id) ?? getGlobalCard(id);
    if (!c) throw new Error(`卡牌不存在: ${id}（对局 ${duel.cfg.id}）`);
    return c;
  };

  const gambit = !!duel.cfg.gambit;
  const v2 = duel.rules === "v2";
  /** 本回合敌方招式（script 循环）；v2 博弈局展示层藏牌，引擎结算仍用真招 */
  const oppIdOf = (d: DuelState) => d.cfg.script[d.round % d.cfg.script.length] ?? d.cfg.script[0]!;

  // ---- 藏牌与洞察（案件模式 v2 压制制对手出牌默认不可见） ----
  const caseMode = sc.mode === "case";
  const oppSee = duel.cfg.seeOpp ?? (caseMode && v2 && duel.mode === "pressure" ? "hidden" : "open");
  const oppHidden = oppSee === "hidden";
  /** 洞察·道具/诈问揭示粒度（seeNext） */
  const seeLevel: "none" | "suit" | "card" | "power" = duel.seeNext ?? "none";
  /** 洞察·青眼被动：每 N 回合瞥见（第 N、2N…回合自动揭示下一手） */
  const peekEvery = (duel.passives ?? []).reduce((s, p) => s || (p.peek ?? 0), 0);
  const peekHit = peekEvery > 0 && duel.round > 0 && duel.round % peekEvery === 0;
  /** 洞察·内廷耳报：第 4 回合起读切忌 script 循环（记忆外置） */
  const scanOn = (duel.passives ?? []).some((p) => p.scan);
  /** 当前可知粒度：道具/诈问 > 青眼被动 */
  const knownLevel: "none" | "suit" | "card" | "power" = seeLevel !== "none" ? seeLevel : peekHit ? "card" : "none";
  const oppNext = duel.mode === "pressure" ? cardOf(oppIdOf(duel)) : null;
  const knownSuit = knownLevel !== "none" ? (oppNext?.suit ?? null) : null;

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
    // 先深拷贝再交引擎 mutate：根治 in-place mutate + 浅拷贝反模式（memo/并发渲染隐患）
    const d = structuredClone(duel);
    if (d.mode === "emotion") {
      if (!d.opponentShown) return;
      const ok = playEmotion(d, card);
      if (!ok) { toast("人物卡是被动，不能打出"); return; }
      const kind = d.lastResult?.kind;
      if (kind === "match") sfx.match();
      else if (kind === "press" || kind === "item") sfx.press();
      else if (kind === "miss") sfx.miss();
      else if (kind === "win") sfx.win();
      else if (kind === "lose") sfx.lose();
      if (d.finished !== "win") revealEmotion(d);
    } else {
      const oppId = d.cfg.script[d.round % d.cfg.script.length] ?? d.cfg.script[0]!;
      const ok = playPressure(d, card, oppId, cardOf);
      if (!ok) { toast(card.layer === "人物" ? "人物卡是被动，不能打出" : "行动力不足"); return; }
      // 盖放陷阱计数（刚盖未触发的回合）
      if (!duel.trap && d.trap) bumpCounter("traps");
      if (d.finished) (d.finished === "win" ? sfx.win : sfx.lose)();
      else sfx.press();
    }
    setDuel(d);
  };

  const doEndTurn = () => {
    sfx.choice();
    const d = structuredClone(duel);
    endTurn(d);
    setDuel(d);
  };

  // ---- 博弈动作（仅 gambit 局） ----
  const doRead = () => {
    sfx.choice();
    const d = structuredClone(duel);
    if (!readEmotion(d)) { toast("气力不足，读不动牌了"); return; }
    setDuel(d);
  };
  const doCharge = () => {
    sfx.choice();
    const d = structuredClone(duel);
    if (!chargeUp(d, oppIdOf(d), cardOf)) { toast(v2 ? "行动力不足" : "蓄力已满（上限 2 层）"); return; }
    bumpCounter("charges");
    if (d.finished) sfx.lose();
    setDuel(d);
  };
  const doBreak = (suit: Suit) => {
    sfx.choice();
    const d = structuredClone(duel);
    if (!breakMove(d, suit, oppIdOf(d), cardOf)) { toast(v2 ? "行动力不足或已破过招" : "已宣过招了"); return; }
    bumpCounter("breaks");
    if (d.finished) sfx.lose();
    setDuel(d);
  };

  // ---- 随从动作（刺探/收买，压制制；须携带斥候/内应随从，只消耗次数不耗银两） ----
  const doSpend = (kind: "scout" | "insider") => {
    const d = structuredClone(duel);
    const r = duelSpend(d, kind);
    if (!r.ok) { toast(r.log ?? "无法行动"); return; }
    sfx.choice();
    if (r.log) toast(r.log);
    bumpCounter(kind === "scout" ? "scouts" : "insiders");
    setDuel(d);
  };

  const handIds = v2 ? duel.hand : duel.cfg.deck;
  /** 押注窗口：仅开局未出手时可押；选过「不押」后不再追问 */
  const [wagerDismissed, setWagerDismissed] = useState(false);
  const wagerOpen = gambit && !duel.finished && !wagerDismissed && wager === 0 && duel.round === 0 && !duel.lastResult;

  return (
    <div className="duel-root">
      <div className="duel-header">
        <div className="duel-title">{duel.cfg.title}{gambit && <span className="gambit-tag">博弈局</span>}</div>
        <div className="muted">{duel.cfg.opponent.name} · {duel.cfg.opponent.desc}{v2 ? " · 【v2 手牌制】" : ""}</div>
        {passiveText && <div className="muted">携带被动：{passiveText}</div>}
        {wagerOpen && silver > 0 && (
          <div className="wager-bar">
            <span className="st-label">押注此局？胜得两倍，败失本金</span>
            {[10, 20, 50].map((n) => (
              <button key={n} className="wager-btn" disabled={silver < n} onClick={() => { sfx.coin(); onWager(n); toast(`押下 ${n} 两——此局胜则入账 ${n * 2} 两`); }}>{n} 两{silver < n && "（不足）"}</button>
            ))}
            <button className="wager-btn skip" onClick={() => { sfx.choice(); setWagerDismissed(true); }}>不押</button>
          </div>
        )}
        {wager > 0 && <div className="wager-on muted">已押 {wager} 两 · 胜入 {wager * 2} 两</div>}
      </div>

      <div className="duel-status">
        {duel.mode === "emotion" ? (
          <>
            <span className="rapport-dots">
              <span className="st-label">共鸣</span>
              {Array.from({ length: duel.cfg.goal ?? DEFAULT_GOAL }, (_, i) => (
                <i key={i} className={i < duel.rapport ? "on" : ""} />
              ))}
            </span>
            <span><span className="st-label">防备</span>{duel.guard}</span>
            <span><span className="st-label">气力</span><QiBar cur={duel.qi} max={10} /></span>
          </>
        ) : (
          <>
            <span><span className="st-label">我方气力</span><QiBar cur={duel.hpPlayer} max={duel.hpMax ?? (duel.cfg.hp?.player ?? 10)} /></span>
            <span><span className="st-label">{duel.cfg.opponent.name}气力</span><QiBar cur={duel.hpOpponent} max={duel.cfg.hp?.opponent ?? 10} foe /></span>
          </>
        )}
        {v2 && duel.mode === "pressure" && <span><span className="st-label">行动力</span>{duel.ap}</span>}
        {duel.mode === "pressure" && duel.charge > 0 && <span><span className="st-label">蓄势</span>{duel.charge} 层（下张+{duel.charge * 2}）</span>}
        {duel.mode === "pressure" && duel.foresuit && <span><span className="st-label">破招宣言</span>敌出「{duel.foresuit}」</span>}
        {duel.mode === "pressure" && duel.trap && <span className="trap-on"><span className="st-label">盖牌</span>「{duel.trap.name}」扣在案上（{duel.trap.effect}）</span>}
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
        {v2 && duel.mode === "pressure" && !oppHidden && !gambit && (
          <p className="opp-line">
            对手下一手：「{cardOf(oppIdOf(duel)).name}」
            <SuitSeal suit={cardOf(oppIdOf(duel)).suit} />
            <span className="edge-hint">出「{RESTRAIN_UI[cardOf(oppIdOf(duel)).suit ?? ""]}」牌可克敌（+1）；每牌耗 1 行动力，行动力尽可【换气】。</span>
          </p>
        )}
        {v2 && duel.mode === "pressure" && oppHidden && (
          <p className={`opp-line ${knownLevel !== "none" ? "peek-line" : ""}`}>
            {knownLevel === "none" && (
              <>
                对手藏住了下一手▓▓▓——他眼底有诈，凭你的眼力去猜。
                <span className="edge-hint">市集里的观牌物件、老刑名的眼力、或一句诈问，都能看破他；看破后【破招】必中。</span>
              </>
            )}
            {knownLevel === "suit" && (
              <>
                〔洞察〕他下一手的路数是<span className={`s-${knownSuit}`}>「{knownSuit}」</span>。
                <span className="edge-hint">已【破招】宣言此色则这招作废；出「{RESTRAIN_UI[knownSuit ?? ""]}」牌可克敌（+1）。</span>
              </>
            )}
            {knownLevel === "card" && (
              <>
                〔洞察〕他下一手：「{oppNext!.name}」
                <SuitSeal suit={oppNext!.suit} />（点数 {oppNext!.power}）
                <span className="edge-hint">出「{RESTRAIN_UI[oppNext!.suit ?? ""]}」牌可克敌（+1）。</span>
              </>
            )}
            {knownLevel === "power" && (
              <>
                〔洞察〕他下一手的劲道约为{oppNext!.power}点，花色不明。
                <span className="edge-hint">够不够换血，你心里有数。</span>
              </>
            )}
          </p>
        )}
        {scanOn && duel.round >= 4 && duel.mode === "pressure" && (
          <p className="opp-line scan-hint">
            〔耳报〕他的路数你已摸透：{duel.cfg.script.map((id) => cardOf(id).suit).join("→")}——眼下这一手是「{cardOf(oppIdOf(duel)).suit}」。
          </p>
        )}
        {v2 && duel.mode === "pressure" && gambit && !oppHidden && (
          <p className="opp-line">
            对手藏住了下一手▓▓▓——他眼底有诈，凭你的眼力去猜。
            <span className="edge-hint">【破招】可宣言敌招花色，押中则该招作废；【蓄势】缓一手，下张牌更狠。</span>
          </p>
        )}
        {duel.mode === "emotion" && gambit && duel.opponentShown && (
          <p className="opp-line gambit-hint">这局他嘴上未必老实——亮出的色可能是虚张，跟错了要撞枪口（气力-2）；拿不准时，可【读牌】验一验（气力-1）。</p>
        )}
        {gambit && !duel.finished && (
          <div className="gambit-bar">
            {duel.mode === "emotion" ? (
              <button className="gambit-btn" disabled={!duel.opponentShown || duel.qi < 1} onClick={doRead}>读牌（气力-1，验其虚实）</button>
            ) : (
              <>
                <button className="gambit-btn" disabled={duel.charge >= 2 || (v2 && duel.ap < 1)} onClick={doCharge}>蓄势{duel.charge > 0 && `（${duel.charge}层）`}（下张+2/层{v2 ? "，耗1行动力" : "，硬接敌一招"}）</button>
                {(["策", "器", "势", "隐"] as const).map((s) => (
                  <button key={s} className={`gambit-btn break-${s} ${knownSuit === s ? "peek-hit" : ""}`} disabled={!!duel.foresuit || (v2 && duel.ap < 1)} onClick={() => doBreak(s)}>破「{s}」</button>
                ))}
              </>
            )}
          </div>
        )}
        {duel.mode === "pressure" && !duel.finished && duel.retinueNames.length > 0 && (
          <div className="gambit-bar retinue-bar">
            <span className="retinue-tag" title="随从：斥候看破敌手，内应买通敌阵">
              {duel.retinueNames.join("、")}
            </span>
            <button className="gambit-btn" disabled={duel.scoutLeft <= 0} onClick={() => doSpend("scout")}>刺探（余 {duel.scoutLeft} 次）</button>
            <button className="gambit-btn" disabled={duel.insiderLeft <= 0} onClick={() => doSpend("insider")}>收买（余 {duel.insiderLeft} 次）</button>
            {duel.sharedTotal > 0 && <span className="muted">随从合计还可动用 {Math.max(0, duel.sharedTotal - duel.sharedUsed)} 次</span>}
          </div>
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
              {c.suit && <SuitGlyph suit={c.suit} />}
              {c.power !== undefined && !isChar && <span className="pc-power-badge">{c.power}</span>}
              <div className="card-artwrap">
                <CardArt id={c.id} name={c.name} compact />
                <CardBand c={c} extra={v2 && duel.mode === "pressure" ? <span className="cost-tag">费{cardCost(c)}</span> : undefined} />
              </div>
              <div className="pc-text">{c.text}</div>
              {c.trap && c.suit === "隐" && <div className="pc-power trap-tag">陷阱 · 盖放（{c.trap}）</div>}
              {c.power !== undefined && !c.trap && <div className="pc-power">点数 {c.power}{c.suit === "势" ? "×2（反噬1）" : ""}</div>}
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
        {gambit && (duel.mode === "emotion"
          ? " 博弈：对手每三招亮一次假色；【读牌】耗 1 气力验色，虚张则拆穿亮真色。"
          : " 博弈：【蓄势】叠蓄力层（上限2，下张每层+2）；【破招】宣言敌招花色，押中则该招作废。")}
      </p>
    </div>
  );
}


// ============================================================
// 场景化小游戏
// ============================================================
function MiniGameView({ sc, sceneId, onFinish }: {
  sc: Scenario; sceneId: string; onFinish: (win: boolean, mutated?: RunState, info?: { allRight?: boolean; netGain?: number }) => void;
}) {
  const scene = findScene(sc, sceneId);
  const mg = scene.minigame!;
  const [puzzle, setPuzzle] = useState<PuzzleState | null>(null);
  const [jiuling, setJiuling] = useState<JiulingState | null>(null);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [paijiu, setPaijiu] = useState<PaijiuState | null>(null);
  const [done, setDone] = useState(false);

  if (mg.type === "gobang" && !puzzle) setPuzzle(initPuzzle(mg.gobang!));
  if (mg.type === "jiuling" && !jiuling) setJiuling(initJiuling(mg.jiuling!));
  if ((mg.type === "duilian" || mg.type === "logic") && !quiz) setQuiz(initQuiz(mg.quiz!));
  if (mg.type === "paijiu" && !paijiu) setPaijiu(initPaijiu(mg.paijiu!));

  const title = mg.type === "gobang" ? (mg.gobang?.title ?? "手谈")
    : mg.type === "jiuling" ? (mg.jiuling?.title ?? "行令")
    : mg.type === "duilian" || mg.type === "logic" ? (mg.quiz?.title ?? "文会")
    : (mg.paijiu?.title ?? "推牌九");

  // 行令手牌高亮：相对当前令签标注 +2/+1/-1
  const jlPair: Record<string, string> = { 策: "势", 势: "器", 器: "隐", 隐: "策" };
  const jlHint = (s: string, drawn: string | null): number => {
    if (!drawn) return 0;
    if (s === drawn) return 2;
    if (jlPair[s] === drawn) return 1;
    return -1;
  };

  return (
    <div className="shop-root">
      <div className="shop-header">
        <h2>{title}</h2>
      </div>

      {mg.type === "gobang" && puzzle && (
        <div className="story-panel">
          {puzzle.status === "playing" && puzzle.puzzle.board && (
            <div className="gobang-wrap">
              <div className="gobang-board" aria-label="残局图">
                {(puzzle.puzzle.boards?.[puzzle.boardIdx] ?? puzzle.puzzle.board).map((row, r) => (
                  <div key={r} className="gobang-row">
                    {[...row].map((ch, ci) => (
                      <span key={ci} className={`gobang-cell ${ch === "B" ? "b" : ch === "W" ? "w" : ""}`} />
                    ))}
                  </div>
                ))}
              </div>
              {puzzle.puzzle.boardHint && <p className="muted gobang-hint">{puzzle.puzzle.boardHint}</p>}
              {puzzle.puzzle.boards && <p className="muted gobang-hint">第 {puzzle.boardIdx}/{puzzle.puzzle.boards.length - 1} 手局面</p>}
            </div>
          )}
          <p className="story-line show">{puzzle.log}</p>
          {puzzle.status === "playing" && (
            <div className="choices">
              {puzzle.puzzle.steps[puzzle.step]?.options.map((o, i) => (
                <button key={i} className="choice" onClick={() => {
                  sfx.card();
                  const p = structuredClone(puzzle);
                  puzzlePlay(p, i);
                  if (p.status === "win") sfx.win(); else if (p.status === "lose") sfx.lose(); else sfx.match();
                  setPuzzle(p);
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
            {jiuling.hand.map((s, i) => (
              <span key={i} className={`wine-chip suit-${s}${jiuling.drawn ? ` jl-hint-${jlHint(s, jiuling.drawn) > 0 ? "good" : jlHint(s, jiuling.drawn) < 0 ? "bad" : "mid"}` : ""}`}
                title={jiuling.drawn ? (jlHint(s, jiuling.drawn) === 2 ? "同令 +2" : jlHint(s, jiuling.drawn) === 1 ? "对令 +1" : "岔令 -1") : undefined}>
                {s}{jiuling.drawn && (jlHint(s, jiuling.drawn) > 0 ? ` +${jlHint(s, jiuling.drawn)}` : jlHint(s, jiuling.drawn) < 0 ? " -1" : "")}
              </span>
            ))}
          </div>
          <p className="story-line show">{jiuling.log}</p>
          <p className="muted">第 {Math.min(jiuling.round + 1, jiuling.cfg.rounds)} / {jiuling.cfg.rounds} 轮 · 得彩 {jiuling.score}（巡罢余牌每张 +1）</p>
          {jiuling.status === "playing" && !jiuling.drawn && (
            <button className="btn-main" onClick={() => { sfx.card(); const j = structuredClone(jiuling); jiulingDraw(j); setJiuling(j); }}>翻令签</button>
          )}
          {jiuling.status === "playing" && jiuling.drawn && (
            <div className="choices">
              {[...new Set(jiuling.hand)].map((s) => (
                <button key={s} className="choice" onClick={() => {
                  const j = structuredClone(jiuling);
                  jiulingPlay(j, s);
                  if (j.status === "win") sfx.win(); else if (j.status === "lose") sfx.lose(); else sfx.match();
                  setJiuling(j);
                }}>应令 · 出「{s}」牌{jlHint(s, jiuling.drawn) > 0 ? `（+${jlHint(s, jiuling.drawn)}）` : jlHint(s, jiuling.drawn) < 0 ? "（-1）" : ""}</button>
              ))}
            </div>
          )}
          {jiuling.status !== "playing" && !done && (
            <button className="btn-main" onClick={() => { setDone(true); onFinish(jiuling.status === "win"); }}>{jiuling.status === "win" ? "领赏" : "落座"}</button>
          )}
        </div>
      )}

      {(mg.type === "duilian" || mg.type === "logic") && quiz && (
        <div className="story-panel">
          <p className="story-line show">{quiz.log}</p>
          {quiz.cfg.ruleHint && quiz.status === "playing" && (
            <details className="quiz-rule"><summary>规则</summary><p className="muted">{quiz.cfg.ruleHint}</p></details>
          )}
          {quiz.status === "playing" && (
            <div className="quiz-box">
              <div className="quiz-prompt">{quiz.cfg.items[quiz.step]?.prompt}</div>
              <div className="choices">
                {quiz.cfg.items[quiz.step]?.options.map((o, i) => (
                  <button key={i} className="choice" onClick={() => {
                    sfx.card();
                    const q = structuredClone(quiz);
                    quizAnswer(q, i);
                    if (q.status === "win") sfx.win(); else if (q.status === "lose") sfx.lose(); else sfx.match();
                    setQuiz(q);
                  }}>{o}</button>
                ))}
              </div>
              <p className="muted">第 {Math.min(quiz.step + 1, quiz.cfg.items.length)} / {quiz.cfg.items.length} 题 · 答对 {quiz.correct}</p>
            </div>
          )}
          {quiz.status !== "playing" && !done && (
            <button className="btn-main" onClick={() => { setDone(true); onFinish(quiz.status === "win", undefined, quiz.status === "win" ? { allRight: quiz.correct === quiz.cfg.items.length } : undefined); }}>{quiz.status === "win" ? "领彩" : "告辞"}</button>
          )}
        </div>
      )}

      {mg.type === "paijiu" && paijiu && (
        <div className="story-panel">
          <p className="story-line show">{paijiu.log}</p>
          {paijiu.status === "playing" && (
            <div className="paijiu-box">
              <p className="muted">第 {paijiu.round + 1} / {paijiu.rounds.length} 局 · 净收益 {paijiu.net} 两（弃牌 {paijiu.folded}/{paijiu.cfg.foldLimit ?? 2} 次）</p>
              {paijiu.result === null && (
                <>
                  <div className="paijiu-hand">
                    <span className="st-label">你的牌：</span>
                    {paijiu.rounds[paijiu.round]!.player.map((n, i) => <span key={i} className="paijiu-tile">{n}</span>)}
                  </div>
                  <div className="choices">
                    {(paijiu.cfg.bets ?? [10, 20, 40]).map((b) => (
                      <button key={b} className="choice" onClick={() => { sfx.card(); const p = structuredClone(paijiu); paijiuBet(p, b); if (p.status === "win") sfx.win(); else if (p.status === "lose") sfx.lose(); else sfx.match(); setPaijiu(p); }}>押 {b} 两</button>
                    ))}
                    <button className="choice" disabled={paijiu.folded >= (paijiu.cfg.foldLimit ?? 2)} onClick={() => { sfx.choice(); const p = structuredClone(paijiu); paijiuFold(p); setPaijiu(p); }}>弃牌（罚 {paijiu.cfg.foldPenalty ?? 8}）</button>
                  </div>
                </>
              )}
            </div>
          )}
          {paijiu.status !== "playing" && !done && (
            <button className="btn-main" onClick={() => { setDone(true); onFinish(paijiu.status === "win", undefined, paijiu.status === "win" ? { netGain: paijiu.net } : undefined); }}>{paijiu.status === "win" ? "收下彩头" : "起身离席"}</button>
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
  // W-1：本次进店的出千次数——查获率随之递增（0.2 + n×0.05，封顶 1）
  const [cheatCount, setCheatCount] = useState(0);
  const roll = () => {
    if (st.bet <= 0 || st.bet > silver) { onSilver(0, "押注超过身家"); return; }
    if (cheat) setCheatCount((c) => c + 1);
    const n = structuredClone(st);
    sicboRoll(n, side, cheat, cheat ? cheatCount : 0);
    const pay = sicboPayout(n);
    sfx.card();
    if (n.result === "win") sfx.win(); else sfx.lose();
    setSt(n);
    onSilver(pay, n.log + (pay !== 0 ? `（${pay > 0 ? "+" : ""}${pay} 两）` : ""));
  };
  return (
    <div className="story-panel" style={{ maxWidth: 640 }}>
      <p className="muted">三枚骰盅，买定离手。大（11-17）/ 小（4-10）一赔一，豹子（三同）一赔五。出千七成胜面——但庄家的眼睛不瞎：同一晚千得越多次，被抓的概率越高（起始两成，每次递增半成），抓到输双倍。</p>
      <div className="duel-status">
        <span>身家 {silver} 两</span>
        <span>押注 {st.bet} 两</span>
        <span>当前买：{side}{cheat ? `（出千 · 第 ${cheatCount + 1} 次）` : ""}</span>
      </div>
      {st.dice && <p className="story-line show">{st.log}</p>}
      <div className="choices">
        <button className="choice" onClick={() => { const n = structuredClone(st); sicboSetBet(n, n.bet + 5, silver); setSt(n); }}>押注 +5</button>
        <button className="choice" onClick={() => { const n = structuredClone(st); sicboSetBet(n, Math.max(5, n.bet - 5), silver); setSt(n); }}>押注 -5</button>
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

/** 卡牌效果 → 结构化中文说明（详情框「作用」段） */
function effectLines(c: CardDef): string[] {
  const out: string[] = [];
  const layer = c.layer ?? "成术";
  if (layer === "成术") {
    const bits: string[] = [];
    if (c.suit) bits.push(`花色「${c.suit}」——克「${RESTRAIN_UI[c.suit]}」、被「${Object.entries(RESTRAIN_UI).find(([, v]) => v === c.suit)?.[0]}」克`);
    if (c.power !== undefined) bits.push(`点数 ${c.power}${c.suit === "势" ? "（×2，反噬 1 气）" : ""}`);
    if (c.cost !== undefined) bits.push(`费 ${c.cost} 行动力`);
    if (c.reveal === "card") bits.push("打出后看破对手下一手（全牌）");
    else if (c.reveal === "suit") bits.push("打出后看破对手下一手（花色）");
    if (bits.length) out.push(bits.join(" · "));
    if (c.text) out.push(`出牌：${c.text}`);
  } else if (layer === "物品") {
    const eff: Record<string, string> = {
      破防: "对局中使用：情绪制破防并共鸣+1；压制制直接造成 4 点伤害",
      回气: "对局中使用：恢复 3 点气力（上限内）",
      强牌: "对局中使用：下一张成术牌点数 +3（情绪制兑现为额外共鸣）",
      共鸣: "对局中使用：情绪制共鸣 +2；压制制造成 3 点伤害",
      抽牌: "对局中使用：再抽 2 张手牌（牌库空时自动洗回弃牌堆）",
      观牌: "对局中使用：看破对手下一手全牌",
      观色: "对局中使用：看破对手下一手花色",
      观点: "对局中使用：看破对手下一手点数",
    };
    if (c.itemEffect) out.push(`效果：${eff[c.itemEffect] ?? c.itemEffect}`);
    if (c.clueReveal === 1) out.push("携带入局：复盘时标出核心线索");
    else if (c.clueReveal === 2) out.push("携带入局：复盘时标出全部真线索");
    if (c.shopPeek) out.push("携带入市集：卡包页出现「先验一封」");
    if (c.text) out.push(`使用：${c.text}`);
  } else if (layer === "人物") {
    const p = c.passive;
    const bits: string[] = [];
    if (p?.bonusSuit) bits.push(`${p.bonusSuit}牌 +${p.bonusPower ?? 1}`);
    if (p?.bonusQi) bits.push(`气力上限 +${p.bonusQi}`);
    if (p?.extraDraw) bits.push(`每回合多抽 ${p.extraDraw}`);
    if (p?.peekEvery) bits.push(`每 ${p.peekEvery} 回合看破对手下一手`);
    if (p?.readScript) bits.push("第 4 回合起读透对手出牌循环");
    if (bits.length) out.push(`被动：${bits.join(" · ")}`);
    if (c.text) out.push(`携带：${c.text}`);
  } else if (layer === "资源") {
    out.push(`资源卡：翻到即入钱袋 +${c.resource} 两。`);
  }
  if (c.rarity) out.push(`稀有度：${c.rarity}（卡面底色/边框即稀有度色）`);
  return out;
}

/** 卡牌出现位置（详情框「由来」段）：全剧本扫描该卡的一切获得途径 */
function originLines(sc: Scenario, c: CardDef): string[] {
  const out: string[] = [];
  if ((sc.initialDeck ?? []).includes(c.id)) out.push("初始编组自带");
  for (const s of sc.scenes) {
    for (const e of s.effects ?? []) if (e.unlockCard === c.id) out.push(`剧情获得：《${s.title ?? s.id}》`);
    for (const ch of s.choices ?? []) {
      for (const e of ch.effects ?? []) if (e.unlockCard === c.id) out.push(`选支获得：《${s.title ?? s.id}》`);
    }
    if (s.cardPick?.options.includes(c.id)) out.push(`三选一：《${s.title ?? s.id}》`);
    if (s.shop) {
      if (s.shop.stock.includes(c.id)) out.push(`市集出售：${s.shop.name}`);
      if (s.shop.hiddenStock?.some((h) => h.id === c.id)) out.push(`暗柜出售：${s.shop.name}`);
      for (const p of s.shop.packs ?? []) if (p.pool.includes(c.id)) out.push(`卡包「${p.name}」：${s.shop.name}`);
    }
  }
  const vs = sc.viewpoints?.filter((v) => (v.initialDeck ?? []).includes(c.id));
  if (vs?.length) out.push(`视角专属起手：${vs.map((v) => v.name).join(" / ")}`);
  if (!out.length) out.push("非卖品 · 无固定获得途径（多周目探索）");
  return out;
}

/** 卡牌详情弹层：左侧大卡 + 右侧「由来 / 作用 / 卡面」详情框；点外部空白返回上一层 */
function CardZoomView({ sc, c, seen, onClose }: { sc: Scenario; c: CardDef; seen?: boolean; onClose: () => void }) {
  const bonus = bonusOfCard(c.id);
  const [readBonus, setReadBonus] = useState(false);
  return (
    <div className="clue-overlay card-zoom-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="card-zoom-body" onClick={(e) => e.stopPropagation()}>
        <TCard c={c} unknown={!seen} />
        <div className="card-detail">
          <h3 className="card-detail-name">{c.name}</h3>
          <div className="card-detail-tags">
            <span className="detail-tag">{c.layer ?? "成术"}</span>
            {c.suit && <span className={`detail-tag s-${c.suit}`}>{c.suit}</span>}
            {c.rarity && <span className={`detail-tag rarity-${c.rarity}`}>{c.rarity}</span>}
          </div>
          <div className="card-detail-sec">
            <div className="card-detail-sec-title">由来</div>
            {originLines(sc, c).map((l, i) => <p key={i} className="detail-line">{l}</p>)}
          </div>
          <div className="card-detail-sec">
            <div className="card-detail-sec-title">作用</div>
            {effectLines(c).map((l, i) => <p key={i} className="detail-line">{l}</p>)}
          </div>
          {c.lore && (
            <div className="card-detail-sec">
              <div className="card-detail-sec-title">卡面</div>
              <p className="detail-line detail-lore">{c.lore}</p>
            </div>
          )}
          {bonus && (
            <div className="card-detail-sec">
              <div className="card-detail-sec-title">番外</div>
              {getBonuses().includes(bonus.id) ? (
                <>
                  <p className="detail-line">「{bonus.title}」已解锁——{bonus.desc}</p>
                  <button className="link-btn" onClick={() => { sfx.choice(); setReadBonus(true); }}>展阅番外</button>
                </>
              ) : (
                <p className="detail-line muted">携带此卡及同组另 {Math.max(1, bonus.need - 1)} 张（{bonus.keyCards.slice(0, 3).join("、")}{bonus.keyCards.length > 3 ? "…" : ""}）赢下本剧本对局，解锁番外「{bonus.title}」。</p>
              )}
            </div>
          )}
          <button className="btn-main" onClick={onClose}>收回</button>
        </div>
      </div>
      {readBonus && bonus && (
        <div className="clue-overlay bonus-read" onClick={() => setReadBonus(false)}>
          <div className="bag-panel bonus-read-panel" onClick={(e) => e.stopPropagation()}>
            <h3>番外 · {bonus.title}</h3>
            <p className="muted">{bonus.desc}</p>
            <div className="bonus-lines">
              {bonus.lines.map((l, i) => <p key={i} className="detail-line">{l}</p>)}
            </div>
            <button className="btn-main" onClick={() => setReadBonus(false)}>合卷</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CardGallery({ sc, onClose }: { sc: Scenario; onClose: () => void }) {
  const seen = new Set(getCardSeen()[sc.id] ?? []);
  // 点卡放大展阅：卡名被遮挡时点开看全，未收录的卡同样可点（仍是？？？样式）
  const [zoom, setZoom] = useState<CardDef | null>(null);
  // 资源卡翻到即折银、永不入袋：不计收集、不入图鉴（分母与分子口径一致）
  const groups: { key: string; label: string }[] = [
    { key: "成术", label: "成术卡" }, { key: "物品", label: "物品卡" },
    { key: "人物", label: "人物卡" },
  ];
  const collectible = sc.cards.filter((c) => (c.layer ?? "成术") !== "资源");
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel" onClick={(e) => e.stopPropagation()}>
        <h3>{sc.title} · 卡牌图鉴</h3>
        <p className="muted">已收录 {seen.size}/{collectible.length} 张（资源卡折银，不计收集）</p>
        {groups.map((g) => {
          const ids = sc.cards.filter((c) => (c.layer ?? "成术") === g.key);
          if (!ids.length) return null;
          return (
            <div key={g.key} className="bag-group">
              <div className="bag-group-title">{g.label}</div>
              <div className="bag-grid">
                {ids.map((c) => (
                  <TCard key={c.id} c={c} unknown={!seen.has(c.id)} onClick={() => { sfx.choice(); setZoom(c); }} />
                ))}
              </div>
            </div>
          );
        })}
        <button className="btn-main" onClick={onClose}>合上图鉴</button>
        <span className="muted" style={{ marginLeft: 12 }}>非卖品孤品 {collectible.filter(c => c.rarity === "孤品" && seen.has(c.id)).length}/{collectible.filter(c => c.rarity === "孤品").length} 张现世</span>
      </div>
      {zoom && (
        <CardZoomView sc={sc} c={zoom} seen={seen.has(zoom.id)} onClose={() => setZoom(null)} />
      )}
    </div>
  );
}

/** 天下卡册：全部剧本全部卡的三态总览（未见？？？ / 已见 / 已得·可携带） */
function AlbumPanel({ onClose }: { onClose: () => void }) {
  const seenMap = getCardSeen();
  const [zoom, setZoom] = useState<{ sc: Scenario; c: CardDef; seen: boolean } | null>(null);
  const [suitF, setSuitF] = useState<"全部" | Suit>("全部");
  const [scF, setScF] = useState<string>("全部");
  let total = 0, got = 0;
  for (const s of SCENARIOS) {
    for (const c of s.cards) {
      if ((c.layer ?? "成术") === "资源") continue;
      total++;
      if ((seenMap[s.id] ?? []).includes(c.id)) got++;
    }
  }
  const carryable = (c: CardDef, seen: boolean) =>
    seen && ((c.layer ?? "成术") === "物品" || !!c.endingReward || ((c.passive?.scout ?? 0) > 0 || (c.passive?.insider ?? 0) > 0));
  // 筛选：上侧剧本 × 左侧花色（AND）
  const shownSc = scF === "全部" ? SCENARIOS : SCENARIOS.filter((s) => s.id === scF);
  const matchSuit = (c: CardDef) => suitF === "全部" || c.suit === suitF;
  let shownTotal = 0, shownGot = 0;
  for (const s of shownSc) {
    for (const c of s.cards) {
      if ((c.layer ?? "成术") === "资源" || !matchSuit(c)) continue;
      shownTotal++;
      if ((seenMap[s.id] ?? []).includes(c.id)) shownGot++;
    }
  }
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel gallery-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>天下卡册 · 全册 {got}/{total} <span className="muted">（当前 {shownGot}/{shownTotal}）</span></h3>
        <p className="muted">未见=？？？ · 已见=亮起 · 「可携带」=入行囊/卡组（物品与结局奖励卡、随从）</p>
        <div className="album-filters">
          <div className="album-filter-row">
            <span className="album-filter-label">剧本</span>
            <div className="album-scroll">
              <button className={`album-chip ${scF === "全部" ? "on" : ""}`} onClick={() => { sfx.choice(); setScF("全部"); }}>全部</button>
              {SCENARIOS.map((s) => (
                <button key={s.id} className={`album-chip ${scF === s.id ? "on" : ""}`} onClick={() => { sfx.choice(); setScF(s.id); }}>{s.title}</button>
              ))}
            </div>
          </div>
          <div className="album-filter-row">
            <span className="album-filter-label">花色</span>
            <div className="album-chips">
              {(["全部", "策", "器", "势", "隐"] as const).map((s) => (
                <button key={s} className={`album-chip ${suitF === s ? "on" : ""} ${s !== "全部" ? `s-${s}` : ""}`} onClick={() => { sfx.choice(); setSuitF(s); }}>{s === "全部" ? "全部" : s}</button>
              ))}
            </div>
          </div>
        </div>
        {shownSc.map((s) => {
          const seen = new Set(seenMap[s.id] ?? []);
          const cols = s.cards.filter((c) => (c.layer ?? "成术") !== "资源" && matchSuit(c));
          if (!cols.length) return null;
          const gotN = cols.filter((c) => seen.has(c.id)).length;
          return (
            <div key={s.id} className="bag-group">
              <div className="bag-group-title">{s.title}<span className="muted">（{gotN}/{cols.length}）</span></div>
              <div className="bag-grid">
                {cols.map((c) => {
                  const isSeen = seen.has(c.id);
                  const carry = carryable(c, isSeen);
                  return (
                    <div key={c.id} className="album-cell">
                      <TCard c={c} unknown={!isSeen} onClick={() => { sfx.choice(); setZoom({ sc: s, c, seen: isSeen }); }} />
                      {carry && <span className="album-carry" title="可携带出战">可携带</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {shownTotal === 0 && <p className="muted" style={{ padding: "16px 0" }}>此筛选下暂无卡牌。</p>}
        <button className="btn-main" onClick={onClose}>合上卡册</button>
      </div>
      {zoom && <CardZoomView sc={zoom.sc} c={zoom.c} seen={zoom.seen} onClose={() => setZoom(null)} />}
    </div>
  );
}

/** 成就面板：跨周目硬性挑战（奖励不产卡，走墨铤/称号/边框） */
function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const owned = new Set(getAchievements());
  const [tab, setTab] = useState<AchCategory>("deck");
  const tabs: { key: AchCategory; label: string }[] = [
    { key: "deck", label: "卡组" }, { key: "duel", label: "对局" }, { key: "minigame", label: "小游戏" },
    { key: "collect", label: "收集" }, { key: "hidden", label: "隐藏" },
  ];
  const baseShown = ACHIEVEMENTS.filter((a) => tab === "hidden" ? a.hidden : a.category === tab);
  const shown = baseShown;
  const done = ACHIEVEMENTS.filter((a) => owned.has(a.id)).length;
  const tabDone = (k: AchCategory) => ACHIEVEMENTS.filter((a) => (k === "hidden" ? a.hidden : a.category === k)).filter((a) => owned.has(a.id)).length;
  const [zoomAch, setZoomAch] = useState<AchievementDef | null>(null);
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel gallery-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>成就 · {done}/{ACHIEVEMENTS.length}</h3>
        <p className="muted">图标即达成徽记（暖橙简笔）；点击任意一条可放大展阅。卡组构成挑战让普通卡成为入场券。</p>
        <div className="ach-tabs">
          {tabs.map((t) => (
            <button key={t.key} className={`ach-tab ${tab === t.key ? "on" : ""}`} onClick={() => { sfx.choice(); setTab(t.key); }}>
              {t.label}<span className="muted"> {tabDone(t.key)}/{ACHIEVEMENTS.filter((a) => t.key === "hidden" ? a.hidden : a.category === t.key).length}</span>
            </button>
          ))}
        </div>
        <div className="ach-list">
          {shown.map((a) => {
            const on = owned.has(a.id);
            return (
              <div key={a.id} className={`ach-item ${on ? "on" : ""} ${a.hidden && !on ? "hidden" : ""}`} onClick={() => { sfx.choice(); setZoomAch(a); }}>
                <span className="ach-icon" aria-hidden="true">{achArt(a.id) ? <img className="ach-icon-img" src={achArt(a.id)} alt="" /> : (on ? (a.hidden ? "🔓" : "🏅") : "🔒")}</span>
                <span className="ach-name">{on ? a.name : (a.hidden ? "？？？" : a.name)}</span>
                <span className="ach-cond">{on ? a.cond : (a.hidden ? "达成条件不祥——多探探边角。" : a.cond)}</span>
                <span className="ach-reward">{a.reward}</span>
              </div>
            );
          })}
          {shown.length === 0 && <p className="muted">此分类暂无成就。</p>}
        </div>
        <button className="btn-main" onClick={onClose}>合上</button>
      </div>
      {zoomAch && (() => {
        const on = owned.has(zoomAch.id);
        return (
          <div className="ach-zoom-overlay clue-overlay" onClick={() => setZoomAch(null)}>
            <div className="ach-zoom" onClick={(ev) => ev.stopPropagation()}>
              <div className="ach-zoom-art">
                {achArt(zoomAch.id) ? (
                  <img className="ach-zoom-img" src={achArt(zoomAch.id)} alt={zoomAch.name} />
                ) : (
                  <span className="ach-zoom-emoji">{on ? (zoomAch.hidden ? "🔓" : "🏅") : "🔒"}</span>
                )}
              </div>
              <div className="ach-zoom-info">
                <h3>{on ? zoomAch.name : (zoomAch.hidden ? "？？？" : zoomAch.name)}</h3>
                <p className={`ach-zoom-state ${on ? "on" : ""}`}>{on ? "已达成" : "未达成"}</p>
                <p className="muted ach-zoom-cond">{on ? zoomAch.cond : (zoomAch.hidden ? "达成条件不祥——多探探边角。" : zoomAch.cond)}</p>
                <p className="ach-zoom-reward">{zoomAch.reward}</p>
                {zoomAch.scenario && <p className="muted ach-zoom-sc">归属剧本 · {SCENARIOS.find((s) => s.id === zoomAch.scenario)?.title ?? zoomAch.scenario}</p>}
                <button className="btn-main" onClick={() => setZoomAch(null)}>合上</button>
              </div>
            </div>
          </div>
        );
      })()}
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
                <button className="emporia-buy" onClick={() => buyGuard(() => buyBoost(b))} disabled={e.ink < b.price}>购 · {b.price} 墨铤</button>
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
                    <button className="emporia-buy" onClick={() => buyGuard(() => buyTheme(t))} disabled={e.ink < t.price}>购 · {t.price} 墨铤</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="bag-group">
          <div className="bag-group-title">战略重器 · 岁币之约</div>
          <div className="emporia-item">
            <div className="emporia-name">岁币之约 {e.peaceDeal && <span className="deck-tag">已持</span>}</div>
            <div className="emporia-desc">一车银锭推到营门前，对面的刀就放下了。出征时勾选「递交和议之书」，本剧下一场战争对局免战——但该局奖励归零，威望有损。</div>
            {e.warLoses.length === 0 ? (
              <p className="muted" style={{ marginTop: 6 }}>战争失败一次后解锁——兵败了，才谈和。</p>
            ) : e.peaceDeal ? (
              <p className="muted" style={{ marginTop: 6 }}>已购入。出征准备时勾选生效。</p>
            ) : (
              <button className="emporia-buy" onClick={() => buyGuard(() => { if (!buyPeaceDeal()) { toast("墨铤不足（60）"); return; } sfx.card(); setTick((t) => t + 1); toast("购入「岁币之约」——银两能买的太平，也是太平。"); })} disabled={e.ink < 60}>购 · 60 墨铤</button>
            )}
            <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>※ 剧本「劫与烬」除外——大明不和亲、不赔款、不称臣。</p>
          </div>
        </div>
        <div className="bag-group">
          <div className="bag-group-title">随身扩容 · 银两兑换</div>
          <div className="emporia-item">
            <div className="emporia-name">随身位 +1 {e.luggageSlots > 0 && <span className="deck-tag">已扩 {e.luggageSlots} 次（共 {3 + e.luggageSlots} 格）</span>}</div>
            <div className="emporia-desc">永久扩容一格随身位（物品/随从共用）。位子永远不够——多一格，多一分选择。</div>
            {e.luggageSlots >= 2 ? (
              <p className="muted" style={{ marginTop: 6 }}>已扩至上限（5 格）。</p>
            ) : (
              <button className="emporia-buy" onClick={() => buyGuard(() => { if (!buyLuggageSlot()) { toast(e.ink < 300 ? "墨铤不足（300）" : "已扩至上限"); return; } sfx.card(); setTick((t) => t + 1); toast("随身位 +1——位子多了，能带的也多了。"); })} disabled={e.ink < 300}>扩位 · 300 墨铤</button>
            )}
          </div>
          <div className="emporia-item">
            <div className="emporia-name">银两储备 {e.spareSilver > 0 && <span className="deck-tag">存 {e.spareSilver} 两</span>}</div>
            <div className="emporia-desc">墨铤 1:1 兑换银两，出征时注入剧本（消耗制）。办案没钱，寸步难行。</div>
            <button className="emporia-buy" onClick={() => buyGuard(() => { const n = 10; if (!exchangeSilver(n)) { toast("墨铤不足"); return; } sfx.card(); setTick((t) => t + 1); toast(`兑换 ${n} 两入储备——开审即入账。`); })} disabled={e.ink < 10}>兑 10 两 · 10 墨铤</button>
          </div>
        </div>
        {e.titles.length > 0 && (
          <div className="bag-group">
            <div className="bag-group-title">称号（成就授予，展示用）</div>
            <div className="emporia-grid">
              {e.titles.map((t) => (
                <div key={t} className="emporia-item"><div className="emporia-name">「{t}」</div></div>
              ))}
            </div>
          </div>
        )}
        <button className="btn-main" onClick={onClose}>离市</button>
      </div>
    </div>
  );
}

/** 行囊：已获得物品卡的自动收藏，出征时可勾选携带 */
/** 行囊跨剧本仓库：查一张全局物品卡所属的剧本（用于详情框「由来/作用」扫描） */
function scForZoom(c: CardDef): Scenario {
  return SCENARIOS.find((s) => s.cards.some((x) => x.id === c.id)) ?? SCENARIOS[0]!;
}

function LuggagePanel({ onClose }: { onClose: () => void }) {
  // 行囊 = 各剧本获得的物品卡（随身位）+ 结局奖励卡（进卡组，不占随身位）
  const defs = [...luggageDefs(), ...endingRewardDefs()];
  const [zoom, setZoom] = useState<CardDef | null>(null);
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>行囊</h3>
        <p className="muted">物品卡（随身位）与结局奖励卡（进卡组）自动收入此处；出征新剧本时可勾选携带。点卡可展阅。</p>
        {defs.length === 0 ? (
          <p className="muted" style={{ padding: "24px 0" }}>行囊空空——先去剧本里攒几件趁手家伙。</p>
        ) : (
          <div className="bag-group">
            <div className="bag-group-title">在囊（{defs.length}）{endingRewardDefs().length > 0 && <span className="muted">· 含 {endingRewardDefs().length} 张结局奖励</span>}</div>
            <div className="bag-grid">
              {defs.map((c) => (
                <div key={c.id} className={`bag-card bag-item rarity-${c.rarity ?? "凡"} ${c.suit ? `suit-${c.suit}` : ""}`} onClick={() => { sfx.choice(); setZoom(c); }}>
                  {c.suit && <SuitGlyph suit={c.suit} />}
                  <div className="card-artwrap">
                    <CardArt id={c.id} name={c.name} compact />
                    <CardBand c={c} />
                  </div>
                  <div className="pc-text">{c.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <button className="btn-main" onClick={onClose}>合上行囊</button>
      </div>
      {zoom && (
        <CardZoomView sc={scForZoom(zoom)} c={zoom} seen onClose={() => setZoom(null)} />
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
                        const vpName = s.viewpoints?.find((v) => v.endings?.includes(scene.id))?.name;
                        const on = unlockedNames.has(scene.ending!.name);
                        if (!on) {
                          return (
                            <div key={scene.id} className="end-tile end-tile-unknown">
                              <div className="end-tile-art">？？？</div>
                              <span className="end-tile-name">？？？</span>
                              <span className="end-tile-rank">{vpName ? `${vpName} · ` : ""}未探明</span>
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
                            <span className="end-tile-rank">{vpName ? `${vpName} · ` : ""}{scene.ending!.rank}</span>
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
  // L-5：确认层 1.5s 冷启动——惊慌误触率对半的经典防御
  const [wait, setWait] = useState(2);
  useEffect(() => {
    if (!armed) { setWait(2); return; }
    const id = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 500);
    return () => clearInterval(id);
  }, [armed]);
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
              确定放弃全部进度？此操作不可恢复。
              <button className="btn-main" onClick={() => setArmed(false)}>反悔（留档）</button>
              <button className="danger-final" disabled={wait > 0} onClick={() => { onCleared(); onClose(); }}>{wait > 0 ? `${wait === 1 ? "最后想一秒" : "再想一会儿"}` : "确定放弃"}</button>
            </span>
          ) : (
            <button className="danger-ghost" onClick={() => setArmed(true)}>放弃存档</button>
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
  const [slots, setSlots] = useState<{ carry: string[]; retinue: string[] }>({ carry: [], retinue: [] });
  const [deckBonus, setDeckBonus] = useState<string[]>([]);
  const [peaceDeal, setPeaceDeal] = useState(false);
  const luggageItems = luggageDefs();
  const retinuePool = retinueDefs();
  const rewardPool = endingRewardDefs();
  const slotCap = 3 + e.luggageSlots; // 随身位：基础 3 格 + 商市扩容（上限 5）
  const slotsUsed = slots.carry.length + slots.retinue.length;
  const toggleBoost = (id: string) => {
    setBoosts((xs) => xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);
  };
  // 随身位物/人争位（合并 state 保证原子读最新值，防闭包竞态超格）
  const toggleCarry = (id: string) => {
    setSlots((s) => {
      if (s.carry.includes(id)) return { ...s, carry: s.carry.filter((x) => x !== id) };
      if (s.carry.length + s.retinue.length >= slotCap) return s;
      return { ...s, carry: [...s.carry, id] };
    });
  };
  const toggleRetinue = (id: string) => {
    setSlots((s) => {
      if (s.retinue.includes(id)) return { ...s, retinue: s.retinue.filter((x) => x !== id) };
      if (s.retinue.length + s.carry.length >= slotCap) return s;
      return { ...s, retinue: [...s.retinue, id] };
    });
  };
  const toggleBonus = (id: string) => {
    setDeckBonus((xs) => xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);
  };
  // 品级边框色（固定色板：凡/良/精/传/孤品）
  const RARITY_COLOR: Record<string, string> = { 凡: "#565040", 良: "#5b8fb8", 精: "#8b7ab8", 传: "#d2a44f", 孤品: "#e0745a" };
  const cardMeta = (id: string) => [...luggageItems, ...retinuePool, ...rewardPool].find((x) => x.id === id);
  const slotItems = [...slots.carry, ...slots.retinue].map((id) => cardMeta(id)).filter((x): x is CardDef => !!x);
  // 卡面迷你块（左池候选网格共用）
  const Mini = ({ c, sel, onToggle, badge }: { c: CardDef; sel: boolean; onToggle: () => void; badge?: string }) => (
    <button type="button" className={`prep-card ${sel ? "on" : ""}`} style={{ borderColor: RARITY_COLOR[c.rarity ?? "凡"] }} onClick={() => { sfx.choice(); onToggle(); }}>
      <span className="prep-card-art">
        {cardArt(c.id) ? <img src={cardArt(c.id)} alt={c.name} loading="lazy" /> : <span className="prep-card-fallback">{c.name.slice(0, 1)}</span>}
        {sel && <span className="prep-card-check">✓</span>}
        {badge && <span className="prep-card-badge">{badge}</span>}
      </span>
      <span className="prep-card-name">{c.name}</span>
    </button>
  );
  return (
    <div className="clue-overlay" onClick={onCancel}>
      <div className="bag-panel prep-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>出征 · {sc.title}</h3>
        <p className="muted">左选右槽——点卡携带，点槽取出。随身位物/人争位，共 {slotCap} 格。</p>
        <div className="prep-split">
          <div className="prep-pool">
            <div className="bag-group">
              <div className="bag-group-title">开局加成</div>
              {SHOP_BOOSTS.every((b) => !(e.boosts[b.id] ?? 0)) ? (
                <p className="muted">暂无加成——去商市用墨铤购置。</p>
              ) : (
                <div className="prep-list">
                  {SHOP_BOOSTS.filter((b) => (e.boosts[b.id] ?? 0) > 0).map((b) => (
                    <label key={b.id} className={`prep-item ${boosts.includes(b.id) ? "prep-checked" : ""}`}>
                      <input type="checkbox" checked={boosts.includes(b.id)} onChange={() => toggleBoost(b.id)} />
                      <span>{b.name} ×{e.boosts[b.id]} <span className="muted">· {b.desc}</span></span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="bag-group">
              <div className="bag-group-title">随身位候选 <span className="muted">（物/人争位 · 已用 {slotsUsed}/{slotCap}）</span></div>
              <div className="prep-sub-title">▸ 器物（行囊物品，对局内道具）</div>
              {luggageItems.length === 0 ? (
                <p className="muted">行囊中没有可携带的物品——先在剧本里获得几件物品卡。</p>
              ) : (
                <div className="prep-grid">
                  {luggageItems.map((c) => <Mini key={c.id} c={c} sel={slots.carry.includes(c.id)} onToggle={() => toggleCarry(c.id)} />)}
                </div>
              )}
              <div className="prep-sub-title">▸ 随从（斥候/内应，对局内刺探/收买）</div>
              {retinuePool.length === 0 ? (
                <p className="muted">暂无随从——黑市/暗柜雇人，或剧情收编。</p>
              ) : (
                <div className="prep-grid">
                  {retinuePool.map((c) => (
                    <Mini key={c.id} c={c} sel={slots.retinue.includes(c.id)} onToggle={() => toggleRetinue(c.id)}
                      badge={`斥${c.passive?.scout ?? 0}/内${c.passive?.insider ?? 0}${c.passive?.sharedTotal ? `共${c.passive.sharedTotal}` : ""}`} />
                  ))}
                </div>
              )}
            </div>
            <div className="bag-group">
              <div className="bag-group-title">结局奖励卡与和议</div>
              <div className="prep-sub-title">▸ 奖励卡（直接进卡组，不占随身位）</div>
              {rewardPool.length === 0 ? (
                <p className="muted">暂无奖励卡——打出特定结局即可解锁专属卡。</p>
              ) : (
                <div className="prep-grid">
                  {rewardPool.map((c) => <Mini key={c.id} c={c} sel={deckBonus.includes(c.id)} onToggle={() => toggleBonus(c.id)} badge={c.rarity ?? "凡"} />)}
                </div>
              )}
              <div className="prep-sub-title">▸ 和议之书（岁币之约 · 非「劫与烬」可用）</div>
              {e.peaceDeal && sc.id !== "jieyu" ? (
                <label className="prep-item prep-checked">
                  <input type="checkbox" checked={peaceDeal} onChange={() => setPeaceDeal(!peaceDeal)} />
                  <span>递交和议之书 <span className="muted">· 下一场战争对局免战（该局奖励归零，威望有损）</span></span>
                </label>
              ) : (
                <p className="muted">{sc.id === "jieyu" ? "劫与烬除外——大明不和亲、不赔款、不称臣。" : "商市未购「岁币之约」。"}</p>
              )}
            </div>
          </div>
          <div className="prep-slots">
            <div className="prep-slots-title">随身位 <b>{slotsUsed}/{slotCap}</b></div>
            <div className="prep-slot-grid">
              {slotItems.map((c) => (
                <button key={c.id} type="button" className={`prep-slot filled ${c.layer === "人物" ? "person" : "item"}`} style={{ borderColor: RARITY_COLOR[c.rarity ?? "凡"] }} onClick={() => { sfx.choice(); (c.layer === "人物" ? toggleRetinue : toggleCarry)(c.id); }}>
                  {cardArt(c.id) ? <img src={cardArt(c.id)} alt={c.name} /> : <span className="prep-card-fallback">{c.name.slice(0, 1)}</span>}
                  <span className="prep-slot-tag">{c.layer === "人物" ? "随从" : "器物"} · 点取</span>
                </button>
              ))}
              {Array.from({ length: Math.max(0, slotCap - slotItems.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="prep-slot empty">空</div>
              ))}
            </div>
            <p className="muted">物品与人物共争这 {slotCap} 格；奖励卡不占位。</p>
          </div>
        </div>
        <div className="prep-actions">
          <button className="btn-main" onClick={() => { sfx.card(); onGo({ boosts, carry: slots.carry, retinue: slots.retinue, deckBonus, peaceDeal }); }}>开审</button>
          <button className="link-btn touch" onClick={onCancel}>再想想</button>
        </div>
      </div>
    </div>
  );
}

/** 视角选择（多视角剧本：先选定主视角才能进入，其余视角折为插叙） */
function ViewpointModal({ sc, onCancel, onPick }: {
  sc: Scenario; onCancel: () => void; onPick: (id: string) => void;
}) {
  return (
    <div className="clue-overlay" onClick={onCancel}>
      <div className="bag-panel prep-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>{sc.title} · 选视角</h3>
        <p className="muted">每个视角各有入口与专属起手卡；结局按视角单列。</p>
        <div className="vp-list">
          {(sc.viewpoints ?? []).map((v) => (
            <button key={v.id} className="vp-card" onClick={() => { sfx.choice(); onPick(v.id); }}>
              <span className="vp-name">{v.name}</span>
              <span className="vp-desc">{v.desc}</span>
              <span className="vp-meta muted">专属结局 {v.endings?.length ?? 0} · 起手卡 {v.initialDeck?.length ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="prep-actions">
          <button className="link-btn touch" onClick={onCancel}>再想想</button>
        </div>
      </div>
    </div>
  );
}
