/**
 * 结局分布审计（可复用）
 * 规则（用户拍板）：
 * ① 单节点结局数 ≤3（choices 的 next/altNext、场景 next、对局 win/lose/lose2 出口全口径）
 * ② 结局入口节点自身必须 ≥1 行正文（垫场）
 * ③ 连续选择 = 前驱的「结局选项」直连 + 目标节点自身 0 行正文（有正文中转不算干点选择）
 * ④ 对局败线统一提示（同剧本多对局败线散落多个结局 → 提示人工确认）
 * 用法：node --experimental-strip-types scripts/ending_audit.mts
 */
import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";
import { jieyu } from "../src/data/jieyu.ts";
import { shumian } from "../src/data/shumian.ts";
import { changjiang } from "../src/data/changjiang.ts";
import { changhen } from "../src/data/changhen.ts";
import { jianfeng } from "../src/data/jianfeng.ts";
import { xingxing } from "../src/data/xingxing.ts";
import { touming } from "../src/data/touming.ts";
import { diaolan } from "../src/data/diaolan.ts";

const ALL: Record<string, any> = { fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, changhen, jianfeng, xingxing, touming, diaolan };

let issues = 0;

for (const [name, sc] of Object.entries(ALL)) {
  const byId = new Map(sc.scenes.map((s: any) => [s.id, s]));
  const gates = new Map<string, { ends: Set<string> }>();

  // 场景 choices / next / duel 出口
  for (const s of sc.scenes) {
    const ends = new Set<string>();
    for (const c of s.choices ?? []) {
      const t = byId.get(c.next);
      if (t?.ending) ends.add(t.ending.name);
      if (c.altNext) { const a = byId.get(c.altNext); if (a?.ending) ends.add(a.ending.name + "(alt)"); }
    }
    if (ends.size) gates.set(s.id, { ends });
  }
  for (const s of sc.scenes) {
    if (s.next && byId.get(s.next)?.ending) {
      const g = gates.get(s.id) ?? { ends: new Set<string>() };
      g.ends.add(byId.get(s.next).ending.name);
      gates.set(s.id, g);
    }
  }
  for (const d of sc.duels) {
    const ends = new Set<string>();
    for (const sid of [d.winScene, d.loseScene]) { const t = byId.get(sid); if (t?.ending) ends.add(t.ending.name); }
    if (d.loseScene2) { const t = byId.get(d.loseScene2.scene); if (t?.ending) ends.add(t.ending.name); }
    if (ends.size) gates.set("⚔" + d.id, { ends });
  }

  console.log("════ " + name + " ════");
  for (const [gid, info] of gates) {
    // altNext 是降级路径非独立结局：去 (alt) 标记后合并去重
    const pure = [...new Set([...info.ends].map((e) => e.replace("(alt)", "")))];
    const over = pure.length > 3;
    if (over) issues++;
    console.log((over ? "  ❌" : "  ") + " " + gid + " → " + pure.length + " 结局: " + pure.join(" / "));
  }

  // ② 入口自身正文
  for (const [gid] of gates) {
    const g = byId.get(gid);
    if (!g) continue;
    if (g.lines.length === 0) { console.log("  ⚠ " + gid + " 结局入口 0 行正文"); issues++; }
  }

  // ②b 选项数维度：可见选项条数 >3 也要报（结局去重会漏检，如 shumian a3_after 4 选项 3 结局）
  // 口径 = choices 数组条数（altNext 是降级出口，不增加可见选项条数）
  // 豁免：走马灯/回忆回环型（大部分选项指向回忆场景而非结局，如 p5_prison/xing_lamp/ch3_canon_variants）
  for (const [gid] of gates) {
    const g = byId.get(gid);
    if (!g || !g.choices) continue;
    const endOpts = g.choices.filter((c: any) => byId.get(c.next)?.ending).length;
    if (endOpts < 2) continue; // 回忆回环型：<2 个选项指向结局 → 豁免
    const optCount = g.choices.length;
    if (optCount > 3) { console.log("  ⚠ " + gid + " 可见选项数 " + optCount + " > 3"); issues++; }
  }

  // ③ 连续选择（正确口径：前驱结局选项直连 + 目标 0 行正文）
  for (const [gid] of gates) {
    const g = byId.get(gid);
    if (!g) continue;
    for (const p of sc.scenes) {
      const hit = (p.choices ?? []).find((c: any) => c.next === gid && byId.get(c.next)?.ending);
      if (hit && g.lines.length === 0) {
        console.log("  ⚠ 连续选择(无垫场): " + p.id + " 结局选项 → " + gid + "（0 行正文）");
        issues++;
      }
    }
  }

  // ④ 对局败线统一提示
  const loseEnds = new Map<string, number>();
  for (const d of sc.duels) {
    const t = byId.get(d.loseScene);
    if (t?.ending) loseEnds.set(t.ending.name, (loseEnds.get(t.ending.name) ?? 0) + 1);
  }
  if (loseEnds.size > 1) {
    console.log("  ℹ 对局败线散落 " + loseEnds.size + " 结局: " + [...loseEnds.entries()].map(([k, v]) => k + "×" + v).join(" / ") + "（人工确认是否多阶段叙事）");
  }
  console.log("");
}

console.log("### 问题总数: " + issues);
process.exit(issues ? 1 : 0);
