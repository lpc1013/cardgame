// ============================================================
// 回归验证套件：node --experimental-strip-types scripts/verify.mts
//  1) 场景图完整性：所有 next/choice/duel/verdict 目标存在
//  2) 剧情树可达性：从 start 经三类边可达全部场景
//  3) 对局可解性 + 难度审计（断言「真实 UI 合同」）：
//     - 情绪制：按真实 UI 可达动作（出牌；博弈局加读牌；v2 情绪局无换气）BFS 穷举可胜性。
//       严禁在模拟里调用真实 UI 不存在的动作（历史教训：模拟偷调 endTurn → 虚假绿灯）。
//     - 压制制：BFS 穷举（出牌 + 换气；博弈局加蓄势/破招×4色）最优线 → 可否胜、剩余气力(紧张度)。
//  4) 复盘门控：核心线索存在于线索表；mustPick ≤ 线索总数且 ≤ 全剧本可解锁线索数（防「呈上御案」永锁）
//  5) 钥匙卡可达性：cond.card 引用的卡必须在剧本内有获得途径（防条件型软锁）
//  5b) 数值可达性轻模型：cond.statAtLeast 门槛 ≤ 理论上限（初值+全部正向增量之和），防选项永锁
//  6) 小游戏数据合法性：残局正解索引不越界；行令轮数/手牌非空
// ============================================================
import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";
import { jieyu } from "../src/data/jieyu.ts";
import { shumian } from "../src/data/shumian.ts";
import { changjiang } from "../src/data/changjiang.ts";
import { diaolan } from "../src/data/diaolan.ts";
import { changhen } from "../src/data/changhen.ts";
import { jianfeng } from "../src/data/jianfeng.ts";
import { xingxing } from "../src/data/xingxing.ts";
import { touming } from "../src/data/touming.ts";
import { BONUS_SCENES } from "../src/data/bonus.ts";
import type { Scenario, CardDef, Suit } from "../src/engine/types.ts";
import { initDuel, revealEmotion, playEmotion, playPressure, setDuelShuffle, endTurn, readEmotion, chargeUp, breakMove, respondOpponent, playItem, RESTRAIN, TURN_DAMAGE_CAP, ITEM_YANLI_COST, EMOTION_YANLI_MAX, DEFAULT_GOAL, type DuelState } from "../src/engine/duel.ts";

setDuelShuffle((a) => a);
const ALL: Scenario[] = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];
const SUITS: Suit[] = ["策", "器", "势", "隐"];
let failures = 0, warnings = 0;
const fail = (m: string) => { failures++; console.error("  ✗", m); };
const warn = (m: string) => { warnings++; console.warn("  ⚠", m); };

const cardOf = (sc: Scenario, duelOpp?: CardDef[]) => (id: string): CardDef => {
  const c = sc.cards.find(c => c.id === id) ?? duelOpp?.find(c => c.id === id);
  if (!c) throw new Error(`卡牌不存在: ${id}`);
  return c;
};

/** B-5：从残局候选文案解析棋盘坐标（文案按 1 起行/列），支持「第3行第4列」「(3,4)」「3行4列」等写法；解析失败返回 null */
function parseOptionCoord(opt: string): { r: number; c: number } | null {
  const CN = "零一二三四五六七八九十";
  const toNum = (t: string): number | null => {
    if (/^\d+$/.test(t)) return Number(t);
    if (t.length === 1 && CN.includes(t)) return CN.indexOf(t);
    return null;
  };
  const a = opt.match(/第\s*([0-9零一二三四五六七八九十]+)\s*行/);
  const b = opt.match(/第\s*([0-9零一二三四五六七八九十]+)\s*列/);
  if (a && b) {
    const r = toNum(a[1]!), c = toNum(b[1]!);
    if (r !== null && c !== null) return { r: r - 1, c: c - 1 };
  }
  const p = opt.match(/[（(]\s*([0-9]+)\s*,\s*([0-9]+)\s*[)）]/);
  if (p) return { r: Number(p[1]) - 1, c: Number(p[2]) - 1 };
  const q = opt.match(/^([0-9]+)\s*行[\s\S]*?([0-9]+)\s*列/);
  if (q) return { r: Number(q[1]) - 1, c: Number(q[2]) - 1 };
  return null;
}

/** v2 对局测试卡组：满编(全部卡池中非资源卡)以获得确定性；人物卡由引擎自动场外化 */
function v2Loadout(sc: Scenario): string[] {
  return sc.cards.filter((c) => (c.layer ?? "成术") !== "资源").map((c) => c.id);
}
/** 裸卡组：初始携带 + 剧情自动必得卡 − 自动移除（不含选择/翻牌所得，偏保守） */
function starterLoadout(sc: Scenario): string[] {
  let ids = [...(sc.initialDeck ?? [])];
  for (const s of sc.scenes) {
    for (const e of s.effects ?? []) {
      if (e.unlockCard && !ids.includes(e.unlockCard)) ids.push(e.unlockCard);
      if (e.removeCard) ids = ids.filter((x) => x !== e.removeCard);
    }
  }
  return ids;
}
/** M8（审计 P1-3）「合法满编」：≤deckLimit 张、只取届时可获取的卡（初始+剧情必得+货架/暗柜/卡包池+翻牌），
 *  排序取强：成术（点数降序）→ 物品 → 人物。旧 v2Loadout 拿全卡池无视上限制胜，证的是玩家组不出的牌堆。 */
function legalLoadout(sc: Scenario): string[] {
  const limit = sc.deckLimit ?? 12;
  const obtainable = new Set<string>(starterLoadout(sc));
  for (const s of sc.scenes) {
    if (s.shop) {
      for (const id of s.shop.stock) obtainable.add(id);
      for (const h of s.shop.hiddenStock ?? []) obtainable.add(h.id);
      for (const p of s.shop.packs ?? []) for (const id of p.pool) obtainable.add(id);
    }
    if (s.cardPick) for (const id of s.cardPick.options) obtainable.add(id);
  }
  const layerOf = (c: CardDef) => c.layer ?? "成术";
  const rank = (c: CardDef) => (layerOf(c) === "成术" ? 0 : layerOf(c) === "物品" ? 1 : 2);
  const pool = sc.cards
    .filter((c) => layerOf(c) !== "资源" && obtainable.has(c.id))
    .sort((a, b) => rank(a) - rank(b) || (b.power ?? 0) - (a.power ?? 0));
  return pool.slice(0, limit).map((c) => c.id);
}
/** 四色覆盖检查 */
function colorCoverage(sc: Scenario, ids: string[]): string {
  const suits = new Set(ids.map((id) => sc.cards.find((c) => c.id === id)?.suit).filter(Boolean));
  return SUITS.filter((s) => !suits.has(s)).join("") || "全色✓";
}
function edgesOf(sc: Scenario) {
  const E: [string, string][] = [];
  for (const s of sc.scenes) {
    if (s.next) E.push([s.id, s.next]);
    for (const c of s.choices ?? []) { E.push([s.id, c.next]); if (c.altNext) E.push([s.id, c.altNext]); }
    if (s.duel) { const d = sc.duels.find(x => x.id === s.duel); if (d) { E.push([s.id, d.winScene], [s.id, d.loseScene]); if (d.loseScene2) E.push([s.id, d.loseScene2.scene]); } }
  }
  if (sc.verdict) E.push([sc.verdict.scene, sc.verdict.winScene], [sc.verdict.scene, sc.verdict.loseScene]);
  for (const s of sc.scenes) {
    if (s.cardPick) E.push([s.id, s.cardPick.next]);
    if (s.next2) E.push([s.id, s.next2]);
    if (s.minigame) E.push([s.id, s.minigame.winNext], [s.id, s.minigame.loseNext]);
  }
  return E;
}

