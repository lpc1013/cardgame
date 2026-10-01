const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/survey_qa.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 五桩案的勘查层各开一次图：验热点落在真东西上（看图）、格数扣得对、线索进卷宗、
// 以及新加的 RunState.survey 能不能穿过存档 round-trip。
const CASES = [
  ['fuma', 'search'], ['xie', 'search'], ['sichou', 'dike'], ['qinhuai', 'dike'], ['qiuwei', 'market_gate'],
];
const mk = (sc, scene) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
    stats: {}, clues: [], bag: [], deck: [], silver: 60,
    lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
});

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
const shot = async (key, info) => {
  res[key] = { ...res[key], ...info, file: `v_${key}.png` };
  save();
  try { await page.screenshot({ path: `${OUT}/v_${key}.png` }); res[key].shot = 'full'; }
  catch {
    try { await page.screenshot({ path: `${OUT}/v_${key}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); res[key].shot = 'clip'; }
    catch { res[key].shot = 'failed'; }
  }
  save();
};

const snap = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const q = (s) => [...document.querySelectorAll(s)].filter(vis);
  const t = (s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim().slice(0, 60) : null; };
  const field = q('.sv-field')[0];
  const fr = field ? field.getBoundingClientRect() : null;
  // 热点飘出图外的（坐标量错或底图换了）一律算不合法
  const out = fr ? q('.sv-spot').filter((e) => {
    const r = e.getBoundingClientRect();
    return r.left < fr.left - 1 || r.right > fr.right + 1 || r.top < fr.top - 1 || r.bottom > fr.bottom + 1;
  }).length : -1;
  return {
    btn: t('.sv-btn'), open: !!q('.sv-layer').length, art: !!q('.sv-art').length,
    spots: q('.sv-spot').length, outOfField: out,
    sub: t('.sv-sub'), note: t('.sv-note'), clues: t('.clue-btn'),
  };
});

const audit = () => page.evaluate(() => {
  if (!window.__audit) return { f: 0, c: 0, l: [] };
  const a = window.__audit();
  return { f: a.fails, c: a.checked, l: a.list.filter((y) => y[0] !== '.sub' && y[0] !== '.cover-ends').slice(0, 8).map((y) => y[0] + ':' + y[1] + '@' + y[4]) };
});

for (const [sc, scene] of CASES) {
  const key = `${sc}_${scene}`;
  await page.goto('about:blank');
  await page.waitForTimeout(200);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), mk(sc, scene));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
  await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector('.sv-btn'); if (b) b.click(); });
  await page.waitForTimeout(900);
  const opened = await snap();
  // 点掉所有能扣格的热点（勘 n），看线索进不进卷宗
  const clicked = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const el = [...document.querySelectorAll('.sv-spot')].find((x) => !x.disabled && !x.className.includes('got'));
      if (!el) break;
      el.click(); n++; await sleep(360);
    }
    return n;
  });
  await page.waitForTimeout(600);
  await shot(key, { scenario: sc, scene, opened, clicked, ...(await snap()), ...(await audit()) });
  // 存档 round-trip
  const persisted = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('dicun_save_v4') || '{}');
    return d.state && d.state.survey ? d.state.survey : null;
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const b = document.querySelector('.sv-btn'); if (b) b.click(); });
  await page.waitForTimeout(800);
  res[key].persisted = persisted;
  res[key].afterReload = await snap();
  save();
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
