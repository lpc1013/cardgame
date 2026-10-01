const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/mobile_bands.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 844, height: 390 });

// 不猜类名。把候选落点摆出来，直接问 DOM：这个矩形压住了哪些"有内容"的元素
// （有文字、或是 img）。哪一格压得最少，成就卡就放哪一格。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing",
  "c_yin_shu", "f_gongnei", "f_anxiang", "t_jieli", "i_dao"];
const duelData = {
  mode: "emotion", rules: "v2", turnSchema: "legacy", round: 6, phase: "pMain", turnNo: 1,
  hpPlayer: 10, hpOpponent: 10, qi: 8, qiMax: 12, hpMax: 12,
  rapport: 2, guard: 3, yanli: 5, yanliMax: 7,
  library: DECK.slice(6), discard: DECK.slice(0, 4),
  hand: ["c_qing_tong", "c_wei_yamen", "c_yin_shu", "i_dao"],
  opponentShown: "策", opponentTrue: "策", bluffed: false,
  charge: 0, foresuit: null, trap: null, seeNext: "none", passives: [],
  scoutLeft: 0, insiderLeft: 0, insiderActive: false, sharedTotal: 0, sharedUsed: 0,
  retinueNames: [], usedCards: [], log: [], lastResult: null, lastPlay: null,
  finished: null, playerLeadSuits: [], baseAp: 3, ap: 3, topicHits: 0,
};
const mk = (o) => JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: o.scene, viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: o.clues, bag: [], deck: DECK, silver: 60,
    lineIndex: 99, visited: [o.scene], boosts: [], retinue: [], usedCards: [],
  },
  duel: o.duel,
});

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

async function boot(o) {
  await page.goto('about:blank');
  await page.waitForTimeout(150);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem('dicun_mode_v1', 'light');
    localStorage.setItem('dicun_dlg_v1', '0');
  });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), mk(o));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2800);
}

// 240x66 的卡，四个候选锚点（横屏 844x390）
const SPOTS = {
  '右下(现状)': { x: 844 - 8 - 240, y: 390 - 8 - 66 },
  '右下·抬手牌上方': { x: 844 - 8 - 240, y: 390 - 120 - 66 },
  '右上': { x: 844 - 8 - 240, y: 6 },
  '右中': { x: 844 - 8 - 240, y: Math.round((390 - 66) / 2) },
};
const cover = (label) => page.evaluate((spots) => {
  const out = {};
  for (const [name, p] of Object.entries(spots)) {
    const R = { l: p.x, t: p.y, r: p.x + 240, b: p.y + 66 };
    const hits = [];
    let area = 0;
    for (const e of document.querySelectorAll('body *')) {
      const b = e.getBoundingClientRect();
      if (b.width < 4 || b.height < 4) continue;
      const cs = getComputedStyle(e);
      if (cs.position === 'fixed' || cs.pointerEvents === 'none') continue;
      const isLeaf = e.children.length === 0;
      const text = isLeaf ? (e.innerText || '').trim() : '';
      const img = e.tagName === 'IMG' || e.tagName === 'CANVAS';
      if (!text && !img) continue;
      const ox = Math.max(0, Math.min(R.r, b.right) - Math.max(R.l, b.left));
      const oy = Math.max(0, Math.min(R.b, b.bottom) - Math.max(R.t, b.top));
      if (ox <= 1 || oy <= 1) continue;
      const ov = ox * oy;
      area += ov;
      if (hits.length < 5) hits.push(`${(text || (img ? '〔图〕' : '')).slice(0, 14)}@${Math.round(b.left)},${Math.round(b.top)}`);
    }
    out[name] = { px: Math.round(area), n: hits.length, hits };
  }
  return out;
}, SPOTS);

await boot({ scene: 'a_duel_scene', clues: [], duel: { cfgId: 'd_wang', data: duelData, wager: 0 } });
res.duel = await cover('duel');

await boot({ scene: 'search', clues: ['x1', 'x2'] });
res.story = await cover('story');

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
