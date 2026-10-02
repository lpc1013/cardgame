const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/contrast_matrix.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
// 844x390 是本项目的手机默认姿态。contrast-audit 跳过零尺寸节点，
// 而 .fab-row 在宽屏上是 display:none——所以对比度审计从来没量过这个菜单。
await page.setViewportSize({ width: 844, height: 390 });

const PANELS = ['行囊', '图鉴', '卡册', '成就', '商市', '设置', '规则书'];
const res = { runs: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

async function inject() {
  await page.evaluate(() => new Promise((done) => {
    if (window.__audit) return done('cached');
    const s = document.createElement('script');
    s.src = '/scripts/contrast-audit.js';
    s.onload = () => done('loaded');
    s.onerror = () => done('load-failed');
    document.head.appendChild(s);
  }));
  return page.evaluate(() => typeof window.__audit === 'function');
}

async function setup(theme, mode) {
  await page.evaluate(([t, m]) => {
    localStorage.setItem('dicun_mode_v1', m);
    localStorage.setItem('dicun_empire_v1', JSON.stringify({
      ink: 999, grantedEnds: 0, warehouse: [], themes: t ? [t] : [], theme: t, boosts: {},
      brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {},
      endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
    }));
    localStorage.setItem('dicun_cards_v1', '[]');
    localStorage.removeItem('dicun_save_v4');
  }, [theme, mode]);
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1800);
  const ok = await inject();
  await page.waitForTimeout(400);
  return ok;
}

const audit = (label, theme, mode) => page.evaluate(([l, t, m]) => {
  const a = window.__audit();
  return {
    screen: l, theme: t || '(默认)', mode: m,
    checked: a.checked, fails: a.fails,
    worst: a.list.slice(0, 6).map((x) => `${x[0]} ${x[1]}(需${x[2]}) x${x[5]} fg=${x[3]} bg=${x[4]} "${x[6]}"`),
  };
}, [label, theme, mode]);

for (const theme of ['', 'bianjun', 'jiangnan']) {
  for (const mode of ['light', 'dark']) {
    const ok = await setup(theme, mode);
    if (ok !== true) { res.runs.push({ theme, mode, error: 'audit script not available: ' + ok }); save(); continue; }
    // 悬浮胶囊菜单：横屏下唯一的入口
    await page.evaluate(() => { const c = document.querySelector('.fab-capsule'); if (c) c.click(); });
    await page.waitForTimeout(500);
    res.runs.push(await audit('FAB菜单', theme, mode));
    await page.evaluate(() => { const b = document.querySelector('.fab-backdrop'); if (b) b.click(); });
    await page.waitForTimeout(300);
    for (const p of PANELS) {
      const opened = await page.evaluate((t) => {
        const b = [...document.querySelectorAll('.title-nav button')].find((x) => x.innerText.trim() === t);
        if (b) { b.click(); return true; }
        return false;
      }, p);
      await page.waitForTimeout(700);
      if (opened) res.runs.push(await audit(p, theme, mode));
      await page.evaluate(() => { const ov = document.querySelector('.clue-overlay'); if (ov) ov.click(); });
      await page.waitForTimeout(260);
    }
    save();
  }
}

// 封面 .sub 是 contrast-audit.js 里写明的已知假阳性（探针看不见 <img> 本身，
// 而那行字实际画在封面立绘上并带 text-shadow）。不列白就会每次 32 个 run 全红，
// 红到没人看——白名单要显式写，命中数一并印出来，别让它悄悄涨。
const KNOWN_FALSE = ['.sub'];
const real = [];
for (const r of res.runs) {
  for (const w of (r.worst || [])) {
    const cls = w.split(' ')[0];
    if (!KNOWN_FALSE.includes(cls)) real.push(`${r.theme}/${r.mode}/${r.screen} ${w}`);
  }
}
res.verdict = {
  runs: res.runs.length,
  runsAnyHit: res.runs.filter((x) => x.fails).length,
  knownFalsePositiveHits: res.runs.reduce((n, r) => n + (r.worst || []).filter((w) => KNOWN_FALSE.includes(w.split(' ')[0])).length, 0),
  realFails: real.length,
  list: real.slice(0, 12),
};
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
