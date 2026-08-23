import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import type { Scenario, CardDef } from "./engine/types";
import { initState, findScene, visibleChoices, applyEffects, registerScenarios, type RunState } from "./engine/runtime";
import { initDuel, revealEmotion, playEmotion, playPressure, endTurn, cardCost, type DuelState } from "./engine/duel";
import { saveGame, loadGame, clearSave, unlockEnding, getGallery, recordTreeVisit, getTree, recordCardsSeen, getCardSeen } from "./engine/save";
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
  diaolan, changhen, jianfeng, xingxing, touming,
];
registerScenarios(SCENARIOS);

// ============================================================
// 美术接入（皮）：运行时按 id 载入 src/assets/{cards,portraits,scenes}/<id>.png
// 图片缺失（外部生成尚未落位）则不出图，文本布局照常，游戏完全不受影响。
// 甲·去字化纹章：花色只作色相 + 非汉字 SVG 纹章，绝不渲染「威/理/利/情」字面。
// 乙·双轴门类：卡面主类目由 cardThemes 查表给出（~13 词），替代四字重复。
// ============================================================
const _CARD_ART = import.meta.glob("./assets/cards/*.png", { eager: true, import: "default" }) as Record<string, string>;
const _PORTRAIT_ART = import.meta.glob("./assets/portraits/*.png", { eager: true, import: "default" }) as Record<string, string>;
function _artUrl(map: Record<string, string>, id: string): string | undefined {
  const key = Object.keys(map).find((p) => p.endsWith("/" + id + ".png"));
  return key ? map[key] : undefined;
}
function cardArt(id: string): string | undefined {
  return _artUrl(_CARD_ART, id) ?? _artUrl(_PORTRAIT_ART, id);
}

// 四花色非汉字纹章（威=官印 / 理=卷宗 / 利=铜钱 / 情=同心结），currentColor 由 .s-* 上色
const SUIT_GLYPH: Record<string, ReactNode> = {
  威: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><path d="M5 8h11v11H5zM8 5v3M13 5v3M8 12h5M8 15h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  理: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><rect x="5" y="5" width="11" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M16 9h3v10H8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><line x1="7" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1.4" /></svg>),
  利: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><rect x="9" y="9" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>),
  情: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><circle cx="9.5" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="14.5" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>),
};

