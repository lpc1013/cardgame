const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
if (!page) page = await context.newPage();

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5199/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);

// 左上暗边、封面内、正文区各采一点，问出到底是谁在画那层颜色
const probe = await page.evaluate(() => {
  const at = (x, y) => {
    const chain = [];
    let n = document.elementFromPoint(x, y);
    for (let i = 0; n && i < 5; i++) {
      const cs = getComputedStyle(n);
      chain.push({
        el: n.id ? '#' + n.id : (n.className && typeof n.className === 'string' && n.className.trim()
          ? n.tagName.toLowerCase() + '.' + n.className.trim().split(/\s+/)[0] : n.tagName.toLowerCase()),
        bc: cs.backgroundColor, bi: cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 34),
      });
      n = n.parentElement;
    }
    return chain;
  };
  return { margin: at(60, 430), coverMat: at(300, 430), art: at(900, 430) };
});

const res = {};
for (const mode of ['light', 'dark']) {
  await page.evaluate((m) => { document.documentElement.dataset.mode = m; }, mode);
  await page.waitForTimeout(1000);
  const p = await page.screenshot({ path: `${OUT}/d2_${mode}.png` });
  res[mode] = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('root'));
    return { rootBg: cs.backgroundColor, bodyBg: getComputedStyle(document.body).backgroundColor };
  });
}
fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify({ probe, res }, null, 1));
console.log(JSON.stringify({ pageCount: context.pages().length }));
