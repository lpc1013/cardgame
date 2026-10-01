const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/panels.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 卷宗架之外那几块面板（商市/行囊/图鉴/卡册/成就/设置）还没量过。
// 判据同 feel_shots：数图、数字、数可点，再算"内容离屏底还剩多少"——
// 上一轮就是靠这三个数把"粗糙"落到"对局屏 0 张图"上的。
const PANELS = [['shop','商市'], ['bag','行囊'], ['gallery','图鉴'], ['album','卡册'], ['ach','成就'], ['settings','设置']];

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => { localStorage.setItem('dicun_mode_v1', 'light'); localStorage.removeItem('dicun_save_v4'); });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2400);

for (const [key, label] of PANELS) {
  const opened = await page.evaluate((t) => {
    const b = [...document.querySelectorAll('.nav-btns button, .title-nav button')].find((x) => x.innerText.replace(/\s/g, '') === t.replace(/\s/g, ''));
    if (!b) return false;
    b.click(); return true;
  }, label);
  await page.waitForTimeout(1400);
  res[key] = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
    const q = (s) => [...document.querySelectorAll(s)].filter(vis);
    const panel = q('.bag-panel, .gallery-panel, .album-panel, .ach-panel, .settings-panel, .emporia-panel')[0]
      || q('#root > div > div')[0] || document.body;
    let bottom = 0;
    for (const e of document.querySelectorAll('body *')) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > bottom && r.bottom < innerHeight * 8) bottom = r.bottom;
    }
    return {
      root: (document.querySelector('.title-root, .bag-panel, .gallery-panel') || {}).className || null,
      imgs: q('img').length,
      cards: q('.tcard').length,
      textLen: (document.body.innerText || '').length,
      clickables: q('button, .tcard, .choice').length,
      lastContentBottom: Math.round(bottom),
      blankBottom: Math.round(innerHeight - bottom),
      // 内容比一屏高出多少：负数说明要滚，横屏/短窗下这是第一现场
      overflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
  res[key].opened = opened;
  save();
  try { await page.screenshot({ path: `${OUT}/p_${key}.png` }); }
  catch {
    try { await page.screenshot({ path: `${OUT}/p_${key}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); } catch { /* ignore */ }
  }
  save();
  // 关面板回卷宗架
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /合上|返回|关闭|回到卷宗架/.test(x.innerText));
    if (b) b.click();
  });
  await page.waitForTimeout(700);
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
