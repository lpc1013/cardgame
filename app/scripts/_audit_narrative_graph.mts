// ============================================================
// 剧情节点×承接文本 结构审计（配合三份对抗性审计报告 + 节点哲学）
// 原则：每个节点选择后都应有承接它的差异化叙事；否则该选型多余。
// 输出：
//  [A] 选项收敛：同场景多个选项指向同一目标（承接同一段文本）→ 冗余候选
//  [B] 选择后零文本 / 直跳结局：无过渡场景的硬切
//  [C] 线索可达性：每条线索的解锁入口数；core/真线索无解锁 = S-1 类断链
//  [D] 旗标产销对账：setFlag 了但全剧本无任何 cond 引用 = 分化白设
//  [E] 结局场景出边 / 骨架场景
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
import type { Scenario, Effect, Choice } from "../src/engine/types.ts";

const ALL: Scenario[] = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];

const brief = (s: string, n = 26) => (s.length > n ? s.slice(0, n) + "…" : s);
const fxOf = (e?: Effect[]) => (e?.length ? e.map(x => {
  const k = x.setFlag ? `旗:${x.setFlag}` : x.unlockClue ? `线索:${x.unlockClue}` : x.unlockCard ? `卡:${x.unlockCard}` : x.removeCard ? `失:${x.removeCard}` : x.stat ? `值:${JSON.stringify(x.stat)}` : "";
  return k;
}).join("+") : "");
const cdOf = (c?: Choice["cond"]) => {
  if (!c) return "";
  const p: string[] = [];
  if (c.flag) p.push(`有${c.flag}`);
  if (c.flag2) p.push(`有${c.flag2}`);
  if (c.notFlag) p.push(`无${c.notFlag}`);
  if (c.clue) p.push(`知${c.clue}`);
  if (c.cluesAtLeast) p.push(`线索≥${c.cluesAtLeast}`);
  if (c.card) p.push(`卡${c.card}`);
  if (c.notCard) p.push(`非${c.notCard}`);
  if (c.resourceAtLeast) p.push(`银≥${c.resourceAtLeast}`);
  if (c.statAtLeast) p.push(`${JSON.stringify(c.statAtLeast)}`);
  return p.join("∧");
};
const fxSig = (e?: Effect[]) => JSON.stringify(e ? [...e].map(x => Object.entries(x).sort()).flat().sort() : []);

