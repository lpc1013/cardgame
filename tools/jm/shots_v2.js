const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/shots_v2.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 本轮改过、但当时因为窗口不合成帧只能靠计算样式交差的四块面：市集抬头、三选一案面、
// 规则书那一册、面板壳的题签与印。浏览器重启后补一次真实像素。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing", "c_yin_shu"];
const mk = (sc, scene) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48, junGong: 0, dixin: 50, minxin: 50 },
    clues: ['x1', 'x2'], bag: [], deck: DECK, silver: 500,
    lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
});
const empire = (t) => JSON.stringify({
  ink: 999, grantedEnds: 0, warehouse: [], themes: t ? [t] : [], theme: t, boosts: {},
  brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {},
  endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
});

const res = { shots: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

async function boot(sc, scene, theme) {
  await page.goto('about:blank');
  await page.waitForTimeout(150);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(([s, e]) => {
    localStorage.setItem('dicun_mode_v1', 'light');
    localStorage.setItem('dicun_dlg_v1', '0');
    localStorage.setItem('dicun_empire_v1', e);
    localStorage.setItem('dicun_save_v4', s);
  }, [mk(sc, scene), empire(theme)]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1900);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
}

const shot = async (name, clip) => {
  try {
    await page.screenshot({ path: `${OUT}/v2_${name}.png`, ...(clip ? { clip } : {}) });
    res.shots.push({ name, ok: true });
  } catch (e) { res.shots.push({ name, ok: false, err: String(e).slice(0, 70) }); }
};

await boot('fuma', 'market', '');
await shot('shop_default', { x: 150, y: 0, width: 1140, height: 420 });

await boot('fuma', 'market', 'jiangnan');
await shot('shop_jiangnan', { x: 150, y: 0, width: 1140, height: 420 });

await boot('qinhuai', 'alley_pick', 'bianjun');
await shot('pick_bianjun');

await boot('fuma', 'market', 'jiangnan');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /离市/.test(x.innerText));
  if (b) b.click();
});
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.title-nav button')].find((x) => /规则书/.test(x.innerText.trim()));
  if (b) b.click();
});
await page.waitForTimeout(900);
await shot('guide_jiangnan', { x: 380, y: 40, width: 680, height: 700 });

await page.evaluate(() => { const ov = document.querySelector('.clue-overlay'); if (ov) ov.click(); });
await page.waitForTimeout(400);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.title-nav button')].find((x) => /成就/.test(x.innerText.trim()));
  if (b) b.click();
});
await page.waitForTimeout(1200);
await shot('panel_achievements', { x: 200, y: 30, width: 1040, height: 420 });

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
