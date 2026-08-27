import { readdirSync, existsSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
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
import { xingxing } from "../src/data/xingxing.ts";
import { touming } from "../src/data/touming.ts";

// 执行模式：DRY=只打印；RUN=真实移动/归档
const RUN = process.argv.includes("--run");
const BACKUP = "E:/CardGame/_archive/card_dup_backup/";

const scs = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];

const cardMeta = new Map<string, { layer: string; suit?: string }>();
for (const sc of scs) {
  for (const c of sc.cards) cardMeta.set(c.id, { layer: c.layer ?? "成术", suit: c.suit });
  for (const d of sc.duels ?? []) for (const oc of d.oppCards ?? []) cardMeta.set(oc.id, { layer: oc.layer ?? "成术", suit: oc.suit });
}

function targetDir(cardId: string): string {
  const meta = cardMeta.get(cardId);
  if (meta && meta.layer === "成术" && meta.suit) {
    const m: Record<string, string> = { 策: "策", 器: "器", 势: "势", 隐: "隐" };
    if (m[meta.suit]) return m[meta.suit];
  }
  return "gu";
}

const CARDS = "src/assets/cards";
const DIRS = ["gu", "策", "器", "势", "隐"];

// 现有文件清单
const files: { rel: string; name: string; dir: string }[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".jpg")) files.push({ rel: p, name: e.name, dir });
  }
};
walk(CARDS);

// 按 id 分组
const byId = new Map<string, typeof files>();
for (const f of files) {
  const id = f.name.replace(/\.jpg$/, "");
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id)!.push(f);
}

// 规划
const toMove: string[] = [];   // {from} -> 规范目录（目录里还没有）
const toRemove: string[] = []; // 重复副本（直接删）
let skipped = 0;

for (const [id, copies] of byId) {
  const tgt = targetDir(id);
  const canonPath = join(CARDS, tgt, `${id}.jpg`);
  const inCanon = copies.some((c) => c.rel === canonPath);
  if (inCanon) {
    // 规范位置已有 → 删其余全部副本
    for (const c of copies) if (c.rel !== canonPath) toRemove.push(c.rel);
  } else {
    // 规范位置没有 → 取第一份移动，其余删除
    const [first, ...rest] = copies;
    toMove.push(`${first.rel} -> ${canonPath}`);
    for (const c of rest) toRemove.push(c.rel);
  }
}

console.log(`唯一 id: ${byId.size}`);
console.log(`待移动: ${toMove.length}`);
console.log(`待删除(归档): ${toRemove.length}`);
console.log(`模式: ${RUN ? "RUN" : "DRY-RUN"}`);
console.log("");
console.log("=== 移动清单 ===");
toMove.forEach((m) => console.log(`  MOVE  ${m}`));
console.log("");
console.log("=== 删除(归档)清单 ===");
toRemove.forEach((r) => console.log(`  DEL   ${r}`));

if (RUN) {
  // 1) 确保目标目录存在
  for (const d of DIRS) mkdirSync(join(CARDS, d), { recursive: true });
  // 2) 移动
  for (const m of toMove) {
    const [from, to] = m.split(" -> ");
    if (!existsSync(from)) { console.error(`!! 源不存在: ${from}`); continue; }
    if (existsSync(to)) { console.error(`!! 目标已存在: ${to}（跳过，防覆盖）`); continue; }
    renameSync(from, to);
    console.log(`  ✓ MOVE ${from} -> ${to}`);
  }
  // 3) 归档重复副本
  mkdirSync(BACKUP, { recursive: true });
  for (const r of toRemove) {
    if (!existsSync(r)) { console.error(`!! 源不存在: ${r}`); continue; }
    const name = r.split(/[\\/]/).pop()!;
    let dest = join(BACKUP, name);
    // 防重名：加序号
    let i = 1;
    while (existsSync(dest)) dest = join(BACKUP, `${name.replace(/\.jpg$/, "")}_${i++}.jpg`);
    renameSync(r, dest);
    console.log(`  ✓ ARCH ${r} -> ${dest}`);
  }
  console.log("");
  console.log("执行完成。");
} else {
  console.log("");
  console.log("（DRY-RUN，未改动任何文件。加 --run 执行）");
}
