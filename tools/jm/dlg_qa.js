const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/dlg_shots.json`;
const BASE = 'http://localhost:5199/';

// 只用任务已有的那一张页：绝不 newPage
let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// viewpoint 必须填真 id：changjiang 是多视角剧本，startScene 是 "prologue" 不是 "start"，
// 而 vpId 为 null 时名牌取不到（narrName 走 viewpoints.find(v=>v.id===null)），
// 拍出来永远测不到 .dlg-name 那条分支。
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'changjiang', savedAt: Date.now(),
  state: {
    scenarioId: 'changjiang', sceneId: 'prologue', viewpoint: 'vp_emperor', flags: [], stats: {},
    clues: [], bag: [], deck: [], silver: 60, lineIndex: 0, visited: ['prologue'],
    boosts: [], retinue: [], usedCards: [],
  },
});

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

// 先落盘再截图：截图在窗口被遮挡时会 30s 超时，把已经算好的断言一起带走
const shot = async (key, info) => {
  res[key] = { ...info, file: `d_${key}.png` };
  save();
  try { await page.screenshot({ path: `${OUT}/d_${key}.png` }); res[key].shot = 'full'; }
  catch (e1) {
    try { await page.screenshot({ path: `${OUT}/d_${key}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } }); res[key].shot = 'clip'; }
    catch (e2) { res[key].shot = 'failed'; }
  }
  save();
}

const probe = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const sv = JSON.parse(localStorage.getItem('dicun_save_v4') || '{}');
  const stv = sv.state || {};
  const lines = [...document.querySelectorAll('.story-panel .story-line')];
  const panel = q('.story-panel');
  const r = panel ? panel.getBoundingClientRect() : null;
  return {
    // 落一笔存档坐标：光看 lines 数分不清是"没推进"还是"换了幕"
    at: `${stv.sceneId}#${stv.lineIndex}`,
    dlg: !!q('.story-root.dlg'),
    head: !!q('.dlg-head'),
    name: q('.dlg-name') ? q('.dlg-name').innerText : null,
    scene: q('.dlg-scene') ? q('.dlg-scene').innerText : null,
    lines: lines.length,
    shown: lines.filter((x) => getComputedStyle(x).display !== 'none').length,
    text: lines.map((x) => x.innerText.slice(0, 14)).join(' | '),
    panelRect: r ? [Math.round(r.top), Math.round(r.bottom), Math.round(r.width)] : null,
    tip: !!q('.next-tip'),
    log: !!q('.dlg-log'),
    narratorName: !!q('.narrator-name'),
  };
});

const audit = () => page.evaluate(() => {
  const a = window.__audit();
  return { f: a.fails, c: a.checked, l: a.list.filter((x) => x[0] !== '.sub').slice(0, 8).map((x) => x[0] + ':' + x[1] + '@' + x[4]) };
});

const enter = async (mode, theme, vw, vh) => {
  await page.setViewportSize({ width: vw, height: vh });
  await page.goto('about:blank');
  await page.waitForTimeout(300);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), mode);
  await page.evaluate(() => localStorage.setItem('dicun_dlg_v1', '1'));
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SAVE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2400);
  await page.evaluate(([t, m]) => {
    if (t) document.documentElement.dataset.theme = t;
    document.documentElement.dataset.mode = m;
  }, [theme, mode]);
  // 手机横屏下 .resume-box 整块让位给左上角 .fab-resume（max-height:520 那条媒体查询），
  // 直接 click('.resume-box .btn-main') 会等到超时——先挑当前真的可见的那个
  const sel = await page.evaluate(() => {
    const a = document.querySelector('.resume-box .btn-main');
    if (a && a.offsetParent) return '.resume-box .btn-main';
    return document.querySelector('.fab-resume') ? '.fab-resume' : null;
  });
  if (!sel) throw new Error('no-resume-cta');
  await page.click(sel, { timeout: 15000 });
  await page.waitForTimeout(3200);
  await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' }).catch(() => {});
  await page.waitForTimeout(600);
};

// 手机横屏 844×390 是这项目的默认姿态：立绘栏在 ≤900px 本就隐藏，
// 台词栏必须在这 390px 高里放得下，所以同一套断言再跑一遍小屏
for (const [key, mode, theme, vw, vh] of [
  ['light', 'light', '', 1440, 900],
  ['dark', 'dark', 'bianjun', 1440, 900],
  ['mob', 'light', 'jiangnan', 844, 390],
]) {
  await enter(mode, theme, vw, vh);
  await shot('first_' + key, { mode, theme, ...(await probe()), ...(await audit()) });

  // 推进两次：对白档下屏上仍只有"当前这一段"，段数不累积
  for (let i = 0; i < 2; i++) { await page.click('.story-panel'); await page.waitForTimeout(900); }
  await shot('adv_' + key, { mode, theme, ...(await probe()), ...(await audit()) });

  await page.click('.dlg-log-btn');
  await page.waitForTimeout(700);
  await shot('log_' + key, { mode, theme, ...(await probe()), ...(await audit()) });
  await page.click('.dlg-log');
  await page.waitForTimeout(500);
  // 收起之后栏框回到内容高，此时栏底沿才量得准
  await shot('afterlog_' + key, { mode, theme, ...(await probe()), ...(await audit()) });

  // 切回长卷：正文重新累积、题签回到大标题、立绘脚边名牌回来
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.top-bar button')].find((x) => x.innerText.trim() === '长卷');
    if (b) b.click();
  });
  await page.waitForTimeout(900);
  await shot('scroll_' + key, { mode, theme, ...(await probe()), ...(await audit()) });
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
