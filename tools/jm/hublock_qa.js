const fs = require('fs');
const BASE = 'http://localhost:5199/';
const SEEDS = JSON.parse(fs.readFileSync('E:/CardGame/_qa/hublock_seeds.json', 'utf8'));
const OUT = 'E:/CardGame/_qa/hublock_probe.json';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// verify.mts 新闸报出 7 幕"唯一出路是全带 cond 的选项"。静态答不了"条件会不会全都落空"，
// 这里把 cond 反着喂到最坏情况，数一遍屏上还剩几个可见选项：0 = 该状态一到达即硬死锁。
//
// 注意这只量"该状态锁不锁"，**不量"该状态走不走得到"**。后者要在乘积图上做带极性的
// 可达性分析（notFlag 是"有则隐藏"、flag 是"无则隐藏"、cluesAtLeast 又是数值），
// 拿一层/两层追溯去猜会两头都错——本仓已因此误报过一次"死旗 + 结局永久不可达"。
const results = [];
for (const s of SEEDS) {
  const save = JSON.stringify({
    version: 4, scenarioId: s.scenario, savedAt: Date.now(),
    state: {
      scenarioId: s.scenario, sceneId: s.scene, viewpoint: null,
      flags: s.flags, stats: s.stats, clues: s.clues,
      bag: s.bag, deck: [], silver: 60, lineIndex: 99, visited: [s.scene],
      boosts: [], retinue: [], usedCards: [],
    },
  });
  await page.goto('about:blank');
  await page.waitForTimeout(250);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), save);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const b = document.querySelector('.resume-box .btn-main') || document.querySelector('.fab-resume');
    if (b) b.click();
  });
  await page.waitForTimeout(1600);
  const r = await page.evaluate((scene) => {
    const vis = (e) => { const q = e.getBoundingClientRect(); return q.width > 3 && q.height > 3; };
    const st = JSON.parse(localStorage.getItem('dicun_save_v4') || '{}').state || {};
    const all = [...document.querySelectorAll('.choices .choice')];
    return {
      landed: st.sceneId,
      atScene: st.sceneId === scene,
      visibleChoices: all.filter(vis).length,
      anyButton: [...document.querySelectorAll('.story-panel button, .story-panel .btn-main')]
        .filter(vis).map((b) => b.innerText.trim().slice(0, 14)).slice(0, 6),
      continueTip: !!document.querySelector('.continue-tip'),
    };
  }, s.scene);
  results.push({ ...s, ...r, locked: r.atScene && r.visibleChoices === 0 && !r.continueTip });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
}
fs.writeFileSync(OUT, JSON.stringify({
  pageCount: (typeof pages === 'function' ? pages() : context.pages()).length, results,
}, null, 1));
