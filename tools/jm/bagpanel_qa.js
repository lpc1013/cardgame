const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/bagpanel_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// .bag-panel 一层壳要同时喂六块面板（行囊/图鉴/卡册/成就/设置/商市）。
// 逐块开一遍，量题签上的印、界栏、以及面板自己的边／框／圆角——
// 只量一块就宣布"七屏受益"是不成立的：商市那块的 h3 里还挂着墨铤胶囊。
const PANELS = ['商市', '行囊', '图鉴', '卡册', '成就', '设置'];
const empire = (theme) => JSON.stringify({
  ink: 999, grantedEnds: 0, warehouse: [], themes: theme ? [theme] : [], theme,
  boosts: {}, brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false,
  achCounters: {}, endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
});

const res = { rows: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const readPanel = () => page.evaluate(() => {
  const de = document.documentElement;
  const p = document.querySelector('.bag-panel');
  if (!p) return null;
  const cs = getComputedStyle(p);
  const h3 = p.querySelector('h3');
  if (!h3) return { noH3: true, cls: p.className };
  const band = getComputedStyle(h3, '::before');
  const seal = getComputedStyle(h3, '::after');
  const h3cs = getComputedStyle(h3);
  return {
    cls: String(p.className).replace('bag-panel', '').trim() || '(裸)',
    title: (h3.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 14),
    h3Display: h3cs.display,
    panelBorderL: `${cs.borderLeftWidth} ${cs.borderLeftColor}`,
    panelRadius: `${cs.borderTopLeftRadius}/${cs.borderBottomLeftRadius}`,
    panelOutline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineOffset}`,
    bandH: band.height, bandImg: (band.backgroundImage || 'none').slice(0, 26),
    bandColor: (band.backgroundImage || band.backgroundColor || '').slice(0, 30),
    sealBox: `${seal.width}x${seal.height}`, sealRadius: seal.borderRadius,
    sealBg: seal.backgroundColor, sealMLA: seal.marginLeft,
    hOverflow: de.scrollWidth - de.clientWidth,
  };
});

for (const theme of ['', 'bianjun', 'jiangnan']) {
  await page.goto('about:blank');
  await page.waitForTimeout(150);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((e) => {
    localStorage.setItem('dicun_mode_v1', 'light');
    localStorage.setItem('dicun_empire_v1', e);
    localStorage.removeItem('dicun_save_v4');
  }, empire(theme));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2200);

  for (const label of PANELS) {
    const opened = await page.evaluate(async (t) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const b = [...document.querySelectorAll('.title-nav button')].find((x) => x.innerText.trim() === t);
      if (!b) return 'no-btn';
      b.click(); await sleep(520);
      return 'opened';
    }, label);
    const r = await readPanel();
    res.rows.push({ theme: theme || '(默认)', label, opened, ...(r || { missing: true }) });
    // 关掉再开下一块，避免叠层互相挡住读数
    await page.evaluate(() => {
      // 面板包在 .clue-overlay 里，背板 onClick=onClose；面板自己 stopPropagation，
      // 所以直接点背板元素就是"关掉"，比找各块面板里文案不一的关闭按钮稳
      const ov = document.querySelector('.clue-overlay');
      if (ov) ov.click();
    });
    await page.waitForTimeout(320);
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
