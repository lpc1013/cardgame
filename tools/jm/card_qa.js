const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/card_shots.json`;
const BASE = 'http://localhost:5199/';

// 只用任务已有的那一张页：绝不 newPage
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 对局屏的手牌要靠存档 deck，伪造存档 deck 为空就一张卡面都拍不到（实测 cards=0）。
// 改走卡牌图鉴：把 dicun_cards_v1（scenarioId -> 已见卡 id）灌满，整面卡墙都是真卡面。
const SC = 'fuma';
// 从 app/src/data/fuma.ts 的 cards 数组按括号配对抽出来的真实 id（40 张，含资源卡）。
// 上一版这里是我手编的 30 个 changjiang id，一半不存在；不存在的 id 不报错，
// 只是卡墙显示「？？？」，拍出来的全是封印态，等于没验。
// 而且 changjiang 根本不是 cardSystem 剧本（五部大理寺案才是），列表里压根没有它。
const IDS = ["c_wei_yamen", "c_wei_liang", "c_li_qian", "c_li_mian", "c_qing_tong", "c_qing_nv", "c_li_lun", "c_li_falv", "i_xin", "i_yu", "i_dao", "i_zhu", "i_shu", "i_yinpiao", "r_li_sanj", "r_zhang", "r_zhou", "r_shen", "r_wang", "s_yin10", "s_yin30", "c_yin_shu", "c_quan_jiang", "c_she_duan", "c_wen_xing", "f_diantang", "f_tangji", "f_yeyan", "f_gongnei", "f_anxiang", "f_yandu", "i_jinzan", "i_guici", "r_cuiping", "s_huangcai", "f_renxin", "t_youji", "t_jieli", "t_huosheng", "i_jiedi"];

const SKINS = ['default', 'bianjun', 'jiangnan'];
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
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '图鉴');
      if (!b) return 'no-album';
      b.click();
      // 首轮必挂：冷启动要加载卡图与字体，固定 900ms 等不到 .gallery-sc-btn，
      // 于是 cards=0、审计只测到结局页签——而 "0 命中" 和 "全过" 长得一样。改成轮询。
      let sc = null;
      for (let i = 0; i < 14; i++) {
        await sleep(500);
        sc = [...document.querySelectorAll('.gallery-sc-btn')].find((x) => x.innerText.trim().startsWith('驸马醉酒杀人案'));
        if (sc) break;
      }
      if (!sc) return 'no-sc-btn';
      sc.click();
      for (let i = 0; i < 10; i++) {
        await sleep(400);
        if (document.querySelectorAll('.tcard').length > 0) break;
      }
      return 'ok';
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
    // 上一版重写时丢了 file 字段，导致 tools/copy_artifacts.py 按文件名去 JSON 里找、
    // 结果 wanted 集合为空、一张都收不回来。截图落点是工作区外的 artifacts 目录，
    // 必须把期望文件名留在结果里，收图才有依据。
    res[key] = { opened, ...a, file: `c_${key}.png` };
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
