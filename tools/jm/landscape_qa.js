const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/landscape.json`;
const BASE = 'http://localhost:5199/';

// 只用任务已有的那一张页：绝不 newPage
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];

// changjiang/start 有 anim-forge 动效层，才会命中 .scene-stage → 宣纸正文栏那条规则。
// 上一版用 fuma/start（无动效层），stage=false，等于没验到我改的东西。
const mk = (sc, scene) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [], stats: {},
    clues: [], bag: [], deck: [], silver: 60, lineIndex: 2, visited: [scene],
    boosts: [], retinue: [], usedCards: [],
  },
});

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const state = () => page.evaluate(() => ({
  attr: document.documentElement.dataset.mode || null,
  stored: localStorage.getItem('dicun_mode_v1'),
}));

// 开合面板是同一个按钮：开着再点就把它关了。上一版无脑又点一次 capsule，
// 「还宣」那一下落在已关闭的面板上、静默没点中，被我误读成产品 bug。
const clickToggleInPanel = async (want) => {
  const open = await page.evaluate(() => !!document.querySelector('.fab-panel'));
  if (!open) await page.evaluate(() => document.querySelector('.fab-capsule').click());
  await page.waitForTimeout(600);
  return page.evaluate((w) => {
    const b = [...document.querySelectorAll('.fab-panel .fab-grid button')].find((x) => new RegExp(w).test(x.innerText));
    if (!b) return false;
    b.click();
    return true;
  }, want);
};

await page.setViewportSize({ width: 844, height: 390 });

// ---- 1. 标题页：横屏藏了 .title-nav，浅/深开关只能走胶囊面板 ----
await page.goto('about:blank');
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.evaluate((s) => {
  localStorage.removeItem('dicun_mode_v1');
  localStorage.setItem('dicun_save_v4', s);
}, mk('changjiang', 'start'));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2600);

res.titleNavHiddenInLandscape = await page.evaluate(() => {
  const n = document.querySelector('.title-nav');
  return n ? getComputedStyle(n).display === 'none' : 'no-nav';
});
res.toggleInPanelFound = await clickToggleInPanel('转墨');
await page.waitForTimeout(900);
res.afterToDark = await state();
res.clickedBack = await clickToggleInPanel('还宣');
await page.waitForTimeout(900);
res.afterToLight = await state();
save();

// ---- 2. 剧情页：宣纸正文栏在 844x390 下是否生效、有没有横向溢出 ----
for (const mode of ['light', 'dark']) {
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2400);
  await page.evaluate((m) => {
    if (m === 'light') delete document.documentElement.dataset.mode;
    else document.documentElement.dataset.mode = m;
  }, mode);
  await page.evaluate(() => { const b = document.querySelector('.fab-resume'); if (b) b.click(); });
  await page.waitForTimeout(3200);
  // 审计脚本每次 goto 后都要重注入，否则 window.__audit 不存在、读数会是 -1
  await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' });
  await page.waitForTimeout(500);
  res['story_' + mode] = await page.evaluate(() => {
    const p = document.querySelector('.story-panel');
    const a = window.__audit ? window.__audit() : { fails: -1, checked: 0, list: [] };
    return {
      auditRan: !!window.__audit,
      stage: !!document.querySelector('.scene-stage'),
      panelBg: p ? getComputedStyle(p).backgroundImage.slice(0, 46) : null,
      panelW: p ? Math.round(p.getBoundingClientRect().width) : null,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      scrollW: document.documentElement.scrollWidth, vw: window.innerWidth,
      f: a.fails, c: a.checked,
      l: (a.list || []).filter((x) => x[0] !== '.sub' && x[0] !== '.cover-ends' && !String(x[0]).startsWith('h3'))
        .slice(0, 6).map((x) => x[0] + ':' + x[1] + '@' + x[4] + 'x' + x[5]),
    };
  });
  await page.screenshot({ path: `${OUT}/L_story_${mode}.png`, clip: { x: 0, y: 0, width: 844, height: 390 } }).catch(() => {});
  save();
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
