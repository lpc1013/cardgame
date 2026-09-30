const fs = require('fs');
const BASE = 'http://localhost:5199/';
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 失败读数对不上手算的对比度时，先把"这个节点到底取到什么色"量出来。
// 探针报的是合成后的背景，但文字色可能被祖先令牌覆写（深漆岛那套），不量就不知道是哪一层。
const out = {};
for (const [theme, mode, nav, sel] of [
  ['bianjun', 'light', '商市', '.emporia-name'],
  ['jiangnan', 'light', '商市', '.emporia-name'],
  ['default', 'light', '卡册', '.album-carry'],
  ['bianjun', 'light', '卡册', '.album-chip'],
  ['bianjun', 'dark', '成就', '.ach-reward'],
]) {
  const key = `${theme}/${mode}/${nav}`;
  await page.goto('about:blank');
  await page.waitForTimeout(250);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), mode);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(([t, m]) => {
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.mode = m;
  }, [theme, mode]);
  await page.evaluate((label) => {
    const b = [...document.querySelectorAll('.nav-btns button')].find((x) => x.innerText.trim() === label);
    if (b) b.click();
  }, nav);
  await page.waitForTimeout(1400);
  out[key] = await page.evaluate((s) => {
    const nodes = [...document.querySelectorAll(s)];
    return nodes.slice(0, 3).map((n) => {
      const cs = getComputedStyle(n);
      return {
        text: (n.innerText || '').slice(0, 12),
        color: cs.color,
        bg: cs.backgroundColor,
        cls: n.className.slice(0, 46),
        gold: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        inkDim: getComputedStyle(document.documentElement).getPropertyValue('--ink-dim').trim(),
      };
    });
  }, sel);
  await page.evaluate(() => { const o = document.querySelector('.clue-overlay'); if (o) o.click(); });
  await page.waitForTimeout(400);
}
out.pageCount = (typeof pages === 'function' ? pages().length : -1);
fs.writeFileSync('E:/CardGame/_qa/color_probe.json', JSON.stringify(out, null, 1));
