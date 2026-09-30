const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/map_shots.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];

// 驸马醉酒杀人案：五桩大理寺案之一，开案在 study_night（书房），MAP_POS.fuma 有坐标
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: 'start', viewpoint: null, flags: [], stats: {},
    clues: [], bag: [], deck: [], silver: 60, lineIndex: 0, visited: ['start'],
    boosts: [], retinue: [], usedCards: [],
  },
});

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
const shot = async (key, info) => {
  res[key] = { ...info, file: `m_${key}.png` };
  save();
  try { await page.screenshot({ path: `${OUT}/m_${key}.png` }); res[key].shot = 'full'; }
  catch (e1) {
    try { await page.screenshot({ path: `${OUT}/m_${key}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); res[key].shot = 'clip'; }
    catch (e2) { res[key].shot = 'failed'; }
  }
  save();
};

const probe = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const sv = JSON.parse(localStorage.getItem('dicun_save_v4') || '{}').state || {};
  const nodes = [...document.querySelectorAll('.loc-node')];
  return {
    at: `${sv.sceneId}#${sv.lineIndex}`,
    atEnd: !!document.querySelector('.choices, .continue-tip'),
    mapBtn: !!nodes.length || [...document.querySelectorAll('.top-bar button')].some((b) => b.innerText.trim() === '舆图'),
    open: !!q('.loc-map'),
    nodes: nodes.length,
    here: nodes.filter((n) => n.className.includes('loc-here')).map((n) => n.innerText.trim()),
    reach: nodes.filter((n) => n.className.includes('loc-reach')).map((n) => n.innerText.trim()),
    seen: nodes.filter((n) => n.className.includes('loc-seen')).length,
    dark: nodes.filter((n) => n.className.includes('loc-dark')).length,
  };
});

const audit = () => page.evaluate(() => {
  const a = window.__audit();
  return { f: a.fails, c: a.checked, l: a.list.filter((x) => x[0] !== '.sub').slice(0, 8).map((x) => x[0] + ':' + x[1] + '@' + x[4]) };
});

const sceneId = () => page.evaluate(() => (JSON.parse(localStorage.getItem('dicun_save_v4') || '{}').state || {}).sceneId);
const readToEnd = () => page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('.choices, .continue-tip')) return;
    const p = document.querySelector('.story-panel');
    if (!p) return;
    p.click();
    await sleep(240);
  }
});
const openMap = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('.top-bar button')].find((x) => x.innerText.trim() === '舆图');
  if (b) b.click();
});
const closeMap = () => page.evaluate(() => { const b = document.querySelector('.loc-close'); if (b) b.click(); });
const clickReach = () => page.evaluate(() => {
  const n = document.querySelector('.loc-node.loc-reach');
  if (!n) return false;
  n.click();
  return true;
});

for (const [key, mode, theme, vw, vh] of [
  ['desk', 'light', '', 1440, 900],
  ['bianjun', 'dark', 'bianjun', 1440, 900],
  ['mob', 'light', 'jiangnan', 844, 390],
]) {
  await page.setViewportSize({ width: vw, height: vh });
  await page.goto('about:blank');
  await page.waitForTimeout(300);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), mode);
  await page.evaluate(() => localStorage.setItem('dicun_dlg_v1', '1'));
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SAVE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2400);
  await page.evaluate(([t, m]) => {
    if (t) document.documentElement.dataset.theme = t;
    document.documentElement.dataset.mode = m;
  }, [theme, mode]);
  const sel = await page.evaluate(() => {
    const a = document.querySelector('.resume-box .btn-main');
    if (a && a.offsetParent) return '.resume-box .btn-main';
    return document.querySelector('.fab-resume') ? '.fab-resume' : null;
  });
  if (!sel) throw new Error('no-resume-cta');
  await page.click(sel, { timeout: 15000 });
  await page.waitForTimeout(2600);

  await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' }).catch(() => {});
  await page.waitForTimeout(500);

  await readToEnd();
  await page.waitForTimeout(700);
  await shot('end_' + key, { mode, theme, ...(await probe()), ...(await audit()) });
  await openMap();
  await page.waitForTimeout(900);
  await shot('map_' + key, { mode, theme, ...(await probe()), ...(await audit()) });

  // 头两幕是同一间书房里的线性续幕（start→origin 都在 study_night），图上自然没有"可去"。
  // 要走到那一步跨了地点，才算验过导航——所以收图、读完下一幕、再开图，最多试五跳。
  const from = await sceneId();
  let hops = 0;
  let clicked = false;
  for (; hops < 5 && !clicked; hops++) {
    clicked = await clickReach();
    if (clicked) break;
    await closeMap();
    await page.waitForTimeout(400);
    // 已经处在幕末时 readToEnd 会立刻返回（.continue-tip 就是判据），
    // 所以要额外点一下栏框才续到下一幕——否则五跳全在原点打转
    await page.click('.story-panel');
    await page.waitForTimeout(1700);
    await readToEnd();
    await page.waitForTimeout(500);
    await openMap();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2400);
  const to = await sceneId();
  await shot('goto_' + key, {
    mode, theme, clicked, hops, from, to, movedScene: from !== to,
    ...(await probe()), ...(await audit()),
  });
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
