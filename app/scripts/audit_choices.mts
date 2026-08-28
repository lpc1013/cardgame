/**
 * audit_choices.mts — 全剧本 choices 选择承接审计 v2
 * 口径修正：
 *  1. stat 消费点 = data 内 Choice.cond.statAtLeast + achievements.ts（按 scenario 归属）
 *  2. 案件剧本（有 verdict）线索由复盘机制消费，E 级豁免；无 verdict 剧本线索照报
 *  3. 新增 F 级：同 next + 全部选项 effects 完全相同 → 文字不同、效果相同（隐性零承接）
 * 分级：
 *  A 零承接   ：全部选项 next 相同 且 无任何实质 effects
 *  B 死旗/死数值：同 next，effects 的 flag/clue/stat 全剧本+成就零消费
 *  C 同文分流 ：不同 next 但目标场景 lines 完全相同
 *  D 死条件   ：cond 引用从未被 set 的 flag/clue（分支恒隐藏/恒显示）
 *  E 未消费线索：无 verdict 剧本中 unlockClue 后无 cond.clue/coreClue 引用
 *  F 同效选项 ：同 next 且所有选项 effects 完全相等 → 选项只是换了句话
 *  G 弱回响   ：flag 全剧本仅被引用 ≤1 次（文本差异可疑，人工复核）
 * 用法：node --experimental-strip-types scripts/audit_choices.mts
 */
import { jieyu } from "../src/data/jieyu.ts";
import { shumian } from "../src/data/shumian.ts";
import { changjiang } from "../src/data/changjiang.ts";
import { diaolan } from "../src/data/diaolan.ts";
import { changhen } from "../src/data/changhen.ts";
import { jianfeng } from "../src/data/jianfeng.ts";
import { xingxing } from "../src/data/xingxing.ts";
import { touming } from "../src/data/touming.ts";
import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";
import { ACHIEVEMENTS } from "../src/data/achievements.ts";
import type { Scenario, Scene, Choice, Effect } from "../src/engine/types.ts";

const SCENARIOS: { name: string; sc: Scenario }[] = [
  { name: "fuma", sc: fuma }, { name: "qiuwei", sc: qiuwei }, { name: "sichou", sc: sichou },
  { name: "xie", sc: xie }, { name: "qinhuai", sc: qinhuai }, { name: "jieyu", sc: jieyu },
  { name: "shumian", sc: shumian }, { name: "changjiang", sc: changjiang }, { name: "diaolan", sc: diaolan },
  { name: "changhen", sc: changhen }, { name: "jianfeng", sc: jianfeng }, { name: "xingxing", sc: xingxing },
  { name: "touming", sc: touming },
];

const EFFECT_KEYS = ["setFlag", "stat", "unlockClue", "unlockCard", "removeCard", "gainSilver", "spendSilver"] as const;

function hasSubstance(e?: Effect[]): boolean {
  if (!e || e.length === 0) return false;
  return e.some((x) => EFFECT_KEYS.some((k) => x[k as keyof Effect] !== undefined));
}
function effKey(e?: Effect[]): string {
  return JSON.stringify(e ?? []);
}

interface Issue { level: string; sceneId: string; title: string; detail: string; }

