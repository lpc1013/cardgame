// 临时：盘点缺失的结局配图（end_<剧本>_<场景>.jpg），跑完可删
import { readdirSync } from "node:fs";
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
import { diaolan } from "../src/data/diaolan.ts";
import { xingxing } from "../src/data/xingxing.ts";
import { touming } from "../src/data/touming.ts";
import type { Scenario } from "../src/engine/types.ts";

const have = new Set(readdirSync("src/assets/endings").map((f) => f.replace(/\.(jpg|jpeg|png)$/, "")));
const ALL: Scenario[] = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, changhen, jianfeng, diaolan, xingxing, touming];
let missing = 0, ok = 0;
for (const sc of ALL) {
  for (const s of sc.scenes) {
    if (!s.ending) continue;
    const key = `end_${sc.id}_${s.id}`;
    if (have.has(key)) { ok++; continue; }
    missing++;
    console.log(`${key}\t【${sc.title}】${s.ending.name} · ${s.ending.rank}`);
  }
}
console.log(`\n已有 ${ok} 张，缺失 ${missing} 张`);
