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

const scs: { name: string; sc: Scenario }[] = [
  { name: "fuma", sc: fuma }, { name: "qiuwei", sc: qiuwei }, { name: "sichou", sc: sichou },
  { name: "xie", sc: xie }, { name: "qinhuai", sc: qinhuai }, { name: "jieyu", sc: jieyu },
  { name: "shumian", sc: shumian }, { name: "changjiang", sc: changjiang }, { name: "diaolan", sc: diaolan },
  { name: "changhen", sc: changhen }, { name: "jianfeng", sc: jianfeng }, { name: "xingxing", sc: xingxing },
  { name: "touming", sc: touming },
];

for (const { name, sc } of scs) {
  const withMini = sc.scenes.filter((s) => s.minigame);
  if (!withMini.length) continue;
  console.log(`【${name}】minigame 场景 ${withMini.length} 个：`);
  for (const s of withMini) {
    const mg = s.minigame!;
    const info = {
      gobang: `棋局残局（多手正解${(mg as any).moves?.length ?? "?"}手）`,
      jiuling: `宴会行令（目标 ${(mg as any).target ?? "?"} 胜）`,
    }[mg.type] ?? mg.type;
    // 该场景在剧本中的位置：被哪些场景/选项引用
    const refs: string[] = [];
    for (const s2 of sc.scenes) {
      if (s2.next === s.id) refs.push(`next:${s2.id}`);
      for (const ch of s2.choices ?? []) if (ch.next === s.id) refs.push(`选项(${s2.id})`);
      for (const s3 of s2.choices ?? []) if (s3.cond) {}
    }
    const winNext = (mg as any).winNext ?? "?";
    const loseNext = (mg as any).loseNext ?? "?";
    console.log(`  · ${s.id}「${s.title}」 → ${info} | 胜→${winNext} 败→${loseNext}`);
    if (refs.length) console.log(`      入口: ${refs.join("、")}`);
  }
}
