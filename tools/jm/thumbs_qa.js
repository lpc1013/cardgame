const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/thumbs_qa.json`;
const URL = 'http://localhost:3000/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

const res = { checks: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
const check = (name, ok, detail) => { res.checks.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`); };

const imgBytes = () => page.evaluate(() => {
  const rs = performance.getEntriesByType('resource').filter((r) => /\.(jpg|webp|png)(\?|$)/.test(r.name));
  let bytes = 0, n = 0, thumbs = 0, full = 0;
  for (const r of rs) {
    bytes += r.transferSize || 0;
    n++;
    if (r.name.includes('/thumbs/')) thumbs++; else full++;
  }
  return { bytes, n, thumbs, full };
});

// ---------- 1. 标题页：封面条走缩略 ----------
await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => { localStorage.removeItem('dicun_save_v4'); });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2600);
const strip = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.cover-thumb img')];
  return { n: imgs.length, thumbs: imgs.filter((i) => i.currentSrc.includes('/thumbs/')).length };
});
check('封面缩略条走 thumbs', strip.n > 0 && strip.thumbs === strip.n, `${strip.thumbs}/${strip.n} 张来自 /thumbs/`);

const t1 = await imgBytes();
check('标题页图片字节', t1.bytes < 900 * 1024, `标题页图片共 ${t1.n} 张 ${(t1.bytes / 1024).toFixed(0)} KB（thumbs ${t1.thumbs} / 全图 ${t1.full}）`);

// ---------- 2. 卡册：卡墙走 thumbs ----------
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.title-nav button, .fab-grid button')].find((x) => x.innerText.trim() === '卡册');
  if (b) b.click();
});
await page.waitForTimeout(1400);
const album = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.album-cell img')];
  return { n: imgs.length, thumbs: imgs.filter((i) => i.currentSrc.includes('/thumbs/cards/')).length };
});
check('卡墙走 thumbs', album.n === 0 || album.thumbs > 0, album.n ? `${album.thumbs}/${album.n} 张来自 /thumbs/cards/（新档全是？？？无图也正常）` : '新档未见卡无图——去图鉴验');
await page.screenshot({ path: `${OUT}/thumbs_title.png` }).catch(() => {});

// ---------- 3. 场景背景预加载 ----------
const SAVE = (sc, scene) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
    stats: {}, clues: [], bag: [], deck: [], silver: 60,
    lineIndex: 0, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
});
await page.evaluate((s) => { localStorage.setItem('dicun_save_v4', s); }, SAVE('fuma', 'origin'));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2600);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('继续上次'));
  if (b) b.click();
});
await page.waitForTimeout(2200);
const pre = await page.evaluate(() => {
  const rs = performance.getEntriesByType('resource');
  // origin 的 next 是 interrogation（问案）；看它的场景图是否已被预取（不论当前是否显示）
  return rs.filter((r) => /scenes\/fuma_(interrogation|__)/.test(r.name)).length;
});
check('下一幕场景图预取', pre > 0, `origin 的下游场景图已发起 ${pre} 个请求`);
await page.screenshot({ path: `${OUT}/thumbs_scene.png` }).catch(() => {});

save();
console.log('DONE');
