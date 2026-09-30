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

const audit = () => page.evaluate(() => {
  const x = window.__audit();
  return { f: x.fails, c: x.checked, l: x.list.filter((y) => y[0] !== '.sub').slice(0, 8).map((y) => y[0] + ':' + y[1] + '@' + y[4]) };
});

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
  // 探针要先注入：主题卡与称号行两张图都要读数，注入点放在滚来滚去之前
  await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' }).catch(() => {});
  await page.waitForTimeout(500);
  // 先拍主题卡（顶上那块织锦样片是这轮新加的），再滚到底拍称号行
  await page.evaluate(() => {
    const c = document.querySelector('.theme-card');
    if (c) c.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(700);
  const themes = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.theme-card')];
    const sw = cards.map((c) => c.querySelector('.theme-swatch')).filter(Boolean);
    return {
      themeCards: cards.length,
      withSwatch: sw.length,
      // 样片走 background-image：探针量不到，只能自己确认它取到了一张非空图
      painted: sw.filter((n) => (getComputedStyle(n).backgroundImage || '').startsWith('url(')).length,
    };
  });
  const imgs = await page.evaluate(async () => {
    const us = [...document.querySelectorAll('.theme-card .theme-swatch')]
      .map((n) => (getComputedStyle(n).backgroundImage || '').replace(/^url\(["']?/, '').replace(/["']?\)$/, ''))
      .filter((u) => u && u !== 'none');
    const out = [];
    for (const u of us) {
      try { const r = await fetch(u); out.push(r.ok && (r.headers.get('content-length') || 'ok')); }
      catch (e) { out.push('err'); }
    }
    return out;
  });
  await shot('themes_' + key, { mode, theme, ...themes, swatchBytes: imgs, ...(await audit()) });
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
  await shot(key, { mode, theme, ...info, ...(await audit()) });
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
