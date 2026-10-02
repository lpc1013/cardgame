const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/dom_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 只量与"页面是否隐藏"无关的东西：DOM 节点数、卡片组件数、真在视口里的图。
// 帧时长这一版不再采——上一趟 p50 报 449ms，那是 rAF 在隐藏页里被节流到几乎不跑，
// 量到的是"多久没被叫"而不是"卡不卡"，拿它当结论会把人带偏。
const res = { screens: {} };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const probe = (label) => page.evaluate((name) => {
  const de = document.documentElement;
  const panel = document.querySelector('.bag-panel');
  const imgs = [...document.querySelectorAll('img')];
  let inView = 0;
  for (const im of imgs) {
    const b = im.getBoundingClientRect();
    if (b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth) inView++;
  }
  return {
    screen: name,
    nodes: document.querySelectorAll('*').length,
    panelNodes: panel ? panel.querySelectorAll('*').length : null,
    tcards: document.querySelectorAll('.tcard').length,
    imgs: imgs.length, imgsInView: inView,
    scrollH: panel ? `${panel.scrollHeight}/${panel.clientHeight}` : null,
    hOverflow: de.scrollWidth - de.clientWidth,
  };
}, label);

await page.goto('about:blank');
await page.waitForTimeout(200);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => {
  localStorage.setItem('dicun_mode_v1', 'light');
  localStorage.removeItem('dicun_save_v4');
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2400);
res.screens.title = await probe('title');

for (const label of ['行囊', '图鉴', '卡册', '成就', '商市', '设置']) {
  const opened = await page.evaluate((t) => {
    const b = [...document.querySelectorAll('.title-nav button')].find((x) => x.innerText.trim() === t);
    if (b) { b.click(); return true; }
    return false;
  }, label);
  await page.waitForTimeout(1500);
  const p = await probe(label);
  p.nav = opened;
  res.screens[label] = p;
  await page.evaluate(() => {
    const ov = document.querySelector('.clue-overlay');
    if (ov) ov.click();
  });
  await page.waitForTimeout(600);
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
