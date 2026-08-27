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
import type { Scenario } from "../src/engine/types.ts";

const ALL: [string, Scenario][] = [["fuma", fuma], ["qiuwei", qiuwei], ["sichou", sichou], ["xie", xie], ["qinhuai", qinhuai], ["jieyu", jieyu], ["shumian", shumian], ["changjiang", changjiang], ["diaolan", diaolan], ["changhen", changhen], ["jianfeng", jianfeng], ["xingxing", xingxing], ["touming", touming]];
for (const [name, sc] of ALL) {
  let trap = 0, situ = 0, sac = 0, draw = 0, reveal = 0, item = 0, person = 0, res = 0, powerOnly = 0;
  for (const c of sc.cards) {
    const layer = c.layer ?? "成术";
    if (layer === "物品") { item++; continue; }
    if (layer === "人物") { person++; continue; }
    if (layer === "资源") { res++; continue; }
    const mech = !!(c.situational || c.sacrifice || c.drawOnPlay || c.trap || c.reveal);
    if (c.trap) trap++;
    else if (c.situational) situ++;
    else if (c.sacrifice) sac++;
    else if (c.drawOnPlay) draw++;
    else if (c.reveal) reveal++;
    else if (!mech && c.power != null) powerOnly++;
  }
  console.log(name.padEnd(11), `陷阱${trap} 情境${situ} 牺牲${sac} 抽牌${draw} 揭示${reveal} | 物${item} 人${person} 资${res} | 纯数值成术${powerOnly}`);
}
