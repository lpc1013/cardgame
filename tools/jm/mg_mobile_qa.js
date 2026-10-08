const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/mg_mobile_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
// 手机默认横屏 844x390（见 memory「手机端默认横屏」）。五艺是五种不同版式的棋盘/题面，
// 唯独这一族屏从没在横屏下量过——牌九要摊一手、围棋是 15 路，最容易撑出屏外。
await page.setViewportSize({ width: 844, height: 390 });

const GAMES = [
  { sc: 'fuma', scene: 'wenchat', type: '对联 duilian' },
  { sc: 'qiuwei', scene: 'qw_logic', type: '证词 logic' },
  { sc: 'sichou', scene: 'sc_paijiu', type: '牌九 paijiu' },
  { sc: 'xie', scene: 'xie_weigi', type: '棋局 gobang' },
  { sc: 'qinhuai', scene: 'jiuling_scene', type: '行令 jiuling' },
];
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen"];

const res = { games: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const measure = (g) => page.evaluate(([gg]) => {
  const de = document.documentElement;
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
  const rect = (e) => { const b = e.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)} → ${Math.round(b.right)},${Math.round(b.bottom)}`; };
  const boards = ['.gobang-board', '.gobang-wrap', '.paijiu-box', '.paijiu-hand', '.quiz-box', '.quiz-prompt', '.jiuling-hand', '.choices', '.story-panel']
    .filter((s) => document.querySelector(s) && vis(document.querySelector(s)))
    .map((s) => `${s}=${rect(document.querySelector(s))}`);
  const btns = [...document.querySelectorAll('button')].filter(vis);
  const small = btns.filter((b) => b.getBoundingClientRect().height < 34 || b.getBoundingClientRect().width < 34)
    .map((b) => `${(b.innerText || '?').replace(/\s+/g, '').slice(0, 8)}@${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
  const offscreen = btns.filter((b) => {
    const r = b.getBoundingClientRect();
    return r.right > de.clientWidth + 1 || r.bottom > de.clientHeight + 1 || r.left < -1 || r.top < -1;
  }).map((b) => (b.innerText || '?').replace(/\s+/g, '').slice(0, 10));
  const main = [...document.querySelectorAll('.btn-main')].filter(vis);
  return {
    ...gg,
    mounted: !!document.querySelector('.shop-root, .story-root, .story-panel'),
    hOverflow: de.scrollWidth - de.clientWidth,
    vOverflow: de.scrollHeight - de.clientHeight,
    vp: `${de.clientWidth}x${de.clientHeight}`,
    boards,
    scrollers: ['.shop-root', '.story-panel', '.quiz-box', '.paijiu-box'].map((sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      return `${sel} ${e.scrollHeight}/${e.clientHeight}${e.scrollHeight > e.clientHeight + 2 ? ' 内滚' : ''}`;
    }).filter(Boolean),
    buttons: btns.length,
    smallTargets: small.slice(0, 8),
    offscreenButtons: offscreen.slice(0, 8),
    mainBtns: main.map((b) => rect(b)),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 150),
  };
}, [g]);

for (const g of GAMES) {
  const SAVE = JSON.stringify({
    version: 4, scenarioId: g.sc, savedAt: Date.now(),
    state: {
      scenarioId: g.sc, sceneId: g.scene, viewpoint: null, flags: [],
      stats: {}, clues: [], bag: [], deck: DECK, silver: 200,
      lineIndex: 99, visited: [g.scene], boosts: [], retinue: [], usedCards: [],
    },
  });
  await page.goto('about:blank');
  await page.waitForTimeout(150);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((v) => {
    localStorage.setItem('dicun_mode_v1', 'light');
    localStorage.setItem('dicun_save_v4', v);
  }, SAVE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1900);
  const clicked = await page.evaluate(() => {
    const b = document.querySelector('.resume-box .btn-main') || document.querySelector('.fab-resume');
    if (b) { b.click(); return true; }
    return false;
  });
  await page.waitForTimeout(2400);
  res.games.push({ resume: clicked, ...(await measure(g)) });
  save();
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
