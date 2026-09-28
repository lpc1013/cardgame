const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const BASE = 'http://localhost:5199/';

// 只用任务已有的那一张页：绝不 newPage（单标签页/单窗口是硬约束）
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

const SAVE = (sc, scene, vp) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: vp, flags: [], stats: {}, clues: [],
    bag: [], deck: [], silver: 60, lineIndex: 3, visited: [scene],
    boosts: [], retinue: [], usedCards: [],
  },
});

const shots = [];
const audit = {};

// 每屏都要重开页面并预置存档：应用会按 sceneId 自行分派对局/剧情相位
const targets = [
  ['motion', 'changjiang', 'start', null],       // 全出血真背景 + anim-forge 特效层
  ['story', 'fuma', 'start', null],              // 复用底纹 + 叙述者立绘
  ['narrator', 'jieyu', 'start', 'vp_yuqian'],   // 于谦立绘
];

for (const [name, sc, scene, vp] of targets) {
  for (const mode of ['light', 'dark']) {
    await page.goto('about:blank');
    await page.waitForTimeout(400);
    await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['dicun_mode_v1', mode]);
    await page.evaluate((s) => localStorage.setItem('dicun_save_v4', s), SAVE(sc, scene, vp));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2600);
    const b = await page.$('button:has-text("继续上次")');
    if (b) { await b.click(); await page.waitForTimeout(1600); }
    await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' });
    await page.waitForTimeout(400);
    const a = await page.evaluate(() => { const x = window.__audit(); return { f: x.fails, c: x.checked, l: x.list.slice(0, 4).map(y => y[0] + ':' + y[1]) }; });
    audit[`${name}_${mode}`] = a;
    const p = `${OUT}/s_${name}_${mode}.png`;
    await page.screenshot({ path: p });
    shots.push(`${name}_${mode}`);
  }
}

fs.writeFileSync(`${OUT}/shots_audit.json`, JSON.stringify({ audit, shots }, null, 1));
console.log(JSON.stringify({ pageCount: context.pages().length, shots, audit }));