for (const sc of ALL) {
  console.log(`\n════════ ${sc.id} ·《${sc.title}》 ${sc.mode} · ${sc.scenes.length}幕`);
  const ids = new Set(sc.scenes.map(s => s.id));
  const sceneById = new Map(sc.scenes.map(s => [s.id, s]));
  // 可达性（同 verify 口径）
  const roots = [sc.startScene, ...(sc.viewpoints?.map(v => v.startScene) ?? [])];
  const E: [string, string][] = [];
  const edgeLabel = new Map<string, string>();
  const addEdge = (a: string, b: string, why: string) => { E.push([a, b]); if (!edgeLabel.has(a + ">" + b)) edgeLabel.set(a + ">" + b, why); };
  for (const s of sc.scenes) {
    if (s.next) addEdge(s.id, s.next, "next");
    for (const c of s.choices ?? []) { addEdge(s.id, c.next, "choice"); if (c.altNext) addEdge(s.id, c.altNext, "altNext"); }
    if (s.duel) { const d = sc.duels.find(x => x.id === s.duel); if (d) { addEdge(s.id, d.winScene, "胜"); addEdge(s.id, d.loseScene, "败"); if (d.loseScene2) addEdge(s.id, d.loseScene2.scene, "败2"); } }
  }
  if (sc.verdict) { addEdge(sc.verdict.scene, sc.verdict.winScene, "复盘胜"); addEdge(sc.verdict.scene, sc.verdict.loseScene, "复盘败"); }
  for (const s of sc.scenes) {
    if (s.cardPick) addEdge(s.id, s.cardPick.next, "翻牌");
    if (s.next2) addEdge(s.id, s.next2, "市集毕");
    if (s.minigame) { addEdge(s.id, s.minigame.winNext, "小游戏胜"); addEdge(s.id, s.minigame.loseNext, "小游戏败"); }
  }
  const reach = new Set(roots);
  for (let p = 0; p < sc.scenes.length + 1; p++) for (const [a, b] of E) if (reach.has(a)) reach.add(b);

  // ---------- [A] 选项收敛 ----------
  const convergeRows: string[] = [];
  for (const s of sc.scenes) {
    const ch = s.choices ?? [];
    if (ch.length < 2) continue;
    const byNext = new Map<string, Choice[]>();
    for (const c of ch) { const arr = byNext.get(c.next) ?? []; arr.push(c); byNext.set(c.next, arr); }
    for (const [nx, group] of byNext) {
      if (group.length < 2) continue;
      const sigs = new Set(group.map(c => fxSig(c.effects)));
      const conds = group.map(c => cdOf(c.cond)).join(" | ");
      const effs = [...new Set(group.map(c => fxOf(c.effects) || "∅"))].join(" | ");
      const tags: string[] = [];
      if (sigs.size > 1) tags.push("效果不同");
      if (group.some(c => c.cond)) tags.push("含条件");
      convergeRows.push(
        `${s.id}: ${group.map(c => `「${brief(c.text)}」(${cdOf(c.cond) || "无条件"}${fxOf(c.effects) ? ";" + fxOf(c.effects) : ""})`).join(" ⇔ ")} → 同去「${nx}」${tags.join("/") || "纯重复"}`,
      );
    }
  }
  console.log(convergeRows.length ? "[A|选项收敛·同途]" : "[A|选项收敛·同途] 无");
  for (const r of convergeRows) console.log("   " + r);

  // ---------- [B] 选择后零文本 / 直跳结局 ----------
  const bRows: string[] = [];
  for (const s of sc.scenes) {
    for (const c of s.choices ?? []) {
      const t = sceneById.get(c.next)!;
      if (!t) continue;
      const chars = t.lines.join("").trim().length;
      const attach = !!(t.duel || t.shop || t.cardPick || t.minigame);
      if (!attach && chars < 50 && !t.ending) bRows.push(`B1 ${s.id} ─「${brief(c.text)}」→ ${t.id} 正文仅${chars}字${t.title ? "(" + t.title + ")" : ""}`);
    }
    for (const c of s.choices ?? []) {
      const t = sceneById.get(c.next)!;
      if (t?.ending) bRows.push(`B2 ${s.id} ─「${brief(c.text)}」→ 直跳结局「${t.ending.name}」(无独立过场)`);
      if (c.altNext && sceneById.get(c.altNext)?.ending) bRows.push(`B3 ${s.id} ─「${brief(c.text)}」降级直跳结局「${sceneById.get(c.altNext)!.ending!.name}」`);
    }
  }
  console.log(bRows.length ? "[B|选择后承接]" : "[B|选择后承接] 无");
  for (const r of bRows) console.log("   " + r);

  // ---------- [C] 线索可达性 ----------
  if (sc.clues?.length) {
    const sites = new Map<string, { scene: string; how: string }[]>();
    const pushSite = (id: string, loc: string, how: string) => { if (id) { const a = sites.get(id) ?? []; a.push({ scene: loc, how }); sites.set(id, a); } };
    for (const s of sc.scenes) {
      const okSite = reach.has(s.id);
      for (const e of s.effects ?? []) if (e.unlockClue) pushSite(e.unlockClue, s.id + (okSite ? "" : "(不可达!)"), "进入");
      for (const c of s.choices ?? []) for (const e of c.effects ?? []) if (e.unlockClue) pushSite(e.unlockClue, `${s.id}·「${brief(c.text, 12)}」` + (okSite ? "" : "(不可达!)"), "选项");
    }
    const v = sc.verdict;
    console.log("[C|线索]");
    for (const cl of sc.clues) {
      const ss = sites.get(cl.id) ?? [];
      const mark = cl.kind === "core" ? "◆核" : cl.kind === "true" ? "真" : "伪";
      const vm = v && (v.coreClue === cl.id) ? " ←verdict.coreClue" : "";
      console.log(`   ${mark} ${cl.id}${vm}: ${ss.length}口 ${ss.map(x => x.scene).join(", ") || "—— 无任何解锁途径！"}`);
    }
    if (v) {
      const unlockable = new Set([...sites.keys()]);
      if (!unlockable.has(v.coreClue)) console.log(`   ✗ S-1型断链：coreClue ${v.coreClue} 全剧本不可解锁 → 复盘恒败`);
      const truthy = sc.clues.filter(c => c.kind !== "false");
      const noTrueEntry = truthy.filter(c => !sites.has(c.id));
      if (noTrueEntry.length) console.log(`   ✗ 真线索无入口: ${noTrueEntry.map(c => c.id).join(",")}`);
    }
  }

  // ---------- [D] 旗标产销 ----------
  const setFlags = new Map<string, string[]>();
  const readFlags = new Set<string>();
  const collectSet = (ef: Effect[] | undefined, at: string) => { for (const e of ef ?? []) if (e.setFlag) { const a = setFlags.get(e.setFlag) ?? []; a.push(at); setFlags.set(e.setFlag, a); } };
  for (const s of sc.scenes) {
    collectSet(s.effects, s.id);
    for (const c of s.choices ?? []) { collectSet(c.effects, `${s.id}·「${brief(c.text, 12)}」`); }
  }
  for (const s of sc.scenes) {
    for (const c of s.choices ?? []) {
      if (c.cond?.flag) readFlags.add(c.cond.flag);
      if (c.cond?.flag2) readFlags.add(c.cond.flag2);
      if (c.cond?.notFlag) readFlags.add(c.cond.notFlag);
    }
  }
  for (const d of sc.duels) if (d.loseScene2?.cond) {
    if (d.loseScene2.cond.flag) readFlags.add(d.loseScene2.cond.flag);
    if (d.loseScene2.cond.notFlag) readFlags.add(d.loseScene2.cond.notFlag);
    if (d.loseScene2.cond.flag2) readFlags.add(d.loseScene2.cond.flag2);
  }
  const dead = [...setFlags.keys()].filter(f => !readFlags.has(f));
  console.log(dead.length ? `[D|死旗标] ${dead.length} 个已设置但全剧本无引用:` : "[D|死旗标] 无");
  for (const f of dead) console.log(`   ${f} ← ${setFlags.get(f)!.slice(0, 4).join("; ")}${setFlags.get(f)!.length > 4 ? ";…" : ""}`);

  // ---------- [E] 结构卫生 ----------
  const eRows: string[] = [];
  for (const s of sc.scenes) {
    if (s.ending && ((s.choices?.length ?? 0) || s.next || s.choices?.length)) eRows.push(`E1 结局场 ${s.id}(「${s.ending.name}」) 仍有出口 ${(s.choices ?? []).length + (s.next ? 1 : 0)} 个`);
    if (!s.lines.filter(Boolean).length && !(s.duel || s.shop || s.cardPick || s.minigame || s.ending)) eRows.push(`E2 场景 ${s.id} 无正文且无玩法挂点`);
  }
  const orphanChoices: string[] = [];
  for (const s of sc.scenes) for (const c of s.choices ?? []) {
    if (!reach.has(c.next)) continue;
  }
  console.log(eRows.length ? "[E|结构卫生]" : "[E|结构卫生] 清洁");
  for (const r of eRows) console.log("   " + r);
}
console.log("\n(完)");
