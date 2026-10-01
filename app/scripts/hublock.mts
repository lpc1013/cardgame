// ============================================================
// 零选项死锁可达性分析（verify.mts 那 7 条 warn 的后半问）
//
// verify 的静态闸只能问"这一幕有没有无条件出口"；hublock_qa 量的是
// "把 cond 反着喂到最坏情况，屏上还剩几个可见选项"——答案是全 0，也就是**锁得住**。
// 但"锁得住的状态走不走得到"是另一个问题：notFlag 是"做过就藏"、flag 是"没做才给看"、
// cluesAtLeast 又是数值，三者极性不同，拿一两层追溯去猜会两头都错
// （本仓已因此误报过一次"死旗 + 结局永久不可达"，改了数据才发现是自己读错）。
//
// 所以这里不猜：从 initState 出发，沿真实选项图做前向 BFS，
// 判定条件与可见选项一律走 runtime.ts 的 checkCond / visibleChoices / applyEffects——
// 与游戏同一份实现，不会我这边算出一套语义、玩家那边是另一套。
// 到达目标幕时若存在一个"可见选项为 0"的状态，即真硬死锁。
//
//   node --experimental-strip-types scripts/hublock.mts [scenarioId ...]
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
import type { Scenario, Scene } from "../src/engine/types.ts";
import { applyEffects, findScene, initState, visibleChoices } from "../src/engine/runtime.ts";

const ALL: Scenario[] = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];

/** verify.mts 报出来的 7 幕（4 部剧本） */
const TARGETS: Record<string, string[]> = {
  sichou: ["hub"],
  qinhuai: ["hub"],
  shumian: ["a2_guling_lose", "a3_after"],
  changhen: ["final", "epilogue_cut", "epilogue_oath"],
};

const MAX_STATES = 300_000;

type St = ReturnType<typeof initState>;

/** 换幕：把 Set / 数组全部拷一份，交给 applyEffects 去改——
 *  applyEffects 是就地改对象的，不拷就会把队列里其他状态一起改了 */
function step(st: St, sceneId: string): St {
  return {
    ...st, sceneId, lineIndex: 0,
    flags: new Set(st.flags), clues: [...st.clues], stats: { ...st.stats },
    bag: [...st.bag], deck: [...st.deck], boosts: [...st.boosts],
    retinue: [...st.retinue], visited: [...st.visited], usedCards: [...st.usedCards],
  };
}

/** 状态指纹：幕 + 旗标集 + 线索集 + 会进 cond 的那些数值。
 *  数值取整表，不然 statAtLeast 的可达性量不出来；背包只留卡 id 集合（cond.card 读它）。 */
function key(sc: Scenario, s: ReturnType<typeof initState>): string {
  const st = Object.entries(s.stats).map(([k, v]) => `${k}=${v}`).sort().join(",");
  return `${s.sceneId}|${[...s.flags].sort().join(",")}|${[...s.clues].sort().join(",")}|${st}|${[...new Set(s.bag)].sort().join(",")}|${s.silver}`;
}

/** 一幕的"下一站"集合。分两类，混用会凭空造出走得到的状态：
 *  ① 恒可走：对局胜/败落点、结案胜/败——这些由引擎/结算决定，与屏上有几个选项无关。
 *  ② 只在"没有任何可见选项"时才存在：choice.next / choice.altNext / scene.next。
 *     App.tsx 里 `atEnd && choices.length > 0` 才渲染选项、`choices.length === 0 && scene.next`
 *     才渲染"继续"——两者互斥。把 ② 当恒可走铺上去，等于允许玩家既选分支又走 next，
 *     于是能凑出真实游戏到不了的旗标组合（第一版就在 changhen 上凭空造出两个"硬死锁"）。 */
function alwaysExits(sc: Scenario, scene: Scene): string[] {
  const out: string[] = [];
  if (scene.duel) {
    const d = sc.duels?.find((x) => x.id === scene.duel);
    if (d) out.push(d.winScene, d.loseScene);
  }
  const v = sc.verdict;
  if (v && scene.id === v.scene) out.push(v.winScene, v.loseScene);
  return out.filter((x) => sc.scenes.some((s) => s.id === x));
}
function conditionalExits(scene: Scene): string[] {
  const out: string[] = [];
  for (const c of scene.choices ?? []) {
    if (c.next) out.push(c.next);
    if (c.altNext) out.push(c.altNext);
  }
  if (scene.next) out.push(scene.next);
  return out;
}

let hardFail = 0;

