// 忠实复现情绪制 v2 在「真实 UI」与「理想 UI」下的表现，验证软锁根因。
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
import type { Scenario, CardDef } from "../src/engine/types.ts";
import { initDuel, revealEmotion, playEmotion, endTurn, type DuelState } from "../src/engine/duel.ts";

const ALL: Scenario[] = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];

function v2Loadout(sc: Scenario): string[] {
  return sc.cards.filter((c) => (c.layer ?? "成术") !== "资源").map((c) => c.id);
}
const co = (sc: Scenario) => (id: string): CardDef => {
  const c = sc.cards.find((x) => x.id === id);
  if (!c) throw new Error(`卡牌不存在 ${id}`);
  return c;
};

// 真实 UI 模型：情绪制下 换气按钮被禁（App.tsx doEndTurn 直接 return），AP 永不回补。
function simRealUI(sc: Scenario, cfg: any): { finished: string | null; rapport: number; goal: number; qi: number; ap: number; steps: number } {
  const pool = v2Loadout(sc);
  const d = initDuel(cfg, pool, sc.cards);
  revealEmotion(d);
  const cfn = co(sc);
  let steps = 0;
  // 玩家尽量用最优策略：同色优先，否则对色破防；AP 不足则停手（真实 UI 不能换气）
  for (let i = 0; !d.finished && i < 200; i++) {
    const shown = d.opponentShown!;
    const OPP: Record<string, string> = { 策: "势", 势: "器", 器: "策" };
    const same = pool.filter((id) => cfn(id).suit === shown && (cfn(id).layer ?? "成术") === "成术");
    const oppSame = pool.filter((id) => OPP[cfn(id).suit ?? ""] === shown && (cfn(id).layer ?? "成术") === "成术");
    // 选可承受费用的最高价值牌
    const cand = (same[0] ? [same[0]] : []).concat(oppSame[0] ? [oppSame[0]] : []);
    const playable = cand.filter((id) => d.ap >= cardCostLocal(cfn(id)));
    if (playable.length === 0) {
      // 真实 UI：不能换气 → 无法行动也赢不了 → 死锁（跳出）
      break;
    }
    const ok = playEmotion(d, cfn(playable[0]!));
    if (!ok) break;
    steps++;
    if (!d.finished) revealEmotion(d);
  }
  return { finished: d.finished, rapport: d.rapport, goal: cfg.goal ?? 3, qi: d.qi, ap: d.ap, steps };
}

// 理想 UI 模型：AP 不足则 endTurn 回补（等价于 verify.mts 的 endTurn(d)）
function simIdealUI(sc: Scenario, cfg: any): { finished: string | null; steps: number } {
  const pool = v2Loadout(sc);
  const d = initDuel(cfg, pool, sc.cards);
  revealEmotion(d);
  const cfn = co(sc);
  const OPP: Record<string, string> = { 策: "势", 势: "器", 器: "策" };
  let steps = 0;
  for (let i = 0; !d.finished && i < 400; i++) {
    const shown = d.opponentShown!;
    const same = pool.filter((id) => cfn(id).suit === shown && (cfn(id).layer ?? "成术") === "成术");
    const oppSame = pool.filter((id) => OPP[cfn(id).suit ?? ""] === shown && (cfn(id).layer ?? "成术") === "成术");
    const cand = (same[0] ? [same[0]] : []).concat(oppSame[0] ? [oppSame[0]] : []);
    const playable = cand.filter((id) => d.ap >= cardCostLocal(cfn(id)));
    if (playable.length === 0) { endTurn(d); continue; }
    playEmotion(d, cfn(playable[0]!));
    steps++;
    if (!d.finished) revealEmotion(d);
  }
  return { finished: d.finished, steps };
}

function cardCostLocal(c: CardDef): number {
  if (c.cost !== undefined) return c.cost;
  if ((c.layer ?? "成术") === "物品") return 2;
  const p = c.power ?? 1;
  return p >= 4 ? 3 : p >= 3 ? 2 : 1;
}

console.log("=== 情绪制 v2：真实 UI（换气被禁）vs 理想 UI（换气可用）===\n");
let realSoftlock = 0, idealWin = 0, total = 0;
for (const sc of ALL) {
  for (const cfg of sc.duels) {
    if (cfg.mode !== "emotion" || cfg.rules !== "v2") continue;
    total++;
    const r = simRealUI(sc, cfg);
    const ideal = simIdealUI(sc, cfg);
    const softlocked = !r.finished;
    if (softlocked) realSoftlock++;
    if (ideal.finished === "win") idealWin++;
    console.log(
      `${sc.id}/${cfg.id}: 真实UI=${r.finished ?? "死锁(软锁)"} ` +
      `(共鸣${r.rapport}/${r.goal},气力${r.qi},AP${r.ap},出牌${r.steps}) | ` +
      `理想UI=${ideal.finished ?? "未终"} (${ideal.steps}步)`
    );
  }
}
console.log(`\n汇总：情绪制v2对局 ${total} 个 → 真实UI软锁 ${realSoftlock} 个；理想UI可胜 ${idealWin} 个`);
