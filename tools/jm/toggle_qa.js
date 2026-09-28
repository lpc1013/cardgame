const fs = require('fs');
const OUT = 'E:/CardGame/_qa';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];

const read = () => page.evaluate(() => {
  const btn = [...document.querySelectorAll('.top-bar .clue-btn')].find((b) => /转墨|还宣/.test(b.innerText));
  const p = document.querySelector('.story-panel');
  return {
    label: btn ? btn.innerText.trim() : null,
    visible: btn ? btn.getBoundingClientRect().width > 0 : false,
    attr: document.documentElement.dataset.mode || null,
    stored: localStorage.getItem('dicun_mode_v1'),
    panelBg: p ? getComputedStyle(p).backgroundImage.slice(0, 46) : null,
    ink: p ? getComputedStyle(p).color : null,
  };
});

const res = {};

// --- 桌面：真实点击两来回 ---
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5199/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => localStorage.removeItem('dicun_mode_v1'));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2600);
await page.click('.resume-box .btn-main', { timeout: 15000 });
await page.waitForTimeout(3200);

res.before = await read();
await page.click('.top-bar .clue-btn:has-text("转墨")');
await page.waitForTimeout(1200);
res.afterFirst = await read();
await page.screenshot({ path: `${OUT}/tog_dark.png` });
await page.click('.top-bar .clue-btn:has-text("还宣")');
await page.waitForTimeout(1200);
res.afterSecond = await read();
await page.screenshot({ path: `${OUT}/tog_light.png` });

// --- 手机横屏：顶栏会不会挤不下 ---
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(1400);
res.mobile = await page.evaluate(() => {
  const bar = document.querySelector('.top-bar');
  const btns = [...document.querySelectorAll('.top-bar .clue-btn')].map((b) => {
    const r = b.getBoundingClientRect();
    return { t: b.innerText.trim(), w: Math.round(r.width), overflow: Math.round(r.right) > window.innerWidth };
  });
  return { barScrollW: bar.scrollWidth, clientW: bar.clientWidth, clipped: bar.scrollWidth > bar.clientWidth + 1, btns };
});
await page.screenshot({ path: `${OUT}/tog_mobile.png` });

fs.writeFileSync(`${OUT}/toggle.json`, JSON.stringify(res, null, 1));
