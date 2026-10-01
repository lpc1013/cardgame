const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/feedback_px.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 上一版整张 clip 全是同一个色（57,53,47）——三条都在截图前淡完了，量等于没量。
// 这版先把 .fx-line 的动画冻在 opacity 1（只冻淡出，颜色/尺寸都是原样），再裁图。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing",
  "c_yin_shu", "f_gongnei", "f_anxiang", "t_jieli", "i_dao"];
const mk = (sc, scene, stats) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
    stats, clues: [], bag: [], deck: DECK, silver: 60,
    lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
});

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

async function boot(scenario, scene, stats) {
  await page.goto('about:blank');
  await page.waitForTimeout(200);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { localStorage.setItem('dicun_mode_v1', 'light'); localStorage.setItem('dicun_dlg_v1', '0'); });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), mk(scenario, scene, stats));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
  return page.evaluate(() => ({
    root: (document.querySelector('#root > div > *') || {}).className || '',
    choices: document.querySelectorAll('.scene-choices button, .choice-btn, .opt-btn').length,
    svBtn: !!document.querySelector('.sv-btn'),
  }));
}

const grab = async (key) => {
  const info = await page.evaluate(() => {
    const wrap = document.querySelector('.fx-feed');
    if (!wrap) return null;
    // 冻住淡出：只改 animation，不动颜色与几何
    [...wrap.querySelectorAll('.fx-line')].forEach((e) => { e.style.animation = 'none'; });
    const wr = wrap.getBoundingClientRect();
    return {
      box: { x: Math.round(wr.left), y: Math.round(wr.top), w: Math.round(wr.width), h: Math.round(wr.height) },
      lines: [...wrap.querySelectorAll('.fx-line')].map((e) => {
        const cs = getComputedStyle(e);
        const tag = e.querySelector('.fx-tag');
        return {
          cls: e.className, text: e.innerText.replace(/\s+/g, ' ').trim(),
          color: cs.color, bg: cs.backgroundColor, hairline: cs.borderBottomColor,
          tagColor: tag ? getComputedStyle(tag).color : null, tagText: tag ? tag.innerText : null,
          h: Math.round(e.getBoundingClientRect().height), op: cs.opacity,
        };
      }),
    };
  });
  if (!info) return null;
  res[key] = info;
  const b = info.box;
  try {
    await page.screenshot({ path: `${OUT}/fx_px_${key}.png`,
      clip: { x: Math.max(0, b.x - 10), y: Math.max(0, b.y - 10), width: b.w + 20, height: b.h + 20 } });
  } catch (e) { res[key + 'ShotErr'] = String(e).slice(0, 90); }
  return info;
};

// ---- A：证（勘查入卷） ----
res.bootA = await boot('fuma', 'search', { chaoting: 62, daoyi: 55, renwang: 48 });
await page.evaluate(() => { const b = document.querySelector('.sv-btn'); if (b) b.click(); });
await page.waitForTimeout(900);
res.clicksA = [];
for (let i = 0; i < 2; i++) {
  const r = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const spots = [...document.querySelectorAll('.sv-spot')]
      .filter((e) => !e.disabled && !e.className.includes('got'))
      .filter((e) => /^勘/.test((e.querySelector('.sv-tag') || {}).innerText || ''));
    if (!spots.length) return 'no-clue-spot';
    spots[0].click(); await sleep(320);
    return 'ok';
  });
  res.clicksA.push(r);
}
res.A = await grab('A');

// ---- B：望（真实选项把帝心推上去） ----
res.bootB = await boot('changjiang', 'tp_muliao', { junGong: 0, dixin: 50, minxin: 50 });
res.clickB = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const btns = [...document.querySelectorAll('button')].filter((b) => /孤信他|住口/.test(b.innerText));
  if (!btns.length) return 'no-choice';
  btns[0].click(); await sleep(700);
  return 'clicked';
});
res.B = await grab('B');

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
