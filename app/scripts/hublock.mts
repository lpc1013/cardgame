// ============================================================
// 零选项死锁可达性分析（verify.mts 那 7 条 warn 的后半问）
//
// verify 的静态闸只能问"这一幕有没有无条件出口"；hublock 量的是
// "把 cond 反着喂到最坏情况，屏上还剩几个可见选项"——答案是全 0，也就是**锁得住**。
// 但"锁得住的状态走不走得到"是另一个问题：notFlag 是"做过就藏"、flag 是"没做才给看"、
// cluesAtLeast 又是数值，三者极性不同，拿一两层追溯去猜会两头都错
// （本仓已因此误报过一次"死旗 + 结局永久不可达"，改了数据才发现是自己读错）。
//
// 所以这里不猜：从 initState 出发，沿真实选项图做前向 BFS，
// 判定条件、可见选项与"这一幕还剩什么动作"一律走 engine/transition.ts 的 availableActions
// （内部用 runtime.checkCond / visibleChoices / applyEffects）——与游戏同一份实现。
// 审计 A06（2026-10-13）要的就是这条口径：验证器认定可以走的动作，玩家界面必须真实可执行；
// 反过来，界面点得动的动作，验证器也不许凭空多画。两边各算一套就永远对不上。
//
// 2026-10-13 起：范围从"verify 报过 warn 的 7 幕"扩到全部 13 部剧本的全部幕。
// 原先的 TARGETS 名单是手抄的，新增一幕真锁住了，名单里没有它 ⇒ 闸照样绿。
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
import type { Scenario, Scene, Effect } from "../src/engine/types.ts";
import { applyEffects, checkCond, findScene, initState, resolveSceneLines, visibleChoices } from "../src/engine/runtime.ts";
import { availableActions, enterScene, lastRealLine } from "../src/engine/transition.ts";
import { SURVEYS, spotCost, foundSpots, surveyLeft } from "../src/data/survey.ts";

const ALL: Scenario[] = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];

const MAX_STATES = 300_000;

type St = ReturnType<typeof initState>;

/** 状态指纹：幕 + 旗标集 + 线索集 + 会进 cond 的那些数值。
 *  数值取整表，不然 statAtLeast 的可达性量不出来；背包只留卡 id 集合（cond.card 读它）。 */
function key(sc: Scenario, s: St): string {
  const st = Object.entries(s.stats).map(([k, v]) => `${k}=${v}`).sort().join(",");
  return `${s.sceneId}|${[...s.flags].sort().join(",")}|${[...s.clues].sort().join(",")}|${st}|${[...new Set(s.bag)].sort().join(",")}|${s.silver}`;
}

/** 落地到一幕：与游戏 gotoFrom 同一条转移——先结算本步效果（选项/翻牌所得），再走 enterScene
 *  （切坐标 + 结算目标幕的进幕 effects）。旧版 hublock 只结算了前者，
 *  于是进幕发的那些旗标/线索在它图上根本不存在。 */
const land = (sc: Scenario, base: St, sceneId: string, effects?: Effect[]): St | null => {
  if (!sceneId || !sc.scenes.some((s) => s.id === sceneId)) return null;
  return enterScene(applyEffects(effects, base), findScene(sc, sceneId));
};

/** 这一幕读到幕末时的状态：正文推进不改旗标/线索，只把 lineIndex 顶到最后一行有效内容 */
function atSceneEnd(sc: Scenario, scene: Scene, s: St): St {
  return { ...s, lineIndex: lastRealLine(resolveSceneLines(scene, s)) };
}

let hardFail = 0;
let truncatedScen = 0;

for (const arg of process.argv.slice(2)) {
  if (!ALL.some((s) => s.id === arg)) { console.error(`未知剧本 ${arg}`); process.exit(2); }
}
const argv = process.argv.slice(2);
const scope = argv.length ? ALL.filter((sc) => argv.includes(sc.id)) : ALL;