const cloneD = (d: DuelState): DuelState => JSON.parse(JSON.stringify(d));
function stateKey(d: DuelState, handAware: boolean): string {
  const base = `${d.round}|${d.mode === "emotion" ? `${d.rapport},${d.guard},${d.qi},${d.yanli ?? ""},${d.topicHits ?? 0}` : `${d.hpPlayer},${d.hpOpponent}`}|${d.finished ?? ""}|${d.lastCardId ?? ""}|${d.ap}|${d.buffPower}|${d.charge}|${d.foresuit ?? ""}|${d.bluffed ? "b" : ""}`;
  // M2 交替回合：相位/回合数/对手意图与蓄力/对手宣言/双方陷阱入键
  const phased = (d.turnSchema ?? "legacy") === "phased";
  const turn = phased ? `|T:${d.phase},${d.turnNo},${d.oppIntent?.kind ?? "-"}|oc:${d.oppCharge ?? 0}|of:${d.oppForesuit ?? ""}|ot:${d.oppTrap ? 1 : 0}|pt:${d.trap ? 1 : 0}` : "";
  if (!handAware) return base + turn;
  return `${base}${turn}|h:${d.hand.join(",")}|l:${d.library.join(",")}|x:${d.discard.join(",")}|u:${d.usedCards.join(",")}`;
}

/** 情绪制：真实 UI 合同下的穷举可胜性。
 *  真实可达动作 = 从手牌（v2）/全池（classic）打出一张牌；博弈局加「读牌」；情绪局无「换气」动作。
 *  M9（审计 P0-3）：v2 情绪局动作面必须含物品——旧实现只跑成术，可胜性系统性低估玩家上限，
 *  unwinnable 断言也可能被物品打穿。物品受 M9 新约束（扣言力+占一手），穷举照实走引擎路由。 */
function emotionCanWin(sc: Scenario, cfg: (typeof sc.duels)[number], loadout: string[]): { win: boolean; steps: number } {
  const co = cardOf(sc, cfg.oppCards);
  const isV2 = cfg.rules === "v2";
  const seen = new Set<string>();
  let feedbackBroken = false; // 反馈断链只报一次，避免 BFS 刷屏
  const q: { d: DuelState; steps: number }[] = [{ d: (() => { const d = initDuel(cfg, loadout, sc.cards); revealEmotion(d); return d; })(), steps: 0 }];
  let capHit = false;
  while (q.length) {
    if (seen.size > 300000) { capHit = true; break; }
    const { d, steps } = q.shift()!;
    if (d.finished === "win") return { win: true, steps };
    if (d.finished) continue;
    const pool = isV2 ? [...d.hand] : loadout;
    for (const id of pool) {
      const c = co(id);
      const layer = c.layer ?? "成术";
      // M9：物品只随 v2 进动作面（引擎 rules!=="v2" 时不路由 playItem；classic 钥匙物品牌另说，
      // 在模拟器里放它进弹药等于给「设计性死局」开新后门，故 classic 仍按成术面穷举）
      if (layer === "物品" && !(isV2 && !!c.itemEffect)) continue;
      if (layer !== "成术" && layer !== "物品") continue;
      const nd = cloneD(d);
      if (!playEmotion(nd, c)) continue;
      // UI 合同：出牌后、未 finish 前反馈文案必须非空（防「清 lastResult」类回归，历史 P1）
      if (!feedbackBroken && !nd.finished && !nd.lastResult) {
        feedbackBroken = true;
        fail(`对局 ${cfg.id} 情绪制出牌后 lastResult 为空——反馈文案断链`);
      }
      if (!nd.finished) revealEmotion(nd);
      const key = stateKey(nd, isV2);
      if (!seen.has(key)) { seen.add(key); q.push({ d: nd, steps: steps + 1 }); }
    }
    if (cfg.gambit && d.opponentShown && (d.yanli ?? 0) >= 1) {
      const nd = cloneD(d);
      if (readEmotion(nd)) {
        const key = stateKey(nd, isV2);
        if (!seen.has(key)) { seen.add(key); q.push({ d: nd, steps: steps + 1 }); }
      }
    }
  }
  if (capHit) warn(`对局 ${cfg.id} 情绪穷举超状态上限，按贪心复核`);
  // 贪心兜底（同色 > 克色 > 中性 > 被克），用于超上限时的近似判断；虚张时先读牌拆穿（保气力底线）
  const d = initDuel(cfg, loadout, sc.cards); revealEmotion(d);
  for (let i = 0; !d.finished && i < 400; i++) {
    if (cfg.gambit && d.bluffed && (d.yanli ?? 0) >= 1 && readEmotion(d)) continue;
    const shown = d.opponentShown!;
    const pool = (isV2 ? [...d.hand] : loadout).map(id => co(id)).filter(c => (c.layer ?? "成术") === "成术");
    const pick =
      pool.find(c => c.suit === shown) ??
      pool.find(c => c.suit && RESTRAIN[c.suit] === shown) ??
      pool.find(c => c.suit && RESTRAIN[shown] !== c.suit) ??
      pool[0];
    if (!pick) return { win: false, steps: i };
    if (!playEmotion(d, pick)) return { win: false, steps: i };
    if (!d.finished) revealEmotion(d);
  }
  return { win: d.finished === "win", steps: d.round };
}

/** 压制制：真实 UI 合同下的穷举（出牌 + 换气；博弈局加蓄势/破招×4色）。
 *  M2 交替回合：phased 局区分我方主阶段（出牌/蓄势/破招/盖放/结束回合）与对手回合（应手）两个动作面。 */
function pressureBest(sc: Scenario, cfg: (typeof sc.duels)[number], loadout: string[]): { d: DuelState; line: string[] } | null {
  const co = cardOf(sc, cfg.oppCards);
  const isV2 = cfg.rules === "v2";
  const phased = (cfg.turnSchema ?? "legacy") === "phased";
  const seen = new Set<string>();
  let best: { d: DuelState; line: string[] } | null = null;
  const q: { d: DuelState; line: string[] }[] = [{ d: initDuel(cfg, loadout, sc.cards), line: [] }];
  const push = (nd: DuelState, line: string[]) => {
    const key = stateKey(nd, true);
    if (!seen.has(key)) { seen.add(key); q.push({ d: nd, line }); }
  };
  while (q.length) {
    if (seen.size > 600000) { warn(`对局 ${cfg.id} 压制穷举超状态上限，结果可能不完整`); break; }
    const { d, line } = q.shift()!;
    if (d.finished === "win" && !best) { best = { d, line }; break; }
    if (d.finished) continue;
    const handIds = isV2 ? [...d.hand] : loadout;
    const oppId = cfg.script[d.round % cfg.script.length] ?? cfg.script[0]!;
    const inOpp = phased && d.phase === "oppTurn";
    if (inOpp) {
      // 对手主攻 → 我方应手（成术非陷阱）
      for (const id of handIds) {
        const c = co(id);
        if ((c.layer ?? "成术") !== "成术" || c.trap) continue;
        const nd = cloneD(d);
        if (!respondOpponent(nd, c, co)) continue;
        push(nd, [...line, id]);
      }
      continue;
    }
    for (const id of handIds) {
      // M9（审计 P0-3）：物品牌同样进动作面——playPressure 在 v2 下把 layer==="物品" 路由给 playItem，
      // 其伤害此后与交手共用 TURN_DAMAGE_CAP 预算（旧实现封顶管不到它，穷举自然也就看不见）。
      const nd = cloneD(d);
      if (!playPressure(nd, co(id), oppId, co)) continue;
      push(nd, [...line, id]);
    }
    if (cfg.gambit) {
      const nd = cloneD(d);
      if (chargeUp(nd, oppId, co)) push(nd, [...line, "(蓄势)"]);
      if (!d.foresuit) {
        for (const s of SUITS) {
          const nb = cloneD(d);
          if (!breakMove(nb, s, oppId, co)) continue;
          push(nb, [...line, `(破${s})`]);
        }
      }
    }
    // 结束回合：legacy v2 在 AP 有余时才值得入队；phased v2 交先手是合法主选择（轻回合由引擎自动交）
    if (isV2 && !phased && d.ap < 3) {
      const nd = cloneD(d);
      endTurn(nd);
      push(nd, [...line, "(换气)"]);
    } else if (isV2 && phased) {
      const nd = cloneD(d);
      endTurn(nd);
      push(nd, [...line, "(结束回合)"]);
    }
  }
  return best;
}

