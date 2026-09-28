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

// 每屏都要重开页面并预置存档：应用会按 sceneId 自行分派对局/剧情相位
// 覆盖面：12 部 × 浅/深 = 24 屏。原先只手挑三部，
// 其余九部的复用底纹与叙述者立绘从没在桌面上核对过像素。
const TARGETS = [
  ['fuma', 'start', null],
  ['qiuwei', 'start', null],
  ['sichou', 'start', null],
  ['xie', 'start', null],
  ['qinhuai', 'start', null],
  ['changjiang', 'start', null],
  ['changhen', 'start', null],
  ['jianfeng', 'start', null],
  ['jieyu', 'start', null],
  ['diaolan', 'start', null],
  // 开场幕 id 不统一是 "start"，这三个各是别的名字（照实取自 SCENE_SETTING）
  ['shumian', 'a1_intro', null],
  ['touming', 'hall_laugh', null],
  ['xingxing', 'zhengzhi', null],
];

const shots = [];
const FILE = `${OUT}/shots_audit.json`;
// 24 屏一次跑不完 180s 硬时限，所以可续跑：已出结果的键直接跳过，中断后重跑接着往下走
const audit = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')).audit || {} : {};

for (const [sc, scene, vp] of TARGETS) {
  const name = sc;
  for (const mode of ['light', 'dark']) {
    const key = `${name}_${mode}`;
    if (audit[key]) { shots.push(key); continue; }
    await page.goto('about:blank');
    await page.waitForTimeout(400);
    await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['dicun_mode_v1', mode]);
    await page.evaluate((s) => localStorage.setItem('dicun_save_v4', s), SAVE(sc, scene, vp));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2600);
    const b = await page.$('button:has-text("继续上次")');
    // 新揭示段有最长 ~1.1s 的错峰 + .5s 擦入，等太短会把句子截在擦到一半的状态，
    // 看上去像文字被面板右缘切掉（jianfeng 首拍就是这样误判过一次）
    if (b) { await b.click(); await page.waitForTimeout(2800); }
    await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' });
    await page.waitForTimeout(400);
    const a = await page.evaluate(() => {
      const x = window.__audit();
      return {
        f: x.fails, c: x.checked,
        l: x.list.slice(0, 4).map((y) => y[0] + ':' + y[1] + '@' + y[4]),
        phase: document.querySelector('.story-root') ? 'story' : document.querySelector('.duel-root') ? 'duel' : 'other',
      };
    });
    audit[`${name}_${mode}`] = a;
    const p = `${OUT}/s_${name}_${mode}.png`;
    await page.screenshot({ path: p });
    shots.push(`${name}_${mode}`);
    fs.writeFileSync(FILE, JSON.stringify({ audit, shots, pageCount: context.pages().length }, null, 1));
  }
}
