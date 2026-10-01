const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/surfaces.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 找下一刀该往哪儿砍：把还没动过的屏各拍一张，并数"有几张图 / 多少字 / 几个可点"。
// 上一轮 feel_shots 就是靠这三个数把"粗糙"落到"对局屏 0 张图"上的。
const DECK = ["c_wei_yamen", "c_li_qian", "c_qing_tong", "c_qing_nv", "c_li_lun", "c_li_falv",
  "c_quan_jiang", "c_she_duan", "c_wen_xing", "i_dao"];
const CASES = [
  ['sichou_hub', 'sichou', 'hub', ['t1', 't2', 't3', 't5', 't6']],
  ['fuma_market', 'fuma', 'market', ['x1', 'x2']],
  ['fuma_verdict', 'fuma', 'verdict', ['x1', 'x2', 'x3', 'x4']],
  ['xie_verdict', 'xie', 'verdict', ['v1', 'v2', 'v3', 'v4', 'v9']],
  ['qiuwei_hub', 'qiuwei', 'origin', ['q1', 'q2']],
];

const res = {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

for (const [tag, sc, scene, clues] of CASES) {
  const SAVE = JSON.stringify({
    version: 4, scenarioId: sc, savedAt: Date.now(),
    state: {
      scenarioId: sc, sceneId: scene, viewpoint: null, flags: [],
      stats: { chaoting: 62, daoyi: 55, renwang: 48 },
      clues, bag: DECK.slice(0, 6), deck: DECK, silver: 120,
      lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
    },
  });
  await page.goto('about:blank');
  await page.waitForTimeout(200);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), 'light');
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SAVE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
  res[tag] = await page.evaluate((want) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
    const q = (s) => [...document.querySelectorAll(s)].filter(vis);
    const root = document.querySelector('#root > div');
    const rs = root ? root.getBoundingClientRect() : null;
    return {
      want,
      root: root ? root.className : null,
      imgs: q('img').length,
      cards: q('.tcard').length,
      textLen: (document.body.innerText || '').length,
      buttons: q('button, .choice, .tcard').length,
      // 内容实际占了多少高度——"下半屏空着"就是靠这个数现形的
      usedPct: rs ? Math.round(Math.min(rs.height, document.body.scrollHeight) / innerHeight * 100) : null,
      blankBottom: (() => {
        let max = 0;
        for (const e of document.querySelectorAll('#root *')) {
          if (!vis(e)) continue;
          const r = e.getBoundingClientRect();
          if (r.bottom > max && r.top < innerHeight) max = r.bottom;
        }
        return Math.round(innerHeight - max);
      })(),
    };
  }, tag);
  save();
  try { await page.screenshot({ path: `${OUT}/u_${tag}.png` }); res[tag].shot = 'full'; }
  catch {
    try { await page.screenshot({ path: `${OUT}/u_${tag}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); res[tag].shot = 'clip'; }
    catch { res[tag].shot = 'failed'; }
  }
  save();
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