for (const sc of ALL) {
  console.log(`\n【${sc.title}】(${sc.mode === "case" ? "案件" : "叙事"} · ${sc.scenes.length}幕 ${sc.duels.length}局)`);
  // 1) 图完整性
  const ids = new Set(sc.scenes.map(s => s.id));
  for (const s of sc.scenes) {
    if (s.next && !ids.has(s.next)) fail(`场景 ${s.id} next 指向不存在的 ${s.next}`);
    for (const c of s.choices ?? []) { if (!ids.has(c.next)) fail(`场景 ${s.id} 选项指向不存在的 ${c.next}`); if (c.altNext && !ids.has(c.altNext)) fail(`场景 ${s.id} 选项降级指向不存在的 ${c.altNext}`); }
    if (s.duel) {
      const du = sc.duels.find(d => d.id === s.duel);
      if (!du) fail(`场景 ${s.id} 引用不存在的对局 ${s.duel}`);
      else {
        if (!ids.has(du.winScene)) fail(`场景 ${s.id} 对局 ${du.id} winScene 指向不存在的 ${du.winScene}`);
        if (!ids.has(du.loseScene)) fail(`场景 ${s.id} 对局 ${du.id} loseScene 指向不存在的 ${du.loseScene}`);
        if (du.loseScene2 && !ids.has(du.loseScene2.scene)) fail(`场景 ${s.id} 对局 ${du.id} loseScene2 指向不存在的 ${du.loseScene2.scene}`);
      }
    }
    if (s.lines.length === 0) warn(`场景 ${s.id} 没有正文`);
    // 1a2) 出口存在性：上面 1) 只查"出口指向的幕在不在"，从不查"这一幕到底有没有出口"。
    // 读完结尾才发现屏上没有任何可点的东西——正是用户报的那类死锁（静态版）。
    // 注意 runtime 的兜底口径：continue-tip 的条件是「choices 为空且有 next」，
    // 所以"全靠选项走出去"的幕一旦所有选项都被 cond 挡住，连兜底都不会出现。
    {
      const verdictEntry = !!sc.verdict && sc.verdict.scene === s.id;
      const hardExit = !!(s.next || s.ending || s.duel || s.cardPick || s.shop || s.minigame || verdictEntry);
      const chs = s.choices ?? [];
      if (!hardExit && chs.length === 0) fail(`场景 ${s.id} 没有任何出口（无 next/choices/duel/cardPick/shop/minigame/ending）——读到这儿就死锁`);
      if (!hardExit && chs.length > 0) {
        const alwaysVisible = chs.some((c) => !c.cond);
        const hasFallback = chs.some((c) => !!c.cond && !!c.altNext);
        if (!alwaysVisible && !hasFallback) warn(`场景 ${s.id} 唯一出路是 ${chs.length} 个全带 cond 的选项，且无 altNext——若这些 cond 能同时落空即零选项死锁，可达性需图分析定（tools/jm/hublock_qa.js 量最坏情况）`);
      }
    }
    // 1b2) variantLines 文本回响：cond 引用合法、lines 非空
    for (const v of s.variantLines ?? []) {
      if (!v.lines || v.lines.length === 0) fail(`场景 ${s.id} variantLines 存在空回响文本`);
      if (v.cond) {
        if (v.cond.clue && !sc.clues?.find(x => x.id === v.cond!.clue)) fail(`场景 ${s.id} variantLines 条件引用不存在的线索 ${v.cond.clue}`);
        if (v.cond.card && !sc.cards.find(x => x.id === v.cond!.card)) fail(`场景 ${s.id} variantLines 条件引用不存在的卡牌 ${v.cond.card}`);
        if (v.cond.notCard && !sc.cards.find(x => x.id === v.cond!.notCard)) fail(`场景 ${s.id} variantLines 条件引用不存在的卡牌 ${v.cond.notCard}`);
        for (const k of Object.keys(v.cond.statAtLeast ?? {})) if (!sc.stats?.find(t => t.key === k)) fail(`场景 ${s.id} variantLines 条件引用未定义数值 ${k}`);
      }
    }
    // 1b) 引用完整性：effects/cond 指向的线索/卡牌/数值必须存在
    for (const ef of s.effects ?? []) {
      if (ef.unlockClue && !sc.clues?.find(c => c.id === ef.unlockClue)) fail(`场景 ${s.id} 解锁不存在的线索 ${ef.unlockClue}`);
      if (ef.unlockCard && !sc.cards.find(c => c.id === ef.unlockCard)) fail(`场景 ${s.id} 解锁不存在的卡牌 ${ef.unlockCard}`);
      for (const k of Object.keys(ef.stat ?? {})) if (!sc.stats?.find(t => t.key === k)) fail(`场景 ${s.id} 引用未定义数值 ${k}`);
    }
    for (const c of s.choices ?? []) {
      if (c.cond?.clue && !sc.clues?.find(x => x.id === c.cond!.clue)) fail(`场景 ${s.id} 选项条件引用不存在的线索 ${c.cond.clue}`);
      if (c.cond?.card && !sc.cards.find(x => x.id === c.cond!.card)) fail(`场景 ${s.id} 选项条件引用不存在的卡牌 ${c.cond.card}`);
      if (c.cond?.notCard && !sc.cards.find(x => x.id === c.cond!.notCard)) fail(`场景 ${s.id} 选项条件引用不存在的卡牌 ${c.cond.notCard}`);
      for (const k of Object.keys(c.cond?.statAtLeast ?? {})) if (!sc.stats?.find(t => t.key === k)) fail(`场景 ${s.id} 选项条件引用未定义数值 ${k}`);
      for (const ef of c.effects ?? []) {
        if (ef.unlockClue && !sc.clues?.find(x => x.id === ef.unlockClue)) fail(`场景 ${s.id} 选项解锁不存在的线索 ${ef.unlockClue}`);
        if (ef.unlockCard && !sc.cards.find(x => x.id === ef.unlockCard)) fail(`场景 ${s.id} 选项解锁不存在的卡牌 ${ef.unlockCard}`);
        for (const k of Object.keys(ef.stat ?? {})) if (!sc.stats?.find(t => t.key === k)) fail(`场景 ${s.id} 选项引用未定义数值 ${k}`);
      }
    }
  }
  // 1c) verdict 入口与胜败线目标存在
  if (sc.verdict) {
    if (!ids.has(sc.verdict.scene)) fail(`verdict 入口场景 ${sc.verdict.scene} 不存在`);
    if (!ids.has(sc.verdict.winScene)) fail(`verdict winScene ${sc.verdict.winScene} 不存在`);
    if (!ids.has(sc.verdict.loseScene)) fail(`verdict loseScene ${sc.verdict.loseScene} 不存在`);
  }
  // 2) 可达性（多视角剧本：全部视角入口并集为根）
  const roots = [sc.startScene, ...(sc.viewpoints?.map(v => v.startScene) ?? [])];
  const reach = new Set(roots);
  for (let p = 0; p < sc.scenes.length; p++) {
    for (const [a, b] of edgesOf(sc)) if (reach.has(a)) reach.add(b);
  }
  const unreachable = sc.scenes.filter(s => !reach.has(s.id)).map(s => s.id);
  if (unreachable.length) fail(`剧情树不可达: ${unreachable.join(",")}`);
  // 2b) 视角通道断言：入口存在、起手卡/结局归属引用有效、id 不重复
  if (sc.viewpoints?.length) {
    const vpIds = new Set<string>();
    const endingScenes = new Set(sc.scenes.filter(s => s.ending).map(s => s.id));
    for (const v of sc.viewpoints) {
      if (vpIds.has(v.id)) fail(`视角 id 重复: ${v.id}`);
      vpIds.add(v.id);
      if (!sc.scenes.find(s => s.id === v.startScene)) fail(`视角 ${v.id} 入口场景 ${v.startScene} 不存在`);
      for (const cid of v.initialDeck ?? []) if (!sc.cards.find(c => c.id === cid)) fail(`视角 ${v.id} 起手卡 ${cid} 不在卡表`);
      for (const eid of v.endings ?? []) if (!endingScenes.has(eid)) fail(`视角 ${v.id} 归属结局 ${eid} 不是结局场景`);
    }
  }
  // 4) 复盘门控（含实得线索对账：全剧本可解锁线索去重后 ≥ mustPick，否则「呈上御案」永久禁用）
  if (sc.verdict) {
    const v = sc.verdict;
    if (!sc.clues?.find(c => c.id === v.coreClue)) fail(`复盘核心线索 ${v.coreClue} 不在线索表`);
    if (v.mustPick > (sc.clues?.length ?? 0)) fail(`复盘选数 ${v.mustPick} 超过线索总数`);
    if (v.minTrue >= v.mustPick) fail(`minTrue(${v.minTrue}) >= mustPick(${v.mustPick}),门槛矛盾`);
    const unlockable = new Set<string>();
    for (const s of sc.scenes) {
      if (!reach.has(s.id)) continue; // S-2：只认可达场景内的解锁口，单点断链不再被聚合校验掩盖
      for (const e of s.effects ?? []) if (e.unlockClue) unlockable.add(e.unlockClue);
      for (const c of s.choices ?? []) for (const e of c.effects ?? []) if (e.unlockClue) unlockable.add(e.unlockClue);
    }
    if (unlockable.size < v.mustPick) fail(`全剧本可解锁线索去重后仅 ${unlockable.size} 条 < 复盘选数 mustPick(${v.mustPick})，复盘按钮将永锁`);
    if (!unlockable.has(v.coreClue)) fail(`复盘核心线索 ${v.coreClue} 全剧本无可解锁入口 —— 复盘恒败（S-1 型叙事断链）`);
    const truthyNoEntry = sc.clues?.filter(c => c.kind === "true" && !unlockable.has(c.id)).map(c => c.id) ?? [];
    if (truthyNoEntry.length) fail(`重要真线索无解锁入口: ${truthyNoEntry.join(",")}`);
  }
  // 5) 钥匙卡可达性：cond.card 所引之卡必须在剧本内有获得途径（初始卡组/解锁/翻牌/市集），否则该选项永久锁死
  {
    const obtainable = new Set<string>(sc.initialDeck ?? []);
    for (const s of sc.scenes) {
      for (const e of s.effects ?? []) if (e.unlockCard) obtainable.add(e.unlockCard);
      for (const c of s.choices ?? []) for (const e of c.effects ?? []) if (e.unlockCard) obtainable.add(e.unlockCard);
      if (s.cardPick) for (const id of s.cardPick.options) obtainable.add(id);
      if (s.shop) {
        for (const id of s.shop.stock) obtainable.add(id);
        for (const p of s.shop.packs ?? []) for (const id of p.pool) obtainable.add(id);
      }
    }
    for (const s of sc.scenes) {
      for (const c of s.choices ?? []) {
        if (c.cond?.card && !obtainable.has(c.cond.card)) fail(`场景 ${s.id} 选项要求卡牌 ${c.cond.card}，但剧本内无获得途径（选项永久锁死）`);
      }
    }
  }
  // 5b) 数值可达性：门槛超过理论上限的选项必然永锁（轻模型：不计重复路径叠加，取全量正增上界）
  {
    const maxStat = new Map<string, number>();
    for (const t of sc.stats ?? []) maxStat.set(t.key, t.init);
    const acc = (ef: { stat?: Record<string, number> }) => {
      for (const [k, d] of Object.entries(ef.stat ?? {})) {
        if (typeof d === "number" && d > 0) maxStat.set(k, (maxStat.get(k) ?? 0) + d);
      }
    };
    for (const s of sc.scenes) {
      for (const e of s.effects ?? []) acc(e);
      for (const c of s.choices ?? []) for (const e of c.effects ?? []) acc(e);
    }
    for (const s of sc.scenes) {
      for (const c of s.choices ?? []) {
        for (const [k, need] of Object.entries(c.cond?.statAtLeast ?? {})) {
          const max = maxStat.get(k);
          if (max === undefined) fail(`场景 ${s.id} 选项要求未定义数值 ${k}≥${need}`);
          else if (max < need) fail(`场景 ${s.id} 选项要求 ${k}≥${need}，但全剧本理论上限仅 ${max}（选项永锁）`);
        }
      }
    }
  }
  // 6) 小游戏数据合法性（不建模可解性，但拦下必然失败的配置错误）
  for (const s of sc.scenes) {
    const mg = s.minigame;
    if (!mg) continue;
    if (mg.type === "gobang" && mg.gobang) {
      if (!mg.gobang.steps.length) fail(`场景 ${s.id} 残局无步骤`);
      mg.gobang.steps.forEach((step, i) => {
        if (!step.options.length) fail(`场景 ${s.id} 残局第${i + 1}手无候选`);
        if (step.answer < 0 || step.answer >= step.options.length) fail(`场景 ${s.id} 残局第${i + 1}手正解索引 ${step.answer} 越界`);
      });
      // B-5 正解数值校验：boards 快照每步应恰好多一枚 B 子（正解落子位置），与 step.answer 对账。
      //   快照不满足「每步多一子」时保留上方越界校验并 warn 说明无法推断，不误杀合法残局。
      const gb = mg.gobang;
      if (gb.boards) {
        if (gb.boards.length !== gb.steps.length + 1) {
          warn(`场景 ${s.id} 残局 boards 快照数 ${gb.boards.length} ≠ 步数+1(${gb.steps.length + 1})，无法推断正解位置`);
        } else if (!gb.boards.every((b) => Array.isArray(b) && b.every((r) => typeof r === "string"))) {
          warn(`场景 ${s.id} 残局 boards 快照格式异常（须为 string[]），无法推断正解位置`);
        } else {
          const countB = (rows: string[]) => rows.reduce((n, r) => n + [...r].filter((ch) => ch === "B").length, 0);
          for (let i = 0; i < gb.steps.length; i++) {
            const before = gb.boards[i]!;
            const after = gb.boards[i + 1]!;
            if (before.length !== after.length || !before.every((r, ri) => r.length === after[ri]?.length)) {
              warn(`场景 ${s.id} 残局第${i + 1}手前后快照尺寸不一致，无法推断正解位置`);
              continue;
            }
            const added = countB(after) - countB(before);
            if (added !== 1) {
              warn(`场景 ${s.id} 残局第${i + 1}手快照黑子增 ${added} ≠ 1，无法推断正解位置（保持越界校验）`);
              continue;
            }
            // 定位唯一新增黑子坐标（0 起）
            let pos: { r: number; c: number } | null = null;
            outer: for (let r = 0; r < after.length; r++) {
              for (let c = 0; c < after[r]!.length; c++) {
                if (after[r]![c] === "B" && before[r]![c] !== "B") {
                  if (pos) { pos = null; break outer; } // 多子同增 → 无法唯一推断
                  pos = { r, c };
                }
              }
            }
            if (!pos) {
              warn(`场景 ${s.id} 残局第${i + 1}手无法唯一确定新增黑子位置，无法与 answer 对账`);
              continue;
            }
            const step = gb.steps[i]!;
            const opt = step.options[step.answer] ?? "";
            const parsed = parseOptionCoord(opt);
            if (parsed) {
              if (parsed.r !== pos.r || parsed.c !== pos.c) {
                fail(`场景 ${s.id} 残局第${i + 1}手 answer(${step.answer})「${opt}」指向 ${parsed.r + 1}行${parsed.c + 1}列，但 boards 推断正解为 ${pos.r + 1}行${pos.c + 1}列`);
              }
            } else {
              warn(`场景 ${s.id} 残局第${i + 1}手候选未含坐标，跳过 answer 与棋盘对账（boards 增子校验已通过：${pos.r + 1}行${pos.c + 1}列）`);
            }
          }
        }
      }
    }
    if (mg.type === "jiuling" && mg.jiuling) {
      if (mg.jiuling.rounds < 1) fail(`场景 ${s.id} 行令轮数非法`);
      if (!mg.jiuling.hand.length) fail(`场景 ${s.id} 行令手牌为空`);
      // 必胜性枚举：4^rounds 令签序列，玩家每轮从剩余手牌选牌取全局最高分；
      // 若出现「无论怎么打都达不到胜利线」的必输序列（天谴局），标红回归（详见第五轮审计 P2）。
      const SUITS = ["策", "器", "势", "隐"] as const;
      const PAIR: Record<string, string> = { 策: "势", 势: "器", 器: "隐", 隐: "策" };
      const rscore = (c: string, d: string) => (c === d ? 2 : PAIR[c] === d ? 1 : -1);
      const best = (seq: string[], hand: string[]): number => {
        let mx = -Infinity;
        const dfs = (i: number, rem: string[], acc: number) => {
          if (i >= seq.length) { mx = Math.max(mx, acc); return; }
          for (let k = 0; k < rem.length; k++) {
            const nx = [...rem.slice(0, k), ...rem.slice(k + 1)];
            dfs(i + 1, nx, acc + rscore(rem[k]!, seq[i]!));
          }
        };
        dfs(0, hand, 0);
        return mx;
      };
      const winLine = mg.jiuling.rounds;
      const seqs: string[][] = [];
      const gen = (cur: string[]) => { if (cur.length === mg.jiuling!.rounds) { seqs.push([...cur]); return; } for (const x of SUITS) gen([...cur, x]); };
      gen([]);
      const loseSeqs = seqs.filter((sq) => best(sq, mg.jiuling.hand) < winLine).map((sq) => sq.join(""));
      if (loseSeqs.length) fail(`场景 ${s.id} 行令存在 ${loseSeqs.length} 种必输序列（${loseSeqs.join("/")}）——手牌容错不足，玩家无论怎么打都达不到胜利线`);
    }
  }
  // 7) 市集/翻牌/卡包引用完整性：货架/卡包池/翻牌选项引用的卡必须存在于卡牌表，
  //    否则 UI def() 返回 undefined（静默缺卡，最坏背包视图对 undefined 取属性崩溃）
  {
    const cardIds = new Set(sc.cards.map((c) => c.id));
    const checkRef = (where: string, id: string) => {
      if (!cardIds.has(id)) fail(`${where} 引用的卡牌 ${id} 不在卡牌表`);
    };
    for (const s of sc.scenes) {
      if (s.shop) {
        for (const id of s.shop.stock) checkRef(`场景 ${s.id} 货架`, id);
        for (const p of s.shop.packs ?? []) for (const id of p.pool) checkRef(`场景 ${s.id} 卡包 ${p.id} 池`, id);
      }
      if (s.cardPick) {
        for (const id of s.cardPick.options) checkRef(`场景 ${s.id} 翻牌`, id);
        if (s.cardPick.options.length !== 3) warn(`场景 ${s.id} 翻牌选项数 = ${s.cardPick.options.length}（类型约定为三选一）`);
      }
    }
  }
  // 3) 对局审计（scriptVariants 逐变体穷举：常驻扰动下每个变体都必须可胜）
  for (const cfg of sc.duels) {
    if (cfg.unwinnable && cfg.gambit) fail(`对局 ${cfg.id} 设计性死局开启了 gambit —— 必败演出不得含押注/破招（W-5 护栏）`);
    const scripts = cfg.scriptVariants?.length ? cfg.scriptVariants : [cfg.script];
    if (!cfg.script.length) { fail(`对局 ${cfg.id} script 为空`); continue; }
    // M8（审计 P1-1）→ M9（审计 P0-3）：门禁口径收严为真命题——普通压制局对手初始血量必须高于
    // 「单窗口（一次交手 ± 其间所拍物品）」的封顶伤害，否则一回合内一手即可猝死。
    // M9 前旧实现另有「+破防物品(4)」的余量分支并标警：物品伤害当时绕开 clamp，血线 7~8 的局确实薄；
    // 现破防/共鸣与交手共用 TURN_DAMAGE_CAP 预算（见 duel.damageOpponent），该假设已不成立，余量分支删除。
    if (cfg.mode === "pressure" && !cfg.unwinnable) {
      const hpO = cfg.hp?.opponent ?? 10;
      if (hpO <= TURN_DAMAGE_CAP) fail(`对局 ${cfg.id} 对手初始 ${hpO} ≤ 单窗口封顶 ${TURN_DAMAGE_CAP}——一次交换（含其间物品）即可猝死（M1 门禁真命题化）`);
    }
    for (const id of cfg.deck) if (!sc.cards.find(c => c.id === id) && !cfg.oppCards?.find(c => c.id === id)) fail(`对局 ${cfg.id} deck 引用不存在的卡牌 ${id}`);
    if (cfg.mode === "pressure") for (const s of scripts) for (const id of s) if (!sc.cards.find(c => c.id === id) && !cfg.oppCards?.find(c => c.id === id)) fail(`对局 ${cfg.id} script(变体) 引用不存在的卡牌 ${id}`);
    const vLabel = (i: number) => scripts.length > 1 ? `[变体${i + 1}/${scripts.length}] ` : "";
    if (cfg.mode === "emotion") {
      for (const s of scripts) for (const x of s) if (!SUITS.includes(x as Suit)) fail(`对局 ${cfg.id} 脚本(变体)含非法花色 ${x}`);
      // M6 策略审计（信息性探针）：「永远反着出」零风险口诀线是否仍在预算内可胜——
      // 审计第七篇 2.1 的结论回归用例：虚张去周期化后该线应在 goal≥6 局被言力预算封住
      if (cfg.rules !== "v2" && !cfg.unwinnable) {
        const d0 = initDuel(cfg, cfg.deck, sc.cards); revealEmotion(d0);
        let played = 0;
        while (!d0.finished && played < 12) {
          const shown = d0.opponentShown!;
          const counter = (Object.entries(RESTRAIN).find(([, v]) => v === shown)?.[0]) as Suit;
          const pool = cfg.deck.map(id => sc.cards.find(c => c.id === id)!).filter(c => c && (c.layer ?? "成术") === "成术");
          const pick = pool.find(c => c.suit === counter);
          if (!pick || !playEmotion(d0, pick)) break;
          played++;
          if (!d0.finished) revealEmotion(d0);
        }
        console.log(`    [策略审计] ${cfg.id}: ${d0.finished === "win" ? `零风险口诀线仍可胜（${played}手）` : `零风险口诀线被预算/卡组封住（${played}手）`}`);
      }
      // M9（审计 P0-3）：情绪制物品弹药上界——把全剧本能直灌共鸣的物品（共鸣+2/破防+1）按性价比
      // 降序在言力总预算内买满，所得共鸣仍必须严格低于 goal。否则「不出一张成术、纯掷物品」即可
      // 零风险零花色判定地打满胜线（P0-3 的原始症状），W-2 言力预算与 EMOTION_TOPIC_MATCH_MAX 全废。
      // 不入闸的效果：强牌（要再占一手、且须接话成功才兑现 +1）、回气/抽牌（不推进胜线）、观X/揭底（情绪制被引擎拒用）。
      // 剧情杀局（unwinnable）引擎侧 playItem 直接拒用，无需数值上界。
      if (cfg.rules === "v2" && !cfg.unwinnable) {
        const ammo = sc.cards
          .filter((c) => (c.layer ?? "成术") === "物品" && (c.itemEffect === "共鸣" || c.itemEffect === "破防"))
          .map((c) => ({ id: c.id, gain: c.itemEffect === "共鸣" ? 2 : 1, price: ITEM_YANLI_COST[c.itemEffect!]! }))
          .sort((a, b) => b.gain / b.price - a.gain / a.price);
        let budget = EMOTION_YANLI_MAX, buy = 0;
        const bought: string[] = [];
        for (const a of ammo) if (a.price <= budget) { budget -= a.price; buy += a.gain; bought.push(a.id); }
        const goal = cfg.goal ?? DEFAULT_GOAL;
        if (buy >= goal) fail(`对局 ${cfg.id} 物品弹药超标：言力预算 ${EMOTION_YANLI_MAX} 内可零风险买满 +${buy} 共鸣（${bought.join("/")}）≥ goal ${goal}——物品独吞胜线，须抬 ITEM_YANLI_COST 或削该剧本的共鸣/破防卡（P0-3）`);
      }
      const legal = cfg.rules === "v2" ? legalLoadout(sc) : cfg.deck;
      const full = cfg.rules === "v2" ? v2Loadout(sc) : cfg.deck;
      for (let vi = 0; vi < scripts.length; vi++) {
        // M7（审计 P1-6）：必须同时清掉 scriptVariants——否则 initDuel 会无视钉住的 script 重新随机选变体，穷举测的是随机剧本池
        const vc = scripts.length > 1 ? { ...cfg, script: scripts[vi]!, scriptVariants: undefined } : cfg;
        if (vc.rules === "v2" && sc.cardSystem) {
          const starter = starterLoadout(sc);
          const s0 = emotionCanWin(sc, vc, starter);
          if (!s0.win && !vc.unwinnable) fail(`对局 ${vc.id}「${vc.title}」${vLabel(vi)}裸卡组在真实 UI 合同下不可胜`);
          else if (!s0.win) console.log(`    ${vLabel(vi)}[裸卡组] ○ 设计性死局(必败走向败线)`);
          else console.log(`    ${vLabel(vi)}[裸卡组] ✓ 真实UI可胜(${s0.steps}步)`);
        }
        // M8（审计 P1-3）：先证「合法满编」（≤deckLimit/可得性约束）可胜；只有超法满编能胜时降级为警告（尺子校准期不炸数据）
        let r = emotionCanWin(sc, vc, legal);
        let legalShort = false;
        if (!r.win && legal.join() !== full.join()) {
          const r2 = emotionCanWin(sc, vc, full);
          if (r2.win) { r = r2; legalShort = true; }
        }
        if (!r.win && !vc.unwinnable) fail(`对局 ${vc.id}「${vc.title}」${vLabel(vi)}满编卡组在真实 UI 合同下不可胜`);
        else if (!r.win) console.log(`  ${vLabel(vi)}○ ${vc.title}: 设计性死局(必败走向败线)`);
        else if (vc.unwinnable && vc.winScene !== vc.loseScene) fail(`对局 ${vc.id}「${vc.title}」${vLabel(vi)}标记 unwinnable 却穷举可胜 —— 死局标记腐烂，剧情杀可能被打赢`);
        else if (vc.unwinnable && r.win) warn(`对局 ${vc.id}「${vc.title}」${vLabel(vi)}标记 unwinnable 却穷举可胜（winScene===loseScene 旧豁免）——App 结算端 finAs 已强制判负，但死局数值应回炉`);
        else {
          if (legalShort) warn(`对局 ${vc.id}「${vc.title}」${vLabel(vi)}仅超法满编可胜（合法 ≤${sc.deckLimit ?? 12} 张不可胜）——卡组可得性/上限回潮（P1-3）`);
          const omni = vc.gambit ? "〔全知上限：胜线假设看穿敌招〕" : "";
          console.log(`  ${vLabel(vi)}✓ ${vc.title}: 真实UI合同可胜(${r.steps}步)${legalShort ? "·超法满编" : ""}${omni}`);
        }
      }
    } else {
      for (let vi = 0; vi < scripts.length; vi++) {
        const vc = scripts.length > 1 ? { ...cfg, script: scripts[vi]!, scriptVariants: undefined } : cfg;
        if (vc.rules === "v2" && sc.cardSystem) {
          const starter = starterLoadout(sc);
          const best0 = pressureBest(sc, vc, starter);
          console.log(`    ${vLabel(vi)}[裸卡组${starter.length}张] ${best0 ? "可胜(" + best0.line.filter(x => x !== "(换气)").length + "步)" : "✗ 不可胜 —— 初始卡组无法通关,需调卡组或提示购买"}`);
        }
        // M8（审计 P1-3/P1-2）：先证合法满编可胜；仅超法牌池能胜降级为警告；gambit/藏牌局的胜线是全知上限，明示标注
        const legal = vc.rules === "v2" ? legalLoadout(sc) : vc.deck;
        const full = vc.rules === "v2" ? v2Loadout(sc) : vc.deck;
        let best = pressureBest(sc, vc, legal);
        let legalShort = false;
        if (!best && legal.join() !== full.join()) {
          const b2 = pressureBest(sc, vc, full);
          if (b2) { best = b2; legalShort = true; }
        }
        const total = vc.hp!.player;
        if (best && vc.unwinnable && vc.winScene !== vc.loseScene) fail(`对局 ${vc.id}「${vc.title}」${vLabel(vi)}标记 unwinnable 却穷举可胜 —— 死局标记腐烂（A-2 反向断言）`);
        else if (best && vc.unwinnable) warn(`对局 ${vc.id}「${vc.title}」${vLabel(vi)}标记 unwinnable 却穷举可胜（winScene===loseScene 旧豁免）——App 结算端 finAs 已强制判负，但死局数值应回炉`);
        if (best) {
          if (legalShort && !vc.unwinnable) warn(`对局 ${vc.id}「${vc.title}」${vLabel(vi)}仅超法满编可胜（合法 ≤${sc.deckLimit ?? 12} 张不可胜）——卡组可得性/上限回潮（P1-3）`);
          const omni = vc.gambit || vc.seeOpp === "hidden" ? " 〔全知上限：穷举默认看得见敌招〕" : "";
          const margin = best.d.hpPlayer;
          const tenseness = margin <= 2 ? "极高张力" : margin <= Math.ceil(total / 2) ? "中等" : "宽松";
          console.log(`  ${vLabel(vi)}✓ ${vc.title}: ${best.d.round}步最优胜,剩${margin}/${total}气力(${tenseness})${legalShort ? "·超法满编" : ""}${omni} 线:${best.line.map(x => x.startsWith("(") ? x.slice(1, -1) : cardOf(sc, vc.oppCards)(x).name).join("→")}`);
        } else if (!vc.unwinnable) {
          fail(`对局 ${vc.id}「${vc.title}」${vLabel(vi)}普通压制局穷举不可胜且未标 unwinnable —— 数值失准或漏标死局（A-2）`);
        } else {
          console.log(`  ${vLabel(vi)}○ ${vc.title}: 设计性死局(必败走向败线)`);
        }
      }
    }
  }
}

