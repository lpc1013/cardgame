// 临时：导出多视角剧本场景图（用完即删）
import { jieyu } from "../src/data/jieyu.ts";
import { shumian } from "../src/data/shumian.ts";
import { changjiang } from "../src/data/changjiang.ts";
import { xingxing } from "../src/data/xingxing.ts";
import * as fs from "node:fs";

const out: Record<string, unknown> = {};
for (const sc of [jieyu, shumian, changjiang, xingxing]) {
  out[sc.id] = {
    start: sc.startScene,
    scenes: sc.scenes.map((s) => ({
      id: s.id,
      t: s.title,
      next: s.next,
      ch: (s.choices ?? []).map((c) => ({ n: c.next, cond: c.cond ? Object.keys(c.cond) : undefined })),
      duel: s.duel,
      end: s.ending ? `${s.ending.name}|${s.ending.rank}` : undefined,
    })),
  };
}
fs.writeFileSync("graph_tmp.json", JSON.stringify(out, null, 1), "utf8");
console.log("ok");
