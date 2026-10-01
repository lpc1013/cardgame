const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/hub_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 两件事一次量清：
// ① hub 到底有没有旁白——上一轮我用 lineIndex:99（越界）灌档，对白档模式下 slice 出空数组，
//    于是把"有 11 行正文的屏"看成"光秃秃五条选项条"，还据此判断"缺配文"。
// ② 舆图在 hub 上能不能点地方（点图上的地方 == 点那条选项）。
//
// lineIndex 不再自己填：每幕行数不一样，填小了 atEnd 就是 false，选项与舆图可去点双双为 0，
// 看着像天大的 bug（本轮就这么差点误报一次）。改成像玩家一样点画面推到幕尾。
const CASES = [
  ['sichou', 'hub', ['t4']],
  ['qinhuai', 'hub', ['m4']],
  ['fuma', 'market_gate', ['x1']],
  ['xie', 'market_gate', ['v1']],
  ['qiuwei', 'market_gate', ['q1']],
];

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const probe = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const q = (s) => [...document.querySelectorAll(s)].filter(vis);
  return {
    dlg: !!q('.dlg-head').length,
    // 屏上实际有几行正文：这是"有没有旁白"的直接判据
    linesShown: q('.story-line').length + q('.dlg-log-line').length,
    body: (document.querySelector('.story-panel') || {}).innerText?.replace(/\s+/g, ' ').slice(0, 90) || null,
    choices: q('.choice').length,
    mapOpen: !!q('.loc-map').length,
    mapNodes: q('.loc-node').length,
    // 状态类名是 `loc-node loc-<state>`（JSX 里 `loc-${state}`），不是 `loc-node-<state>`。
    // 上一版数 .loc-node-reach 恒为 0，把"舆图点不动"这个假 bug 报了出去——
    // 判据不能猜类名，直接把每个节点的实际 class 打出来。
    mapReach: q('.loc-reach').length,
    // 直接把每个节点的原始 class 打出来。上一版用 /\bloc-(here|reach|...)/ 取第一个匹配，
    // 于是 loc-here loc-reach 这种"两个都在"的态被读成 here，改动生效与否根本看不出来。
    nodeStates: q('.loc-node').map((e) => {
      const nm = e.querySelector('.loc-name');
      return `${nm ? nm.innerText : '?'}=${e.className.replace('loc-node ', '')}${e.disabled ? '(死)' : ''}`;
    }).join(' | '),
    multi: q('.loc-multi').map((e) => e.innerText).join(','),
  };
});

for (const [sc, scene, clues] of CASES) {
  const key = `${sc}_${scene}`;
  const SAVE = JSON.stringify({
    version: 4, scenarioId: sc, savedAt: Date.now(),
    state: {
      scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
      stats: { chaoting: 62, daoyi: 55, renwang: 48 },
      clues, bag: [], deck: [], silver: 100,
      lineIndex: 0, visited: [scene], boosts: [], retinue: [], usedCards: [],
    },
  });
  await page.goto('about:blank');
  await page.waitForTimeout(200);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { localStorage.setItem('dicun_mode_v1', 'light'); localStorage.setItem('dicun_dlg_v1', '1'); });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SAVE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
  res[key] = { sc, scene, start: await probe() };
  // 像玩家一样点画面推到幕尾（上限 40 下，防住意外死循环）
  let taps = 0;
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => {
      const p = document.querySelector('.story-panel');
      if (!p) return true;
      if ([...p.querySelectorAll('.choice')].some((b) => b.getBoundingClientRect().height > 3)) return true;
      p.click();
      return false;
    });
    taps++;
    await page.waitForTimeout(320);
    if (done) break;
  }
  res[key].taps = taps;
  Object.assign(res[key], await probe());
  await page.evaluate(() => { const b = [...document.querySelectorAll('.clue-btn')].find((x) => x.innerText.includes('舆图')); if (b) b.click(); });
  await page.waitForTimeout(1000);
  res[key].map = await probe();
  save();
  try { await page.screenshot({ path: `${OUT}/h_${key}.png` }); }
  catch {
    try { await page.screenshot({ path: `${OUT}/h_${key}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); } catch { /* ignore */ }
  }
  save();
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
