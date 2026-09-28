const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
fs.mkdirSync(OUT, { recursive: true });

// 只用任务已有的那一张页，绝不 newPage
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
if (!page) page = await context.newPage();

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5199/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3500);

// 载入对比度审计工具（dev 期脚本，不进生产包）
await page.addScriptTag({ url: 'http://localhost:5199/scripts/contrast-audit.js' });
await page.waitForTimeout(600);

const shots = [];
const audit = {};

for (const mode of ['light', 'dark']) {
  await page.evaluate((m) => { document.documentElement.dataset.mode = m; }, mode);
  await page.waitForTimeout(1200);
  const p = `${OUT}/desk_title_${mode}.png`;
  await page.screenshot({ path: p, fullPage: false });
  shots.push(p);
  audit[mode] = await page.evaluate(() => {
    const a = window.__audit();
    return { mode: a.mode, vp: a.viewport, checked: a.checked, fails: a.fails, list: a.list };
  });
}

fs.writeFileSync(`${OUT}/desk_audit.json`, JSON.stringify(audit, null, 1));
console.log(JSON.stringify({ pageCount: context.pages().length, shots, audit: Object.fromEntries(Object.entries(audit).map(([k, v]) => [k, [v.fails, v.checked]])) }));