// ============================================================
// 6b) M9（第四轮审计 P0-3）引擎合同自测：物品卡必须踩在对局资源约束之内
//   合成局不读剧本——防「这批数据恰好没弹药」造成假绿灯（旧 bug 正是数据层备好了 i_yinpiao2/i_mixin 等）。
// ============================================================
{
  const mk = (c: Partial<CardDef> & { id: string }): CardDef => ({ name: c.id, text: "", lore: "", ...c });
  const ST_PO = mk({ id: "st_po", layer: "物品", suit: "器", itemEffect: "破防" });
  const ST_GONG = mk({ id: "st_gong", layer: "物品", suit: "器", itemEffect: "共鸣" });
  const ST_GONG2 = mk({ id: "st_gong2", layer: "物品", suit: "器", itemEffect: "共鸣" });
  const ST_HUI = mk({ id: "st_hui", layer: "物品", suit: "器", itemEffect: "回气" });
  const ST_QIANG = mk({ id: "st_qiang", layer: "物品", suit: "器", itemEffect: "强牌" });
  const ST_GUAN = mk({ id: "st_guan", layer: "物品", suit: "器", itemEffect: "观牌" });
  // 主攻牌两张同点数不同 id：避开「招式用老 -2」；花色取 器，对手牌取 策——不相克，边距为 0
  const ST_BIG = mk({ id: "st_big", suit: "器", power: 9 });
  const ST_BIG2 = mk({ id: "st_big2", suit: "器", power: 9 });
  const ST_O1 = mk({ id: "st_o1", suit: "策", power: 1 });
  const pool = [ST_PO, ST_GONG, ST_BIG, ST_HUI, ST_GONG2, ST_GUAN, ST_QIANG, ST_BIG2];
  const ids = pool.map((c) => c.id);
  const base = { id: "st", title: "合同自测", intro: "", opponent: { name: "甲", desc: "乙" }, winScene: "w", loseScene: "l" };
  const pCfg = { ...base, mode: "pressure", rules: "v2", turnSchema: "phased", hp: { player: 99, opponent: 99 }, script: ["st_o1"], deck: ids, oppCards: [ST_O1] } as unknown as Scenario["duels"][number];
  const eCfg = { ...base, mode: "emotion", rules: "v2", goal: 5, script: ["策"], deck: ids } as unknown as Scenario["duels"][number];
  const eDead = { ...eCfg, unwinnable: true } as unknown as Scenario["duels"][number];
  const co = (id: string): CardDef => pool.find((c) => c.id === id) ?? ST_O1;

  // ① 压制制：物品伤害与交手共用同一份 TURN_DAMAGE_CAP 窗口预算
  {
    const d = initDuel(pCfg, ids, pool, { ap: 4 });   // 7 点行动力：够走完 6 步动作序列
    if (!playItem(d, ST_PO)) fail("合同自测：压制制破防物品被拒用（应可用）");
    if (!playItem(d, ST_GONG)) fail("合同自测：压制制共鸣物品被拒用（应可用）");
    const spent = (pCfg.hp!.opponent!) - d.hpOpponent;
    if (spent > TURN_DAMAGE_CAP) fail(`合同自测：同窗口物品输出 ${spent} 越过 TURN_DAMAGE_CAP ${TURN_DAMAGE_CAP}——物品仍在封顶之上（P0-3 复发）`);
    if (spent !== TURN_DAMAGE_CAP) fail(`合同自测：破防4+共鸣3 应恰好灌满单窗口封顶 ${TURN_DAMAGE_CAP}，实得 ${spent}——钳制链路没接上？`);
    const before = d.hpOpponent;
    playPressure(d, ST_BIG, "st_o1", co);             // 差值 8，但本窗口余量已尽 → 一点不伤
    if (d.hpOpponent !== before) fail(`合同自测：封顶余量已尽，主攻仍伤敌 ${before - d.hpOpponent} 点——物品与交手未共用预算`);
    playPressure(d, ST_BIG2, "st_o1", co);            // round 已推进 → 新窗口，钳到封顶 6
    if (before - d.hpOpponent !== TURN_DAMAGE_CAP) fail(`合同自测：新窗口主攻应伤敌恰好 ${TURN_DAMAGE_CAP}，实得 ${before - d.hpOpponent}——交手伤害被错误吞减？`);
    if (playItem(d, ST_PO)) fail("合同自测：同一件物品一局限一张失效（usedCards 未记账）");
    if (!playItem(d, ST_HUI)) fail("合同自测：回气（非伤害型）被误封——只应收紧伤害型物品");
    if (!playItem(d, ST_QIANG)) fail("合同自测：强牌（增益型）被误封——增益类不受封顶影响");
  }
  // ② 剧情杀局封死物品 / 情绪制封死压制制情报物品
  {
    const d = initDuel(eDead, ids, pool);
    revealEmotion(d);
    if (playItem(d, ST_GONG)) fail("合同自测：unwinnable 剧情杀局仍可打物品——死局标记会被物品打穿");
    const d2 = initDuel(eCfg, ids, pool);
    revealEmotion(d2);
    if (playItem(d2, ST_GUAN)) fail("合同自测：情绪制仍可打出「观牌」（无消费路径的死卡）");
  }
  // ③ 情绪制：物品按强度扣言力，且占一次出手（round 前进 / 当前亮色作废）
  {
    const d = initDuel(eCfg, ids, pool);
    revealEmotion(d);
    const y0 = d.yanli;
    if (!playItem(d, ST_GONG)) fail("合同自测：情绪制共鸣物品被拒用");
    if (d.yanli !== y0 - ITEM_YANLI_COST["共鸣"]) fail(`合同自测：情绪制物品未扣言力（应 ${y0}→${y0 - ITEM_YANLI_COST["共鸣"]}，实为 ${d.yanli}）——P0-3 复发`);
    if (d.round !== 1) fail(`合同自测：情绪制物品未占出手（round 应为 1，实为 ${d.round}）——P0-3 复发`);
    if (d.opponentShown) fail("合同自测：情绪制物品打出后对手亮色未作废，等于白送一次定向接话");
    revealEmotion(d);
    const r0 = d.rapport;
    d.yanli = 1;   // 抽干预算：只剩 1 言力，共鸣（2）付不起
    if (playItem(d, ST_GONG2)) fail("合同自测：言力不足仍可打出物品——言力闸门未生效");
    if (d.rapport !== r0 || d.usedCards.includes("st_gong2")) fail("合同自测：付不起的物品仍产生副作用（先检查后记账被打破）");
    // 纯物品灌不满 goal：共鸣(2)+破防(2) 顶多 +3 共鸣，仍需成术收尾
    const d3 = initDuel(eCfg, ids, pool);
    revealEmotion(d3);
    playItem(d3, ST_GONG); playItem(d3, ST_PO);
    if (d3.rapport >= (eCfg.goal ?? 0)) fail("合同自测：两件物品即可打满 goal——情绪制胜线被物品独吞");
  }
  console.log("引擎合同自测: 物品卡对局资源约束（封顶预算/言力定价/一局一张/剧情杀封死）校验完成");
}

