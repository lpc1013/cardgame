const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/fab_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 844, height: 390 });

// .fab-panel 写死 rgba(23,21,18,.88) 的深底，却吃 --gold/--line/--ink 这些"为宣纸调过"的令牌。
// 先把它量实：底色合成、标题与按钮字色、以及这些字在合成底上的对比度。
const res = { rows: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const read = () => page.evaluate(() => {
  const de = document.documentElement;
  const panel = document.querySelector('.fab-panel');
  if (!panel) return { open: false };
  const cs = getComputedStyle(panel);
  const head = panel.querySelector('.fab-panel-head');
  const btns = [...panel.querySelectorAll('.fab-grid button')];
  const rect = panel.getBoundingClientRect();
  return {
    open: true,
    theme: de.dataset.theme || '(默认)', mode: de.dataset.mode || '(默认)',
    panelBg: cs.backgroundColor,
    behind: getComputedStyle(de).backgroundColor,
    headColor: head ? getComputedStyle(head).color : null,
    headText: head ? head.innerText : null,
    btnColor: btns.length ? getComputedStyle(btns[0]).color : null,
    btnBorder: btns.length ? getComputedStyle(btns[0]).borderTopColor : null,
    btnRadius: btns.length ? getComputedStyle(btns[0]).borderTopLeftRadius : null,
    btnMinH: btns.map((b) => Math.round(b.getBoundingClientRect().height)),
    n: btns.length,
    box: `${Math.round(rect.left)},${Math.round(rect.top)} → ${Math.round(rect.right)},${Math.round(rect.bottom)}`,
    offscreen: rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1 || rect.left < -1 || rect.top < -1,
    tokens: {
      gold: getComputedStyle(de).getPropertyValue('--gold').trim(),
      ink: getComputedStyle(de).getPropertyValue('--ink').trim(),
      line: getComputedStyle(de).getPropertyValue('--line').trim(),
    },
  };
});

await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => localStorage.setItem('dicun_mode_v1', 'light'));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2200);

for (const t of ['', 'bianjun', 'jiangnan']) {
  await page.evaluate((th) => {
    const e = JSON.parse(localStorage.getItem('dicun_empire_v1') || '{}');
    Object.assign(e, {
      ink: 999, grantedEnds: 0, warehouse: [], themes: th ? [th] : [], theme: th, boosts: {},
      brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {},
      endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
    });
    localStorage.setItem('dicun_empire_v1', JSON.stringify(e));
  }, t);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const c = document.querySelector('.fab-capsule'); if (c) c.click(); });
  await page.waitForTimeout(700);
  const r = await read();
  res.rows.push(r);
  // 浅深两档各测一次（浅档是默认，也是出问题的那一档）
  if (t === '') {
    await page.evaluate(() => {
      localStorage.setItem('dicun_mode_v1', 'dark');
      const c = document.querySelector('.fab-capsule'); if (c) c.click();
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { const c = document.querySelector('.fab-capsule'); if (c) c.click(); });
    await page.waitForTimeout(700);
    res.rows.push(await read());
    await page.evaluate(() => localStorage.setItem('dicun_mode_v1', 'light'));
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
