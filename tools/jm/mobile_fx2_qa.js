const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/mobile_fx2.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 844, height: 390 });

// 满手 10 张才是横屏最坏情况：牌会一路铺到右边，成就卡贴右下角就会盖住能打牌的那几张。
// 这里不打折——直接量成就卡与每一张手牌的矩形相交，交几张就是盖几张。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing",
  "c_yin_shu", "f_gongnei", "f_anxiang", "t_jieli", "i_dao"];
const duelData = {
  mode: "emotion", rules: "v2", turnSchema: "legacy", round: 6, phase: "pMain", turnNo: 1,
  hpPlayer: 10, hpOpponent: 10, qi: 8, qiMax: 12, hpMax: 12,
  rapport: 4, guard: 3, yanli: 5, yanliMax: 7,
  library: [], discard: DECK.slice(0, 4),
  hand: [...DECK],
  opponentShown: "策", opponentTrue: "策", bluffed: false,
  charge: 0, foresuit: null, trap: null, seeNext: "none", passives: [],
  scoutLeft: 0, insiderLeft: 0, insiderActive: false, sharedTotal: 0, sharedUsed: 0,
  retinueNames: [], usedCards: [], log: [], lastResult: null, lastPlay: null,
  finished: null, playerLeadSuits: [], baseAp: 3, ap: 3, topicHits: 0,
};
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: 'a_duel_scene', viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: [], bag: [], deck: DECK, silver: 60,
    lineIndex: 99, visited: ['a_duel_scene'], boosts: [], retinue: [], usedCards: [],
  },
  duel: { cfgId: 'd_wang', data: duelData, wager: 0 },
});

const res = {};
await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate((v) => {
  localStorage.setItem('dicun_mode_v1', 'light');
  localStorage.setItem('dicun_achievements_v1', '[]');
  localStorage.setItem('dicun_save_v4', v);
}, SAVE);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
await page.waitForTimeout(2800);

res.handBefore = await page.evaluate(() => document.querySelectorAll('.hand .play-card').length);
res.played = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const c = [...document.querySelectorAll('.hand .play-card.suit-策')].find((x) => !x.disabled);
  if (!c) return 'no-match-card';
  c.click(); await sleep(460);
  const up = [...document.querySelectorAll('.hand .play-card.hand-top')][0] || c;
  up.click(); await sleep(460);
  return 'played';
});

const read = () => page.evaluate(() => {
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 3 && b.height > 3; };
  const ach = [...document.querySelectorAll('.fx-ach-card')].filter(vis);
  const cards = [...document.querySelectorAll('.hand .play-card')].filter(vis);
  const toast = [...document.querySelectorAll('.toast')].filter(vis);
  const de = document.documentElement;
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const cover = (list) => list.map((e) => {
    const a = R(e);
    return cards.filter((c) => hit(a, R(c))).length;
  }).join('/');
  return {
    achN: ach.length,
    achRect: ach.length ? (() => { const b = R(ach[0]); return `${Math.round(b.l)},${Math.round(b.t)} → ${Math.round(b.r)},${Math.round(b.b)}`; })() : null,
    achOverCards: ach.length ? cover(ach) : null,
    achOffscreen: ach.length ? ach.map((e) => { const b = R(e); return b.r > de.clientWidth + 1 || b.b > de.clientHeight + 1 || b.l < -1 || b.t < -1; }) : null,
    cardRects: cards.map((c) => { const b = R(c); return `${Math.round(b.l)},${Math.round(b.t)}..${Math.round(b.r)},${Math.round(b.b)}`; }),
    tableRect: (() => { const e = document.querySelector('.dt-table'); if (!e) return null; const b = R(e); return `${Math.round(b.l)},${Math.round(b.t)} → ${Math.round(b.r)},${Math.round(b.b)}`; })(),
    achOverTable: ach.length ? cards.length && (() => { const a = R(ach[0]); const t = document.querySelector('.dt-table'); if (!t) return null; const b = R(t); return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; })() : null,
    toastBottom: toast.length ? Math.round(de.clientHeight - R(toast[0]).b) : null,
    toastOverCards: toast.length ? cover(toast) : null,
  };
});
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(500);
  res.hit = await read();
  if (res.hit.achN) break;
}
res.owned = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('dicun_achievements_v1') || '[]'); } catch { return []; }
});
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
