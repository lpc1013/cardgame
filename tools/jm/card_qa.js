const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/card_shots.json`;
const BASE = 'http://localhost:5199/';

// 只用任务已有的那一张页：绝不 newPage
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 对局屏的手牌要靠存档 deck，伪造存档 deck 为空就一张卡面都拍不到（实测 cards=0）。
// 改走卡牌图鉴：把 dicun_cards_v1（scenarioId -> 已见卡 id）灌满，整面卡墙都是真卡面。
const SC = 'changjiang';
const IDS = ['c_qi_gong', 'c_qi_shou', 'c_qi_jie', 'c_qi_qi', 'c_ben_xi', 'c_ben_duan', 'c_ben_fu', 'c_ben_yi', 'c_ben_zhen', 'c_jiangjiao', 'c_chenchen', 'c_zhoudu', 'c_shuizhen', 'c_chaoji', 'c_yezhang', 'c_fenghuo', 'c_junxin', 'c_dushi', 'c_paoshou', 'c_gongnu', 'c_xiangji', 'c_macheng', 'c_sifang', 'c_yuanjun', 'c_zhongjun', 'c_dianjiang', 'c_jijiang', 'c_caiyuan', 'c_duankai', 'c_jieming'];

const SKINS = ['default', 'zhusha', 'daiqing', 'liujin', 'celadon', 'indigo', 'luxury'];
const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

for (const skin of SKINS) {
  for (const mode of ['light', 'dark']) {
    const key = `${skin}_${mode}`;
    if (res[key] && res[key].shot !== undefined) continue;
    await page.goto('about:blank');
    await page.waitForTimeout(300);
    await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['dicun_mode_v1', mode]);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['dicun_cards_v1', JSON.stringify({ [SC]: IDS })]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2400);
    await page.evaluate(([s, m]) => {
      if (s === 'default') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = s;
      if (m === 'light') delete document.documentElement.dataset.mode;
      else document.documentElement.dataset.mode = m;
    }, [skin, mode]);
    await page.waitForTimeout(900);
    const opened = await page.evaluate(async () => {
      const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '图鉴');
      if (!b) return false;
      b.click();
      await new Promise((r) => setTimeout(r, 900));
      return true;
    });
    await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' });
    await page.waitForTimeout(500);
    const a = await page.evaluate(() => {
      const x = window.__audit();
      return {
        cards: document.querySelectorAll('.tcard').length,
        f: x.fails, c: x.checked,
        l: x.list.filter((y) => y[0] !== '.sub' && y[0] !== '.cover-ends').slice(0, 8)
          .map((y) => y[0] + ':' + y[1] + '@' + y[4] + 'x' + y[5]),
      };
    });
    // opened 是 Node 侧变量，塞进 page.evaluate 会 ReferenceError（浏览器上下文看不到闭包）
    res[key] = { opened, ...a };
    save();
    const p = `${OUT}/c_${key}.png`;
    try {
      await page.screenshot({ path: p });
      res[key].shot = 'full';
    } catch (e1) {
      try {
        await page.screenshot({ path: p, clip: { x: 0, y: 0, width: 1440, height: 900 } });
        res[key].shot = 'clip';
      } catch (e2) {
        res[key].shot = 'failed';
      }
    }
    save();
  }
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