// 7) 成就审计：id 唯一；weak_card 引用的卡/对局存在
{
  const { ACHIEVEMENTS } = await import("../src/data/achievements.ts");
  const ids = new Set<string>();
  for (const a of ACHIEVEMENTS) {
    if (ids.has(a.id)) { fail(`成就 id 重复: ${a.id}`); }
    ids.add(a.id);
  }
  const allCards = ALL.flatMap((sc) => sc.cards);
  const weakCard = ACHIEVEMENTS.find((a) => a.id === "weak_card");
  if (weakCard) {
    if (!allCards.some((c) => c.id === "j_min")) fail("成就 weak_card 引用的卡 j_min 不存在");
    const jieyuSc = ALL.find((s) => s.id === "jieyu");
    if (!jieyuSc?.duels.some((d) => d.id === "d_defense")) fail("成就 weak_card 引用的对局 d_defense 不存在");
  }
  const hero = ACHIEVEMENTS.find((a) => a.id === "hero_letter");
  if (hero) {
    const jieyuSc = ALL.find((s) => s.id === "jieyu");
    if (!jieyuSc?.scenes.some((s) => s.ending?.name === "信在人在")) fail("成就 hero_letter 引用的结局「信在人在」不存在");
  }
  // F-4 门禁：每条成就必须至少有一个判定钩子。钩子形态：win("<id>") 字面调用、
  // 三元/映射表内的第二处字面引用、WEAK_CARDS 循环模板、statAtLeast/Most 通用循环、
  // 或 App.tsx 行为计数表。缺钩子 = 永久不可达成的幽灵成就（F-4 曾漏检 bare_deck，本断言兜底）。
  {
    const { readFileSync } = await import("node:fs");
    const achSrc = readFileSync(new URL("../src/data/achievements.ts", import.meta.url), "utf-8");
    const appSrc = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf-8");
    const noHook = ACHIEVEMENTS.filter((a) => {
      if (a.id.startsWith("weak_") && a.id !== "weak_card") return !achSrc.includes("win(`weak_${scId}_${cardId}`)");
      if (a.statAtLeast || a.statAtMost) return !achSrc.includes("win(a.id)");
      const refs = achSrc.split(`"${a.id}"`).length - 1; // 定义处 1 次 + 其他钩子引用 ≥1
      if (refs >= 2) return false;
      return !appSrc.includes(`"${a.id}"`);
    });
    if (noHook.length) fail(`成就无判定钩子（永久不可达成）: ${noHook.map((a) => a.id).join(", ")}`);
  }
  console.log(`成就审计: ${ACHIEVEMENTS.length} 条定义合法（含钩子可达性断言）`);
}

