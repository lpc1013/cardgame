const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/minigame_audit.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 五个小游戏的落点幕（type @ sceneId）。丝绸案推牌九刚查出"押完第一局屏上没有任何可点东西"
// 的硬死锁（押注视图整块 gate 在 result === null 上，而 result 永不复位）。
// 同类写法要逐个验，所以这里每幕单独灌存档、走 45 步，看它能不能自己走完。
const MG = [
  ['fuma_duilian', 'fuma', 'wenchat'],
  ['qiuwei_logic', 'qiuwei', 'qw_logic'],
  ['sichou_paijiu', 'sichou', 'sc_paijiu'],
  ['qinhuai_jiuling', 'qinhuai', 'jiuling_scene'],
  ['xie_gobang', 'xie', 'xie_weigi'],
];

const seed = (sc, scene) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [], stats: {},
    clues: [], bag: [], deck: [], silver: 60, lineIndex: 0, visited: [scene],
    boosts: [], retinue: [], usedCards: [],
  },
});

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const snap = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3 && !e.disabled; };
  const q = (s) => [...document.querySelectorAll(s)].filter(vis);
  const st = (() => { try { return JSON.parse(localStorage.getItem('dicun_save_v4') || '{}').state || {}; } catch (e) { return {}; } })();
  return {
    scene: st.sceneId,
    onStage: !!document.querySelector('.shop-root'),
    clickable: q('.choices .choice').length + q('.shop-root .btn-main').length + q('.shop-root .gobang-cell').length,
    head: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 56),
  };
});

const clickOne = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3 && !e.disabled; };
  const q = (s) => [...document.querySelectorAll(s)].filter(vis);
  const cell = q('.shop-root .gobang-cell');
  const bet = q('.choices .choice');
  const main = q('.shop-root .btn-main');
  // 终局按钮（收下彩头/起身离席/领赏/告辞/拱手告退）优先——它一出现就说明这一局打完了
  if (main.length) { main[0].click(); return 'main'; }
  if (bet.length) {
    const i = (window.__n = ((window.__n || 0) + 1) % bet.length);
    bet[i].click(); return 'bet';
  }
  if (cell.length) { cell[0].click(); return 'cell'; }
  return null;
});

for (const [tag, sc, scene] of MG) {
  if (res[tag]) continue;
  await page.goto('about:blank');
  await page.waitForTimeout(250);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), seed(sc, scene));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const b = document.querySelector('.resume-box .btn-main') || document.querySelector('.fab-resume');
    if (b) b.click();
  });
  await page.waitForTimeout(1800);

  let outcome = 'budget';
  let zeroAt = null;
  let steps = 0;
  for (let i = 0; i < 45; i++) {
    const s = await snap();
    if (!s.onStage) { outcome = 'left'; steps = i; break; }
    if (s.clickable === 0) { outcome = 'dead-end'; zeroAt = s.head; steps = i; break; }
    const acted = await clickOne();
    if (!acted) { outcome = 'dead-end'; zeroAt = s.head; steps = i; break; }
    await page.waitForTimeout(520);
  }
  const end = await snap();
  res[tag] = { outcome, steps, zeroAt, endScene: end.scene, endHead: end.head };
  save();
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
