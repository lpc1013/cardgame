const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/shop_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 市集这一屏本轮补了三样东西：场景淡水印底、招牌那枚印、界栏与货签的"笔画"。
// 光看代码不算数——三套皮 × 明暗两档一共六个组合，逐个量计算样式，
// 特别要回答的是"换了皮，市集到底跟着变了没有"（本轮之前它只换色不换形）。
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
const empire = (theme) => JSON.stringify({
  ink: 999, grantedEnds: 0, warehouse: [], themes: theme ? [theme] : [], theme,
  boosts: {}, brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false,
  achCounters: {}, endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
});

const res = { combos: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const measure = () => page.evaluate(() => {
  const P = (el, pseudo) => (el ? getComputedStyle(el, pseudo) : null);
  const hdr = document.querySelector('.shop-header');
  const h2 = document.querySelector('.shop-header h2');
  const seal = P(h2, '::after');
  const band = P(hdr, '::after');
  const tabOn = document.querySelector('.shop-tab.on');
  const tabs = [...document.querySelectorAll('.shop-tab')];
  const bg = document.querySelector('.scene-bg');
  const de = document.documentElement;
  const rect = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)} → ${Math.round(b.right)},${Math.round(b.bottom)}`; };
  return {
    theme: de.dataset.theme || '(默认)',
    mode: de.dataset.mode || '(默认)',
    onShop: !!hdr,
    sceneBg: !!bg,
    sceneBgSrc: bg ? (getComputedStyle(bg).backgroundImage || '').slice(0, 46) : null,
    sealBox: seal ? `${seal.width}x${seal.height}` : null,
    sealRadius: seal ? seal.borderRadius : null,
    sealBg: seal ? seal.backgroundColor : null,
    sealShadow: seal ? (seal.boxShadow || '').slice(0, 40) : null,
    sealTransform: seal ? seal.transform : null,
    bandH: band ? band.height : null,
    bandBg: band ? (band.backgroundImage || '').slice(0, 46) : null,
    tabRadius: tabOn ? tabOn.style.borderRadius || getComputedStyle(tabOn).borderTopLeftRadius : null,
    tabAllRadius: [...new Set(tabs.map((t) => getComputedStyle(t).borderTopLeftRadius + '/' + getComputedStyle(t).borderBottomLeftRadius))],
    tabOnOutline: tabOn ? getComputedStyle(tabOn).outlineWidth + ' ' + getComputedStyle(tabOn).outlineStyle : null,
    tabOnBorderL: tabOn ? getComputedStyle(tabOn).borderLeftWidth + ' ' + getComputedStyle(tabOn).borderLeftColor : null,
    tabOnShadow: tabOn ? (getComputedStyle(tabOn).boxShadow || '').slice(0, 40) : null,
    hOverflow: de.scrollWidth - de.clientWidth,
    shopScrollH: (() => { const e = document.querySelector('.shop-root'); return e ? `${e.scrollHeight}/${e.clientHeight}` : null; })(),
    hdrRect: rect(hdr),
    // 抬头这块板子到底是什么色，招牌字在它上面还剩多少对比——上一版这里用的是 --bg
    // （大漆木框），浅档下等于把暗赭字压在黑木上
    hdrPlate: hdr ? getComputedStyle(hdr).backgroundImage.slice(0, 60) : null,
    hdrBorderBottom: hdr ? getComputedStyle(hdr).borderBottomColor : null,
    tokens: {
      bg: getComputedStyle(de).getPropertyValue('--bg').trim(),
      panel: getComputedStyle(de).getPropertyValue('--panel').trim(),
      gold: getComputedStyle(de).getPropertyValue('--gold').trim(),
      line: getComputedStyle(de).getPropertyValue('--line').trim(),
      accent: getComputedStyle(de).getPropertyValue('--accent').trim(),
    },
    h2Color: h2 ? getComputedStyle(h2).color : null,
    tabOnColor: tabOn ? getComputedStyle(tabOn).color : null,
    descColor: (() => { const e = document.querySelector('.shop-desc'); return e ? getComputedStyle(e).color : null; })(),
    cardCount: document.querySelectorAll('.shop-grid .tcard').length,
  };
});

for (const theme of ['', 'bianjun', 'jiangnan']) {
  for (const mode of ['light', 'dark']) {
    await page.goto('about:blank');
    await page.waitForTimeout(150);
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(([e, s, m]) => {
      localStorage.setItem('dicun_mode_v1', m);
      localStorage.setItem('dicun_empire_v1', e);
      localStorage.setItem('dicun_save_v4', s);
    }, [empire(theme), SAVE, mode]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
    await page.waitForTimeout(2400);
    const m = await measure();
    res.combos.push(m);
    if (mode === 'light') {
      try { await page.screenshot({ path: `E:/CardGame/_qa/shop_${theme || 'default'}.png` }); } catch (e) { m.shotErr = String(e).slice(0, 60); }
    }
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
