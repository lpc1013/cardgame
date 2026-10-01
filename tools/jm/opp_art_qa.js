const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/opp_art_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 立绘接线的验收：新落的 10 张 opp_<对局id>.jpg 必须真的把席位的朱印回落顶掉。
// 只看 .dt-seat-img 在不在——文件名对不上时页面不会报错，只会安静地继续画那枚印。
const CASES = [
  ['changhen', 'duel_intro', 'd_sima'],
  ['changjiang', 'q_intro', 'd_qipan'],
  ['changjiang', 'ch_weichi_duel', 'd_sipan_chai'],
  ['jieyu', 'p1_last', 'd_laststand'],
  ['jieyu', 'nanqian_yi', 'd_chaobian'],
  ['shumian', 'hx_baiyu_intro', 'd_baiyu'],
  ['shumian', 'a2_backstab_intro', 'd_guling'],
  ['touming', 'ch2_court', 'd_chai_tea'],
  ['touming', 'ch3_depart', 'd_li_yuan'],
  ['xingxing', 'geban_intro', 'd_geban'],
];

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

for (const [sc, scene, duel] of CASES) {
  const SAVE = JSON.stringify({
    version: 4, scenarioId: sc, savedAt: Date.now(),
    state: {
      scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
      stats: {}, clues: [], bag: [], deck: [], silver: 60,
      lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
    },
  });
  await page.goto('about:blank');
  await page.waitForTimeout(200);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SAVE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
  res[duel] = await page.evaluate((want) => {
    const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
    const img = document.querySelector('.dt-opp .dt-seat-img');
    return {
      want,
      onDuel: vis('.duel-root'),
      img: !!img,
      seal: vis('.dt-opp .dt-seat-seal'),
      src: img ? (img.currentSrc || img.src).split('/').pop() : null,
      natural: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
      name: (document.querySelector('.dt-opp .dt-seat-name') || {}).innerText || null,
    };
  }, duel);
  save();
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