for (const arg of process.argv.slice(2)) {
  if (!ALL.some((s) => s.id === arg)) { console.error(`未知剧本 ${arg}`); process.exit(2); }
}
const scope = process.argv.slice(2).length
  ? ALL.filter((sc) => process.argv.slice(2).includes(sc.id))
  : ALL.filter((sc) => TARGETS[sc.id]);

for (const sc of scope) {
  const targets = new Set(TARGETS[sc.id] ?? []);
  const seen = new Set<string>();
  const locked: { scene: string; flags: string[]; clues: number }[] = [];
  const reached = new Set<string>();
  const q: St[] = [initState(sc)];
  // 多视角剧本：起手只走 sc.startScene 的话，另一个视角的整条支线从图上消失，
  // 于是"没走到"会被报成"安全"。shumian（十面埋伏·主/将双视角）就是这样漏掉 a2_guling_lose 的。
  for (const vp of sc.viewpoints ?? []) q.push(initState(sc, vp.id));
  let n = 0, truncated = false;

  while (q.length) {
    const st = q.shift()!;
    if (n++ > MAX_STATES) { truncated = true; break; }
    const k = key(sc, st);
    if (seen.has(k)) continue;
    seen.add(k);
    let scene: Scene;
    try { scene = findScene(sc, st.sceneId); } catch { continue; }
    reached.add(st.sceneId);
    const vis = visibleChoices(scene, st);
    // 这一幕有没有别的出路：线性 next / 结案 / 对局 / 翻牌 / 商市 / 小游戏都算活着
    const hasOtherExit = !!(scene.next || scene.duel || scene.cardPick || scene.shop || scene.minigame || scene.ending);
    if (targets.has(st.sceneId) && vis.length === 0 && !hasOtherExit) {
      locked.push({ scene: st.sceneId, flags: [...st.flags].sort(), clues: st.clues.length });
      continue; // 死锁状态不再外扩，免得把可达图污染成"哪都能去"
    }
    // 对局胜/败、结案胜/败：与屏上有几个选项无关，恒可走
    for (const nid of alwaysExits(sc, scene)) {
      if (vis.some((c) => (c.next || c.altNext) === nid)) continue;
      q.push(step(st, nid));
    }
    for (const c of vis) {
      const nextId = c.next || c.altNext;
      if (!nextId || !sc.scenes.some((s) => s.id === nextId)) continue;
      const nxt = step(st, nextId);
      applyEffects(c.effects, nxt);
      q.push(nxt);
    }
    // 零可见选项时，"继续（点击画面）"这条 next 边才存在；有可见选项时它与选项互斥
    if (vis.length === 0) {
      for (const nid of conditionalExits(scene)) q.push(step(st, nid));
    }
  }

  const total = targets.size;
  const hit = new Set(locked.map((l) => l.scene));
  console.log(`\n【${sc.id}】状态 ${seen.size} 个${truncated ? "（触顶截断，结论只覆盖已展开部分）" : "（穷尽）"}，走过 ${reached.size}/${sc.scenes.length} 幕`);
  for (const t of [...targets]) {
    if (hit.has(t)) {
      hardFail++;
      const l = locked.find((x) => x.scene === t)!;
      console.log(`  ✗ ${t}: 可达且零选项 —— 真硬死锁。样例旗标 ${l.flags.join(",") || "（无）"}，线索 ${l.clues} 条`);
    } else if (!reached.has(t)) {
      // "没发现死锁"和"根本没走到这一幕"长得一模一样。后者说明这次分析什么都没验，
      // 报绿就是假绿——单独判一种结论，并且计入失败，逼下次来查图为什么断。
      hardFail++;
      console.log(`  ? ${t}: 起手图压根没走到这一幕 —— 本次分析对它是空转，不能据此说它安全（图断在对局/视角入口？）`);
    } else {
      console.log(`  ✓ ${t}: 到过（含零选项判定），所有可达状态都至少还剩一个可见出口`);
    }
  }
  // 顺带报一下这些幕到底靠什么活着，方便下次判断能不能把 warn 降成静默
  for (const t of [...targets]) {
    const s = sc.scenes.find((x) => x.id === t);
    if (!s) continue;
    const uncond = (s.choices ?? []).filter((c) => !c.cond || c.altNext).length;
    console.log(`      ${t}: 选项 ${(s.choices ?? []).length} 个，其中无条件/带 altNext ${uncond} 个；next=${s.next ?? "—"} 线索表 ${sc.clues?.length ?? 0} 条`);
  }
}

console.log(hardFail ? `\n${hardFail} 项待办（可达零选项 / 分析空转）—— 见上` : "\n全部目标幕均被走到且无可达零选项状态：warn 维持，不是待修的 bug");
process.exit(hardFail ? 1 : 0);
