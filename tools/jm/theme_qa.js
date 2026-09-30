const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/theme_audit.json`;

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5199/', { waitUntil: 'load', timeout: 60000 });

// 剧情档要一个"能续"的存档。原先直接点 .resume-box .btn-main，赌浏览器里躺着用户自己的进度——
// 一旦被别的驱动覆写掉就干等 15s 超时。这里自己灌一份（changjiang 是多视角剧本，
// 开场幕叫 prologue 不是 start，viewpoint 必须是真 id，否则名牌那条分支测不到）。
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'changjiang', savedAt: Date.now(),
  state: {
    scenarioId: 'changjiang', sceneId: 'prologue', viewpoint: 'vp_emperor', flags: [], stats: {},
    clues: [], bag: [], deck: [], silver: 60, lineIndex: 0, visited: ['prologue'],
    boosts: [], retinue: [], usedCards: [],
  },
});
await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SAVE);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.addScriptTag({ url: 'http://localhost:5199/scripts/contrast-audit.js' });
await page.waitForTimeout(700);

// 皮表必须跟注册表一致。旧六套已下线：它们不再匹配任何 CSS，
// 全部会静默回落成默认皮肤并报"0 失败"——绿灯是假的。
// 所以下面每组都落 --panel 实际取值，靠它断言"这套皮真的换上了"。
const THEMES = ['default', 'bianjun', 'jiangnan'];
const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const apply = (theme, mode) => page.evaluate(([t, m]) => {
  if (t === 'default') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  if (m === 'light') delete document.documentElement.dataset.mode;
  else document.documentElement.dataset.mode = m;
}, [theme, mode]);

const shoot = () => page.evaluate(() => {
  const a = window.__audit();
  return {
    f: a.fails, c: a.checked,
    l: a.list.filter((x) => x[0] !== '.sub').slice(0, 8).map((x) => x[0] + ':' + x[1] + '@' + x[4]),
    panel: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim(),
    ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
  };
});

for (const screen of ['title', 'story']) {
  if (screen === 'story') {
    await apply('default', 'light');
    await page.waitForTimeout(600);
    await page.click('.resume-box .btn-main', { timeout: 15000 });
    await page.waitForTimeout(3000);
  }
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark']) {
      const key = `${screen}/${theme}/${mode}`;
      if (res[key]) continue;
      await apply(theme, mode);
      await page.waitForTimeout(1100);
      res[key] = await shoot();
      save();
    }
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
