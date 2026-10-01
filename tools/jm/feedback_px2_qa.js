const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/feedback_px2.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 上一版 clip 拍到的是空纸：page.screenshot 在遮挡窗口里要好几秒，回来时条子已经被
// React 的 3200ms 定时器摘掉了（冻 animation 只能冻淡出，冻不住卸载）。
// 这版把顺序倒过来——触发完立刻按固定取景截一张，再去读 DOM。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen"];
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
}

// 中上方固定取景：.fx-feed 在 top:10、水平居中，max-width 560
const CROP = { x: 440, y: 0, width: 560, height: 116 };
const shoot = async (key) => {
  try { await page.screenshot({ path: `${OUT}/fx_px2_${key}.png`, clip: CROP }); return true; }
  catch (e) { res[key + 'ShotErr'] = String(e).slice(0, 90); return false; }
};
const readBars = () => page.evaluate(() => {
  const wrap = document.querySelector('.fx-feed');
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.fx-line')].map((e) => {
    const tag = e.querySelector('.fx-tag');
    return { cls: e.className, text: e.innerText.replace(/\s+/g, ' ').trim(),
      tagColor: tag ? getComputedStyle(tag).color : null,
      box: (() => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; })() };
  });
});

await boot('changjiang', 'tp_muliao', { junGong: 0, dixin: 50, minxin: 50 });
res.click = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const btns = [...document.querySelectorAll('button')].filter((b) => /住口/.test(b.innerText));
  if (!btns.length) return 'no-choice';
  btns[0].click(); await sleep(560);
  return 'clicked';
});
res.shot = await shoot('B');
res.bars = await readBars();
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
