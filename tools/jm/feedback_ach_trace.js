const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/fx_ach_trace.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing",
  "c_yin_shu", "f_gongnei", "f_anxiang", "t_jieli", "i_dao"];
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

const res = { sweep: [], vis: null };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate((v) => {
  localStorage.setItem('dicun_mode_v1', 'light');
  localStorage.setItem('dicun_achievements_v1', '[]');
  localStorage.setItem('dicun_save_v4', v);
}, SAVE);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2200);
await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
await page.waitForTimeout(2600);

res.played = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const c = [...document.querySelectorAll('.hand .play-card.suit-策')].find((x) => !x.disabled);
  if (!c) return 'no-match-card';
  c.click(); await sleep(460);
  const up = [...document.querySelectorAll('.hand .play-card.hand-top')][0] || c;
  up.click(); await sleep(460);
  return 'played';
});

// 隐藏页里 rAF 一帧都不跑（上一版 count:0 就是这么来的），CSS 动画也被冻在起始帧，
// 所以"卡片停在视口外"到底是动画真的走过头、还是根本没合成，用采样问不出来。
// 改用 WAAPI：把这张卡身上的动画全部接管、暂停，然后逐时刻 setCurrentTime 再量包围盒——
// 量到的是浏览器在该时刻会合成出来的真实几何，与页面可见性、节流都无关。
for (let i = 0; i < 8; i++) {
  const got = await page.evaluate(() => {
    const c = document.querySelector('.fx-ach-card');
    if (!c) return null;
    const anims = c.getAnimations();
    if (!anims.length) return { noAnims: true, vis: document.visibilityState };
    const vw = window.innerWidth, vh = window.innerHeight;
    const out = [];
    for (let t = 0; t <= 5200; t += 40) {
      for (const a of anims) { a.pause(); a.currentTime = t; }
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      out.push({
        t, l: Math.round(r.left), rt: Math.round(r.right), tp: Math.round(r.top), b: Math.round(r.bottom),
        w: Math.round(r.width), h: Math.round(r.height),
        op: +(+cs.opacity).toFixed(2),
        offL: r.left < -0.5, offR: r.right > vw + 0.5, offB: r.bottom > vh + 0.5,
      });
    }
    for (const a of anims) a.cancel();
    return { vis: document.visibilityState, vw, vh, out, animNames: anims.map((a) => a.animationName || '?') };
  });
  if (got && got.out) {
    res.vis = got.vis;
    res.viewport = { w: got.vw, h: got.vh };
    res.animNames = got.animNames;
    res.sweep = got.out;
    break;
  }
  if (got && got.noAnims) { res.noAnims = true; break; }
  await page.waitForTimeout(500);
}

if (res.sweep.length) {
  const minL = Math.min(...res.sweep.map((s) => s.l));
  const maxR = Math.max(...res.sweep.map((s) => s.rt));
  const maxB = Math.max(...res.sweep.map((s) => s.b));
  const maxW = Math.max(...res.sweep.map((s) => s.w));
  res.metrics = {
    samples: res.sweep.length,
    minLeft: minL, maxRight: maxR, maxBottom: maxB, maxWidth: maxW,
    everOffLeft: res.sweep.some((s) => s.offL),
    everOffRight: res.sweep.some((s) => s.offR),
    everOffBottom: res.sweep.some((s) => s.offB),
    at0: res.sweep[0], at200: res.sweep[5], at420: res.sweep.find((s) => s.t >= 420),
    at1000: res.sweep.find((s) => s.t >= 1000),
    minOpacity: Math.min(...res.sweep.map((s) => s.op)),
  };
  // 只在几何/透明度变化的时刻留样本，全量 130 条压成可读的十几条
  const keep = [];
  let prev = null;
  for (const s of res.sweep) {
    const key = `${s.l}|${s.rt}|${s.w}|${s.op}`;
    if (key !== prev) { keep.push(s); prev = key; }
  }
  res.changed = keep;
}
res.owned = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('dicun_achievements_v1') || '[]'); } catch { return []; }
});
// 上一版整页截图落在卡片卸载之后，等于什么都没拍到。这里先确认还挂着，再用 clip 截局部
// （窗口被遮挡时整页截图会超时，clip 基本能成）
res.stillMounted = await page.evaluate(() => {
  const c = document.querySelector('.fx-ach-card');
  if (!c) return false;
  const r = c.getBoundingClientRect();
  return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), op: getComputedStyle(c).opacity };
});
if (res.stillMounted) {
  const m = res.stillMounted;
  try {
    await page.screenshot({
      path: `${OUT}/fx_ach_clip.png`,
      clip: { x: Math.max(0, m.l - 12), y: Math.max(0, m.t - 12), width: m.w + 24, height: m.h + 24 },
    });
  } catch (e) { res.shotErr = String(e).slice(0, 80); }
}
try { await page.screenshot({ path: `${OUT}/fx_ach_trace.png` }); } catch (e) { res.shotErr2 = String(e).slice(0, 80); }
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
