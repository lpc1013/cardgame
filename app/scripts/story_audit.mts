// ============================================================
// 剧情数据层查漏（S-2 后续 · verify 之外的引用完整性审计）
// 只查"名字对不上"这一类硬伤——旗标/线索/数值/卡 id 的悬挂引用：
//   · 读而从未写（cond 永假 → 支线/回响永远不可达，最难被发现的静默断链）
//   · 写而从未读（旗标/数值白设，多半是删改后的残根）
//   · 引用了不存在的 id（线索表/卡表/场景表/番外钥匙与结局名）
//   · emotionTopics 配了话头，但该局卡池没有任何卡的话题能接上（M5 内容化空转）
// verify 管"可达性与可胜性"，本脚本管"引用完整性"；两者互补，改动剧情数据后都跑。
// （本文件原为一次性的叙事卷卡牌分布快照，2026-10-02 起让位给这份查漏器）
// ============================================================
import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";
import { changhen } from "../src/data/changhen.ts";
import { changjiang } from "../src/data/changjiang.ts";
import { diaolan } from "../src/data/diaolan.ts";
import { jianfeng } from "../src/data/jianfeng.ts";
import { jieyu } from "../src/data/jieyu.ts";
import { shumian } from "../src/data/shumian.ts";
import { touming } from "../src/data/touming.ts";
import { xingxing } from "../src/data/xingxing.ts";
import { BONUS_SCENES } from "../src/data/bonus.ts";
import type { Scenario } from "../src/engine/types.ts";

const SCEN: [string, Scenario][] = [
  ["fuma", fuma], ["qiuwei", qiuwei], ["sichou", sichou], ["xie", xie], ["qinhuai", qinhuai],
  ["changhen", changhen], ["changjiang", changjiang], ["diaolan", diaolan], ["jianfeng", jianfeng],
  ["jieyu", jieyu], ["shumian", shumian], ["touming", touming], ["xingxing", xingxing],
];

const SUITS = new Set(["策", "器", "势", "隐"]);
type Any = Record<string, unknown>;

/** 深度遍历：收集所有 Cond 读与 Effect 写（topics/emotionTopics 是话题词不是引用，跳过） */
function walk(node: unknown, visit: (obj: Any, path: string) => void, path = ""): void {
  if (Array.isArray(node)) { node.forEach((n, i) => walk(n, visit, `${path}[${i}]`)); return; }
  if (node && typeof node === "object") {
    const o = node as Any;
    visit(o, path);
    for (const [k, v] of Object.entries(o)) {
      if (k === "emotionTopics" || k === "topics") continue;
      walk(v, visit, path ? `${path}.${k}` : k);
    }
  }
}

let problems = 0, notes = 0;
const p = (s: string) => { problems++; console.log(`  ✗ ${s}`); };
const note = (s: string) => { notes++; console.log(`  · ${s}`); };

