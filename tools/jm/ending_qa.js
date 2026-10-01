const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/ending_qa.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 战报这块改了两件事：标题里那串「── ──」换成 CSS 发的两道发丝线；
// 数值行从"遍历 st.stats"改成"照剧本声明的那张表念"。
// 后者要能证伪：声明表里有的项，哪怕这一局从没碰过，也该出现在屏上。
const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen"];
const SAVE = JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: 'end_a_win', viewpoint: null, flags: [],
    stats: { chaoting: 71, daoyi: 44, revisit_left: 1 },
    clues: ['x1', 'x2', 'x3'], bag: [], deck: DECK, silver: 128,
    lineIndex: 99, visited: ['search', 'market', 'end_a_win'], boosts: [], retinue: [], usedCards: [],
  },
});
const empire = (theme) => JSON.stringify({
  ink: 999, grantedEnds: 0, warehouse: [], themes: theme ? [theme] : [], theme,
  boosts: {}, brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false,
  achCounters: {}, endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
});

const res = { rows: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

for (const theme of ['', 'bianjun', 'jiangnan']) {
  await page.goto('about:blank');
  await page.waitForTimeout(150);
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(([e, s]) => {
    localStorage.setItem('dicun_mode_v1', 'light');
    localStorage.setItem('dicun_empire_v1', e);
    localStorage.setItem('dicun_save_v4', s);
  }, [empire(theme), SAVE]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
  await page.waitForTimeout(2600);
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const t = document.querySelector('.run-report-title');
    const rows = [...document.querySelectorAll('.stat-report')];
    const chips = [...document.querySelectorAll('.stat-report .stat-chip')];
    const cs = t ? getComputedStyle(t) : null;
    const pre = t ? getComputedStyle(t, '::before') : null;
    const post = t ? getComputedStyle(t, '::after') : null;
    return {
      theme: de.dataset.theme || '(默认)',
      onEnding: !!document.querySelector('.story-panel.ending'),
      title: t ? t.innerText.trim() : null,
      hasAsciiDash: t ? /[─—]{2,}/.test(t.innerText) : null,
      display: cs ? cs.display : null,
      hairBefore: pre ? `${pre.width}x${pre.height}` : null,
      hairAfter: post ? `${post.width}x${post.height}` : null,
      rows: rows.length,
      chips: chips.map((c) => c.innerText.replace(/\s+/g, ' ').trim()),
      chipRadius: chips.length ? getComputedStyle(chips[0]).borderTopLeftRadius : null,
      chipBorder: chips.length ? getComputedStyle(chips[0]).borderLeftWidth + ' ' + getComputedStyle(chips[0]).borderLeftColor : null,
      hOverflow: de.scrollWidth - de.clientWidth,
    };
  });
  res.rows.push(r);
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
