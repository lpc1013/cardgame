// ============================================================
// 状态一致性门禁：node --experimental-strip-types scripts/state_tests.mts
//
// 出处＝《GitHub 仓库对抗性审计报告》2026-10-13 第六节「应该新增的核心测试用例」表。
// 那张表里每一条都是「常规流程跑得通、异常路径跑不通」的那一类，本轮修的正是它们：
//   A01 回退后强制进 story   A02 浅拷共享引用   A03 先执行后判断
//   A04 存档只做形状检查      A08 清档清不干净   A06 提示与推进两套判定
// 断言一律打在 engine/runtime.ts + engine/transition.ts + engine/save.ts 这三份真实实现上，
// 不另建"测试专用模型"——测试与游戏各算一套，红了也说明不了游戏坏。
//
// 每条都自带「命中数自报」，并且跑前先对自己的断言做一次反证（见 falsify 段）：
// 一条从不曾红过的闸，等于没有闸。
// ============================================================
import { registerScenarios, applyEffects, checkCond, cloneRunState, initState, visibleChoices, resolveSceneLines, type RunState } from "../src/engine/runtime.ts";
import {
  availableActions, enterScene, lastRealLine, nextLineIndex, resolveScenePhase, takeChoice,
} from "../src/engine/transition.ts";
import type { Scenario, Scene } from "../src/engine/types.ts";
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
import { readFileSync } from "node:fs";

const ALL: Scenario[] = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];
registerScenarios(ALL);

let failures = 0, checks = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  checks++;
  if (cond) console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `实得 ${JSON.stringify(got)} / 应为 ${JSON.stringify(want)}`);

// ---------- 合成剧本：只用来喂断言，不进游戏 ----------
const mkState = (over: Partial<RunState> = {}): RunState => ({
  scenarioId: "tst", sceneId: "s1", flags: new Set(), stats: { mei: 0 }, clues: [],
  bag: [], deck: [], silver: 0, lineIndex: 0, visited: [], boosts: [], retinue: [], usedCards: [],
  ...over,
});
const TST: Scenario = {
  id: "tst", title: "合成", subtitle: "", mode: "story", scenes: [], duels: [], cards: [], startScene: "s1",
  stats: [{ key: "mei", name: "媒", init: 0 }],
};
const scene = (s: Partial<Scene> & { id: string }): Scene => ({ lines: ["甲", "乙"], ...s });
const addScenes = (...ss: Scene[]) => { TST.scenes.push(...ss); };

console.log("\n【1】applyEffects 是纯函数：原状态与所有内层集合都不许被改（审计 A02）");
{
  const base = mkState({ flags: new Set(["f0"]), clues: ["c0"], bag: ["k0"], deck: ["k0"], stats: { mei: 1 }, visited: ["v0"], survey: { s1: ["spot"] } });
  const frozen = JSON.stringify({ ...base, flags: [...base.flags] });
  const out = applyEffects([
    { setFlag: "f1", stat: { mei: 5 }, unlockClue: "c1", gainSilver: 20 },
  ], base);
  ok("原对象逐字段不变", JSON.stringify({ ...base, flags: [...base.flags] }) === frozen);
  ok("原 flags 是同一个 Set 实例且没长", base.flags.has("f1") === false && base.flags.size === 1);
  ok("原 stats/clues/bag/deck 未被就地改", base.stats.mei === 1 && base.clues.length === 1 && base.bag.length === 1 && base.deck.length === 1);
  ok("返回的新对象与原件不同引用", out !== base && out.flags !== base.flags && out.stats !== base.stats && out.clues !== base.clues);
  ok("效果确实落在了新对象上", out.flags.has("f1") && out.stats.mei === 6 && out.clues.length === 2 && out.silver === 20);
  // 反证（这条必须绿）：照旧写法「浅拷 + 就地改」，原件确实被污染——
  // 它一旦红，说明上面那批「原件不变」的断言根本没在量 A02，是在自我表扬。
  const dirty = { ...base, flags: base.flags, stats: base.stats, clues: base.clues };
  dirty.flags.add("f9");
  ok("（反证）浅拷 + 就地改会顺着共享引用写到原件", base.flags.has("f9"), "红了＝反证没扎进去，上面的断言是空的");
  base.flags.delete("f9");
}

