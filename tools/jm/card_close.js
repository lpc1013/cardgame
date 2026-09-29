const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const BASE = 'http://localhost:5199/';

// 只用任务已有的那一张页：绝不 newPage
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];

await page.setViewportSize({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto('about:blank');
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2600);
await page.evaluate(() => {
  const ids = ["c_wei_yamen","c_wei_liang","c_li_qian","c_li_mian","c_qing_tong","c_qing_nv","c_li_lun","c_li_falv","i_xin","i_yu","i_dao","i_zhu","i_shu","i_yinpiao","r_li_sanj","r_zhang","r_zhou","r_shen","r_wang","s_yin10","s_yin30","c_yin_shu","c_quan_jiang","c_she_duan","c_wen_xing","f_diantang","f_tangji","f_yeyan","f_gongnei","f_anxiang","f_yandu","i_jinzan","i_guici","r_cuiping","s_huangcai","f_renxin","t_youji","t_jieli","t_huosheng","i_jiedi"];
  localStorage.setItem('dicun_cards_v1', JSON.stringify({ fuma: ids }));
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2400);
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '图鉴').click());
await page.waitForTimeout(900);
await page.evaluate(() => [...document.querySelectorAll('.gallery-sc-btn')].find((x) => x.innerText.trim().startsWith('驸马醉酒杀人案')).click());
await page.waitForTimeout(1400);

// 挑三张不同品级/花色的卡各截一张特写，才看得出边框与层次到底是死是活
const boxes = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.tcard')];
  const want = [];
  const seen = new Set();
  for (const c of cards) {
    // 品级是中文（凡/良/优/珍/绝），[a-z0-9]+ 匹配不到 → 全部塌成 "?" 只剩一张
    const rar = (c.className.match(/rarity-\S+/) || ['?'])[0];
    if (seen.has(rar)) continue;
    seen.add(rar);
    const r = c.getBoundingClientRect();
    want.push({ rar, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cls: c.className });
    if (want.length >= 3) break;
  }
  return want;
});

const shots = [];
for (const b of boxes) {
  const f = `${OUT}/card_${b.rar}.png`;
  await page.screenshot({ path: f, clip: { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: Math.min(b.h + 8, 900 - b.y) } }).catch(() => {});
  shots.push(f);
}

// 小卡收掉描述之后，必须确认放大态仍然给全文（否则信息就真丢了）
await page.evaluate(() => {
  const c = document.querySelector('.tcard.clickable');
  if (c) c.click();
});
await page.waitForTimeout(1200);
const zoom = await page.evaluate(() => {
  const body = document.querySelector('.card-zoom-body');
  if (!body) return null;
  const t = body.querySelector('.tcard-bottom');
  const secs = [...body.querySelectorAll('.card-detail-sec-title')].map((x) => x.innerText.trim());
  return {
    smallCardTextVisible: t ? getComputedStyle(t).display !== 'none' : null,
    detailSections: secs,
    hasName: !!body.querySelector('.card-detail-name'),
    text: (body.querySelector('.card-detail') || {}).innerText ? body.querySelector('.card-detail').innerText.replace(/\s+/g, ' ').slice(0, 90) : null,
  };
});
await page.screenshot({ path: `${OUT}/card_zoom.png` }).catch(() => {});
shots.push(`${OUT}/card_zoom.png`);

fs.writeFileSync(`${OUT}/card_close.json`, JSON.stringify({ boxes, shots, zoom, pageCount: (typeof pages === 'function' ? pages().length : -1) }, null, 1));
