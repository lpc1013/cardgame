// ============================================================
// 内容管线：Excel(.xlsx) ⇄ 剧本 TS 数据
//
// 用法：
//   node scripts/content.mjs export           # 把现有剧本导出为 content/*.xlsx 模板
//   node scripts/content.mjs import <file> <id>  # 从 xlsx 生成 src/data/<id>.gen.ts
//
// xlsx 结构（每个剧本一个文件，六个 sheet）：
//   scenario / scenes / choices / cards / clues / duels
// 列名见 docs/SCHEMA.md。多值字段（lines、effects 等）用「||」分隔，
// kv 字段（effects/cond/stats）格式： key=value;key2=value2
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const dataDir = new URL("../src/data/", import.meta.url);
const outDir = new URL("../content/", import.meta.url);

const FILES = { fuma: "fuma.ts", qiuwei: "qiuwei.ts", touming: "touming.ts", xie: "xie.ts", qinhuai: "qinhuai.ts", jieyu: "jieyu.ts", sichou: "sichou.ts", shumian: "shumian.ts", changjiang: "changjiang.ts", diaolan: "diaolan.ts", changhen: "changhen.ts", jianfeng: "jianfeng.ts", xingxing: "xingxing.ts" };

function loadAll() {
  const out = {};
  for (const [name, file] of Object.entries(FILES)) {
    let src = readFileSync(new URL(file, dataDir), "utf-8");
    src = src.replace(/^import .*$/gm, "")
      .replace(/export const (\w+)(?:: Scenario)? =/g, "const $1 =")
      // 去掉其余 TS 类型标注（浅层）：
      .replace(/: Scenario\b/g, "").replace(/ as const/g, "");
    const vars = [...src.matchAll(/const (\w+) =/g)].map(m => m[1]);
    const obj = Function(`${src}; return {${vars.join(",")}};`)();
    out[name] = vars.map(v => obj[v]).find(Boolean);
  }
  return out;
}

const S = (v) => (v == null ? "" : String(v));

function toRows(sc) {
  const scenario = [{
    id: sc.id, title: sc.title, subtitle: sc.subtitle, mode: sc.mode,
    stats: (sc.stats ?? []).map(s => `${s.key}:${s.name}=${s.init}`).join(";"),
    startScene: sc.startScene,
    verdict: sc.verdict ? [
      `场景=${sc.verdict.scene}`, `选数=${sc.verdict.mustPick}`,
      `核心=${sc.verdict.coreClue}`, `真线索≥=${sc.verdict.minTrue}`,
      `胜=${sc.verdict.winScene}`, `败=${sc.verdict.loseScene}`,
    ].join(";") : "",
  }];
  const scenes = sc.scenes.map(s => ({
    id: s.id, title: S(s.title), lines: s.lines.join("||"),
    next: S(s.next), duel: S(s.duel),
    effects: (s.effects ?? []).map(fmtEffect).join("||"),
    ending: s.ending ? `${s.ending.name}::${s.ending.rank}::${s.ending.desc}` : "",
  }));
  const choices = sc.scenes.flatMap(s => (s.choices ?? []).map((c, i) => ({
    sceneId: s.id, order: i + 1, text: c.text, hint: S(c.hint),
    cond: c.cond ? fmtCond(c.cond) : "", effects: (c.effects ?? []).map(fmtEffect).join("||"),
    next: c.next,
  })));
  const cards = sc.cards.map(c => ({
    id: c.id, name: c.name, suit: c.suit, text: c.text, lore: c.lore,
    power: c.power ?? "", cost: c.cost ?? "",
  }));
  const clues = (sc.clues ?? []).map(c => ({ id: c.id, name: c.name, kind: c.kind, desc: c.desc }));
  const duels = sc.duels.map(d => ({
    id: d.id, mode: d.mode, title: d.title, intro: d.intro,
    opponent: `${d.opponent.name}::${d.opponent.desc}`,
    goal: d.goal ?? "", hp: d.hp ? `${d.hp.player}/${d.hp.opponent}` : "",
    script: d.script.join(","), deck: d.deck.join(","),
    winScene: d.winScene, loseScene: d.loseScene,
  }));
  return { scenario, scenes, choices, cards, clues, duels };
}