for (const sc of scope) {
  const seen = new Set<string>();
  const locked: { scene: string; flags: string[]; clues: number; silver: number }[] = [];
  const reached = new Set<string>();
  const q: St[] = [initState(sc)];
  // 多视角剧本：起手只走 sc.startScene 的话，另一个视角的整条支线从图上消失，
  // 于是"没走到"会被报成"安全"。shumian（十面埋伏·主/将双视角）就是这样漏掉 a2_guling_lose 的。
  for (const vp of sc.viewpoints ?? []) q.push(initState(sc, vp.id));
  let n = 0, truncated = false;

  while (q.length) {
    if (n++ > MAX_STATES) { truncated = true; break; }
    const st = q.shift()!;
    const k = key(sc, st);
    if (seen.has(k)) continue;
    seen.add(k);
    let scene: Scene;
    try { scene = findScene(sc, st.sceneId); } catch { continue; }
    reached.add(st.sceneId);
    // 唯一判据：与界面同一个 availableActions。kind==="none" 就是"读到幕末，屏上没有选项、
    // 也没有 next 可点"——玩家被困在这一幕，除了退回上一幕/清档没有第二条路。
    if (availableActions(sc, scene, atSceneEnd(sc, scene, st)).kind === "none") {
      locked.push({ scene: st.sceneId, flags: [...st.flags].sort(), clues: st.clues.length, silver: st.silver });
      continue; // 死锁状态不再外扩，免得把可达图污染成"哪都能去"
    }
    const push = (s: St | null) => { if (s) q.push(s); };
    // ① 恒可走：对局胜/败、结案胜/败、翻牌续幕、市集离开、小游戏胜败——由引擎/结算决定，与屏上有几个选项无关
    if (scene.duel) {
      const d = sc.duels.find((x) => x.id === scene.duel);
      if (d) {
        push(land(sc, st, d.winScene));
        // 条件败线（loseScene2）与 App 结算同口径：旗标满足才走那条。旧版把它整个漏了，
        // diaolan 的 end_ninegates 就是这样"图上走不到"的——闸看不见一条败线分支，等于没验。
        const lose2 = d.loseScene2 && checkCond(d.loseScene2.cond, st) ? d.loseScene2.scene : null;
        push(land(sc, st, lose2 ?? d.loseScene));
      }
    }
    if (sc.verdict && scene.id === sc.verdict.scene) {
      push(land(sc, st, sc.verdict.winScene)); push(land(sc, st, sc.verdict.loseScene));
    }
    if (scene.cardPick) {
      // 三张候选各扩一条边：翻到的卡进 bag，cond.card / notCard 的判定因此跟着变，
      // 不把三条并成一条"随便挑"——那样等于假设玩家总能挑到需要的那张
      for (const id of scene.cardPick.options) push(land(sc, st, scene.cardPick.next, [{ unlockCard: id }]));
    }
    if (scene.shop) {
      // 两条购物线都扩：
      //  ①「什么都没买」——玩家随时可以不掏钱，这条一定走得通；
      //  ②「货架/暗柜/卡包池全拿到」——不扣银的上界，只为把「必须持有某张货架卡才露出来的那条选项」
      //    纳入可达图（qiuwei 的恩科/白绫两个结局此前在图上压根不存在）。
      //  卡的获得在本模型里单调增可视（cond.card 只会因有卡而显形），所以②只会少报锁、不会虚报锁。
      //  唯一的反向极性是 cond.notCard——「买了就把这条路藏起来」——本脚本按 notCard 名单把这些卡从②里剔除；
      //  verify.mts 另有一条闸保证「notCard 引用的卡不得在市集出售」，两边共同兜住这个前提。
      push(land(sc, st, scene.next2 ?? scene.next ?? ""));
      const banned = new Set<string>();
      for (const s2 of sc.scenes) for (const c of s2.choices ?? []) if (c.cond?.notCard) banned.add(c.cond.notCard);
      const grant = [...scene.shop.stock, ...(scene.shop.hiddenStock ?? []).map((h) => h.id),
        ...(scene.shop.packs ?? []).flatMap((p) => p.pool)].filter((id) => !banned.has(id));
      push(land(sc, st, scene.next2 ?? scene.next ?? "", grant.map((id) => ({ unlockCard: id }))));
    }
    if (scene.minigame) {
      push(land(sc, st, scene.minigame.winNext)); push(land(sc, st, scene.minigame.loseNext));
    }
    // ③ 现场勘查：这一幕有现场就扩「点某处热点」的自环边（不换幕，只增线索/卡）。
    //    格数账与游戏同一份——以 st.survey[幕id] 里"已入卷的热点"本身当账，超预算的那条走不到。
    //    不建模勘查的代价是真实的：勘查给的线索会点亮 cond.clue / cluesAtLeast 的选项，
    //    漏掉它就漏掉一整条支线可达性（qiuwei 的恩科/白绫两幕此前在图上不存在）。
    const sv = SURVEYS[sc.id]?.[st.sceneId];
    if (sv) {
      const found = foundSpots(st.survey, st.sceneId);
      for (const spot of sv.spots) {
        if (found.includes(spot.id)) continue;
        if (surveyLeft(sv, found) < spotCost(spot)) continue;
        const withSpot = applyEffects(spot.effects, st);
        withSpot.survey = { ...(withSpot.survey ?? {}), [st.sceneId]: [...found, spot.id] };
        push(withSpot);
      }
    }
    // ② 幕末的选项/续幕边：有可见选项时只能选，零可见选项时「继续（点击画面）」那条 next 边才存在——
    //    两者互斥，这正是 availableActions 的分支顺序。把它们当同时可走会凭空造出到不了的状态
    //    （第一版就在 changhen 上凭空造出两个"硬死锁"）。
    const vis = visibleChoices(scene, st);
    if (vis.length > 0) {
      for (const c of vis) {
        // 与 takeChoice 同口径：分支按「做选择之前」的状态判，效果之后才落（审计 A03）
        const nid = checkCond(c.cond, st) ? c.next : (c.altNext ?? c.next);
        push(land(sc, st, nid, c.effects));
      }
    } else if (scene.next) {
      push(land(sc, st, scene.next));
    }
  }

  if (truncated) truncatedScen++;
  const neverReached = sc.scenes.filter((s) => !reached.has(s.id)).map((s) => s.id);
  console.log(`\n【${sc.id}】状态 ${seen.size} 个${truncated ? "（触顶截断，结论只覆盖已展开部分）" : "（穷尽）"}，走过 ${reached.size}/${sc.scenes.length} 幕`);
  if (locked.length) {
    hardFail += locked.length;
    const byScene = new Map<string, typeof locked>();
    for (const l of locked) (byScene.get(l.scene) ?? byScene.set(l.scene, []).get(l.scene)!).push(l);
    for (const [sid, ls] of byScene) {
      const l = ls[0]!;
      console.log(`  ✗ ${sid}: 可达且幕末零动作（共 ${ls.length} 个这样的状态）—— 真硬死锁。样例旗标 ${l.flags.join(",") || "（无）"}，线索 ${l.clues} 条，银两 ${l.silver}`);
    }
  }
  if (neverReached.length) {
    // "没发现死锁"和"根本没走到这一幕"长得一模一样。截断时尤其要说清：这次分析对它们什么都没验。
    console.log(`  · 本次未走到 ${neverReached.length} 幕：${neverReached.join(",")}`);
    if (truncated) console.log("    （因状态数触顶而中断，不能据此说这些幕安全）");
  }
  if (!locked.length) console.log(`  ✓ 走到的每一幕幕末都至少还剩一个可执行动作${neverReached.length ? "（未走到的见上）" : ""}`);
}

const summary = hardFail
  ? `\n${hardFail} 个可达零动作状态（真硬死锁）—— 见上`
  : `\n全部走得到的幕末都有得点：无硬死锁（本次范围 ${scope.length}/${ALL.length} 部${truncatedScen ? `，其中 ${truncatedScen} 部状态数触顶，结论只覆盖已展开部分` : "，全部穷尽"}）`;
console.log(summary);
if (hardFail) process.exit(1);
