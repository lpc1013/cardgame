// 图片引用核对：数据 id 约定（卡=id、场景=剧本_幕、结局=end_剧本_幕、封面=cover_剧本、成就=ach_图标）× src/assets 实际文件
// 用法：node --experimental-strip-types scripts/audit-art.mts
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
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
import { touming } from "../src/data/touming.ts";
import { xingxing } from "../src/data/xingxing.ts";
import { ACHIEVEMENTS } from "../src/data/achievements.ts";

const SCENARIOS = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, touming, xingxing];
const ASSETS = join(import.meta.dirname, "../src/assets");

function keys(rel: string, depth = 1): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const dir = join(ASSETS, rel);
  if (!existsSync(dir)) return m;
  const walk = (d: string, prefix: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) { if (depth > 1) walk(join(d, f.name), prefix + f.name + "/"); continue; }
      const dot = f.name.lastIndexOf(".");
      const base = f.name.slice(0, dot);
      const ext = f.name.slice(dot).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
      // 与 App buildArtIndex 一致：按纯文件名（不含子目录）建索引
      const k = base;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(prefix + f.name);
    }
  };
  walk(dir, "");
  return m;
}

const cards = keys("cards", 2);
const portraits = keys("portraits");
const scenes = keys("scenes");
const covers = keys("covers");
const endings = keys("endings");
const achs = keys("achievements");

let issues = 0;
const say = (s: string) => { issues++; console.log(s); };

// 1) 同 id 多后缀共存（png/jpg 双胞胎——易出现新旧图混淆）
for (const [name, m] of [["cards", cards], ["portraits", portraits], ["scenes", scenes], ["covers", covers], ["endings", endings], ["achievements", achs]] as const) {
  for (const [k, files] of m) if (files.length > 1) say(`[双胞胎] ${name}/${k}: ${files.join(", ")}`);
}

// 2) 封面：每个剧本必须有 cover_<id>
for (const sc of SCENARIOS) if (!covers.has(`cover_${sc.id}`)) say(`[缺封面] cover_${sc.id}`);

// 3) 卡牌：每张卡（含对局 oppCards）必须有卡面（cards 目录，或人物卡回落 portraits）
for (const sc of SCENARIOS) {
  const all = [...sc.cards, ...sc.duels.flatMap((d) => d.oppCards ?? [])];
  const missing = all.filter((c) => !cards.has(c.id) && !portraits.has(c.id)).map((c) => `${c.id}(${c.name})`);
  if (missing.length) say(`[缺卡面] ${sc.id}: ${[...new Set(missing)].join(" ")}`);
}

// 3b) gu/ 目录语义：cards/gu 只放「孤品」稀有度的物品/资源卡面（特殊收藏、四色之外的极少数）；
//     人物卡一律不入 gu/——孤品人物仍按花色归位（势）。非孤品混进来 = 把孤品架当杂物间
//     （历史上 i_/r_/s_ 曾整体倾倒于此积到 86 张，后又清剩 3 张孤品人物，两轮均被用户退回）
{
  const loneOf = new Map<string, boolean>();
  for (const sc of SCENARIOS) for (const c of sc.cards) {
    if (!loneOf.has(c.id)) loneOf.set(c.id, c.rarity === "孤品" && (c.layer ?? "成术") !== "人物");
  }
  for (const [k, files] of cards) {
    for (const f of files) {
      const inGu = f.startsWith("gu/");
      const belongs = loneOf.get(k) === true;
      if (inGu && !belongs) say(`[gu目录滥用] gu/${k}——${loneOf.has(k) ? "人物卡纵是孤品也不入孤品架" : "非孤品或查无此卡"}，请迁往花色目录`);
      if (belongs && !inGu) say(`[孤品未入gu] ${k} 是孤品物品/资源，卡面却在「${f}」`);
    }
  }
}

// 4) 场景底图与结局图：与 sceneArt 的三级回退一致（剧本前缀 → scn_旧命名 → 裸 id）
let noScene = 0, noEnd = 0;
for (const sc of SCENARIOS) {
  for (const s of sc.scenes) {
    if (!scenes.has(`${sc.id}_${s.id}`) && !scenes.has(`scn_${s.id}`) && !scenes.has(s.id)) { noScene++; console.log(`  · 无场景图 ${sc.id}/${s.id}`); }
    if (s.ending && !endings.has(`end_${sc.id}_${s.id}`)) { noEnd++; console.log(`  · 无结局图 end_${sc.id}_${s.id}`); }
  }
}

// 5) 成就图标
for (const a of ACHIEVEMENTS) if (!achs.has(`ach_${a.id}`)) say(`[缺成就图标] ach_${a.id}`);

// 6) （卡框体系已于 2026-09-18 按需求下线，assets/frames 不再被引用）

// 7) 孤儿文件：assets 里存在但没有任何数据 id 引用（含对局 oppCards 与败线 endArt 查找）
const used = new Set<string>([
  ...SCENARIOS.flatMap((sc) => [
    ...sc.cards.map((c) => c.id),
    ...sc.duels.flatMap((d) => [...(d.oppCards ?? []).map((c) => c.id), ...(d.loseScene ? [`end_${sc.id}_${d.loseScene}`] : [])]),
    ...sc.scenes.map((s) => `${sc.id}_${s.id}`),
    ...sc.scenes.map((s) => `scn_${s.id}`),
    ...sc.scenes.filter((s) => s.ending).map((s) => `end_${sc.id}_${s.id}`),
    `cover_${sc.id}`,
  ]),
  ...ACHIEVEMENTS.map((a) => `ach_${a.id}`),
]);
for (const [name, m] of [["cards", cards], ["portraits", portraits], ["scenes", scenes], ["covers", covers], ["endings", endings], ["achievements", achs]] as const) {
  for (const k of m.keys()) if (!used.has(k)) console.log(`  · 孤儿 ${name}/${k}`);
}

console.log(`\n硬性问题 ${issues} 项；无场景图 ${noScene} 幕、无结局图 ${noEnd} 个（若为刻意留白可忽略）`);
