// 临时脚本：校验三个多视角剧本的场景引用闭合 + 结局可达
import { jieyu } from "../src/data/jieyu.ts";
import { changjiang } from "../src/data/changjiang.ts";
import { shumian } from "../src/data/shumian.ts";

let bad = 0;
for (const sc of [jieyu, changjiang, shumian]) {
  const ids = new Set(sc.scenes.map((s) => s.id));
  const check = (from: string, to: string | undefined, label: string) => {
    if (to && !ids.has(to)) { console.log(`[BROKEN] ${sc.id} ${from} ${label}->${to}`); bad++; }
  };
  for (const s of sc.scenes) {
    check(s.id, s.next, "next");
    check(s.id, s.next2, "next2");
    if (s.duel) {
      const d = sc.duels?.find((x) => x.id === s.duel);
      if (!d) { console.log(`[BROKEN] ${sc.id} ${s.id} duel ${s.duel} missing`); bad++; }
      else { check(s.id, d.winScene, "duel-win"); check(s.id, d.loseScene, "duel-lose"); }
    }
    for (const c of s.choices ?? []) check(s.id, c.next, "choice");
    if (s.cardPick) check(s.id, s.next2, "pick");
  }
  check("startScene", sc.startScene, "start");
  for (const v of sc.viewpoints ?? []) {
    check(`vp:${v.id}`, v.startScene, "vp-start");
    for (const e of v.endings ?? []) {
      if (!ids.has(e)) { console.log(`[BROKEN] ${sc.id} vp:${v.id} ending ${e} missing`); bad++; }
    }
  }
  // 结局总数与视角收录
  const endings = sc.scenes.filter((s) => s.ending);
  const listed = new Set((sc.viewpoints ?? []).flatMap((v) => v.endings ?? []));
  const unlisted = endings.filter((e) => !listed.has(e.id));
  console.log(`${sc.id}: scenes=${sc.scenes.length} endings=${endings.length}${unlisted.length ? ` UNLISTED:${unlisted.map((e) => e.id).join(",")}` : ""}`);
}
console.log(bad === 0 ? "AUDIT PASS" : `AUDIT FAIL: ${bad}`);
