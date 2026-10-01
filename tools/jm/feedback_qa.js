const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/feedback.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 反馈层两件事，都走真实输入，不直接调内部函数：
//  A 获得 → 中上方堆叠：用勘查点证物（会往 st.clues 里加），看细条有没有弹、文字对不对、堆到几条
//  B 成就 → 右下角卡片：把情绪局打到共鸣满（按对手亮出的色挑同色牌出），
//    胜局会走 checkDuelAchievements → grantAch。没弹要能分清"触发坏了"还是"没成就够格"，
//    所以同时把达成前后的成就数与已拥有数都记下来。
// 牌组要四色都有：对手亮什么色就得有同色牌可接，否则只能错色掉气力、打不满五道共鸣。
// fuma 自带卡里器色只有物品，故补 i_dao/i_zhu；隐色多给几张（c_yin_shu/f_gongnei/f_anxiang/t_jieli）。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing", "r_wang",
  "c_yin_shu", "f_gongnei", "f_anxiang", "t_jieli", "i_dao", "i_zhu"];
const mk = (scene) => JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: scene, viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: [], bag: [], deck: DECK, silver: 60,
    lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
});

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

async function boot(scene) {
  await page.goto('about:blank');
  await page.waitForTimeout(200);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { localStorage.setItem('dicun_mode_v1', 'light'); localStorage.setItem('dicun_dlg_v1', '0'); });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), mk(scene));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
}

const readFx = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const feed = [...document.querySelectorAll('.fx-line')].filter(vis);
  const ach = [...document.querySelectorAll('.fx-ach-card')].filter(vis);
  return {
    feedCount: feed.length,
    feedText: feed.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' ⧸ '),
    feedStacked: feed.length > 1 ? Math.round(feed[feed.length - 1].getBoundingClientRect().top - feed[0].getBoundingClientRect().top) !== 0 : null,
    achCount: ach.length,
    achText: ach.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' ⧸ '),
    achIconImg: ach.length ? !!ach[0].querySelector('.fx-ach-icon img, .fx-ach-icon svg') : null,
  };
});

// ---------- A 勘查入卷 ----------
await boot('search');
await page.evaluate(() => { const b = document.querySelector('.sv-btn'); if (b) b.click(); });
await page.waitForTimeout(900);
res.A_before = await readFx();
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 4; i++) {
    const el = [...document.querySelectorAll('.sv-spot')].find((x) => !x.disabled && !x.className.includes('got'));
    if (!el) break;
    el.click(); await sleep(700);
  }
});
await page.waitForTimeout(400);
res.A_after = await readFx();
try { await page.screenshot({ path: `${OUT}/fx_A_feed.png` }); } catch { /* ignore */ }
save();

// ---------- B 对局取胜 → 成就卡 ----------
const achOwned0 = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('dicun_achievements_v1') || '[]').length; } catch { return -1; }
});
res.B_ownedBefore = achOwned0;
await boot('a_duel_scene');
res.B_duelOpen = await page.evaluate(() => !!document.querySelector('.duel-root'));
const log = [];
for (let round = 0; round < 14; round++) {
  // 情绪局里对手亮色是"打完这一手之后"才换的，中间有一段 opponentShown=null
  // 的窗口，此时手牌整排 disabled。上一版只等 2.1s 就读，读到 null 直接空转十轮，
  // 看着像"成就卡坏了"，其实是没等。这里轮询等到亮色为止（上限 12s）。
  let st = null;
  for (let w = 0; w < 12; w++) {
    st = await page.evaluate(() => {
      const el = document.querySelector('.dt-placard.shown .pc-suit');
      const m = el ? el.className.match(/s-([策略势隐])/) : null;
      return {
        suit: m ? m[1] : null,
        dots: document.querySelectorAll('.rapport-dots i.on').length,
        qi: ((document.querySelector('.dt-me .qi-num') || {}).innerText || '').replace(/[^\d/]/g, ''),
        over: !!document.querySelector('.duel-root .btn-main'),
        ach: document.querySelectorAll('.fx-ach-card').length,
      };
    });
    if (st.suit || st.over || st.ach) break;
    await page.waitForTimeout(1000);
  }
  log.push(`r${round}:suit=${st.suit},dots=${st.dots},qi=${st.qi}`);
  if (st.over || st.ach) break;
  if (!st.suit) { log.push('  等亮色超时'); continue; }
  // 挑一张同色的成术牌，两段式点两下；没有同色的就随便出一张（错色掉气力，
  // 但局会打完——这一趟要验的是"成就卡有没有弹"，不是"能不能打赢"）
  const played = await page.evaluate(async (want) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const all = [...document.querySelectorAll('.hand .play-card')].filter((x) => !x.disabled && !x.className.includes('card-disabled'));
    const c = all.find((x) => x.className.includes(`suit-${want}`)) || all[0];
    if (!c) return 'no-card';
    c.click(); await sleep(420);
    const up = [...document.querySelectorAll('.hand .play-card.hand-top')][0] || c;
    up.click(); await sleep(420);
    return 'ok';
  }, st.suit);
  log.push(`  play=${played}`);
  await page.waitForTimeout(2100);
  const fx = await readFx();
  if (fx.achCount) { res.B_ach = fx; break; }
}
res.B_log = log;
await page.waitForTimeout(1200);
res.B_after = await readFx();
const achOwned1 = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('dicun_achievements_v1') || '[]').length; } catch { return -1; }
});
res.B_ownedAfter = achOwned1;
try { await page.screenshot({ path: `${OUT}/fx_B_ach.png` }); } catch { /* ignore */ }
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
