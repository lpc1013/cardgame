const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/art_live_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 离线校验证明"文件没坏"，这一趟证明"页面上真画出来了"：
// 市集一次摆 20+ 张带图卡面，是卡图最密集的一屏；再看对手立绘与成就图标。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing", "c_yin_shu"];
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: 'market', viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: [], bag: [], deck: DECK, silver: 500,
    lineIndex: 99, visited: ['market'], boosts: [], retinue: [], usedCards: [],
  },
});

const res = {};
const scan = (label) => page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')];
  const broken = [];
  const dims = {};
  for (const im of imgs) {
    const src = im.currentSrc || im.src || '';
    if (!src) continue;
    if (im.naturalWidth === 0) { broken.push(src.split('/').pop()); continue; }
    const k = im.naturalWidth + 'x' + im.naturalHeight;
    dims[k] = (dims[k] || 0) + 1;
  }
  return {
    imgs: imgs.length, brokenN: broken.length, broken: broken.slice(0, 12),
    top: Object.entries(dims).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
});

await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate((v) => {
  localStorage.setItem('dicun_mode_v1', 'light');
  localStorage.setItem('dicun_save_v4', v);
}, SAVE);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2200);
await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
await page.waitForTimeout(2600);
res.shop = await scan('shop');
// 翻到卡包页，让卡背/开包那批图也进视口
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.shop-tab')].find((x) => /卡包/.test(x.innerText));
  if (t) t.click();
});
await page.waitForTimeout(1200);
res.pack = await scan('pack');
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
