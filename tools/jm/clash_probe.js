const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/clash_probe.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

const DECK = ["c_wei_yamen", "c_li_qian", "c_qing_tong", "c_qing_nv", "c_li_lun", "c_li_falv",
  "c_quan_jiang", "c_she_duan", "c_wen_xing", "i_dao"];
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: 'a_duel_scene', viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: ['x1', 'x2', 'x4'], bag: [], deck: DECK, silver: 60,
    lineIndex: 99, visited: ['a_duel_scene'], boosts: [], retinue: [], usedCards: [],
  },
});

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

await page.goto('about:blank');
await page.waitForTimeout(250);
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), 'light');
await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SAVE);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  const b = document.querySelector('.resume-box .btn-main');
  if (b) b.click();
});
await page.waitForTimeout(2800);

// 出牌前：谁把版面撑宽了
res.before = await page.evaluate(() => {
  const de = document.documentElement;
  const wide = [];
  for (const el of document.querySelectorAll('.duel-root *')) {
    const r = el.getBoundingClientRect();
    if (r.right > de.clientWidth + 2 || r.left < -2) {
      wide.push(`${el.tagName}.${el.className}`.slice(0, 60) + ` [${Math.round(r.left)},${Math.round(r.right)}]`);
    }
    if (wide.length > 14) break;
  }
  return {
    scrollW: de.scrollWidth, clientW: de.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    wide,
    clashExists: !!document.querySelector('.dt-clash'),
    lastPlayText: (document.querySelector('.duel-log') || {}).innerText || null,
  };
});

// 打一手：只挑真没被禁用的那张
res.clicks = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const c = [...document.querySelectorAll('.hand .play-card')].find((x) => !x.disabled);
  if (!c) return 'no-enabled-card';
  const log = [c.innerText.slice(0, 12), 'disabled=' + c.disabled];
  c.click(); await sleep(500);
  log.push('raised=' + c.className.includes('hand-top'));
  c.click(); await sleep(500);
  log.push('still-raised=' + c.className.includes('hand-top'));
  return log.join(' | ');
});
await page.waitForTimeout(2200);

res.after = await page.evaluate(() => {
  const de = document.documentElement;
  const el = document.querySelector('.dt-clash');
  const r = el ? el.getBoundingClientRect() : null;
  const cs = el ? getComputedStyle(el) : null;
  const wide = [];
  for (const x of document.querySelectorAll('.duel-root *')) {
    const b = x.getBoundingClientRect();
    if (b.right > de.clientWidth + 2) {
      wide.push(`${x.tagName}.${x.className}`.slice(0, 60) + ` [${Math.round(b.left)},${Math.round(b.right)}]`);
    }
    if (wide.length > 14) break;
  }
  return {
    scrollW: de.scrollWidth, clientW: de.clientWidth, wide,
    clashExists: !!el,
    clashRect: r ? { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null,
    clashDisplay: cs ? cs.display : null,
    clashParent: el && el.parentElement ? el.parentElement.className : null,
    clashText: el ? el.innerText.replace(/\s+/g, ' ').slice(0, 80) : null,
    logs: [...document.querySelectorAll('.duel-log')].map((x) => x.className + '::' + x.innerText.slice(0, 24)),
    hand: document.querySelectorAll('.hand .play-card').length,
  };
});

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
try { await page.screenshot({ path: `${OUT}/p_clash.png` }); } catch (e) { res.shotErr = String(e).slice(0, 80); }
save();
