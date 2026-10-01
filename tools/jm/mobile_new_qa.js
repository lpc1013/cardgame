const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/mobile_new.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
// 手机端默认横屏：验收姿态是 844x390，不是竖屏（见 memory「手机端默认横屏」）。
// 这一轮只量本轮新加的三块面：牌桌分区、勘查层、HUD 字牌框形。
await page.setViewportSize({ width: 844, height: 390 });

const DECK = ["c_wei_yamen", "c_li_qian", "c_qing_tong", "c_qing_nv", "c_li_lun", "c_li_falv",
  "c_quan_jiang", "c_she_duan", "c_wen_xing", "i_dao"];
const mk = (sc, scene) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: [], bag: [], deck: DECK, silver: 60,
    lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
});

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

// 溢出与"顶出屏外"是横屏最常见的两种坏法：窄屏一行排不下就往外撑
const probe = (extra) => page.evaluate((x) => {
  const de = document.documentElement;
  const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const over = [];
  for (const e of document.querySelectorAll('.dt-table *, .sv-layer *, .top-bar *')) {
    const r = e.getBoundingClientRect();
    if (r.right > de.clientWidth + 1 || r.left < -1) {
      over.push(`${e.tagName}.${String(e.className).slice(0, 22)}@${Math.round(r.left)},${Math.round(r.right)}`);
    }
    if (over.length > 6) break;
  }
  const t = document.querySelector('.dt-table');
  const g = document.querySelector('.sv-ground');
  // 光量"有没有横向溢出"判不了这块：真正的坏法是案面吃掉整屏、手牌掉到折叠线以下。
  // 所以直接量"手牌在不在屏内""我方席有没有被切"。
  const hand = document.querySelector('.hand');
  const hr = hand ? hand.getBoundingClientRect() : null;
  const me = document.querySelector('.dt-me');
  const mr = me ? me.getBoundingClientRect() : null;
  const out = {
    vw: de.clientWidth, vh: de.clientHeight,
    overflowX: de.scrollWidth - de.clientWidth,
    offenders: over,
    tableH: t ? Math.round(t.getBoundingClientRect().height) : null,
    tablePct: t ? Math.round(t.getBoundingClientRect().height / de.clientHeight * 100) : null,
    handOnScreen: hr ? (hr.top >= -1 && hr.bottom <= de.clientHeight + 1) : null,
    handBottom: hr ? Math.round(hr.bottom) : null,
    meClipped: mr ? (mr.bottom > de.clientHeight + 1) : null,
    svFits: g ? (g.getBoundingClientRect().height <= de.clientHeight + 1) : null,
    svBottom: g ? Math.round(g.getBoundingClientRect().bottom) : null,
    svSpotOut: (() => {
      const f = document.querySelector('.sv-field'); if (!f) return null;
      const fr = f.getBoundingClientRect();
      return [...document.querySelectorAll('.sv-spot')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.left < fr.left - 1 || r.right > fr.right + 1 || r.top < fr.top - 1 || r.bottom > fr.bottom + 1;
      }).length;
    })(),
    btnCount: [...document.querySelectorAll('.top-bar .clue-btn')].filter((e) => {
      const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3;
    }).length,
    btnWrapped: (() => {
      const bs = [...document.querySelectorAll('.top-bar .clue-btn')].filter((e) => e.getBoundingClientRect().height > 3);
      if (bs.length < 2) return null;
      const tops = new Set(bs.map((e) => Math.round(e.getBoundingClientRect().top)));
      return tops.size > 1;
    })(),
  };
  if (x) out.note = x;
  return out;
}, extra);

async function boot(sc, scene, theme, mode) {
  await page.goto('about:blank');
  await page.waitForTimeout(200);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), mode);
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), mk(sc, scene));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(([t, m]) => {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    document.documentElement.dataset.mode = m;
  }, [theme, mode]);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
}

const shot = async (key) => {
  try { await page.screenshot({ path: `${OUT}/m_${key}.png` }); res[key].shot = 'full'; }
  catch {
    try { await page.screenshot({ path: `${OUT}/m_${key}.png`, clip: { x: 0, y: 0, width: 844, height: 390 } }); res[key].shot = 'clip'; }
    catch { res[key].shot = 'failed'; }
  }
  save();
};

// 四趟就够定性：一套浅皮一套深皮，各量牌桌与勘查浮层。
// 截图比探针贵得多，上一轮 9 趟撞了 CLI 硬时限（跑到第 6 趟被终止），所以按 CLI 时限收规模。
for (const [theme, mode] of [['', 'light'], ['jiangnan', 'dark']]) {
  const tag = (theme || 'xu') + '_' + mode;
  await boot('fuma', 'b_start', theme, mode);
  res['table_pressure_' + tag] = await probe('fuma/d_shen');
  await shot('table_pressure_' + tag);
  // 勘查层：打开浮层量它高不高于视口、热点有没有飘出图外
  await boot('fuma', 'search', theme, mode);
  await page.evaluate(() => { const b = document.querySelector('.sv-btn'); if (b) b.click(); });
  await page.waitForTimeout(900);
  res['survey_' + tag] = await probe('fuma/search');
  await shot('survey_' + tag);
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