function SuitSeal({ suit }: { suit?: string }) {
  if (!suit || !(suit in SUIT_GLYPH)) return null;
  return <span className={`pc-suit s-${suit}`}>{SUIT_GLYPH[suit]}</span>;
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
      recordCardsSeen(sc.id, next.bag);
      setSt(next);
      if (target.duel) {
        const cfg = sc.duels.find((d) => d.id === target.duel);
        if (cfg) {
          const loadout = sc.cardSystem ? next.deck : cfg.deck;
          const d = initDuel(cfg, loadout, sc.cards);
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
    recordCardsSeen(sc.id, next.bag);
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

  const start = (scenario: Scenario) => {
    setSc(scenario);
    const s = initState(scenario);
    const scene = findScene(scenario, s.sceneId);
    applyEffects(scene.effects, s);
    recordTreeVisit(scenario.id, s.sceneId);
    recordCardsSeen(scenario.id, s.bag);
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
        const d = initDuel(cfg, loadout, scenario.cards);
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

  // ---------- 标题页 ----------
  if (phase === "title") {
    const save = loadGame();
    const gallery = getGallery();
    void titleTick;
    return (
      <div className="title-screen">
        <h1>帝成观止</h1>
        <p className="sub">剧本引擎 · 卡牌系统 v2</p>
        {save && (
          <div className="resume-box">
            <button className="btn-main" onClick={resume}>
              继续上次 · {SCENARIOS.find((s) => s.id === save.scenarioId)?.title ?? save.scenarioId}
            </button>
            <button className="link-btn" onClick={() => { clearSave(); setTitleTick((t) => t + 1); }}>放弃存档</button>
          </div>
        )}
        <div className="scenario-list">
          {SCENARIOS.map((s) => {
            const ends = gallery.filter((g) => g.scenarioId === s.id);
            const tree = getTree()[s.id] ?? [];
            return (
              <div key={s.id} className="scenario-wrap">
                <button className="scenario-card" onClick={() => start(s)}>
                  <div className="sc-title">{s.title}{s.cardSystem ? " ✦" : ""}</div>
                  <div className="sc-sub">{s.subtitle} · {s.mode === "case" ? "案件模式" : "叙事模式"}</div>
                  {s.cardSystem && <div className="sc-sub">✦ 卡牌系统 v2：编组 · 市集 · 翻牌</div>}
                  {ends.length > 0 && (
                    <div className="sc-ends">已解锁结局：{ends.map((e) => e.endingName).join("、")}</div>
                  )}
                </button>
                <div className="wrap-btns">
                  {(tree.length > 0 || ends.length > 0) && (
                    <button className="tree-btn" onClick={() => { sfx.choice(); setTreeOf(s); }}>
                      剧情树（{tree.length}/{s.scenes.length}）
                    </button>
                  )}
                  {s.cardSystem && (
                    <button className="tree-btn" onClick={() => { sfx.choice(); setCardsOf(s); }}>
                      卡牌图鉴（{(getCardSeen()[s.id] ?? []).length}/{s.cards.filter(c => (c.layer ?? "成术") !== "资源").length}）
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="guide-entry">
          <button className="link-btn" onClick={() => setShowGuide(true)}>玩法速览（30 秒上手）</button>
        </div>
        <p className="foot-tip">点击画面推进文本 · 空格推进/数字选支 · 进度自动保存 · ✦ = 含卡牌系统 v2</p>
        {showGuide && (
          <div className="clue-overlay" onClick={() => setShowGuide(false)}>
            <div className="clue-overlay-panel" onClick={(e) => e.stopPropagation()}>
              <h3>玩法速览</h3>
              <div className="guide-sec"><b>基础</b>：点击画面推进文字；选项决定走向；空格=推进，数字键=选支。进度自动保存。</div>
              <div className="guide-sec"><b>案件模式</b>：调查取证 → 结案陈词拣选线索（真/伪/核心）→ 定谳。核心线索+足够实据 = 完整结局。</div>
              <div className="guide-sec"><b>对局·情绪匹配制</b>：对手亮出情绪（威/理/利/情）。同色接话=共鸣；对色（威↔理、利↔情）=破防；错色=失言。共鸣满则胜。</div>
              <div className="guide-sec"><b>对局·气力压制制</b>：出牌比点，点差即伤害；威牌×2但反噬1；连出同一张「招式用老」-2。打空对方气力即胜。</div>
              <div className="guide-sec"><b>✦ 卡牌系统 v2</b>：四层卡——成术（对局四色牌）/ 物品（对局道具，用后消耗，也是剧情钥匙）/ 人物（携带被动）/ 资源（即银两）。市集买卡卖卡开卡包；翻牌三选一；顶栏「卡组」随时编组（上限 12，资源不占槽）。对局中出牌耗行动力，可「换气」回力补牌。</div>
              <div className="guide-sec"><b>收集</b>：结局图鉴 · 剧情树（未探明的"？？？"就是多周目的方向）· 卡牌图鉴（孤品现世计数）。</div>
              <button className="btn-main" onClick={() => setShowGuide(false)}>开始查案</button>
            </div>
          </div>
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
              <button key={id} className="pick-card" onClick={() => afterPick(id)}>
                <CardArt id={c.id} name={c.name} />
                <div className="pc-top">
                  <SuitSeal suit={c.suit} />
                  <span className="rarity-tag">{c.rarity ?? "凡"}</span>
                  <ThemeTag id={c.id} suit={c.suit} />
                </div>
                <div className="pc-name">{c.name}</div>
                <div className="pc-layer">{c.layer ?? "成术"}</div>
                <div className="pc-text">{c.text}</div>
              </button>
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
    return (
      <div className="story-root">
        <div className="story-panel ending" ref={panelRef}>
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

  return (
    <div className="story-root" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
      <TopBar sc={sc} st={st} onClues={() => setShowClues(true)} onBag={() => setShowBag(true)} />
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
        <button className="clue-btn" onClick={() => { sfx.choice(); onBag(); }}>卡组（{st.deck.length}/{sc.deckLimit ?? 12}）</button>
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
  const def = (id: string) => sc.cards.find((c) => c.id === id);
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
                    <button key={id} className={`bag-card ${on ? "in-deck" : ""} rarity-${c.rarity ?? "凡"}`} onClick={() => toggleDeck(id)}>
                      <CardArt id={c.id} name={c.name} compact />
                      <div className="bag-card-head">
                        <SuitSeal suit={c.suit} />
                        <span className="bag-card-name">{c.name}</span>
                        <ThemeTag id={c.id} suit={c.suit} />
                        {on && <span className="deck-tag">在组</span>}
                      </div>
                      <div className="pc-text">{c.text}</div>
                      {c.power !== undefined && <div className="pc-power">点 {c.power} · 费 {c.cost ?? cardCost(c)}</div>}
                      <div className="bag-lore">{c.lore}</div>
                    </button>
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
              return (
                <div key={i} className={`pick-card rarity-${c?.rarity ?? "凡"}`}>
                  {c && <CardArt id={c.id} name={c.name ?? id} />}
                  <div className="pc-top">
                    {c && <SuitSeal suit={c.suit} />}
                    <span className="rarity-tag">{c?.rarity ?? "凡"}</span>
                    {c && <ThemeTag id={c.id} suit={c.suit} />}
                  </div>
                  <div className="pc-name">{c?.name ?? id}{c?.resource ? `（+${c.resource} 两）` : ""}</div>
                  <div className="pc-layer">{c?.layer ?? "成术"}</div>
                </div>
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
              <div key={id} className={`shop-card rarity-${c.rarity ?? "凡"}`}>
                <CardArt id={c.id} name={c.name} compact />
                <div className="bag-card-head">
                  <SuitSeal suit={c.suit} />
                  <span className="bag-card-name">{c.name}</span>
                  <ThemeTag id={c.id} suit={c.suit} />
                </div>
                <div className="pc-text">{c.text}</div>
                <div className="bag-lore">{c.lore}</div>
                <div className="shop-actions">
                  <button className="btn-main" disabled={owned} onClick={() => buy(id)}>
                    {owned ? "已有" : `买 ${c.price ?? 10} 两`}
                  </button>
                  {owned && <button className="link-btn" onClick={() => sell(id)}>卖 {Math.floor((c.price ?? 10) / 2)} 两</button>}
                </div>
              </div>
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
              <button className="btn-main" onClick={() => openPack(p.id)}>开包 {p.price} 两</button>
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
    const c = sc.cards.find((x) => x.id === id) ?? duel.cfg.oppCards?.find((x) => x.id === id);
    if (!c) throw new Error(`卡牌不存在: ${id}（对局 ${duel.cfg.id}）`);
    return c;
  };

  const moodText = useMemo(() => {
    if (duel.mode !== "emotion" || !duel.opponentShown) return null;
    const mood: Record<string, string> = {
      威: "他端起架子，话里带着压人的威。（威）",
      理: "他掰着指头，跟你算起了道理。（理）",
      利: "他眼睛滴溜溜转，句句离不开好处。（利）",
      情: "他声音低下来，说起了自家的难处。（情）",
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
      if (!ok) { toast("行动力不足"); return; }
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
    if (duel.mode === "emotion") { toast("情绪对局按回合自动推进"); return; }
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
            <span>共鸣 {duel.rapport}/{duel.cfg.goal ?? 3}</span>
            <span>防备 {duel.guard}</span>
            <span>气力 {duel.qi}</span>
          </>
        ) : (
          <>
            <span>我方气力 {Math.max(0, duel.hpPlayer)}</span>
            <span>{duel.cfg.opponent.name}气力 {Math.max(0, duel.hpOpponent)}</span>
          </>
        )}
        {v2 && <span>行动力 {duel.ap}</span>}
        {v2 && <span>牌库 {duel.library.length} · 手牌 {duel.hand.length}</span>}
      </div>

      <div className="duel-stage">
        {moodText && <p className="opp-line">{moodText}</p>}
        {duel.mode === "pressure" && !v2 && (
          <p className="opp-line">对手蓄势待发……出牌比点，点高者伤敌；威牌点数翻倍，但反噬自身一点气力。</p>
        )}
        {v2 && duel.mode === "pressure" && !moodText && (
          <p className="opp-line">手牌中打出成术牌对质；物品卡为道具；人物卡提供被动。行动力耗尽可【换气】。</p>
        )}
        {duel.lastResult && <p className={`duel-log ${duel.lastResult.kind}`}>{duel.lastResult.text}</p>}
        {duel.lastPlay && duel.mode === "pressure" && !duel.lastResult?.kind.includes("item") && (
          <p className="duel-log press">
            {duel.lastPlay.stale && "（招式用老，点数-2！）"}
            你打出「{duel.lastPlay.playerCard?.name}」（{duel.lastPlay.playerCard?.power}{duel.lastPlay.playerCard?.suit === "威" ? "×2" : ""}{duel.lastPlay.stale ? "-2" : ""}），他打出「{duel.lastPlay.oppCard?.name}」（{duel.lastPlay.oppCard?.power}）——
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
        {v2 && !duel.finished && (
          <button className="btn-main end-turn-btn" onClick={doEndTurn}>换气（结束本回合，补牌+行动力）</button>
        )}
      </div>

      <div className="hand">
        {handIds.map((id) => {
          const c = cardOf(id);
          const disabled = !!duel.finished || (duel.mode === "emotion" && !duel.opponentShown) || (v2 && duel.ap < cardCost(c));
          const isChar = (c.layer ?? "成术") === "人物";
          return (
            <button key={id} className={`play-card rarity-${c.rarity ?? "凡"} ${isChar ? "char-card" : ""}`} disabled={disabled && !isChar ? true : !!duel.finished || (duel.mode === "emotion" && !duel.opponentShown)} onClick={() => clickCard(id)}>
              <CardArt id={c.id} name={c.name} compact />
              <div className="pc-top">
                {c.suit && <SuitSeal suit={c.suit} />}
                <span className="rarity-tag">{c.rarity ?? "凡"}</span>
                <ThemeTag id={c.id} suit={c.suit} />
                {v2 && <span className="cost-tag">费{cardCost(c)}</span>}
              </div>
              <div className="pc-name">{c.name}</div>
              <div className="pc-text">{c.text}</div>
              {c.power !== undefined && <div className="pc-power">点数 {c.power}{c.suit === "威" ? "×2（反噬1）" : ""}</div>}
              {isChar && <div className="pc-power">被动 · 不可打出</div>}
            </button>
          );
        })}
      </div>
      <p className="duel-rule muted">
        {duel.mode === "emotion"
          ? v2
            ? "v2 规则：出牌耗行动力；物品卡为道具；人物卡被动生效。同色=共鸣+1；对色（威↔理，利↔情）=破防备；错色=失言气力-1。"
            : "规则：同色接话=共鸣+1；对色（威↔理，利↔情）=破其防备；错色=失言，气力-1。共鸣满则胜，气力尽则败。"
          : v2
            ? "v2 规则：出牌耗行动力，点差即伤害；威×2反噬1；连出同张「招式用老」-2；物品卡一锤定音。"
            : "规则：每回合各出一牌比点，点差即伤害；威牌×2但反噬1；连出同一张牌招式用老-2。先打空对方气力者胜。"}
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
        <button className="choice" onClick={roll}>摇盅！</button>
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
                {ids.map((c) => {
                  const has = seen.has(c.id);
                  return (
                    <div key={c.id} className={`bag-card rarity-${c.rarity ?? "凡"} ${has ? "" : "card-unknown"}`}>
                      {has && <CardArt id={c.id} name={c.name} compact />}
                      <div className="bag-card-head">
                        {c.suit && <SuitSeal suit={c.suit} />}
                        <span className="bag-card-name">{has ? c.name : "？？？"}</span>
                        {has && <ThemeTag id={c.id} suit={c.suit} />}
                      </div>
                      {has ? (
                        <>
                          <div className="pc-text">{c.text}</div>
                          {c.lore && <div className="bag-lore">{c.lore}</div>}
                        </>
                      ) : (
                        <div className="pc-text">尚未收录</div>
                      )}
                    </div>
                  );
                })}
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
