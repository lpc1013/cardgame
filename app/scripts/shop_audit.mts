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
  const shops = sc.scenes.filter((s) => s.shop);
  if (!shops.length) { console.log(`【${name}】无 shop 场景`); continue; }
  console.log(`【${name}】shop 场景 ${shops.length} 个：`);
  for (const s of shops) {
    const sh = s.shop!;
    const hidden = sh.hiddenStock?.length ?? 0;
    const packs = sh.packs?.length ?? 0;
    const sicbo = s.minigame ? ` +minigame:${s.minigame.type}` : "";
    const packInfo = (sh.packs ?? []).map((p) => `${p.name}${p.price}两×${p.draws}抽`).join("、");
    console.log(`  · ${s.id}「${s.title}」 shop:${sh.name} 货架${sh.stock.length} 卡包${packs} 暗柜${hidden}${sicbo}`);
    if (packInfo) console.log(`      卡包: ${packInfo}`);
  }
}
