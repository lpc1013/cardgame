// 盘点结局配图缺口：对比全部结局场景与 assets/endings/ 已有文件
import { readdirSync, writeFileSync } from "node:fs";
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
const SCENARIOS = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];

const have = new Set(readdirSync("src/assets/endings"));
const missing: { sc: string; scene: string; name: string; rank: string; file: string }[] = [];
const total: string[] = [];
for (const sc of SCENARIOS) {
  for (const s of sc.scenes) {
    if (!s.ending) continue;
    const file = `end_${sc.id}_${s.id}.jpg`;
    total.push(file);
    if (!have.has(file) && !have.has(`end_${sc.id}_${s.id}.png`)) {
      missing.push({ sc: sc.id, scene: s.id, name: s.ending.name, rank: s.ending.rank, file });
    }
  }
}
writeFileSync("../tmp_missing.json", JSON.stringify({ total: total.length, missing }, null, 1), "utf8");
console.log(`结局总数 ${total.length}，缺图 ${missing.length}`);