console.log("\n【2】换幕不带走旧状态：enterScene 之后 base 仍完好");
{
  addScenes(scene({ id: "s1", next: "s2" }), scene({ id: "s2", lines: ["丙"], effects: [{ setFlag: "in_s2", stat: { mei: 3 } }] }));
  const base = mkState();
  const next = enterScene(base, TST.scenes[1]!, {});
  ok("base 无 in_s2、mei 仍 0", !base.flags.has("in_s2") && base.stats.mei === 0);
  ok("next 带 in_s2、mei=3、sceneId=s2", next.flags.has("in_s2") && next.stats.mei === 3 && next.sceneId === "s2");
  ok("visited 记账把旧幕留下", next.visited.length === 1 && next.visited[0] === "s1" && base.visited.length === 0);
}

console.log("\n【3】选项：分支按「做选择之前」的状态判定（审计 A03）");
{
  TST.scenes.length = 0;
  addScenes(scene({
    id: "s1",
    choices: [{
      text: "砸钱换声望再定夺", hint: "", cond: { statAtLeast: { mei: 10 } },
      effects: [{ stat: { mei: 50 } }], next: "真结局", altNext: "降级结局",
    }],
  }));
  const poor = mkState({ stats: { mei: 5 } });
  const got = takeChoice(poor, TST.scenes[0]!, 0);
  ok("mei=5 不够门槛 → 落 altNext（哪怕这条选项自己会把 mei 顶到 55）", got?.targetSceneId === "降级结局", `实落 ${got?.targetSceneId}`);
  ok("效果仍照常结算（声望确实进账）", got?.next.stats.mei === 55);
  ok("原件 mei 仍是 5", poor.stats.mei === 5);
  const rich = takeChoice(mkState({ stats: { mei: 20 } }), TST.scenes[0]!, 0);
  ok("够门槛 → 落 next", rich?.targetSceneId === "真结局");
  // 反证（这条必须绿）：旧写法「浅拷 + 就地结算效果 + 再读原状态判 cond」会把这条判成满足。
  // stats 是共享引用，applyEffects 就地 +50 等于先把考卷改了再打分。
  const st0 = mkState({ stats: { mei: 5 } });
  const shallow = { ...st0 };
  shallow.stats.mei += 50;            // 旧 applyEffects 就长这样：改的是 st0.stats 那个对象
  ok("（反证）旧顺序会先改状态再判 cond", checkCond({ statAtLeast: { mei: 10 } }, st0) === true,
    "红了＝这个样本压根构不成 A03 的反例，上面的断言是空的");
}

console.log("\n【4】动作模型：提示与实际推进同源（审计 A06）");
{
  TST.scenes.length = 0;
  addScenes(scene({
    id: "hidden_all", lines: ["只有一句"],
    choices: [{ text: "需甲", cond: { flag: "no_such_flag" }, next: "x" }],
    next: "y",
  }));
  TST.scenes.push(scene({ id: "x", lines: ["x"] }), scene({ id: "y", lines: ["y"] }));
  const s = TST.scenes[0]!;
  const st = { ...mkState(), lineIndex: lastRealLine(resolveSceneLines(s, mkState())) };
  const act = availableActions(TST, s, st);
  ok("选项全被 cond 挡掉 + 有 next → 动作是 next（于是「▼ 继续」亮着就一定点得动）", act.kind === "next" && act.sceneId === "y", JSON.stringify(act));
  const shown = visibleChoices(s, st);
  ok("同一状态下屏上确实零选项", shown.length === 0);
  const unlocked = availableActions(TST, s, { ...st, flags: new Set(["no_such_flag"]) });
  ok("旗标补上后同一幕变成 choices", unlocked.kind === "choices");
  TST.scenes[0] = scene({ id: "hidden_all", lines: ["只有一句"], choices: [{ text: "需甲", cond: { flag: "no_such_flag" }, next: "x" }] });
  const dead = availableActions(TST, TST.scenes[0]!, st);
  ok("零可见选项且没有 next → none（这就是硬死锁，hublock 按同一判据扫全库）", dead.kind === "none");
}

console.log("\n【5】正文推进：幕尾空行不算「还有内容没读」");
{
  const withTail = ["甲", "乙", "", "丙", ""];
  eq("lastRealLine 指向最后一个非空行", lastRealLine(withTail), 3);
  eq("空数组不返回负数", lastRealLine([]), 0);
  eq("长卷档一次揭满一段（停在排版空行）", nextLineIndex(withTail, 0, false), 2);
  eq("对白档一次一句", nextLineIndex(withTail, 0, true), 1);
  eq("封顶在最后一行有效内容，不落在幕尾空行", nextLineIndex(withTail, 3, false), 3);
}

