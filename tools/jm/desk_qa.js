// 桌面 1440x900 像素+对比度验收：标题页 → 7 个面板 → 剧情页，浅/深两档各扫一遍。
// 跑法：tabbit-cli tabs --task <名> --state owned 取 tabId，再
//   tabbit-cli nodejs --task <名> --tab <tabId> --timeout-ms 180000 < tools/jm/desk_qa.js
// 结果落 _qa/final_audit.json（分段落盘，中途失败不丢已完成的部分）。
const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/final_audit.json`;

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5199/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
await page.addScriptTag({ url: 'http://localhost:5199/scripts/contrast-audit.js' });
await page.waitForTimeout(700);

// 面板扫完可能留下遮罩（有些面板没有「关闭」按钮），不清掉会拦住后续点击
const clearOverlays = () => page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let n = 0;
  for (let i = 0; i < 6; i++) {
    const ov = document.querySelector('.clue-overlay, .overlay, .modal-mask, .panel-mask');
    if (!ov) break;
    ov.click(); n++;
    await sleep(260);
  }
  return n;
});

const setMode = async (m) => {
  await page.evaluate((x) => { document.documentElement.dataset.mode = x; }, m);
  await page.waitForTimeout(1300);
};
const audit = () => page.evaluate(() => { const a = window.__audit(); return { checked: a.checked, fails: a.fails, list: a.list.slice(0, 8) }; });

res.title = res.title || {};
for (const mode of ['light', 'dark']) {
  await clearOverlays();
  await setMode(mode);
  res.title[mode] = await audit();
  save();
}

res.sweep = res.sweep || {};
for (const mode of ['light', 'dark']) {
  await clearOverlays();
  await setMode(mode);
  res.sweep[mode] = await page.evaluate((ls) => window.__sweep(ls), ['商市', '行囊', '图鉴', '卡册', '成就', '规则书', '设置']);
  save();
}
res.leftover = await clearOverlays();
save();

await setMode('light');
await page.click('.resume-box .btn-main', { timeout: 15000 });
await page.waitForTimeout(4500);
res.story = {};
for (const mode of ['light', 'dark']) {
  await setMode(mode);
  res.story[mode] = await audit();
  await page.screenshot({ path: `${OUT}/fin_${mode}.png`, fullPage: false });
  save();
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