// ---------- 番外可达性（A-1 门禁）----------
// 与 App.tsx 解锁判定同构：hits = keyCards ∩ cfg.deck ≥ need；全剧本死局（unwinnable）→ 败线兜底豁免。
// 防 touming/jieyu 类静默断链：钥匙卡定义了、卡片也在表，但没有一个对局 deck 能带进去 → 番外永不解锁。
{
  for (const b of BONUS_SCENES) {
    const sc = ALL.find((s) => s.id === b.scenarioId);
    if (!sc) {
      fail(`番外「${b.title}」归属剧本 ${b.scenarioId} 不存在`);
      continue;
    }
    if (b.lines.length === 0) fail(`番外「${b.title}」正文为空`);
    // ending 型：unlockEndings 必须是该剧本存在的结局名
    if (b.unlock === "ending") {
      const names = new Set(sc.scenes.filter((s) => s.ending).map((s) => s.ending!.name));
      for (const en of b.unlockEndings ?? []) {
        if (!names.has(en)) fail(`番外「${b.title}」解锁结局「${en}」不在剧本 ${b.scenarioId} 结局表中（实有：${[...names].join("/")}）`);
      }
      continue;
    }
    // dual 型：剧本必须有 ≥2 个视角，且各视角归属结局名存在
    if (b.unlock === "dual") {
      if ((sc.viewpoints?.length ?? 0) < 2) fail(`番外「${b.title}」要求双视角解锁，但剧本 ${b.scenarioId} 仅有 ${sc.viewpoints?.length ?? 0} 个视角`);
      continue;
    }
    // cards 型（默认）：钥匙卡可达性
    const duels = sc.duels.filter((d) => d.deck);
    const maxHits = Math.max(0, ...duels.map((d) => (b.keyCards ?? []).filter((k) => d.deck!.includes(k)).length));
    const noWinRoute = sc.duels.length > 0 && sc.duels.every((d) => d.unwinnable);
    if (!noWinRoute && maxHits < (b.need ?? 2)) {
      fail(`番外「${b.title}」钥匙卡不可达：本剧本 ${sc.duels.length} 个对局 deck 均不满足携带 ≥${b.need ?? 2} 张（keyCards: ${(b.keyCards ?? []).join("/")}）——请将 ≥${b.need ?? 2} 张钥匙卡补入任一可胜对局 deck`);
    }
  }
  console.log(`番外可达性: ${BONUS_SCENES.length} 个番外校验完成`);
}