console.log("\n【6】相位解析：同一幕在首次进入/读档/回退三条路径上只有一个答案（审计 A01）");
{
  TST.scenes.length = 0;
  const shopScene = scene({ id: "market", lines: ["夜市"], next: "market_gate", shop: { name: "京师夜市", stock: [] } });
  const duelScene = scene({ id: "duel1", lines: ["开打"], duel: "d1" });
  const endScene = scene({ id: "fin", lines: ["收束"], ending: { name: "终", rank: "甲", desc: "" } });
  const pickScene = scene({ id: "pick1", lines: ["三张"], cardPick: { title: "选", options: [], next: "fin" } });
  const miniScene = scene({ id: "mini", lines: ["一局"], minigame: { type: "duilian", winNext: "fin", loseNext: "fin" } });
  TST.scenes.push(scene({ id: "s1", lines: ["普通"] }), shopScene, duelScene, endScene, pickScene, miniScene);
  TST.duels = [{ id: "d1", mode: "pressure", title: "", intro: "", opponent: { name: "", desc: "" }, script: ["策"], deck: [], winScene: "fin", loseScene: "fin" }];
  eq("商市幕 → shop", resolveScenePhase(TST, shopScene), "shop");
  eq("对局幕（配置存在）→ duel", resolveScenePhase(TST, duelScene), "duel");
  eq("结局幕 → ending", resolveScenePhase(TST, endScene), "ending");
  eq("翻牌幕 → pick", resolveScenePhase(TST, pickScene), "pick");
  eq("小游戏幕 → minigame", resolveScenePhase(TST, miniScene), "minigame");
  eq("普通幕 → story", resolveScenePhase(TST, TST.scenes[0]!), "story");
  TST.duels = [];
  eq("对局幕但配置查不到 → story（与旧 fallthrough 同口径）", resolveScenePhase(TST, duelScene), "story");

  // 真实数据里的那条复现路径：fuma「京师夜市」→ 离开 → 退回，必须还是商店界面
  const fm = fuma.scenes.find((s) => s.id === "market");
  ok("fuma/market 是商市幕", !!fm && resolveScenePhase(fuma, fm) === "shop", fm ? `实得 ${resolveScenePhase(fuma, fm)}` : "没找到 market 幕");

  // 源码级闸：三条路径都必须走 dispatchView；setPhase("story") 这个字面量除 dispatch 兜底外不许再出现。
  // 计数前先剔掉整行注释——本轮解释旧 bug 的注释里就写着这个字面量，照原文数会自己咬自己一口
  // （局限：写在行尾的 // 注释仍会被数进去；要绕过这条闸只能真的把相位分派写回 App，那正是它拦的事）。
  const appSrc = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf-8");
  const codeOnly = appSrc.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const storyLiterals = (codeOnly.match(/setPhase\("story"\)/g) ?? []).length;
  ok('App.tsx 代码里 setPhase("story") 出现 0 次（相位一律由 resolveScenePhase 决定）', storyLiterals === 0, `实得 ${storyLiterals} 次`);
  const dispatchSites = (codeOnly.match(/dispatchView\(/g) ?? []).length;
  ok("dispatchView 调用点 ≥ 5（gotoFrom / start / resume / restorePrev / 对局定格各一处）", dispatchSites >= 5, `实得 ${dispatchSites} 处`);
  const phaseLiterals = (codeOnly.match(/setPhase\(/g) ?? []).length;
  console.log(`      （自报命中数：App.tsx 里 setPhase( 共 ${phaseLiterals} 处，其中相位取值只应来自 resolveScenePhase 或 title/duel 这类显式收束）`);
}

console.log("\n【7】cloneRunState：内层集合逐个重建，survey 的二级数组也不例外");
{
  const a = mkState({ flags: new Set(["x"]), survey: { s1: ["p1"] } });
  const b = cloneRunState(a);
  b.flags.add("y");
  b.survey!.s1 = [...(b.survey!.s1 ?? []), "p2"];
  ok("改副本不动原件", a.flags.size === 1 && (a.survey!.s1 ?? []).length === 1);
  ok("副本确实带着两处新增", b.flags.size === 2 && (b.survey!.s1 ?? []).length === 2);
}

console.log("\n【8】存档契约：非法数据进不了游戏（审计 A04）");
{
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  const save = await import("../src/engine/save.ts");
  const wire = { scenarioId: "fuma", sceneId: "hub", lineIndex: 0, flags: [], stats: {}, clues: [], bag: [], deck: [], boosts: [], visited: [], silver: 0 };
  const bad: [string, Record<string, unknown>][] = [
    ["stats 为 null", { state: { ...wire, stats: null } }],
    ["flags 混进非字符串", { state: { ...wire, flags: ["ok", 7] } }],
    ["bag 混进非字符串卡 id", { state: { ...wire, bag: [null] } }],
    ["silver 是字符串", { state: { ...wire, silver: "50" } }],
    ["lineIndex 为负", { state: { ...wire, lineIndex: -1 } }],
    ["wagers 不是整数", { state: { ...wire, wagers: 1.5 } }],
    ["survey 账本值不是数组", { state: { ...wire, survey: { s1: "p1" } } }],
    ["duel.mode 非法", { state: wire, duel: { cfgId: "d_x", data: { mode: "chaos", round: 1, hpPlayer: 5, hpOpponent: 5 } } }],
    ["duel.hand 不是字符串数组", { state: wire, duel: { cfgId: "d_x", data: { mode: "pressure", round: 1, hpPlayer: 5, hpOpponent: 5, hand: [3] } } }],
    ["duel 段缺 cfgId", { state: wire, duel: { data: { mode: "pressure", round: 1, hpPlayer: 5, hpOpponent: 5 } } }],
    ["duel.round 是字符串", { state: wire, duel: { cfgId: "d_x", data: { mode: "pressure", round: "1", hpPlayer: 5, hpOpponent: 5 } } }],
  ];
  let rejected = 0;
  for (const [name, payload] of bad) {
    store.clear();
    store.set("dicun_save_v4", JSON.stringify({ version: 4, scenarioId: "fuma", savedAt: 1, ...payload }));
    const got = save.loadGame();
    const reason = save.consumeSaveRejectReason();
    const quarantined = store.has("dicun_save_bad_v4");
    const liveGone = !store.has("dicun_save_v4");
    if (got === null && reason && quarantined && liveGone) rejected++;
    else console.error(`    · ${name} 未被拒绝（loadGame 返回 ${got ? "档" : "null"}，理由=${reason}，备份=${quarantined}，摘除=${liveGone}）`);
  }
  ok(`非法存档 ${bad.length} 例全部拒绝并备份`, rejected === bad.length, `拒绝 ${rejected}/${bad.length}`);

  // 好档必须照样进得来（否则上面那条"全拒绝"可能只是校验写死了）
  store.clear();
  const good = mkState({ scenarioId: "fuma", sceneId: "hub", flags: new Set(["a"]), silver: 12 });
  save.saveGame("fuma", good);
  const back = save.loadGame();
  ok("正常存档读写往返", !!back && back.scenarioId === "fuma" && back.state.silver === 12 && [...back.state.flags].join() === "a");
  ok("flags 从数组还原成 Set", back instanceof Object && (back.state.flags instanceof Set) && back.state.flags.has("a"));

  // 高版本档：拒绝载入但绝不清档（C-6）
  store.clear();
  store.set("dicun_save_v4", JSON.stringify({ version: 99, scenarioId: "fuma", state: {}, savedAt: 1 }));
  const fut = save.loadGame();
  ok("高版本档标记 future", !!(fut as { future?: boolean })?.future);
  ok("高版本档没有被删", store.has("dicun_save_v4"));
  save.consumeSaveRejectReason();
}

console.log("\n【9】旧版本存档：迁移落新键 + 清档连带旧键（审计 A08）");
{
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  const save = await import("../src/engine/save.ts");
  const v3 = { version: 3, scenarioId: "fuma", savedAt: 1, state: { ...mkState({ scenarioId: "fuma", sceneId: "hub" }), flags: [] } };
  store.set("dicun_save_v3", JSON.stringify(v3));
  const migrated = save.loadGame();
  ok("v3 档读得通", !!migrated && migrated.scenarioId === "fuma");
  ok("读到的瞬间已改写回当前键", store.has("dicun_save_v4"));
  ok("旧键随即作废", !store.has("dicun_save_v3"));
  save.consumeSaveRejectReason();
  save.clearSave();
  ok("清档后 loadGame 不再从旧键把进度捞回来", save.loadGame() === null && !store.has("dicun_save_v3"));
  store.set("dicun_save_v3", JSON.stringify(v3));
  save.clearSave();
  ok("清档连带删除历史键（哪怕当前键本来就没有档）", !store.has("dicun_save_v3"));
}

console.log("\n【10】对局中途存档往返：资源/手牌/回合刷新后完全一致");
{
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  const save = await import("../src/engine/save.ts");
  const { initDuel, setDuelShuffle } = await import("../src/engine/duel.ts");
  setDuelShuffle((a: string[]) => a);
  const cfg = ALL.flatMap((s) => s.duels).find((d) => d.rules === "v2" && d.mode === "pressure");
  if (!cfg) ok("找到一场 v2 压制局做往返样本", false, "剧本里一场都没有");
  else {
    const sc = ALL.find((s) => s.duels.includes(cfg))!;
    const st = initState(sc);
    const d = initDuel(cfg, st.deck.length ? st.deck : cfg.deck, sc.cards);
    d.ap = 3; d.hand = [d.library[0] ?? "x"]; d.round = 2; d.hpPlayer = 7;
    const { cfg: _c, ...rest } = d;
    void _c;
    save.saveGame(sc.id, st, { cfgId: cfg.id, data: rest, wager: 20 });
    const back = save.loadGame();
    const wire = back?.duel?.data as Record<string, unknown> | undefined;
    ok(`对局 ${cfg.id} 存档往返：round/hp/ap/手牌一致`,
      !!wire && wire.round === 2 && wire.hpPlayer === 7 && wire.ap === 3 && JSON.stringify(wire.hand) === JSON.stringify(d.hand),
      wire ? `实得 round=${wire.round} hp=${wire.hpPlayer} ap=${wire.ap} hand=${JSON.stringify(wire.hand)}` : "无 duel 段");
    ok("押注随档落盘（败局前刷新不再免单）", back?.duel?.wager === 20);
  }
}

console.log("\n【11】虚张去固定哈希：本局盐进哈希、可注入、同盐同序（审计·玩法风险一）");
{
  const { initDuel, revealEmotion, setDuelSeedSource } = await import("../src/engine/duel.ts");
  const target = ALL.map((s) => ({ sc: s, cfg: s.duels.find((d) => d.mode === "emotion" && d.gambit) }))
    .find((x) => !!x.cfg);
  if (!target?.cfg) ok("找到一场 gambit 情绪局做样本", false, "剧本里一场都没有");
  else {
    const { sc } = target;
    // 变体池是 initDuel 里另一处 Math.random（B-1）：不钉死它，"同盐同序"测的其实是变体抽没抽重。
    // 与 verify.mts 同一手法——钉住 script 并清掉 scriptVariants。
    const cfg = target.cfg.scriptVariants?.length
      ? { ...target.cfg, script: target.cfg.scriptVariants[0]!, scriptVariants: undefined }
      : target.cfg;
    setDuelSeedSource(() => 7);
    ok("种子源可注入（验证器钉死同一把尺）", initDuel(cfg, cfg.deck, sc.cards).runSeed === 7);
    setDuelSeedSource(null);
    const a = initDuel(cfg, cfg.deck, sc.cards), b = initDuel(cfg, cfg.deck, sc.cards);
    ok("游戏内每局各摇各的（两次 initDuel 的 runSeed 不同）", a.runSeed !== b.runSeed, `${a.runSeed} vs ${b.runSeed}`);
    const seq = (seed: number): string => {
      const d = initDuel(cfg, cfg.deck, sc.cards);
      d.runSeed = seed;
      const out: string[] = [];
      for (let r = 0; r < 12; r++) {
        d.round = r; d.opponentShown = null; d.bluffed = false;
        revealEmotion(d);
        out.push(`${d.bluffed ? "B" : "-"}${d.opponentShown ?? "?"}`);
      }
      return out.join(",");
    };
    ok("同盐同序（续档/回档复现同一串虚张）", seq(42) === seq(42));
    ok("换盐换序列（盐真的进了哈希，不是挂着不用）", seq(0) !== seq(42), "若这条不红，加盐等于没加");
    ok("旧档无 runSeed 按 0 处理（不摇散玩家手里的残局）",
      (() => { const d = initDuel(cfg, cfg.deck, sc.cards); d.runSeed = undefined; d.round = 0; d.opponentShown = null; revealEmotion(d);
        const e = initDuel(cfg, cfg.deck, sc.cards); e.runSeed = 0; e.round = 0; e.opponentShown = null; revealEmotion(e);
        return d.opponentShown === e.opponentShown && d.bluffed === e.bluffed; })());
  }
}

console.log(`\n========== 状态一致性：${checks} 项断言 / ${failures} 失败 ==========`);
if (failures) process.exit(1);
