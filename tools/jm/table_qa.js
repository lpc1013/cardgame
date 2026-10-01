const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/table_qa.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 牌桌分区验收：案面 = 他席 / 交锋带 / 我席。
// 情绪制（fuma d_wang）与压制制（fuma b_start → d_shen，phased+v2+博弈）各走一趟：
// 交锋带此前只在压制制有数据，情绪制的 lastPlay 是这一轮才补上的。
const DECK = ["c_wei_yamen", "c_li_qian", "c_qing_tong", "c_qing_nv", "c_li_lun", "c_li_falv",
  "c_quan_jiang", "c_she_duan", "c_wen_xing", "i_dao"];
const mk = (scene) => JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: scene, viewpoint: null, flags: [],
    stats: { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: ['x1', 'x2', 'x4'], bag: [], deck: DECK, silver: 60,
    lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
});

// 两趟分开跑（一个 CLI 时限装不下 6 张截图），所以读回旧结果再往上叠
const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));
const shot = async (key, info) => {
  res[key] = { ...info, file: `k_${key}.png` };
  save();
  try { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150); } catch { /* ignore */ }
  try { await page.screenshot({ path: `${OUT}/k_${key}.png` }); res[key].shot = 'full'; }
  catch {
    try { await page.screenshot({ path: `${OUT}/k_${key}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); res[key].shot = 'clip'; }
    catch { res[key].shot = 'failed'; }
  }
  save();
};

const probe = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const q = (s) => [...document.querySelectorAll(s)].filter(vis);
  const txt = (s) => { const e = q(s)[0]; return e ? e.innerText.replace(/\s+/g, ' ').trim().slice(0, 46) : null; };
  const de = document.documentElement;
  return {
    onDuel: !!q('.duel-root').length,
    table: !!q('.dt-table').length,
    oppImg: !!q('.dt-opp .dt-seat-img').length,
    oppSeal: !!q('.dt-opp .dt-seat-seal').length,
    oppName: txt('.dt-opp .dt-seat-name'),
    oppBars: txt('.dt-opp .dt-bars'),
    meSeat: !!q('.dt-me .dt-seat').length,
    meBars: txt('.dt-me .dt-bars'),
    placard: !!q('.dt-placard').length,
    stacks: q('.dt-stack').length,
    turn: txt('.dt-turn'),
    clash: !!q('.dt-clash:not(.idle)').length,
    clashIdle: !!q('.dt-clash.idle').length,
    clashText: txt('.dt-clash'),
    rules: !!q('.dt-rules summary').length,
    hand: q('.hand .play-card').length,
    // 案面真的占住高度了：旧版这里是一行字，下半屏全空
    tablePct: Math.round((q('.dt-table')[0] || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height / innerHeight * 100),
    overflowX: de.scrollWidth - de.clientWidth,
  };
});

const audit = () => page.evaluate(() => {
  if (!window.__audit) return { f: -1, c: 0, l: ['NO-AUDIT'] };
  const a = window.__audit();
  return { f: a.fails, c: a.checked, l: a.list.filter((y) => y[0] !== '.sub').slice(0, 12).map((y) => y[0] + ':' + y[1] + '@' + y[4]) };
});

// 打一手：两段式——点一下立起来，再点同一张才打出。
// 灰牌（card-disabled）与物品都跳过：物品走 playItem，不写 lastPlay，交锋带本来就不该亮。
const playOne = () => page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const c = [...document.querySelectorAll('.hand .play-card')].find((x) =>
    !x.disabled && !x.className.includes('card-disabled') && x.innerText.includes('点数'));
  if (!c) return 'no-playable';
  c.click(); await sleep(480);
  const again = [...document.querySelectorAll('.hand .play-card')].find((x) => x.className.includes('hand-top'));
  if (!again) return 'not-raised';
  again.click(); await sleep(480);
  return 'clicked:' + c.innerText.replace(/\s+/g, '').slice(0, 8);
});

// 三张皮：默认宣纸（无 data-theme）、浅底边军（把 --lacquer 换浅成 #4a3f2e 的那套，
// 上一轮就是在它上面翻车）、深底边军
for (const [duel, mode] of __DUELS__) {
  for (const [tag, dm, theme] of [
    ['xu_light', 'light', ''],
    ['bj_light', 'light', 'bianjun'],
    ['bj_dark', 'dark', 'bianjun'],
  ]) {
    const key = `${duel}_${tag}`;
    await page.goto('about:blank');
    await page.waitForTimeout(250);
    await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), dm);
    await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), mk(duel === 'wang' ? 'a_duel_scene' : 'b_start'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.evaluate(([t, m]) => {
      if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
      document.documentElement.dataset.mode = m;
    }, [theme, dm]);
    await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
    await page.waitForTimeout(2600);
    await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' }).catch(() => {});
    await page.waitForTimeout(600);
    const skin = await page.evaluate(() => document.documentElement.dataset.theme || 'default');
    res[key] = { mode, skin, duelKind: mode, ...(await probe()), ...(await audit()) };
    res[key].play = await playOne();
    await page.waitForTimeout(2200);
    const after = await probe();
    const afterAudit = await audit();
    await shot(key, { ...res[key], after, ...afterAudit });
  }
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
