const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/pick_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 三选一这一屏本轮加了三样：案面（深漆板）、题签上那枚印、发牌的依次落案。
// 三套皮 × 明暗都要量，特别要确认动画落定后 hover 还在（fill-mode 用错就会把
// transform 永久占住，牌抬不起来了）。
const DECK = ["i_yinzan", "r_zhoumang", "c_qing_tong", "c_li_lun"];
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'qinhuai', savedAt: Date.now(),
  state: {
    scenarioId: 'qinhuai', sceneId: 'alley_pick', viewpoint: null, flags: [],
    stats: { chaoting: 50, daoyi: 50, renwang: 50 },
    clues: [], bag: [], deck: DECK, silver: 200,
    lineIndex: 99, visited: ['alley_pick'], boosts: [], retinue: [], usedCards: [],
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
  const de = document.documentElement;
  const row = document.querySelector('.pick-row');
  const title = document.querySelector('.pick-title');
  const seal = title ? getComputedStyle(title, '::after') : null;
  const cards = [...document.querySelectorAll('.pick-row .tcard')];
  const cs = row ? getComputedStyle(row) : null;
  return {
    theme: de.dataset.theme || '(默认)', mode: de.dataset.mode || '(默认)',
    onPick: !!row,
    title: title ? title.innerText.trim() : null,
    cards: cards.length,
    trayBg: cs ? (cs.backgroundImage || '').slice(0, 52) : null,
    trayBorder: cs ? `${cs.borderTopWidth} ${cs.borderLeftWidth} ${cs.borderTopLeftRadius}/${cs.borderBottomLeftRadius}` : null,
    trayOutline: cs ? `${cs.outlineWidth} ${cs.outlineStyle}` : null,
    trayShadow: cs ? (cs.boxShadow || '').slice(0, 40) : null,
    sealBox: seal ? `${seal.width}x${seal.height}` : null,
    sealRadius: seal ? seal.borderRadius : null,
    sealBg: seal ? seal.backgroundColor : null,
    sealTransform: seal ? seal.transform : null,
    anim: cards.map((c) => { const s = getComputedStyle(c); return `${s.animationName}@${s.animationDelay}`; }),
    // 落定之后 hover 必须还抬得起来：fill-mode 若是 both/forwards，to 帧的 transform:none
    // 会被永久占住，:hover 的上浮就再也不生效。backwards 只在延迟期占 from 帧，落定即归还。
    fillMode: cards.length ? getComputedStyle(cards[0]).animationFillMode : null,
    animPlayState: cards.length ? cards[0].getAnimations().map((a) => a.playState).join(',') : null,
    hOverflow: de.scrollWidth - de.clientWidth,
    vOverflow: (() => { const e = document.querySelector('.pick-root'); return e ? e.scrollHeight - e.clientHeight : null; })(),
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
    await page.waitForTimeout(2600);
    const m = await measure();
    res.combos.push(m);
    if (mode === 'light') {
      // 遮挡窗口里整页截图会等合成帧等到超时（30s），改截局部；
      // 且隐藏页动画是冻住的，backwards 会把牌按在 opacity 0——先摘掉动画再拍
      await page.evaluate(() => {
        document.querySelectorAll('.pick-row .tcard').forEach((e) => { e.style.animation = 'none'; });
        document.querySelectorAll('.fx-line, .fx-ach-card').forEach((e) => { e.style.animation = 'none'; });
      });
      try {
        await page.screenshot({ path: `${OUT}/pick_${theme || 'default'}.png`,
          clip: { x: 520, y: 286, width: 400, height: 300 } });
      } catch (e) { m.shotErr = String(e).slice(0, 60); }
    }
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
