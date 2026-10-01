const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/shop_hdr.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 截图上"京師夜市"那一条是黑底，而浅档的 --bg 是 #d9cdb4——两者对不上。
// 不去猜是谁盖的，直接把那一条按像素级问一遍：命中测试 + 计算样式 + 祖先链。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen"];
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: 'market', viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: [], bag: [], deck: DECK, silver: 500,
    lineIndex: 99, visited: ['market'], boosts: [], retinue: [], usedCards: [],
  },
});

await page.goto('about:blank');
await page.waitForTimeout(150);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate((s) => {
  localStorage.setItem('dicun_mode_v1', 'light');
  localStorage.setItem('dicun_empire_v1', JSON.stringify({
    ink: 999, grantedEnds: 0, warehouse: [], themes: [], theme: '', boosts: {},
    brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {},
    endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
  }));
  localStorage.setItem('dicun_save_v4', s);
}, SAVE);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
await page.waitForTimeout(2400);

const res = await page.evaluate(() => {
  const out = {};
  const de = document.documentElement;
  out.tokens = {
    mode: de.dataset.mode || '(none)', theme: de.dataset.theme || '(none)',
    bg: getComputedStyle(de).getPropertyValue('--bg').trim(),
    panel: getComputedStyle(de).getPropertyValue('--panel').trim(),
    rootBg: getComputedStyle(document.body).backgroundColor,
  };
  const hdr = document.querySelector('.shop-header');
  if (hdr) {
    const cs = getComputedStyle(hdr);
    const b = hdr.getBoundingClientRect();
    out.header = {
      rect: `${Math.round(b.left)},${Math.round(b.top)} → ${Math.round(b.right)},${Math.round(b.bottom)}`,
      bg: cs.backgroundColor, bgImg: (cs.backgroundImage || '').slice(0, 70), pos: cs.position, z: cs.zIndex,
    };
    out.headerAncestors = (() => {
      const chain = [];
      let e = hdr;
      while (e && e !== document.body) {
        const c = getComputedStyle(e);
        chain.push(`${e.tagName}.${String(e.className).slice(0, 26)} bg=${c.backgroundColor} img=${(c.backgroundImage || 'none').slice(0, 30)}`);
        e = e.parentElement;
      }
      return chain;
    })();
  }
  out.hitTop = (() => {
    const e = document.elementFromPoint(120, 25);
    if (!e) return null;
    const c = getComputedStyle(e);
    return `${e.tagName}.${String(e.className).slice(0, 30)} bg=${c.backgroundColor} img=${(c.backgroundImage || 'none').slice(0, 40)}`;
  })();
  out.hitMid = (() => {
    const e = document.elementFromPoint(120, 300);
    if (!e) return null;
    const c = getComputedStyle(e);
    return `${e.tagName}.${String(e.className).slice(0, 30)} bg=${c.backgroundColor}`;
  })();
  return out;
});
fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
