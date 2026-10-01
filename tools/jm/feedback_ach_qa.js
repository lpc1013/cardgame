const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/feedback_ach2.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 验右下角的成就卡。走真实链路：存档里挂一局"再共鸣一次就胜"的对局（就是正常读档的形状），
// 玩家真的点两张同色牌 → playEmotion 把共鸣推到 5 → finishCheck 判胜 →
// checkDuelAchievements → grantAch → pushAch。不直接调内部函数，也不伪造弹窗。
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

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const read = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const ach = [...document.querySelectorAll('.fx-ach-card')].filter(vis);
  return {
    onDuel: !!document.querySelector('.duel-root'),
    fxFeedMounted: !!document.querySelector('.fx-feed'),
    fxAchMounted: !!document.querySelector('.fx-ach'),
    dots: document.querySelectorAll('.rapport-dots i.on').length,
    owned: (() => { try { return JSON.parse(localStorage.getItem('dicun_achievements_v1') || '[]').length; } catch { return -1; } })(),
    achCount: ach.length,
    achText: ach.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' ⧸ '),
    achIcon: ach.length ? !!ach[0].querySelector('img, svg') : null,
    // 位置也要量：弹了但没贴在右下角，等于没做成 Steam 式
    achBottomGap: ach.length ? Math.round(innerHeight - ach[0].getBoundingClientRect().bottom) : null,
    achRightGap: ach.length ? Math.round(innerWidth - ach[0].getBoundingClientRect().right) : null,
    achAnim: ach.length ? getComputedStyle(ach[0]).animationName : null,
  };
});

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
await page.waitForTimeout(2800);
res.before = await read();

// 两段式：点同色的「将心比心」立起来，再点一次打出去
const played = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const c = [...document.querySelectorAll('.hand .play-card.suit-策')].find((x) => !x.disabled);
  if (!c) return 'no-match-card';
  c.click(); await sleep(460);
  const up = [...document.querySelectorAll('.hand .play-card.hand-top')][0] || c;
  up.click(); await sleep(460);
  return 'played';
});
res.played = played;

const seen = [];
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(700);
  const s = await read();
  seen.push(`${i}:dots=${s.dots},owned=${s.owned},ach=${s.achCount}`);
  if (s.achCount) {
    res.hit = s;
    // 在"卡片确实在屏上"的那一刻就拍，再等视图切走之后拍一次：
    // 两次的差别才能回答"跨视图切换还在不在"，而不是靠事后一张图猜时序
    try { await page.screenshot({ path: `${OUT}/fx_ach_at.png` }); } catch { /* ignore */ }
    await page.waitForTimeout(2200);
    res.afterSwitch = await read();
    try { await page.screenshot({ path: `${OUT}/fx_ach_later.png` }); } catch { /* ignore */ }
    break;
  }
}
res.seen = seen;
res.end = await read();
try { await page.screenshot({ path: `${OUT}/fx_ach_card.png` }); } catch { /* ignore */ }
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
