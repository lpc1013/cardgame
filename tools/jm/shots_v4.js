const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/shots_v4.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 大 clip 连吃两次 30s 超时，小 clip（264x101 / 1140x420）此前能成。
// 这趟只截"题签那一条"，高度压到 120 以内——要看的本来就是题签上的印与界栏。
const empire = (t) => JSON.stringify({
  ink: 999, grantedEnds: 0, warehouse: [], themes: t ? [t] : [], theme: t, boosts: {},
  brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {},
  endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
});
const res = { shots: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const head = (sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const b = e.getBoundingClientRect();
  return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
}, sel);

const grab = async (name, sel) => {
  const r = await head(sel);
  if (!r) { res.shots.push({ name, ok: false, err: 'no element' }); return; }
  const clip = { x: r.x, y: Math.max(0, r.y - 4), width: Math.min(r.w, 620), height: Math.min(r.h + 16, 120) };
  try { await page.screenshot({ path: `${OUT}/v4_${name}.png`, clip }); res.shots.push({ name, ok: true, clip }); }
  catch (e) { res.shots.push({ name, ok: false, err: String(e).slice(0, 50), clip }); }
  save();
};

for (const theme of ['', 'bianjun', 'jiangnan']) {
  await page.goto('about:blank');
  await page.waitForTimeout(150);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((e) => {
    localStorage.setItem('dicun_mode_v1', 'light');
    localStorage.setItem('dicun_empire_v1', e);
    localStorage.removeItem('dicun_save_v4');
  }, empire(theme));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2100);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.title-nav button')].find((x) => /规则书/.test(x.innerText.trim()));
    if (b) b.click();
  });
  await page.waitForTimeout(800);
  await grab('guide_' + (theme || 'default'), '.guide-panel h3');
  await page.evaluate(() => { const ov = document.querySelector('.clue-overlay'); if (ov) ov.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.title-nav button')].find((x) => /成就/.test(x.innerText.trim()));
    if (b) b.click();
  });
  await page.waitForTimeout(1000);
  await grab('panel_' + (theme || 'default'), '.bag-panel h3');
  await page.evaluate(() => { const ov = document.querySelector('.clue-overlay'); if (ov) ov.click(); });
  await page.waitForTimeout(300);
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