function fmtEffect(e) {
  if (e.setFlag) return `旗标=${e.setFlag}`;
  if (e.unlockClue) return `线索=${e.unlockClue}`;
  if (e.unlockCard) return `卡牌=${e.unlockCard}`;
  if (e.stat) return Object.entries(e.stat).map(([k, v]) => `数值.${k}${v >= 0 ? "+" : ""}${v}`).join("&");
  return "";
}
function fmtCond(c) {
  const p = [];
  if (c.flag) p.push(`旗标=${c.flag}`);
  if (c.notFlag) p.push(`无旗标=${c.notFlag}`);
  if (c.clue) p.push(`线索=${c.clue}`);
    if (c.cluesAtLeast !== undefined) p.push(`线索数≥${c.cluesAtLeast}`);
  if (c.statAtLeast) for (const [k, v] of Object.entries(c.statAtLeast)) p.push(`数值.${k}≥${v}`);
  return p.join(";");
}

// ---------- export ----------
function doExport() {
  mkdirSync(outDir, { recursive: true });
  for (const [id, sc] of Object.entries(loadAll())) {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(toRows(sc)))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    const file = new URL(`${id}.xlsx`, outDir).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    XLSX.writeFile(wb, file);
    console.log("导出:", file);
  }
}

// ---------- import ----------
function parseEffect(s) {
  if (!s) return null;
  const e = {};
  for (const part of s.split("&")) {
    if (part.startsWith("旗标=")) e.setFlag = part.slice(3);
    else if (part.startsWith("线索=")) e.unlockClue = part.slice(3);
    else if (part.startsWith("卡牌=")) e.unlockCard = part.slice(3);
    else if (part.startsWith("数值.")) {
      const m = part.slice(3).match(/^([\w\u4e00-\u9fa5]+)([+-]\d+)$/);
      if (!m) throw new Error(`effects 数值格式错误: "${part}"（应为 数值.键±数字）`);
      e.stat = e.stat ?? {}; e.stat[m[1]] = Number(m[2]);
    }
  }
  return e;
}
function parseCond(s) {
  if (!s) return undefined;
  const c = {};
  for (const part of s.split(";")) {
    if (part.startsWith("旗标=")) c.flag = part.slice(3);
    else if (part.startsWith("无旗标=")) c.notFlag = part.slice(4);
    else if (part.startsWith("线索=")) c.clue = part.slice(3);
    else if (part.startsWith("线索数≥")) c.cluesAtLeast = Number(part.slice(4));
    else if (part.startsWith("数值.")) {
      const m = part.slice(3).match(/^([\w\u4e00-\u9fa5]+)≥(\d+)$/);
      if (!m) throw new Error(`cond 格式错误: "${part}"（应为 数值.键≥数字）`);
      c.statAtLeast = c.statAtLeast ?? {}; c.statAtLeast[m[1]] = Number(m[2]);
    }
  }
  return c;
}
function nonEmpty(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null)); }

// C-5：列白名单硬校验——export 端只写白名单列；白名单之外的列一旦在导入 Excel 中有非空值即抛错，
// 防止内容管线新旧脱节导致新列被静默丢弃（layer/rarity/itemEffect/passive/resource/price/shop/minigame 等
// 引擎/UI 已支持但 content.mjs 尚未支持的列，导入时必须显式报错而非静默吞掉）。
// 当前无「有意忽略」例外列：需忽略的列应直接在导出模板中删除。
function assertKnownCols(sheet, rowList, known) {
  for (const row of rowList) {
    for (const key of Object.keys(row)) {
      const v = row[key];
      if (!known.has(key) && v !== "" && v != null) {
        throw new Error(`[${sheet}] 存在未支持的列「${key}」（值：${S(v).slice(0, 40)}）——该列会被 content.mjs 静默丢弃，请改用已支持列或先扩展脚本`);
      }
    }
  }
}

