const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/theme_shots.json`;
const BASE = 'http://localhost:5199/';

// 只用任务已有的那一张页：绝不 newPage
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

const SAVE = JSON.stringify({
  version: 4, scenarioId: 'changjiang', savedAt: Date.now(),
  state: {
    scenarioId: 'changjiang', sceneId: 'start', viewpoint: null, flags: [], stats: {},
    clues: [], bag: [], deck: [], silver: 60, lineIndex: 2, visited: ['start'],
    boosts: [], retinue: [], usedCards: [],
  },
});

// 皮表跟注册表同步：旧六套已下线，留着会全部回落成默认皮肤、拍出七张一模一样的图。
const SKINS = ['default', 'bianjun', 'jiangnan'];
const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

for (const skin of SKINS) {
  for (const mode of ['light', 'dark']) {
    for (const screen of ['title', 'story']) {
      const key = `${skin}_${mode}_${screen}`;
      if (res[key]) continue;
      await page.goto('about:blank');
      await page.waitForTimeout(300);
      await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['dicun_mode_v1', mode]);
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['dicun_save_v4', SAVE]);
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(2200);
      if (screen === 'story') {
        const b = await page.$('.resume-box .btn-main');
        if (b) { await b.click(); await page.waitForTimeout(3000); }
      } else {
        await page.waitForTimeout(900);
      }
      // 皮肤靠 dataset.theme 驱动；默认皮肤要显式清掉属性
      await page.evaluate(([s, m]) => {
        if (s === 'default') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = s;
        if (m === 'light') delete document.documentElement.dataset.mode;
        else document.documentElement.dataset.mode = m;
      }, [skin, mode]);
      await page.waitForTimeout(1200);
      const p = `${OUT}/t_${key}.png`;
      await page.screenshot({ path: p });
      res[key] = { file: `t_${key}.png`, root: await page.evaluate(() => (document.querySelector('.story-root') ? 'story' : document.querySelector('.title-screen') ? 'title' : 'other')) };
      save();
    }
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
