const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const BASE = 'http://localhost:5199/';
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 抓三张"案件玩起来是什么样"的现场：hub（探案主屏）、对局、市集。
// 只为把"粗糙/没有玩法感"这句反馈落到具体画面上，不做断言。
const shots = [
  ['case_hub', 'fuma', 'hub', ['t1', 't2', 't5']],
  ['case_duel', 'fuma', 'a_duel_scene', []],
  ['case_shop', 'fuma', 'market', []],
];
const log = [];
for (const [tag, sc, scene, clues] of shots) {
  const save = JSON.stringify({
    version: 4, scenarioId: sc, savedAt: Date.now(),
    state: {
      scenarioId: sc, sceneId: scene, viewpoint: null, flags: [], stats: { chaoting: 62, daoyi: 55, renwang: 48 },
      clues, bag: [], deck: [], silver: 60, lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
    },
  });
  await page.goto('about:blank');
  await page.waitForTimeout(250);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), save);
  await page.evaluate(() => localStorage.setItem('dicun_mode_v1', 'light'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const b = document.querySelector('.resume-box .btn-main');
    if (b) b.click();
  });
  await page.waitForTimeout(2600);
  const info = await page.evaluate(() => ({
    root: (document.querySelector('#root > div') || {}).className,
    imgs: document.querySelectorAll('img').length,
    cards: document.querySelectorAll('.tcard').length,
    textLen: (document.body.innerText || '').length,
  }));
  log.push({ tag, ...info });
  try { await page.screenshot({ path: `${OUT}/feel_${tag}.png` }); }
  catch (e) { try { await page.screenshot({ path: `${OUT}/feel_${tag}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); } catch (e2) {} }
}
fs.writeFileSync(`${OUT}/feel.json`, JSON.stringify({ log, pageCount: (typeof pages === 'function' ? pages() : context.pages()).length }, null, 1));