function doImport(file, id) {
  const wb = XLSX.readFile(file);
  const rows = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
  // C-5：各 sheet 列白名单硬校验（见 assertKnownCols）
  assertKnownCols("scenario", rows("scenario"), new Set(["id", "title", "subtitle", "mode", "stats", "startScene", "verdict"]));
  assertKnownCols("scenes", rows("scenes"), new Set(["id", "title", "lines", "next", "duel", "effects", "ending"]));
  assertKnownCols("choices", rows("choices"), new Set(["sceneId", "order", "text", "hint", "cond", "effects", "next"]));
  assertKnownCols("cards", rows("cards"), new Set(["id", "name", "suit", "text", "lore", "power", "cost"]));
  assertKnownCols("clues", rows("clues"), new Set(["id", "name", "kind", "desc"]));
  assertKnownCols("duels", rows("duels"), new Set(["id", "mode", "title", "intro", "opponent", "goal", "hp", "script", "deck", "winScene", "loseScene"]));
  const [sc0] = rows("scenario");
  const stats = S(sc0.stats).split(";").filter(Boolean).map(p => {
    const [key, rest] = p.split(":"); const [name, init] = rest.split("=");
    return { key, name, init: Number(init) };
  });
  const vd = S(sc0.verdict);
  const sc = {
    id: sc0.id, title: sc0.title, subtitle: sc0.subtitle, mode: sc0.mode,
    stats: stats.length ? stats : undefined,
    startScene: sc0.startScene,
    verdict: vd ? (() => {
      const m = Object.fromEntries(vd.split(";").map(p => p.split("=")));
      return { scene: m["场景"], mustPick: +m["选数"], coreClue: m["核心"], minTrue: +m["真线索≥"], winScene: m["胜"], loseScene: m["败"] };
    })() : undefined,
    cards: rows("cards").map(c => nonEmpty({ id: c.id, name: c.name, suit: c.suit, text: c.text, lore: c.lore, power: c.power === "" ? undefined : +c.power })),
    clues: rows("clues").length ? rows("clues").map(c => ({ id: c.id, name: c.name, kind: c.kind, desc: c.desc })) : [],
    duels: rows("duels").map(d => {
      const [on, od] = S(d.opponent).split("::");
      return nonEmpty({
        id: d.id, mode: d.mode, title: d.title, intro: d.intro,
        opponent: { name: on, desc: od },
        goal: d.goal === "" ? undefined : +d.goal,
        hp: d.hp ? (() => { const [p, o] = S(d.hp).split("/"); return { player: +p, opponent: +o }; })() : undefined,
        script: S(d.script).split(",").filter(Boolean),
        deck: S(d.deck).split(",").filter(Boolean),
        winScene: d.winScene, loseScene: d.loseScene,
      });
    }),
    scenes: rows("scenes").map(s => {
      const choiceList = rows("choices").filter(c => c.sceneId === s.id).sort((a, b) => a.order - b.order)
        .map(c => nonEmpty({ text: c.text, hint: S(c.hint) || undefined, cond: parseCond(S(c.cond)), effects: S(c.effects) ? S(c.effects).split("||").map(parseEffect).filter(Boolean) : undefined, next: c.next }));
      const ending = S(s.ending) ? (() => { const [name, rank, desc] = S(s.ending).split("::"); return { name, rank, desc }; })() : undefined;
      return nonEmpty({
        id: s.id, title: S(s.title) || undefined,
        lines: S(s.lines).split("||"),
        next: S(s.next) || undefined,
        duel: S(s.duel) || undefined,
        effects: S(s.effects) ? S(s.effects).split("||").map(parseEffect).filter(Boolean) : undefined,
        choices: choiceList.length ? choiceList : undefined,
        ending,
      });
    }),
  };
  const out = `// 由 content/${file.replaceAll("\\", "/").split("/").pop()} 生成 —— 请勿手改\nimport type { Scenario } from "../engine/types";\n\nexport const ${id}: Scenario = ${JSON.stringify(sc, null, 2)};\n`;
  const dest = new URL(`${id}.gen.ts`, dataDir).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  writeFileSync(dest, out);
  console.log("生成:", dest, `（${sc.scenes.length} 场景）`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "export") doExport();
else if (cmd === "import") doImport(a, b ?? a?.replace(/[.]xlsx$/, ""));
else { console.log("用法: node scripts/content.mjs export | import <file.xlsx> <exportName>"); process.exit(1); }