for (const [sid, sc] of SCEN) {
  console.log(`【${sid}】`);
  const flagSet = new Set<string>(), flagRead = new Map<string, string[]>();
  const clueUnlock = new Set<string>(), clueRead = new Map<string, string[]>();
  const statWrite = new Set<string>(), statRead = new Map<string, string[]>();
  const cardRef = new Map<string, string[]>();
  const clueIds = new Set((sc.clues ?? []).map((c) => c.id));
  const cardIds = new Set(sc.cards.map((c) => c.id));

  walk(sc, (o, path) => {
    for (const k of ["flag", "flag2", "notFlag"] as const) {
      if (typeof o[k] === "string") {
        const v = o[k] as string;
        if (!flagRead.has(v)) flagRead.set(v, []);
        flagRead.get(v)!.push(path);
      }
    }
    if (typeof o.clue === "string") {
      const v = o.clue as string;
      if (!clueRead.has(v)) clueRead.set(v, []);
      clueRead.get(v)!.push(path);
    }
    if (o.statAtLeast && typeof o.statAtLeast === "object") {
      for (const k of Object.keys(o.statAtLeast as Any)) {
        if (!statRead.has(k)) statRead.set(k, []);
        statRead.get(k)!.push(path);
      }
    }
    for (const k of ["card", "notCard"] as const) {
      if (typeof o[k] === "string") {
        const v = o[k] as string;
        if (!cardRef.has(v)) cardRef.set(v, []);
        cardRef.get(v)!.push(path);
      }
    }
    if (typeof o.setFlag === "string") flagSet.add(o.setFlag as string);
    if (typeof o.unlockClue === "string") clueUnlock.add(o.unlockClue as string);
    if (o.stat && typeof o.stat === "object") {
      for (const k of Object.keys(o.stat as Any)) statWrite.add(k);
    }
    for (const k of ["unlockCard", "removeCard"] as const) {
      if (typeof o[k] === "string") {
        const v = o[k] as string;
        if (!cardRef.has(v)) cardRef.set(v, []);
        cardRef.get(v)!.push(path);
      }
    }
  });

  const sceneIds = new Set(sc.scenes.map((s) => s.id));
  // ---- 场景图引用存在性（数据流里静默丢边的反面：把每个收束口点名核一遍） ----
  const dangling = (from: string, slot: string, to: unknown) => {
    if (typeof to === "string" && to && !sceneIds.has(to)) p(`「${from}」的 ${slot} → 「${to}」不在场景表`);
  };
  for (const s of sc.scenes) {
    dangling(s.id, "next", s.next);
    dangling(s.id, "next2", s.next2);
    for (const [i, c] of (s.choices ?? []).entries()) dangling(s.id, `choices[${i}].next`, c.next);
    if (s.duel) {
      const d = sc.duels.find((x) => x.id === s.duel);
      dangling(s.id, `duel ${s.duel}.winScene`, d?.winScene);
      dangling(s.id, `duel ${s.duel}.loseScene`, d?.loseScene);
      dangling(s.id, `duel ${s.duel}.loseScene2.scene`, d?.loseScene2?.scene);
    }
    if (s.minigame) { dangling(s.id, "minigame.winNext", s.minigame.winNext); dangling(s.id, "minigame.loseNext", s.minigame.loseNext); }
    if (s.cardPick) dangling(s.id, "cardPick.next", s.cardPick.next);
    // ---- variantLines 遮蔽：首中即返，无条件兜底出现在前面 → 后面全部永假 ----
    const vls = s.variantLines ?? [];
    for (const [i, v] of vls.entries()) {
      if (v.cond) continue;
      if (i < vls.length - 1) p(`「${s.id}」variantLines[${i}] 无条件兜底不在末位——其后的 ${vls.length - 1 - i} 条回响永不可达`);
      break;
    }
    const seenConds = new Map<string, number>();
    for (const [i, v] of vls.entries()) {
      if (!v.cond) continue;
      const key = JSON.stringify(v.cond);
      if (seenConds.has(key)) p(`「${s.id}」variantLines[${i}] 与 [${seenConds.get(key)}] 条件完全相同——前者遮蔽后者`);
      else seenConds.set(key, i);
    }
  }
  if (!sceneIds.has(sc.startScene)) p(`startScene「${sc.startScene}」不在场景表`);
  const endingSceneIds = new Set(sc.scenes.filter((s) => s.ending).map((s) => s.id));
  for (const v of sc.viewpoints ?? []) {
    if (!sceneIds.has(v.startScene)) p(`视角 ${v.id} startScene「${v.startScene}」不在场景表`);
    // viewpoints[].endings 存的是结局「场景 id」（图鉴按视角归类的依据）
    for (const e of (v as Any).endings ?? []) {
      if (!endingSceneIds.has(e)) p(`视角 ${v.id} endings「${e}」不是结局场景 id`);
    }
  }

  // ---- 旗标 ----
  for (const [f, paths] of flagRead) {
    if (!flagSet.has(f)) p(`旗标「${f}」被读（${paths[0]}${paths.length > 1 ? ` 等 ${paths.length} 处` : ""}）但全剧本无 setFlag —— 条件永假，内容不可达`);
  }
  for (const f of flagSet) {
    if (!flagRead.has(f)) note(`旗标「${f}」有 setFlag 但无处读取（残根或预留）`);
  }
  // ---- 线索 ----
  for (const c of clueUnlock) if (clueIds.size > 0 && !clueIds.has(c)) p(`unlockClue「${c}」不在线索表`);
  for (const [c, paths] of clueRead) {
    if (clueIds.size > 0 && !clueIds.has(c)) p(`cond.clue「${c}」不在线索表（${paths[0]}）`);
    else if (clueIds.size > 0 && !clueUnlock.has(c)) p(`线索「${c}」被 cond.clue 读（${paths[0]}）但全剧本无解锁口 —— 不可达`);
  }
  // ---- 数值 ----
  const declared = new Set((sc.stats ?? []).map((s) => s.key));
  for (const [k, paths] of statRead) {
    if (!statWrite.has(k) && !declared.has(k)) p(`stat「${k}」被门槛读（${paths[0]}）但从未被写也未声明 —— 恒为初值`);
  }
  for (const k of statWrite) {
    if (!statRead.has(k) && !declared.has(k)) note(`stat「${k}」被写但无门槛读、也不在 stats 表 —— 隐形账目`);
  }
  // ---- 卡引用 ----
  for (const c of sc.initialDeck ?? []) if (!cardIds.has(c)) p(`initialDeck「${c}」不在卡表`);
  for (const [c, paths] of cardRef) if (!cardIds.has(c)) p(`卡引用「${c}」（${paths[0]}）不在本剧本卡表`);
  // ---- 对局：卡池/脚本/话头 ----
  for (const d of sc.duels) {
    // 对手专属卡（oppCards 内联定义）也算合法脚本项
    const oppIds = new Set(((d.oppCards as Any[]) ?? []).map((c) => String(c.id)));
    for (const c of (d.deck ?? [])) if (!cardIds.has(c)) p(`对局 ${d.id} 卡池「${c}」不在卡表`);
    const variants = d.scriptVariants ?? [];
    for (const entry of [...d.script, ...variants.flat()]) {
      if (SUITS.has(entry)) continue;
      if (!cardIds.has(entry) && !oppIds.has(entry)) p(`对局 ${d.id} 脚本项「${entry}」既非花色也不在卡表/oppCards`);
    }
    const topics = (d.emotionTopics ?? []).flat();
    if (topics.length) {
      const pool = d.deck ?? sc.initialDeck ?? [...cardIds];
      const cardTopics = new Set(sc.cards.filter((c) => pool.includes(c.id)).flatMap((c) => (c.topics as unknown as string[]) ?? []));
      const hit = topics.filter((t) => cardTopics.has(t));
      if (!hit.length) note(`对局 ${d.id} 配了 ${topics.length} 个话头，但卡池话题一个都接不上 —— M5 内容化在该局空转`);
    }
  }
  // ---- 复盘门 ----
  if (sc.verdict) {
    const v = sc.verdict;
    for (const k of ["scene", "winScene", "loseScene"] as const) {
      if (!sceneIds.has(v[k])) p(`verdict.${k}「${v[k]}」不在场景表`);
    }
    if (clueIds.size > 0 && !clueIds.has(v.coreClue)) p(`verdict.coreClue「${v.coreClue}」不在线索表`);
    else if (clueIds.size > 0 && !clueUnlock.has(v.coreClue)) p(`verdict.coreClue「${v.coreClue}」全剧本无解锁口（S-1 同型断链）`);
  }
  // ---- 番外钥匙与结局名 ----
  const endNames = new Set(sc.scenes.filter((s) => s.ending).map((s) => s.ending!.name));
  for (const b of BONUS_SCENES.filter((b) => b.scenarioId === sid)) {
    for (const c of b.keyCards ?? []) if (!cardIds.has(c)) p(`番外 ${b.id} 钥匙卡「${c}」不在卡表`);
    for (const e of b.unlockEndings ?? []) if (!endNames.has(e)) p(`番外 ${b.id} unlockEndings「${e}」不匹配任何结局名`);
  }

  // ---- 分支感知（S-3 数据流）：旗标不跨视角支线共享 ----
  // 对每个入口（全局 start + 各视角 start）做旗标前向数据流（保守超集：所有选项视为可见），
  // 场景里读到的旗标若在到达它的每条路上都无人写入 → 该 cond 永假、文本永远不出。
  // 多入口各自独立算——只在某一入口可达的死读按入口点名。
  const sceneById = new Map(sc.scenes.map((s) => [s.id, s]));
  const entries = [...new Set([sc.startScene, ...(sc.viewpoints ?? []).map((v) => v.startScene)])];
  const sceneFlagSets = (s: typeof sc.scenes[number]): string[] =>
    (s.effects ?? []).filter((e) => e.setFlag).map((e) => e.setFlag!);
  const edgesOf = (s: typeof sc.scenes[number]): { to: string; set: string[] }[] => {
    const out: { to: string; set: string[] }[] = [];
    const push = (to?: string, set: string[] = []) => { if (to && sceneById.has(to)) out.push({ to, set }); };
    push(s.next); push(s.next2);
    for (const c of s.choices ?? []) push(c.next, (c.effects ?? []).filter((e) => e.setFlag).map((e) => e.setFlag!));
    if (s.duel) {
      const d = sc.duels.find((x) => x.id === s.duel);
      push(d?.winScene); push(d?.loseScene); push(d?.loseScene2?.scene);
    }
    if (s.cardPick) push(s.cardPick.next);
    if (s.minigame) { push(s.minigame.winNext); push(s.minigame.loseNext); }
    return out;
  };
  // 每个场景的旗标读点：variantLines 的 cond（进幕结算）+ 各选项的 cond
  const readsOf = (s: typeof sc.scenes[number]): { flag: string; where: string }[] => {
    const reads: { flag: string; where: string }[] = [];
    for (const [i, v] of (s.variantLines ?? []).entries()) {
      for (const k of ["flag", "flag2"] as const) if (v.cond?.[k]) reads.push({ flag: v.cond[k]!, where: `variantLines[${i}]` });
    }
    for (const [i, c] of (s.choices ?? []).entries()) {
      for (const k of ["flag", "flag2"] as const) if (c.cond?.[k]) reads.push({ flag: c.cond[k]!, where: `choices[${i}]` });
    }
    return reads;
  };
  for (const entry of entries) {
    if (!sceneById.has(entry)) continue;
    const flagsIn = new Map<string, Set<string>>();
    const queue: { id: string; set: Set<string> }[] = [{ id: entry, set: new Set() }];
    while (queue.length) {
      const { id, set } = queue.shift()!;
      const prev = flagsIn.get(id);
      const merged = new Set(prev ?? []);
      let grew = false;
      for (const f of set) if (!merged.has(f)) { merged.add(f); grew = true; }
      if (prev && !grew) continue;
      flagsIn.set(id, merged);
      const s = sceneById.get(id)!;
      const carried = new Set(merged);
      for (const f of sceneFlagSets(s)) carried.add(f);
      for (const e of edgesOf(s)) {
        const next = new Set(carried);
        for (const f of e.set) next.add(f);
        queue.push({ id: e.to, set: next });
      }
    }
    for (const [scid, avail] of flagsIn) {
      const s = sceneById.get(scid)!;
      for (const r of readsOf(s)) {
        if (!avail.has(r.flag) && !sceneFlagSets(s).includes(r.flag)) {
          p(`[${entry} 线] 场景 ${scid} 读旗标「${r.flag}」（${r.where}）——该线上无人写入，回响/选项永假`);
        }
      }
    }
  }
}

console.log(`\n========== ${problems} 处硬伤 / ${notes} 处存疑 ==========`);
