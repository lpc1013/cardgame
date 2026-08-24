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
import type { Scenario, CardDef, Suit } from "../src/engine/types.ts";
import { initDuel, revealEmotion, playEmotion, playPressure, setDuelShuffle, endTurn, readEmotion, chargeUp, breakMove, RESTRAIN, type DuelState } from "../src/engine/duel.ts";

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
/** 四色覆盖检查 */
function colorCoverage(sc: Scenario, ids: string[]): string {
  const suits = new Set(ids.map((id) => sc.cards.find((c) => c.id === id)?.suit).filter(Boolean));
  return SUITS.filter((s) => !suits.has(s)).join("") || "全色✓";
}
function edgesOf(sc: Scenario) {
  const E: [string, string][] = [];
  for (const s of sc.scenes) {
    if (s.next) E.push([s.id, s.next]);
    for (const c of s.choices ?? []) E.push([s.id, c.next]);
    if (s.duel) { const d = sc.duels.find(x => x.id === s.duel)!; E.push([s.id, d.winScene], [s.id, d.loseScene]); if (d.loseScene2) E.push([s.id, d.loseScene2.scene]); }
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
  const base = `${d.round}|${d.mode === "emotion" ? `${d.rapport},${d.guard},${d.qi}` : `${d.hpPlayer},${d.hpOpponent}`}|${d.finished ?? ""}|${d.lastCardId ?? ""}|${d.ap}|${d.buffPower}|${d.charge}|${d.foresuit ?? ""}|${d.bluffed ? "b" : ""}`;
  if (!handAware) return base;
  return `${base}|h:${d.hand.join(",")}|l:${d.library.join(",")}|x:${d.discard.join(",")}|u:${d.usedCards.join(",")}`;
}

/** 情绪制：真实 UI 合同下的穷举可胜性。
 *  真实可达动作 = 从手牌（v2）/全池（classic）打出一张牌；博弈局加「读牌」；情绪局无「换气」动作。 */
function emotionCanWin(sc: Scenario, cfg: (typeof sc.duels)[number], loadout: string[]): { win: boolean; steps: number } {
  const co = cardOf(sc, cfg.oppCards);
  const isV2 = cfg.rules === "v2";
  const seen = new Set<string>();
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
      if ((c.layer ?? "成术") !== "成术") continue;
      const nd = cloneD(d);
      if (!playEmotion(nd, c)) continue;
      if (!nd.finished) revealEmotion(nd);
      const key = stateKey(nd, isV2);
      if (!seen.has(key)) { seen.add(key); q.push({ d: nd, steps: steps + 1 }); }
    }
    if (cfg.gambit && d.opponentShown && d.qi >= 1) {
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
    if (cfg.gambit && d.bluffed && d.qi >= 2 && readEmotion(d)) continue;
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

/** 压制制：真实 UI 合同下的穷举（出牌 + 换气；博弈局加蓄势/破招×4色） */
function pressureBest(sc: Scenario, cfg: (typeof sc.duels)[number], loadout: string[]): { d: DuelState; line: string[] } | null {
  const co = cardOf(sc, cfg.oppCards);
  const isV2 = cfg.rules === "v2";
  const seen = new Set<string>();
  let best: { d: DuelState; line: string[] } | null = null;
  const q: { d: DuelState; line: string[] }[] = [{ d: initDuel(cfg, loadout, sc.cards), line: [] }];
  while (q.length) {
    if (seen.size > 400000) { warn(`对局 ${cfg.id} 压制穷举超状态上限，结果可能不完整`); break; }
    const { d, line } = q.shift()!;
    if (d.finished === "win" && !best) { best = { d, line }; break; }
    if (d.finished) continue;
    const handIds = isV2 ? [...d.hand] : loadout;
    const oppId = cfg.script[d.round % cfg.script.length] ?? cfg.script[0]!;
    for (const id of handIds) {
      const nd = cloneD(d);
      if (!playPressure(nd, co(id), oppId, co)) continue;
      const key = stateKey(nd, isV2);
      if (!seen.has(key)) { seen.add(key); q.push({ d: nd, line: [...line, id] }); }
    }
    if (cfg.gambit) {
      const nd = cloneD(d);
      if (chargeUp(nd, oppId, co)) {
        const key = stateKey(nd, isV2);
        if (!seen.has(key)) { seen.add(key); q.push({ d: nd, line: [...line, "(蓄势)"] }); }
      }
      if (!d.foresuit) {
        for (const s of SUITS) {
          const nb = cloneD(d);
          if (!breakMove(nb, s, oppId, co)) continue;
          const key = stateKey(nb, isV2);
          if (!seen.has(key)) { seen.add(key); q.push({ d: nb, line: [...line, `(破${s})`] }); }
        }
      }
    }
    if (isV2 && d.ap < 3 && !d.finished) {
      const nd = cloneD(d);
      endTurn(nd);
      const key = stateKey(nd, true);
      if (!seen.has(key)) { seen.add(key); q.push({ d: nd, line: [...line, "(换气)"] }); }
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
    for (const c of s.choices ?? []) if (!ids.has(c.next)) fail(`场景 ${s.id} 选项指向不存在的 ${c.next}`);
    if (s.duel && !sc.duels.find(d => d.id === s.duel)) fail(`场景 ${s.id} 引用不存在的对局 ${s.duel}`);
    if (s.lines.length === 0) warn(`场景 ${s.id} 没有正文`);
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
      for (const e of s.effects ?? []) if (e.unlockClue) unlockable.add(e.unlockClue);
      for (const c of s.choices ?? []) for (const e of c.effects ?? []) if (e.unlockClue) unlockable.add(e.unlockClue);
    }
    if (unlockable.size < v.mustPick) fail(`全剧本可解锁线索去重后仅 ${unlockable.size} 条 < 复盘选数 mustPick(${v.mustPick})，复盘按钮将永锁`);
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
    }
    if (mg.type === "jiuling" && mg.jiuling) {
      if (mg.jiuling.rounds < 1) fail(`场景 ${s.id} 行令轮数非法`);
      if (!mg.jiuling.hand.length) fail(`场景 ${s.id} 行令手牌为空`);
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
  // 3) 对局审计
  for (const cfg of sc.duels) {
    if (!cfg.script.length) { fail(`对局 ${cfg.id} script 为空`); continue; }
    for (const id of cfg.deck) if (!sc.cards.find(c => c.id === id) && !cfg.oppCards?.find(c => c.id === id)) fail(`对局 ${cfg.id} deck 引用不存在的卡牌 ${id}`);
    if (cfg.mode === "pressure") for (const id of cfg.script) if (!sc.cards.find(c => c.id === id) && !cfg.oppCards?.find(c => c.id === id)) fail(`对局 ${cfg.id} script 引用不存在的卡牌 ${id}`);
    if (cfg.mode === "emotion") {
      for (const s of cfg.script) if (!SUITS.includes(s as Suit)) fail(`对局 ${cfg.id} 脚本含非法花色 ${s}`);
      const pool = cfg.rules === "v2" ? v2Loadout(sc) : cfg.deck;
      if (cfg.rules === "v2" && sc.cardSystem) {
        const starter = starterLoadout(sc);
        console.log(`    [裸卡组${starter.length}张] 花色覆盖: ${colorCoverage(sc, starter)}`);
        const s0 = emotionCanWin(sc, cfg, starter);
        if (!s0.win) fail(`对局 ${cfg.id}「${cfg.title}」裸卡组在真实 UI 合同下不可胜（情绪制无换气可回气补牌之外无退路）`);
        else console.log(`    [裸卡组] ✓ 真实UI可胜(${s0.steps}步)`);
      }
      const r = emotionCanWin(sc, cfg, pool);
      if (!r.win) fail(`对局 ${cfg.id}「${cfg.title}」满编卡组在真实 UI 合同下不可胜`);
      else console.log(`  ✓ ${cfg.title}: 真实UI合同可胜(${r.steps}步)`);
    } else {
      if (cfg.rules === "v2" && sc.cardSystem) {
        const starter = starterLoadout(sc);
        const best0 = pressureBest(sc, cfg, starter);
        console.log(`    [裸卡组${starter.length}张] ${best0 ? "可胜(" + best0.line.filter(x => x !== "(换气)").length + "步)" : "✗ 不可胜 —— 初始卡组无法通关,需调卡组或提示购买"}`);
      }
      const loadout = cfg.rules === "v2" ? v2Loadout(sc) : cfg.deck;
      const best = pressureBest(sc, cfg, loadout);
      const total = cfg.hp!.player;
      if (best) {
        const margin = best.d.hpPlayer;
        const tenseness = margin <= 2 ? "极高张力" : margin <= Math.ceil(total / 2) ? "中等" : "宽松";
        console.log(`  ✓ ${cfg.title}: ${best.d.round}步最优胜,剩${margin}/${total}气力(${tenseness}) 线:${best.line.map(x => x.startsWith("(") ? x.slice(1, -1) : cardOf(sc, cfg.oppCards)(x).name).join("→")}`);
      } else {
        // 确认是否"设计性死局"(唯一出口=loseScene)
        console.log(`  ○ ${cfg.title}: 穷举不可胜 —— 设计性死局(必败走向败线)`);
      }
    }
  }
}

console.log(`\n========== ${failures} 失败 / ${warnings} 警告 ==========`);
process.exit(failures ? 1 : 0);
