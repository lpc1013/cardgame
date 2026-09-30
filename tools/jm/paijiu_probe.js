const fs = require('fs');
const BASE = 'http://localhost:5199/';
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 丝绸案在 sc_paijiu 上被判 loop。到底是牌九走不动，还是遍历器点错了东西——量一次。
const SEED = JSON.stringify({
  version: 4, scenarioId: 'sichou', savedAt: Date.now(),
  state: {
    scenarioId: 'sichou', sceneId: 'sc_paijiu', viewpoint: null, flags: [], stats: {},
    clues: [], bag: [], deck: [], silver: 60, lineIndex: 0, visited: ['sc_paijiu'],
    boosts: [], retinue: [], usedCards: [],
  },
});

const snap = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const list = (s) => [...document.querySelectorAll(s)].filter(vis).map((b) => `${b.innerText.trim().slice(0, 10)}${b.disabled ? '(哑)' : ''}`);
  return {
    root: (document.querySelector('#root > div') || {}).className,
    choices: list('.choices .choice'),
    shopChoice: list('.shop-root .choice'),
    shopMain: list('.shop-root .btn-main'),
    log: (document.querySelector('.story-panel .story-line') || {}).innerText || '',
    round: (document.querySelector('.paijiu-box .muted') || {}).innerText || '',
  };
});

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SEED);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  const b = document.querySelector('.resume-box .btn-main') || document.querySelector('.fab-resume');
  if (b) b.click();
});
await page.waitForTimeout(1800);

const steps = [];
for (let i = 0; i < 9; i++) {
  steps.push(await snap());
  // 按遍历器同样的优先级点一下
  await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3 && !e.disabled; };
    const q = (s) => [...document.querySelectorAll(s)].filter(vis);
    const a = q('.choices .choice') || [];
    if (a.length) { a[0].click(); return; }
    const b = q('.shop-root .btn-main');
    if (b.length) { b[0].click(); return; }
  });
  await page.waitForTimeout(900);
}
fs.writeFileSync('E:/CardGame/_qa/paijiu_probe.json', JSON.stringify({ steps, pageCount: (typeof pages === 'function' ? pages() : context.pages()).length }, null, 1));
