// 番外钥匙卡可达性精确扫描 v3——按对局 id 位置分块，无缩进假设
// 判定与 App.tsx 一致：hits = keyCards ∩ cfg.deck ≥ need；全剧本死局（unwinnable）→ 败线兜底豁免
import { readFileSync } from "node:fs";

const bonus = readFileSync("src/data/bonus.ts", "utf8");
const scenes = [];
for (const m of bonus.matchAll(/id: "bonus_(\w+)"/g)) {
  const seg = bonus.slice(m.index, bonus.indexOf("\n  }", m.index));
  scenes.push({
    id: m[1],
    scenarioId: (seg.match(/scenarioId: "(\w+)"/) ?? [])[1] ?? m[1],
    need: +((seg.match(/need: (\d+)/) ?? [])[1] ?? 2),
    keyCards: [...(seg.matchAll(/"([a-z]+_\w+)"/g) ?? [])].map((x) => x[1]),
  });
}

let allOk = true;
for (const b of scenes) {
  const data = readFileSync(`src/data/${b.scenarioId}.ts`, "utf8");
  // 对局 id 位置分块
  const ids = [...data.matchAll(/id: "d_(\w+)"/g)];
  const duels = [];
  for (let i = 0; i < ids.length; i++) {
    const start = ids[i].index;
    const end = i + 1 < ids.length ? ids[i + 1].index : data.length;
    const block = data.slice(start, end);
    const deckM = block.match(/deck:\s*\[([^\]]*)\]/);
    if (deckM) {
      const cards = [...deckM[1].matchAll(/"([a-z]+_\w+)"/g)].map((x) => x[1]);
      duels.push({ unw: /unwinnable:\s*true/.test(block), hits: b.keyCards.filter((k) => cards.includes(k)).length });
    }
  }
  const maxHits = Math.max(0, ...duels.map((d) => d.hits));
  const noWinRoute = duels.length > 0 && duels.every((d) => d.unw);
  const ok = noWinRoute || maxHits >= b.need;
  allOk = allOk && ok;
  console.log(
    `${b.id.padEnd(14)} need=${b.need} 对局=${duels.length} 最大命中=${maxHits} ${noWinRoute ? "[全死局·败线兜底]" : ""} ${ok ? "OK" : "✗ 不可达"}`
  );
}
console.log(allOk ? "\n全部番外可达 ✓" : "\n存在不可达番外 ✗");
process.exit(allOk ? 0 : 1);
