import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";

const cases: [string, any][] = [
  ["fuma", fuma], ["qiuwei", qiuwei], ["sichou", sichou], ["xie", xie], ["qinhuai", qinhuai],
];
for (const [k, sc] of cases) {
  console.log(`\n# ${k} :: ${sc.title}`);
  for (const c of sc.cards) {
    const lore = (c.lore ?? "").replace(/\n/g, " ");
    console.log(`CARD\t${c.id}\t${c.layer ?? "成术"}\t${c.rarity ?? "凡"}\t${c.suit ?? "-"}\t${c.itemEffect ?? "-"}\t${c.resource ?? "-"}\t${c.name}\t${lore}`);
  }
  for (const d of sc.duels ?? []) {
    if (d.oppCards) for (const c of d.oppCards)
      console.log(`OPP\t${k}\t${d.id}\t${c.suit}\t${c.power}\t${c.name}\t${(c.lore ?? "").replace(/\n/g," ")}`);
    if (d.opponent) console.log(`OPPNAME\t${k}\t${d.id}\t${d.opponent.name}\t${d.opponent.desc}`);
  }
}
