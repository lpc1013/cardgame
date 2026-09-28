// 对局页像素+对比度验收：读档进剧情后一路点正文/取首个选项推进，直到出现 .duel-root，
// 再在浅/深两档各跑一次对比度审计并截图。
// 跑法：tabbit-cli nodejs --task <名> --tab <tabId> --timeout-ms 180000 < tools/jm/duel_qa.js
// 结果落 _qa/duel_audit.json，截图落 _qa/duel_{light,dark}.png（需从 artifacts 目录 cp 回来）。
const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/duel_audit.json`;

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5199/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
await page.addScriptTag({ url: 'http://localhost:5199/scripts/contrast-audit.js' });
await page.waitForTimeout(700);

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

await page.click('.resume-box .btn-main', { timeout: 15000 });
await page.waitForTimeout(3500);

// 一路点正文推进、遇到选项点第一个，直到进入对局相位（最多 60 步防死循环）
const reached = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('.duel-root')) return { ok: true, steps: i };
    const c = document.querySelector('.choices .choice');
    if (c) { c.click(); await sleep(900); continue; }
    const b = document.querySelector('.story-panel .btn-main');
    if (b) { b.click(); await sleep(900); continue; }
    const p = document.querySelector('.story-panel');
    if (p) { p.click(); await sleep(420); continue; }
    await sleep(500);
  }
  return { ok: false, steps: 60, head: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120) };
});
res.reached = reached;
save();
if (!reached.ok) { res.pageCount = (typeof pages === 'function' ? pages().length : -1); save(); return; }

await page.waitForTimeout(1800);
res.duel = {};
for (const mode of ['light', 'dark']) {
  await page.evaluate((m) => { document.documentElement.dataset.mode = m; }, mode);
  await page.waitForTimeout(1400);
  res.duel[mode] = await page.evaluate(() => {
    const a = window.__audit();
    return { checked: a.checked, fails: a.fails, list: a.list.map((x) => ({ sel: x[0], r: x[1], need: x[2], fg: x[3], bg: x[4], n: x[5], t: x[6] })) };
  });
  await page.screenshot({ path: `${OUT}/duel_${mode}.png`, fullPage: false });
  save();
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