// ---------- 卡包期望门禁（M9.5，审计 P1-6 扫尾）----------
// 印钞机判据：单包期望回银 = Σ池[(resource ?? 半价回卖)]/池大小×draws，超过售价即「无限买包稳赚」。
// 资源卡直接折银、非资源按半价卖回计最大回收——与 ShopView 的 openPack/sell 口径一致。
{
  let packCount = 0;
  for (const sc of ALL) {
    for (const scene of sc.scenes) {
      for (const p of scene.shop?.packs ?? []) {
        packCount++;
        let sum = 0;
        for (const id of p.pool) {
          const c = sc.cards.find((x) => x.id === id);
          if (!c) { fail(`卡包「${p.name}」(${sc.id}/${p.id}) 池含未知卡 id：${id}——开出即吞银`); continue; }
          sum += (c.resource ?? 0) || Math.floor((c.price ?? 10) / 2);
        }
        const ev = (sum / p.pool.length) * p.draws;
        if (ev > p.price) {
          fail(`卡包「${p.name}」(${sc.id}/${p.id}) 是印钞机：期望回银 ${ev.toFixed(1)} > 售价 ${p.price}——抬价或削池（P1-6 口径：含回卖回收）`);
        }
      }
    }
  }
  console.log(`卡包期望值: ${packCount} 个全检，期望均 ≤ 售价`);
}

console.log(`\n========== ${failures} 失败 / ${warnings} 警告（警告不拦退出码——绿≠零隐患，明细见上） ==========`);
process.exit(failures ? 1 : 0);
