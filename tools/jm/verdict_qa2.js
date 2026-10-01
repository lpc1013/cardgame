const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/verdict_qa2.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 结案屏这轮改了三件事，逐件量：
// ① 线索卡不再跑出视口右缘；② 这一幕有自己的场景底；③ 拣中要一眼可辨（不只是描边换个色）。
const DECK = ["c_wei_yamen", "c_li_qian", "c_qing_tong", "c_qing_nv", "c_li_lun"];
const CASES = [
  ['fuma', 'verdict', ['x1', 'x2', 'x3', 'x4', 'x5', 'x6']],
  ['xie', 'verdict', ['v1', 'v2', 'v3', 'v4', 'v9', 'v10']],
  ['sichou', 'verdict', ['t1', 't2', 't3', 't5']],
];

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const probe = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const cards = [...document.querySelectorAll('.clue-card')].filter(vis);
  const de = document.documentElement;
  const panel = document.querySelector('.story-panel');
  const pr = panel ? panel.getBoundingClientRect() : null;
  const bg = document.querySelector('.verdict-root .scene-bg');
  return {
    cards: cards.length,
    offRight: cards.filter((e) => e.getBoundingClientRect().right > de.clientWidth - 2).length,
    panelLeft: pr ? Math.round(pr.left) : null,
    panelRight: pr ? Math.round(pr.right) : null,
    // 左右留白相等才叫居中。第一版写成 |left + (innerWidth-right)| < 6，
    // 居中时两项同号、相加是 2*left，永远不小于 6 —— 把对的判成 False。
    panelCentered: pr ? Math.abs(pr.left - (innerWidth - pr.right)) < 6 : null,
    backdrop: bg ? getComputedStyle(bg).backgroundImage !== 'none' : false,
    slips: [...document.querySelectorAll('.clue-slip')].filter(vis).length,
    marks: [...document.querySelectorAll('.clue-mark')].filter(vis).map((e) => e.innerText).join(','),
    btn: (document.querySelector('.story-panel .btn-main') || {}).innerText || null,
    overflowX: de.scrollWidth - de.clientWidth,
  };
});

const audit = () => page.evaluate(() => {
  if (!window.__audit) return { f: -1, c: 0, l: ['NO-AUDIT'] };
  const a = window.__audit();
  return { f: a.fails, c: a.checked, l: a.list.filter((y) => y[0] !== '.sub' && y[0] !== '.cover-ends').slice(0, 10).map((y) => y[0] + ':' + y[1] + '@' + y[4]) };
});

for (const [sc, scene, clues] of CASES) {
  const SAVE = JSON.stringify({
    version: 4, scenarioId: sc, savedAt: Date.now(),
    state: {
      scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
      stats: { chaoting: 62, daoyi: 55, renwang: 48 },
      clues, bag: DECK.slice(0, 4), deck: DECK, silver: 100,
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
  await page.addScriptTag({ url: URL + 'scripts/contrast-audit.js' }).catch(() => {});
  await page.waitForTimeout(500);
  res[sc] = { clues: clues.length, ...(await probe()), ...(await audit()) };
  // 拣两张，看"已拣"与按钮文案怎么变
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cs = [...document.querySelectorAll('.clue-card')];
    if (cs[0]) { cs[0].click(); await sleep(260); }
    if (cs[1]) { cs[1].click(); await sleep(260); }
  });
  await page.waitForTimeout(500);
  res[sc].afterPick = await probe();
  try { await page.screenshot({ path: `${OUT}/w_${sc}_verdict.png` }); res[sc].shot = 'full'; }
  catch {
    try { await page.screenshot({ path: `${OUT}/w_${sc}_verdict.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); res[sc].shot = 'clip'; }
    catch { res[sc].shot = 'failed'; }
  }
  save();
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
