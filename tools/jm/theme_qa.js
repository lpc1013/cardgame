const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/theme_audit.json`;

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5199/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
await page.addScriptTag({ url: 'http://localhost:5199/scripts/contrast-audit.js' });
await page.waitForTimeout(700);

const THEMES = ['default', 'zhusha', 'daiqing', 'liujin', 'celadon', 'indigo', 'luxury'];
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
