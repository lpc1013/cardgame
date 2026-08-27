import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";
import type { Scenario } from "../src/engine/types.ts";

const scs: { name: string; sc: Scenario }[] = [
  { name: "fuma", sc: fuma }, { name: "qiuwei", sc: qiuwei }, { name: "sichou", sc: sichou },
  { name: "xie", sc: xie }, { name: "qinhuai", sc: qinhuai },
];

// 1) 同剧本内双 shop 重叠
console.log("===== 同剧本内多 shop 的货架重叠 =====");
for (const { name, sc } of scs) {
  const shops = sc.scenes.filter((s) => s.shop);
  if (shops.length < 2) continue;
  const list = shops.map((s) => ({ id: s.id, title: s.title, stock: new Set(s.shop!.stock) }));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const inter = [...list[i].stock].filter((x) => list[j].stock.has(x));
      if (inter.length) console.log(`  ${name}: ${list[i].id} ∩ ${list[j].id} = [${inter.join(", ")}]`);
      else console.log(`  ${name}: ${list[i].id} ∩ ${list[j].id} = 无`);
    }
  }
}

// 2) 跨剧本同名卡出现在多少个 shop（stock + hiddenStock + packs pool）
console.log("");
console.log("===== 跨剧本商品重叠（同一卡出现在多个剧本的 shop） =====");
const cardShops = new Map<string, string[]>();
for (const { name, sc } of scs) {
  for (const s of sc.scenes.filter((x) => x.shop)) {
    const sh = s.shop!;
    const all = [
      ...sh.stock,
      ...(sh.hiddenStock ?? []).map((h) => h.id),
      ...(sh.packs ?? []).flatMap((p) => p.pool),
    ];
    for (const id of all) {
      if (!cardShops.has(id)) cardShops.set(id, []);
      cardShops.get(id)!.push(`${name}/${s.id}`);
    }
  }
}
const dup = [...cardShops.entries()].filter(([, v]) => new Set(v).size > 1);
if (!dup.length) console.log("  无跨剧本重复商品");
for (const [id, shops] of dup) {
  const unique = [...new Set(shops)];
  console.log(`  ${id} → ${unique.join("、")}${unique.length !== shops.length ? `（${shops.length} 处）` : ""}`);
}

// 3) 同剧本内 卡包 pool 与货架 的重叠（开包能开出货架上明卖的卡）
console.log("");
console.log("===== 同剧本内「货架明卖 ∩ 卡包可开出」 =====");
for (const { name, sc } of scs) {
  for (const s of sc.scenes.filter((x) => x.shop)) {
    const sh = s.shop!;
    const packs = sh.packs ?? [];
    if (!packs.length) continue;
    const pool = new Set(packs.flatMap((p) => p.pool));
    const inter = sh.stock.filter((x) => pool.has(x));
    if (inter.length) console.log(`  ${name}/${s.id}: 货架∩卡包 = [${inter.join(", ")}]`);
  }
}
