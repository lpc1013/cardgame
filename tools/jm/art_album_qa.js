const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/art_album_qa.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

const res = { checks: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
const check = (name, ok, detail) => { res.checks.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`); };

const SAVE = (sc, scene) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
    stats: {}, clues: [], bag: [], deck: [], silver: 60,
    lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
});

// ---------- 1. 卡册：memo 分组 + content-visibility 后功能不回归 ----------
await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => {
  localStorage.setItem('dicun_mode_v1', 'light');
  localStorage.removeItem('dicun_save_v4');
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2400);

const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.title-nav button, .fab-grid button')].find((x) => x.innerText.trim() === '卡册');
  if (b) { b.click(); return true; }
  return false;
});
await page.waitForTimeout(1200);
check('卡册入口可达', opened, opened ? 'nav 命中' : '标题页与胶囊里都没找到「卡册」按钮');

const album = await page.evaluate(() => {
  const cells = document.querySelectorAll('.album-cell');
  const groups = document.querySelectorAll('.bag-group-title').length;
  const cv = getComputedStyle(document.querySelector('.album-cell')).contentVisibility;
  const pb = getComputedStyle(document.querySelector('.album-cell')).paddingBottom;
  return { cells: cells.length, groups, cv, pb };
});
check('卡册分组渲染', album.cells > 300 && album.groups >= 13, `${album.groups} 组 / ${album.cells} 格（重构前 345 格）`);
check('content-visibility 生效', album.cv === 'auto', `content-visibility: ${album.cv}, padding-bottom: ${album.pb}`);

// 折叠一组再展开——memo 路径
await page.evaluate(() => {
  const g = document.querySelectorAll('.bag-group-title')[0];
  g.click();
});
await page.waitForTimeout(400);
const folded = await page.evaluate(() => document.querySelectorAll('.album-cell').length);
await page.evaluate(() => {
  document.querySelectorAll('.bag-group-title')[0].click();
});
await page.waitForTimeout(400);
const unfolded = await page.evaluate(() => document.querySelectorAll('.album-cell').length);
check('折叠/展开正常', folded < unfolded, `折叠后 ${folded} 格 → 展开 ${unfolded} 格`);

// 打开一张卡缩放（zoom 经由稳定回调）
await page.evaluate(() => {
  const cell = document.querySelector('.album-cell .tcard.clickable');
  cell.click();
});
await page.waitForTimeout(500);
const zoomOpen = await page.evaluate(() => !!document.querySelector('.card-zoom-body, .card-zoom'));
check('卡牌缩放打开', zoomOpen, zoomOpen ? 'zoom 容器在' : '点击后没有 zoom 层');
await page.evaluate(() => {
  const ov = document.querySelector('.clue-overlay');
  if (ov) ov.click();
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/album_memo.png` }).catch(() => {});

// ---------- 2. 普通幕画心：四张落单图有消费者 ----------
for (const [sc, scene, img] of [
  ['xie', 'end_surface', 'end_xie_end_surface'],
  ['touming', 'ch2_tea_lose', 'end_touming_ch2_tea_lose'],
]) {
  await page.evaluate((s) => { localStorage.setItem('dicun_save_v4', s); }, SAVE(sc, scene));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('继续上次'));
    if (b) b.click();
  });
  await page.waitForTimeout(1600);
  const art = await page.evaluate(() => {
    const el = document.querySelector('.scene-art img');
    return el ? { w: el.naturalWidth, h: el.naturalHeight, src: el.currentSrc.split('/').pop() } : null;
  });
  check(`画心挂载 ${sc}/${scene}`, !!art && art.w > 0, art ? `${art.src} ${art.w}×${art.h}` : '未渲染（art 开关或取图断链）');
  await page.screenshot({ path: `${OUT}/sceneart_${sc}.png` }).catch(() => {});
}

save();
console.log('DONE');
