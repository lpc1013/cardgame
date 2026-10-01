const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/feedback_b.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 只验 B：把 fuma 的情绪局按对手亮出的色接到共鸣满，胜局会走
// checkDuelAchievements → grantAch → pushAch，右下角该滑出一张 Steam 式成就卡。
// A（中上方获得条）已用勘查入卷验过两次，不再重复，免得整趟撞上 CLI 硬时限。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing", "r_wang",
  "c_yin_shu", "f_gongnei", "f_anxiang", "t_jieli", "i_dao", "i_zhu"];
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: 'a_duel_scene', viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: [], bag: [], deck: DECK, silver: 60,
    lineIndex: 99, visited: ['a_duel_scene'], boosts: [], retinue: [], usedCards: [],
  },
});

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const read = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const ach = [...document.querySelectorAll('.fx-ach-card')].filter(vis);
  const el = document.querySelector('.dt-placard.shown .pc-suit');
  const m = el ? el.className.match(/s-([策略势隐])/) : null;
  return {
    suit: m ? m[1] : null,
    dots: document.querySelectorAll('.rapport-dots i.on').length,
    qi: ((document.querySelector('.dt-me .qi-num') || {}).innerText || '').replace(/[^\d/]/g, ''),
    over: !!document.querySelector('.duel-root .btn-main'),
    achCount: ach.length,
    achText: ach.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' ⧸ '),
    achIcon: ach.length ? !!ach[0].querySelector('img, svg') : null,
    // 卡片该贴在右下角：量它离视口右下边的距离，验证位置不是"弹了但在别处"
    achBottomGap: ach.length ? Math.round(innerHeight - ach[0].getBoundingClientRect().bottom) : null,
    achRightGap: ach.length ? Math.round(innerWidth - ach[0].getBoundingClientRect().right) : null,
    owned: (() => { try { return JSON.parse(localStorage.getItem('dicun_achievements_v1') || '[]').length; } catch { return -1; } })(),
  };
});

await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate((v) => { localStorage.setItem('dicun_mode_v1', 'light'); localStorage.setItem('dicun_save_v4', v); }, SAVE);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
await page.waitForTimeout(2600);

const log = [];
res.start = await read();
log.push(`start:dots=${res.start.dots},qi=${res.start.qi},owned=${res.start.owned}`);

for (let round = 0; round < 9; round++) {
  let s = res.start;
  for (let w = 0; w < 5; w++) {
    s = await read();
    if (s.suit || s.over || s.achCount) break;
    await page.waitForTimeout(1000);
  }
  log.push(`r${round}:suit=${s.suit},dots=${s.dots},qi=${s.qi}`);
  if (s.over || s.achCount) { res.hit = s; break; }
  if (!s.suit) continue;
  const played = await page.evaluate(async (want) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const all = [...document.querySelectorAll('.hand .play-card')].filter((x) => !x.disabled && !x.className.includes('card-disabled'));
    const c = all.find((x) => x.className.includes(`suit-${want}`)) || all[0];
    if (!c) return 'no-card';
    c.click(); await sleep(420);
    const up = [...document.querySelectorAll('.hand .play-card.hand-top')][0] || c;
    up.click(); await sleep(420);
    return all.length ? 'ok' : 'none-playable';
  }, s.suit);
  log.push(`  play=${played}`);
  await page.waitForTimeout(1800);
  const after = await read();
  if (after.achCount) { res.hit = after; log.push(`  ACH! ${after.achText}`); break; }
}

await page.waitForTimeout(1500);
res.end = await read();
res.log = log;
try { await page.screenshot({ path: `${OUT}/fx_B_ach.png` }); } catch { /* ignore */ }
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
