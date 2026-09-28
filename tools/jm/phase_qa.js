const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/phase_audit.json`;
const BASE = 'http://localhost:5199/';

// 只用任务已有的那一张页：绝不 newPage
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 伪造存档直接落到某条相位：resume() 按 scene 上的标志分派
// （cardPick→pick / shop→shop / minigame→minigame / verdict.scene→verdict / ending→ending）
const SAVE = (sc, scene) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
    stats: {}, clues: [], bag: [], deck: [], silver: 60,
    lineIndex: 0, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
});

const TARGETS = [
  ['fuma', 'verdict', 'verdict'],
  ['qiuwei', 'verdict', 'verdict'],
  ['fuma', 'market', 'shop'],
  ['xie', 'bookshop', 'shop'],
  ['qiuwei', 'yeshi', 'shop'],
  ['fuma', 'search_pick', 'pick'],
  ['sichou', 'dike_pick', 'pick'],
  ['fuma', 'wenchat', 'minigame'],
  ['sichou', 'sc_paijiu', 'minigame'],
  ['qinhuai', 'jiuling_scene', 'minigame'],
  ['qiuwei', 'qw_logic', 'minigame'],
  ['xie', 'xie_weigi', 'minigame'],
  ['fuma', 'end_a_win', 'ending'],
  ['changjiang', 'end_xuelu', 'ending'],
  ['jieyu', 'end_wanjing', 'ending'],
  ['xingxing', 'junzhuang', 'ending'],
];

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

// 相位判据：看真实渲染出来的根容器，别信我们自己的意图。
// 小游戏与商市共用 .shop-root 这层壳，区别在 ShopView 有 .shop-tabs、
// MiniGameView 没有（它内部按玩法是 .gobang-wrap / .jiuling-hand / .paijiu-box / .quiz-box）。
const detect = () => page.evaluate(() => {
  const q = (s) => !!document.querySelector(s);
  const mg = q('.gobang-wrap, .jiuling-hand, .paijiu-box, .quiz-box');
  const root = q('.pick-root') ? 'pick' : q('.shop-root') ? (mg ? 'minigame' : 'shop')
    : q('.verdict-hint') ? 'verdict' : q('.story-panel.ending') ? 'ending'
      : q('.duel-root') ? 'duel' : q('.story-root') ? 'story' : q('.title-screen') ? 'title' : 'unknown';
  const a = window.__audit();
  // 结局画心是否真的加载出来：img 在 DOM 里但 naturalWidth=0 等于没图
  const ea = document.querySelector('.ending-art');
  return {
    root,
    endingArt: ea ? (ea.naturalWidth > 0 ? `ok ${ea.naturalWidth}x${ea.naturalHeight}` : 'NOT-LOADED') : (q('.story-panel.ending') ? 'NO-IMG' : null),
    f: a.fails, c: a.checked,
    l: a.list.filter((x) => x[0] !== '.sub').slice(0, 6).map((x) => x[0] + ':' + x[1] + '@' + x[4]),
    txt: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
  };
});

for (const [sc, scene, want] of TARGETS) {
  for (const mode of ['light', 'dark']) {
    const key = `${sc}/${scene}/${mode}`;
    if (res[key]) continue;
    await page.goto('about:blank');
    await page.waitForTimeout(300);
    await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['dicun_mode_v1', mode]);
    await page.evaluate((s) => localStorage.setItem('dicun_save_v4', s), SAVE(sc, scene));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2400);
    const b = await page.$('.resume-box .btn-main');
    if (b) { await b.click(); await page.waitForTimeout(2800); }
    await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' });
    await page.waitForTimeout(500);
    const d = await detect();
    d.want = want;
    d.mismatch = d.root !== want;
    res[key] = d;
    // 截图前把正文面板滚回顶：结局页的画心在正文之上，滚动位置不对会拍成"结局没有配图"
    // （changjiang/end_xuelu 首拍就这样被误判过一次，实际 end_changjiang_end_xuelu.jpg 239KB 在仓）
    await page.evaluate(() => {
      document.querySelectorAll('.story-panel, .shop-root, .pick-root, .duel-root')
        .forEach((el) => { el.scrollTop = 0; });
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/p_${sc}_${scene}_${mode}.png` });
    save();
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
