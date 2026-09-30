const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/title_shots.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 称号行：把五条「称号」奖励一次灌满，好让"有没有图"这件事一眼可判
const TITLES = ["不忘旧部", "白衣卿相", "百战之身", "五艺俱通", "天下全知"];

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
const shot = async (key, info) => {
  res[key] = { ...info, file: `s_${key}.png` };
  save();
  try { await page.screenshot({ path: `${OUT}/s_${key}.png` }); res[key].shot = 'full'; }
  catch (e1) {
    try { await page.screenshot({ path: `${OUT}/s_${key}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); res[key].shot = 'clip'; }
    catch (e2) { res[key].shot = 'failed'; }
  }
  save();
};

for (const [key, mode, theme] of [['light', 'light', ''], ['bianjun', 'dark', 'bianjun']]) {
  await page.goto('about:blank');
  await page.waitForTimeout(300);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), mode);
  await page.evaluate((v) => localStorage.setItem('dicun_empire_v1', v), JSON.stringify({
    version: 1, ink: 999, grantedEnds: 0, warehouse: [], themes: [], theme: "", boosts: {},
    brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {}, endMile: 0,
    luggageSlots: 0, spareSilver: 0, titles: TITLES,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2400);
  await page.evaluate(([t, m]) => {
    if (t) document.documentElement.dataset.theme = t;
    document.documentElement.dataset.mode = m;
  }, [theme, mode]);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.title-nav button, .title-nav a')].find((x) => x.innerText.trim() === '商市');
    if (b) b.click();
  });
  await page.waitForTimeout(1400);
  // 称号行在商市最底部，不滚进视口就只拍到上半张面板。
  // 面板自己带 overflow-y，光 scrollIntoView 一次会被后续渲染顶回去——先把所有可滚祖先推到底
  await page.evaluate(() => {
    const n = document.querySelector('.title-item');
    if (!n) return;
    for (let el = n.parentElement; el; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 4) el.scrollTop = el.scrollHeight;
    }
    n.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(900);
  await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' }).catch(() => {});
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.title-item')];
    const r = items.length ? items[0].getBoundingClientRect() : null;
    return {
      titles: items.length,
      // 落一笔屏幕坐标：不然"拍到了"和"拍糊了"在图上看不出区别
      inView: r ? (r.top > 0 && r.bottom < innerHeight) : false,
      rect: r ? [Math.round(r.top), Math.round(r.bottom)] : null,
      withArt: items.filter((n) => n.querySelector('img.title-icon')).length,
      broken: [...document.querySelectorAll('img.title-icon')].filter((i) => i.complete && i.naturalWidth === 0).length,
      names: items.map((n) => n.innerText.trim().replace(/\s+/g, ' ')),
    };
  });
  const a = await page.evaluate(() => {
    const x = window.__audit();
    return { f: x.fails, c: x.checked, l: x.list.filter((y) => y[0] !== '.sub').slice(0, 8).map((y) => y[0] + ':' + y[1] + '@' + y[4]) };
  });
  await shot(key, { mode, theme, ...info, ...a });
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