function audit(sc: Scenario): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(sc.scenes.map((s) => [s.id, s]));
  const flagSet = new Set<string>(), flagRef = new Set<string>();
  const clueUnlock = new Set<string>(), clueRef = new Set<string>();
  const statRef = new Set<string>(), statSet = new Set<string>();

  for (const s of sc.scenes) {
    for (const e of s.effects ?? []) {
      if (e.setFlag) flagSet.add(e.setFlag);
      if (e.unlockClue) clueUnlock.add(e.unlockClue);
      if (e.stat) Object.keys(e.stat).forEach((k) => statSet.add(k));
    }
    for (const c of s.choices ?? []) {
      for (const e of c.effects ?? []) {
        if (e.setFlag) flagSet.add(e.setFlag);
        if (e.unlockClue) clueUnlock.add(e.unlockClue);
        if (e.stat) Object.keys(e.stat).forEach((k) => statSet.add(k));
      }
      if (c.cond) {
        if (c.cond.flag) flagRef.add(c.cond.flag);
        if (c.cond.flag2) flagRef.add(c.cond.flag2);
        if (c.cond.notFlag) flagRef.add(c.cond.notFlag);
        if (c.cond.clue) clueRef.add(c.cond.clue);
        if (c.cond.statAtLeast) Object.keys(c.cond.statAtLeast).forEach((k) => statRef.add(k));
      }
    }
    // variantLines 文本回响的 cond 也是 flag/clue/stat 消费点
    for (const v of s.variantLines ?? []) {
      if (v.cond?.flag) flagRef.add(v.cond.flag);
      if (v.cond?.flag2) flagRef.add(v.cond.flag2);
      if (v.cond?.notFlag) flagRef.add(v.cond.notFlag);
      if (v.cond?.clue) clueRef.add(v.cond.clue);
      if (v.cond?.statAtLeast) Object.keys(v.cond.statAtLeast).forEach((k) => statRef.add(k));
    }
  }
  for (const d of sc.duels ?? []) {
    if (d.loseScene2?.cond?.flag) flagRef.add(d.loseScene2.cond.flag);
    if (d.loseScene2?.cond?.notFlag) flagRef.add(d.loseScene2.cond.notFlag);
    if (d.loseScene2?.cond?.statAtLeast) Object.keys(d.loseScene2.cond.statAtLeast).forEach((k) => statRef.add(k));
  }
  if (sc.verdict?.coreClue) clueRef.add(sc.verdict.coreClue);
  // 成就系统消费（按剧本归属）
  for (const a of ACHIEVEMENTS) {
    if (a.scenario !== sc.id) continue;
    if (a.statAtLeast) Object.keys(a.statAtLeast).forEach((k) => statRef.add(k));
    if (a.statAtMost) Object.keys(a.statAtMost).forEach((k) => statRef.add(k));
  }
  const hasVerdict = !!sc.verdict;

  for (const s of sc.scenes) {
    const cs = s.choices ?? [];
    if (cs.length === 0) continue;

    // D 死条件
    for (const c of cs) {
      if (c.cond?.flag && !flagSet.has(c.cond.flag))
        issues.push({ level: "D", sceneId: s.id, title: s.title ?? "", detail: `选项「${c.text}」cond.flag=${c.cond.flag} 全剧本从未被 set → 选项永远隐藏（分支不可达）` });
      if (c.cond?.notFlag && !flagSet.has(c.cond.notFlag))
        issues.push({ level: "D", sceneId: s.id, title: s.title ?? "", detail: `选项「${c.text}」cond.notFlag=${c.cond.notFlag} 全剧本从未被 set → 条件恒真（相当于无条件选项）` });
      if (c.cond?.flag2 && !flagSet.has(c.cond.flag2))
        issues.push({ level: "D", sceneId: s.id, title: s.title ?? "", detail: `选项「${c.text}」cond.flag2=${c.cond.flag2} 全剧本从未被 set → 恒不满足` });
      if (c.cond?.clue && !clueUnlock.has(c.cond.clue))
        issues.push({ level: "D", sceneId: s.id, title: s.title ?? "", detail: `选项「${c.text}」cond.clue=${c.cond.clue} 全剧本从未被 unlockClue → 恒不满足` });
    }

    const nexts = cs.map((c) => c.next);
    const distinct = new Set(nexts);
    const allSub = cs.every((c) => !hasSubstance(c.effects));

    if (distinct.size === 1) {
      const target = [...distinct][0];
      if (allSub) {
        issues.push({ level: "A", sceneId: s.id, title: s.title ?? "", detail: `全部选项同 next(${target}) 且全部无 effects → 选择零影响，纯摆设` });
        continue;
      }
      // F 同效选项：effects 完全相同
      const keys = cs.map((c) => effKey(c.effects));
      if (new Set(keys).size === 1) {
        issues.push({ level: "F", sceneId: s.id, title: s.title ?? "", detail: `全部选项同 next(${target}) 且 effects 完全相同 [${effSummary(cs[0].effects)}] → 选项只是换了句话，结果一样` });
        continue;
      }
      // B 死旗/死数值/死线索
      const deadFlags = new Set<string>(), deadClues = new Set<string>(), deadStats = new Set<string>();
      for (const c of cs) for (const e of c.effects ?? []) {
        if (e.setFlag && !flagRef.has(e.setFlag)) deadFlags.add(e.setFlag);
        if (e.unlockClue && !clueRef.has(e.unlockClue)) deadClues.add(e.unlockClue);
        if (e.stat) for (const k of Object.keys(e.stat)) if (!statRef.has(k)) deadStats.add(k);
      }
      for (const e of s.effects ?? []) {
        if (e.setFlag && !flagRef.has(e.setFlag)) deadFlags.add(e.setFlag);
        if (e.unlockClue && !clueRef.has(e.unlockClue)) deadClues.add(e.unlockClue);
      }
      if (deadFlags.size || deadClues.size || deadStats.size) {
        const bits: string[] = [];
        if (deadFlags.size) bits.push(`死旗[${[...deadFlags].join(",")}]（set 后无任何 cond 引用）`);
        if (deadClues.size) bits.push(`死线索[${[...deadClues].join(",")}]（unlock 后无 cond.clue/coreClue 引用）`);
        if (deadStats.size) bits.push(`死数值[${[...deadStats].join(",")}]（增量后无 statAtLeast/成就消费）`);
        issues.push({ level: "B", sceneId: s.id, title: s.title ?? "", detail: `选项 effects 无后续回响：${bits.join("；")}` });
      }
      continue;
    }

    // distinct > 1：C 同文分流
    const nextSceneLines = new Map<string, string>();
    for (const n of distinct) {
      const t = byId.get(n);
      nextSceneLines.set(n, t ? t.lines.join("␞") : "__MISSING__");
    }
    const lineCounts = new Map<string, string[]>();
    for (const [n, l] of nextSceneLines) {
      if (!lineCounts.has(l)) lineCounts.set(l, []);
      lineCounts.get(l)!.push(n);
    }
    for (const [l, ids] of lineCounts) {
      if (l === "__MISSING__") {
        issues.push({ level: "D", sceneId: s.id, title: s.title ?? "", detail: `选项 next 指向不存在的场景：${ids.join(",")}` });
        continue;
      }
      if (ids.length > 1) {
        issues.push({
          level: "C", sceneId: s.id, title: s.title ?? "",
          detail: `选项分流到 ${ids.join(" / ")} 但目标场景 lines 完全相同（${byId.get(ids[0])?.lines.length} 段）→ 玩家感受不到分流；建议各分支写差异化文本或加 cond 门控`,
        });
      }
    }
  }

  // E 未消费线索（无 verdict 剧本）
  if (!hasVerdict) {
    for (const cl of clueUnlock) {
      if (!clueRef.has(cl)) issues.push({ level: "E", sceneId: "(全局)", title: sc.title, detail: `线索 ${cl} 被 unlock 但全剧本无 cond.clue / coreClue 引用 → 拿了没用` });
    }
  }

  // G 弱回响：flag set 后仅 1 次引用
  const refCount = new Map<string, number>();
  for (const s of sc.scenes) for (const c of s.choices ?? []) {
    if (c.cond?.flag) refCount.set(c.cond.flag, (refCount.get(c.cond.flag) ?? 0) + 1);
    if (c.cond?.notFlag) refCount.set(c.cond.notFlag, (refCount.get(c.cond.notFlag) ?? 0) + 1);
  }
  for (const d of sc.duels ?? []) {
    if (d.loseScene2?.cond?.flag) refCount.set(d.loseScene2.cond.flag, (refCount.get(d.loseScene2.cond.flag) ?? 0) + 1);
  }
  for (const f of flagSet) {
    if (refCount.get(f) === 1) {
      const setters = sc.scenes.filter((s) =>
        (s.effects ?? []).some((e) => e.setFlag === f) || (s.choices ?? []).some((c) => (c.effects ?? []).some((e) => e.setFlag === f))
      ).map((s) => s.id);
      issues.push({ level: "G", sceneId: "(flag)", title: f, detail: `flag 仅被引用 1 次（set 于 ${setters.join(",")}）→ 回响单薄，建议人工复核引用处文本是否真的差异化` });
    }
  }

  return issues;
}

let total = 0;
const byLevel: Record<string, number> = {};
const order: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6 };
for (const { name, sc } of SCENARIOS) {
  const issues = audit(sc);
  const choiceScenes = sc.scenes.filter((s) => (s.choices?.length ?? 0) > 0).length;
  console.log(`\n===== ${name}（${sc.title}）场景=${sc.scenes.length} 含选项节点=${choiceScenes} 问题=${issues.length} =====`);
  if (issues.length === 0) { console.log("  ✓ 无问题"); continue; }
  const sorted = [...issues].sort((a, b) => order[a.level] - order[b.level]);
  for (const it of sorted) {
    total++;
    byLevel[it.level] = (byLevel[it.level] ?? 0) + 1;
    console.log(`  [${it.level}] ${it.sceneId}「${it.title}」`);
    console.log(`        ${it.detail}`);
  }
}
console.log(`\n########## 汇总：A零承接=${byLevel.A ?? 0}  B死旗/死数值=${byLevel.B ?? 0}  C同文分流=${byLevel.C ?? 0}  D死条件=${byLevel.D ?? 0}  E未消费线索=${byLevel.E ?? 0}  F同效选项=${byLevel.F ?? 0}  G弱回响=${byLevel.G ?? 0}  合计=${total}`);
