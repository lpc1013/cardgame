const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/art_load_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 批量重编码之后必须回答一个问题：有没有图不出了。
// 坏图不会报错，只会变成空白格子，所以按 naturalWidth===0 数，而不是看 console。
const res = {};
const broken = [];
const loaded = [];

await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => {
  localStorage.setItem('dicun_mode_v1', 'light');
  localStorage.setItem('dicun_empire_v1', JSON.stringify({
    ink: 999, grantedEnds: 0, warehouse: [], themes: [], theme: '', boosts: {},
    brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {},
    endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
  }));
  localStorage.setItem('dicun_cards_v1', '[]');
  localStorage.removeItem('dicun_save_v4');
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2400);

// 卡册是"全卡三态"的那一屏，一张页扫到所有卡图
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.title-nav button')].find((x) => /卡册|图鉴/.test(x.innerText.trim()));
  if (b) b.click();
});
await page.waitForTimeout(1800);
res.openedPanel = await page.evaluate(() => !!document.querySelector('.bag-panel'));

// 逐屏滚到底，让懒加载的图都进过一次视口
for (let i = 0; i < 30; i++) {
  await page.evaluate(() => {
    const p = document.querySelector('.bag-panel');
    if (p) p.scrollTop += p.clientHeight * 0.9;
  });
  await page.waitForTimeout(260);
}
await page.evaluate(() => { const p = document.querySelector('.bag-panel'); if (p) p.scrollTop = 0; });
await page.waitForTimeout(900);

res.scan = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.bag-panel img')];
  const broken = [];
  const sizes = {};
  for (const im of imgs) {
    const src = im.currentSrc || im.src || '';
    if (!src) continue;
    if (im.naturalWidth === 0) broken.push(src.split('/').pop());
    else sizes[im.naturalWidth + 'x' + im.naturalHeight] = (sizes[im.naturalWidth + 'x' + im.naturalHeight] || 0) + 1;
  }
  return {
    imgs: imgs.length,
    broken: broken.slice(0, 20),
    brokenN: broken.length,
    dims: Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
});

// 再直接按 HTTP 取一遍：naturalWidth 依赖渲染，取状态码才证明文件本身在
res.http = await page.evaluate(async () => {
  const urls = [...document.querySelectorAll('.bag-panel img')].map((i) => i.currentSrc || i.src).filter(Boolean);
  const uniq = [...new Set(urls)];
  const bad = [];
  const types = {};
  for (let i = 0; i < uniq.length; i += 24) {
    const chunk = uniq.slice(i, i + 24);
    const rs = await Promise.all(chunk.map((u) => fetch(u).then((r) => ({ u, ok: r.ok, t: r.headers.get('content-type') })).catch(() => ({ u, ok: false, t: 'ERR' }))));
    for (const r of rs) {
      if (!r.ok) bad.push(r.u);
      types[r.t] = (types[r.t] || 0) + 1;
    }
  }
  return { urls: uniq.length, bad: bad.slice(0, 10), badN: bad.length, types };
});

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
