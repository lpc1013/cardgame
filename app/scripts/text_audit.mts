// ============================================================
// 文本卫生审计（text_audit）：扫全库叙事字符串的机械层问题
// 范围：scenes.lines / choices.text+hint / variantLines / ending 三层 /
//       duels.intro+opponent.desc+lastResult 类 / 番外正文 / 线索 desc
// 只报不改；修复走数据文件手工批处理（改完重跑本门禁应归零）。
// 文风红线层（凝练/物件/留白）不在此检查——那是人眼的事。
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

type Hit = { sc: string; where: string; kind: string; text: string };
const hits: Hit[] = [];
const push = (sc: string, where: string, kind: string, text: string) =>
  hits.push({ sc, where, kind, text: text.slice(0, 60) });

/** 元叙事词（游戏术语漏进正文）——保守表，宁缺勿滥。
 *  「存档」不列：剧中「刑部存档/物证存档」是在世用语（朝廷档案），非游戏术语。 */
const META = ["玩家", "读档", "攻略", "按钮", "点击", "界面", "面板", "系统提示", "经验值", "NPC", "Boss", "buff"];
/** 半角标点紧跟汉字（中英混排事故） */
const HALF_PUNCT = /[,;:?!](?=[\u4e00-\u9fff])/;
const HALF_DOT = /\.(?=[\u4e00-\u9fff])/;

function checkLine(sc: string, where: string, s: string): void {
  if (typeof s !== "string") return;
  if (s.includes("。。")) push(sc, where, "重复句号", s);
  if (/[？！]{3,}/.test(s)) push(sc, where, "标点×3+", s);
  if (s.includes("...")) push(sc, where, "半角省略号", s);
  if (HALF_PUNCT.test(s)) push(sc, where, "半角标点", s);
  if (HALF_DOT.test(s) && !/\b[a-z]\./i.test(s)) push(sc, where, "半角句点", s);
  if (s !== s.trimEnd()) push(sc, where, "尾随空白", s);
  if (/^[\s\u3000]/.test(s)) push(sc, where, "段首空白", s);
  for (const w of META) {
    if (s.includes(w)) { push(sc, where, `元叙事词「${w}」`, s); break; }
  }
  if (/—{3,}/.test(s)) push(sc, where, "破折号×3+", s);
  if (/[“”]/.test(s) && /[「」]/.test(s)) push(sc, where, "两种引号混用", s);
}

function walkStrings(node: unknown, where: string): void {
  if (typeof node === "string") { checkLine(where.split(".")[0], where, node); return; }
  if (Array.isArray(node)) { node.forEach((n, i) => walkStrings(n, `${where}[${i}]`)); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "id" || k === "reward" || k === "coreClue" || k === "script" || k === "deck" || k === "next" || k === "next2" || k === "winScene" || k === "loseScene" || k === "topics" || k === "emotionTopics" || k === "keyCards" || k === "unlockEndings" || k === "endings" || k === "stock" || k === "options") continue;
      if (k === "board" || k === "boards" || k === "answer" || k === "moves" || k === "hand" || k === "drawn") continue; // 棋盘点阵/牌面数据，非文本
      walkStrings(v, `${where}.${k}`);
    }
  }
}

for (const [sid, sc] of SCEN) {
  walkStrings(sc, sid);
}
for (const b of BONUS_SCENES) {
  for (const [i, l] of (b.lines ?? []).entries()) checkLine(b.scenarioId, `bonus/${b.id}.lines[${i}]`, l);
  checkLine(b.scenarioId, `bonus/${b.id}.desc`, b.desc ?? "");
}

// ---- 汇总 ----
const byKind = new Map<string, number>();
for (const h of hits) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1);
for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${k}: ${n}`);
}
console.log("---- 明细（每类最多 6 条）----");
const shown = new Map<string, number>();
for (const h of hits) {
  const n = shown.get(h.kind) ?? 0;
  if (n >= 6) continue;
  shown.set(h.kind, n + 1);
  console.log(`  [${h.kind}] ${h.where}: ${h.text}`);
}

// ---- 引号制度（按剧本统计：正文中直角引号 vs 弯引号的占比）----
console.log("---- 引号制度 ----");
for (const [sid, sc] of SCEN) {
  let corner = 0, curly = 0;
  const scan = (s: string) => { corner += (s.match(/[「」]/g) ?? []).length; curly += (s.match(/[“”]/g) ?? []).length; };
  for (const s of sc.scenes) { for (const l of s.lines ?? []) scan(l); for (const c of s.choices ?? []) scan(c.text ?? ""); }
  if (corner > 0 && curly > 0) {
    console.log(`  ⚠ ${sid}: 「」×${corner} 与 “”×${curly} 混用（少数派 ${Math.min(corner, curly)}）`);
  }
}

// ---- 相邻重复行（复制粘贴残留）----
console.log("---- 相邻重复行 ----");
let dup = 0;
for (const [sid, sc] of SCEN) {
  for (const s of sc.scenes) {
    const lines = s.lines ?? [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] && lines[i] === lines[i - 1] && lines[i]!.length > 6) {
        dup++;
        console.log(`  ⚠ ${sid}/${s.id}.lines[${i}] 连续重复：「${lines[i]!.slice(0, 40)}」`);
      }
    }
  }
}
if (!dup) console.log("  （无）");

console.log(`\n========== 文本卫生：${hits.length} 处 ==========`);
