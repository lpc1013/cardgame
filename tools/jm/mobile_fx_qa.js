const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/mobile_fx.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
// 手机端默认横屏 844x390（见 memory「手机端默认横屏」）。这一轮量刚提交的反馈层。
await page.setViewportSize({ width: 844, height: 390 });

const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing",
  "c_yin_shu", "f_gongnei", "f_anxiang", "t_jieli", "i_dao"];
const mk = (o) => JSON.stringify({
  version: 4, scenarioId: o.sc, savedAt: Date.now(),
  state: {
    scenarioId: o.sc, sceneId: o.scene, viewpoint: null, flags: [],
    stats: o.stats, clues: [], bag: [], deck: DECK, silver: 60,
    lineIndex: 99, visited: [o.scene], boosts: [], retinue: [], usedCards: [],
  },
  duel: o.duel,
});
const duelData = {
  mode: "emotion", rules: "v2", turnSchema: "legacy", round: 6, phase: "pMain", turnNo: 1,
  hpPlayer: 10, hpOpponent: 10, qi: 8, qiMax: 12, hpMax: 12,
  rapport: 4, guard: 3, yanli: 5, yanliMax: 7,
  library: DECK.slice(6), discard: DECK.slice(0, 4),
  hand: ["c_qing_tong", "c_wei_yamen", "c_yin_shu", "i_dao"],
  opponentShown: "策", opponentTrue: "策", bluffed: false,
  charge: 0, foresuit: null, trap: null, seeNext: "none", passives: [],
  scoutLeft: 0, insiderLeft: 0, insiderActive: false, sharedTotal: 0, sharedUsed: 0,
  retinueNames: [], usedCards: [], log: [], lastResult: null, lastPlay: null,
  finished: null, playerLeadSuits: [], baseAp: 3, ap: 3, topicHits: 0,
};

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

async function boot(o) {
  await page.goto('about:blank');
  await page.waitForTimeout(200);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem('dicun_mode_v1', 'light');
    localStorage.setItem('dicun_dlg_v1', '0');
    localStorage.setItem('dicun_achievements_v1', '[]');
  });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), mk(o));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
}

// 反馈层压住了谁，才是这一屏要回答的问题：横屏只有 390 高，右下角和手牌是同一块地方
const geom = () => page.evaluate(() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const box = (s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect().width > 3 ? r(e) : null; };
  const rects = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 3).map(r);
  const hit = (a, b) => !!a && !!b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
  const feed = box('.fx-feed');
  const ach = box('.fx-ach-card');
  const hand = box('.hand');
  const toast = box('.toast');
  const de = document.documentElement;
  const off = [];
  for (const e of document.querySelectorAll('.fx-feed *, .fx-ach *')) {
    const b = e.getBoundingClientRect();
    if (b.width < 1) continue;
    if (b.right > de.clientWidth + 1 || b.left < -1 || b.bottom > de.clientHeight + 1 || b.top < -1) {
      off.push(`${e.tagName}.${String(e.className).slice(0, 20)}@${Math.round(b.left)}..${Math.round(b.right)}/${Math.round(b.top)}..${Math.round(b.bottom)}`);
    }
  }
  return {
    vp: { w: de.clientWidth, h: de.clientHeight },
    feed, feedN: document.querySelectorAll('.fx-feed .fx-line').length,
    ach, hand, toast, off,
    achOverHand: hit(ach, hand),
    feedOverGround: hit(feed, box('.sv-ground')),
    toastOverHand: hit(toast, hand),
    handCards: rects('.hand .play-card').length,
  };
});

// ---- A：中上方细条（勘查入卷） ----
await boot({ sc: 'fuma', scene: 'search', stats: { chaoting: 62, daoyi: 55, renwang: 48 } });
await page.evaluate(() => { const b = document.querySelector('.sv-btn'); if (b) b.click(); });
await page.waitForTimeout(900);
res.clicksA = [];
for (let i = 0; i < 2; i++) {
  res.clicksA.push(await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const spots = [...document.querySelectorAll('.sv-spot')]
      .filter((e) => !e.disabled && !e.className.includes('got'))
      .filter((e) => /^勘/.test((e.querySelector('.sv-tag') || {}).innerText || ''));
    if (!spots.length) return 'no-clue-spot';
    spots[0].click(); await sleep(300);
    return 'ok';
  }));
}
res.A = await geom();

// ---- B：右下角成就卡（真打赢一局） ----
await boot({ sc: 'fuma', scene: 'a_duel_scene', stats: { chaoting: 62, daoyi: 55, renwang: 48 }, duel: { cfgId: 'd_wang', data: duelData, wager: 0 } });
res.played = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const c = [...document.querySelectorAll('.hand .play-card.suit-策')].find((x) => !x.disabled);
  if (!c) return 'no-match-card';
  c.click(); await sleep(460);
  const up = [...document.querySelectorAll('.hand .play-card.hand-top')][0] || c;
  up.click(); await sleep(460);
  return 'played';
});
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(600);
  res.B = await geom();
  if (res.B.ach) break;
}
res.Bowned = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('dicun_achievements_v1') || '[]'); } catch { return []; }
});
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
