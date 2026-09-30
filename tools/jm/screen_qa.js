const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/screen_audit.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 这七块面板此前从没进过对比度探针——title_qa 一开商市就照出 .deck-tag 3.25，
// 说明"没测过"和"没问题"长得一样。这里把六套皮（三主题 × 浅深）× 七屏全扫一遍。
const NAVS = ['商市', '行囊', '图鉴', '卡册', '成就', '规则书', '设置'];
const COMBOS = [
  ['default', 'light'], ['default', 'dark'],
  ['bianjun', 'light'], ['bianjun', 'dark'],
  ['jiangnan', 'light'], ['jiangnan', 'dark'],
];

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

for (const [theme, mode] of COMBOS) {
  await page.goto('about:blank');
  await page.waitForTimeout(250);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), mode);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(([t, m]) => {
    if (t === 'default') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    document.documentElement.dataset.mode = m;
  }, [theme, mode]);
  await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' }).catch(() => {});
  await page.waitForTimeout(600);

  for (const nav of NAVS) {
    const key = `${theme}/${mode}/${nav}`;
    if (res[key]) continue;
    // 面板都包在 .clue-overlay 里，点它自己就 onClose；规则书是另一套壳，按文案收
    await page.evaluate((label) => {
      const b = [...document.querySelectorAll('.nav-btns button')].find((x) => x.innerText.trim() === label);
      if (b) b.click();
    }, nav);
    await page.waitForTimeout(1300);
    const opened = await page.evaluate(() => !!document.querySelector('.clue-overlay, .guide-overlay, .guide-panel'));
    const a = await page.evaluate(() => {
      if (!window.__audit) return { f: -1, c: 0, l: ['NO-AUDIT'] };
      const x = window.__audit();
      return {
        f: x.fails, c: x.checked,
        l: x.list.filter((y) => y[0] !== '.sub' && y[0] !== '.cover-ends').slice(0, 10)
          .map((y) => y[0] + ':' + y[1] + '@' + y[4]),
      };
    });
    const root = await page.evaluate(() => {
      const n = document.querySelector('.clue-overlay > *, .guide-panel');
      return n ? n.className.slice(0, 40) : null;
    });
    res[key] = { opened, root, ...a };
    save();
    await page.evaluate(() => {
      const o = document.querySelector('.clue-overlay');
      if (o) { o.click(); return; }
      const g = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '开始查案');
      if (g) g.click();
    });
    await page.waitForTimeout(600);
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
