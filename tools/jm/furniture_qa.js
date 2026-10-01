const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/furniture_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 三套皮的构件（牌位 / 分隔纹 / 幕题印）要能一眼分开，还要各自过对比度闸。
// 对白档看 .dlg-name + .dlg-head 下那道纹；长卷看 .scene-title 右端那枚印。
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: 'origin', viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: [], bag: [], deck: [], silver: 60,
    lineIndex: 2, visited: ['origin'], boosts: [], retinue: [], usedCards: [],
  },
});

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const probe = () => page.evaluate(() => {
  const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const cs = (s, prop) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[prop] : null; };
  const after = (s, prop) => { const e = document.querySelector(s); return e ? getComputedStyle(e, '::after')[prop] : null; };
  return {
    dlg: vis('.dlg-head'),
    name: vis('.dlg-name'),
    nameRadius: cs('.dlg-name', 'borderRadius'),
    nameBorderLeft: cs('.dlg-name', 'borderLeftWidth'),
    headBand: after('.dlg-head', 'backgroundImage') !== 'none',
    sceneTitle: vis('.scene-title'),
    seal: after('.scene-title', 'width'),
    sealRadius: after('.scene-title', 'borderRadius'),
  };
});

const audit = () => page.evaluate(() => {
  if (!window.__audit) return { f: 0, c: 0, l: [] };
  const a = window.__audit();
  return { f: a.fails, c: a.checked, l: a.list.filter((y) => y[0] !== '.sub' && y[0] !== '.cover-ends').slice(0, 8).map((y) => y[0] + ':' + y[1] + '@' + y[4]) };
});

for (const [key, theme, mode, dlg] of __CASES__) {
  await page.goto('about:blank');
  await page.waitForTimeout(200);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(([m, d]) => {
    localStorage.setItem('dicun_mode_v1', m);
    localStorage.setItem('dicun_dlg_v1', d ? '1' : '0');
  }, [mode, dlg]);
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SAVE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(([t, m]) => {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    document.documentElement.dataset.mode = m;
  }, [theme, mode]);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
  await page.addScriptTag({ url: 'http://localhost:5199/scripts/contrast-audit.js' }).catch(() => {});
  await page.waitForTimeout(500);
  const info = { theme: theme || 'default', mode, dlg, ...(await probe()), ...(await audit()) };
  res[key] = { ...res[key], ...info, file: `f_${key}.png` };
  save();
  try { await page.screenshot({ path: `${OUT}/f_${key}.png` }); res[key].shot = 'full'; }
  catch {
    try { await page.screenshot({ path: `${OUT}/f_${key}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); res[key].shot = 'clip'; }
    catch { res[key].shot = 'failed'; }
  }
  save();
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
