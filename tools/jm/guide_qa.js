const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/guide_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 规则书要做成"一册"：左口线装打眼、题签上钤印、每条一记朱点。
// 这三样都是 ::before/::after 画的，量不到就等于没做——逐个取伪元素计算样式。
const empire = (theme) => JSON.stringify({
  ink: 999, grantedEnds: 0, warehouse: [], themes: theme ? [theme] : [], theme,
  boosts: {}, brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false,
  achCounters: {}, endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
});

const res = { combos: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const measure = () => page.evaluate(() => {
  const de = document.documentElement;
  const p = document.querySelector('.guide-panel');
  if (!p) return { open: false };
  const cs = getComputedStyle(p);
  const spine = getComputedStyle(p, '::before');
  const stitch = getComputedStyle(p, '::after');
  const h3 = p.querySelector('h3');
  const seal = h3 ? getComputedStyle(h3, '::after') : null;
  const sec = p.querySelector('.guide-sec');
  const dot = sec ? getComputedStyle(sec, '::before') : null;
  const pr = p.getBoundingClientRect();
  const sr = sec ? sec.getBoundingClientRect() : null;
  return {
    open: true,
    theme: de.dataset.theme || '(默认)', mode: de.dataset.mode || '(默认)',
    secs: p.querySelectorAll('.guide-sec').length,
    padLeft: cs.paddingLeft, radius: cs.borderTopLeftRadius,
    spineW: spine.width, spineBg: spine.backgroundColor,
    stitchW: stitch.width, stitchImg: (stitch.backgroundImage || '').slice(0, 34),
    stitchSize: stitch.backgroundSize,
    sealBox: seal ? `${seal.width}x${seal.height}` : null,
    sealRadius: seal ? seal.borderRadius : null,
    sealBg: seal ? seal.backgroundColor : null,
    dotBox: dot ? `${dot.width}x${dot.height}` : null,
    dotRadius: dot ? dot.borderRadius : null,
    dotBg: dot ? dot.backgroundColor : null,
    // 正文左沿必须让开脊线与订书眼，否则字压在装订上
    textClearsSpine: sr ? Math.round(sr.left - pr.left) : null,
    hOverflow: de.scrollWidth - de.clientWidth,
    panelScroll: `${p.scrollHeight}/${p.clientHeight}`,
  };
});

for (const theme of ['', 'bianjun', 'jiangnan']) {
  for (const mode of ['light', 'dark']) {
    await page.goto('about:blank');
    await page.waitForTimeout(150);
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(([e, m]) => {
      localStorage.setItem('dicun_mode_v1', m);
      localStorage.setItem('dicun_empire_v1', e);
      localStorage.removeItem('dicun_save_v4');
    }, [empire(theme), mode]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2200);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.title-nav button, .title-nav .nav-btns button')]
        .find((x) => /规则书/.test(x.innerText));
      if (b) b.click();
    });
    await page.waitForTimeout(700);
    const m = await measure();
    res.combos.push(m);
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
