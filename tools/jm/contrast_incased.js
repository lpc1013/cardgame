const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/contrast_incased.json`;
const URL = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
// 上一张矩阵只量了标题页与七块面板；玩家真正长时间停留的案情屏
// （正文/勘查/牌桌/市集/五艺/结案/结局）一次都没在换皮后量过对比度。
// 844x390 是本项目的手机默认姿态，一并量。
await page.setViewportSize({ width: 844, height: 390 });

const DECK = ["c_qing_tong", "c_li_lun", "c_quan_jiang", "c_wei_yamen", "c_wen_xing",
  "c_yin_shu", "f_gongnei", "f_anxiang", "t_jieli", "i_dao"];
const duelData = {
  mode: "emotion", rules: "v2", turnSchema: "legacy", round: 6, phase: "pMain", turnNo: 1,
  hpPlayer: 10, hpOpponent: 10, qi: 8, qiMax: 12, hpMax: 12,
  rapport: 2, guard: 3, yanli: 5, yanliMax: 7,
  library: DECK.slice(6), discard: DECK.slice(0, 4),
  hand: ["c_qing_tong", "c_wei_yamen", "c_yin_shu", "i_dao"],
  opponentShown: "策", opponentTrue: "策", bluffed: false,
  charge: 0, foresuit: null, trap: null, seeNext: "none", passives: [],
  scoutLeft: 0, insiderLeft: 0, insiderActive: false, sharedTotal: 0, sharedUsed: 0,
  retinueNames: [], usedCards: [], log: [], lastResult: "他亮出「策」，等你接话。", lastPlay: null,
  finished: null, playerLeadSuits: [], baseAp: 3, ap: 3, topicHits: 0,
};
const mk = (sc, scene, extra) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: (extra && extra.flags) || [],
    stats: (extra && extra.stats) || { chaoting: 62, daoyi: 55, renwang: 48 },
    clues: (extra && extra.clues) || ['x1', 'x2', 'x3'], bag: [], deck: DECK, silver: 400,
    lineIndex: 99, visited: [scene], boosts: [], retinue: [], usedCards: [],
  },
  duel: (extra && extra.duel) || undefined,
});

// 每个案情屏：怎么进（存档 + 进档后要再点的按钮）
const SCREENS = [
  { key: '正文', sc: 'fuma', scene: 'search' },
  { key: '勘查层', sc: 'fuma', scene: 'search', then: '.sv-btn' },
  { key: '牌桌', sc: 'fuma', scene: 'a_duel_scene', duel: true },
  { key: '市集', sc: 'fuma', scene: 'market' },
  { key: '五艺牌九', sc: 'sichou', scene: 'sc_paijiu', stats: {} },
  { key: '结案', sc: 'fuma', scene: 'verdict' },
  { key: '结局', sc: 'fuma', scene: 'end_a_win' },
];
const KNOWN_FALSE = ['.sub'];   // contrast-audit.js 里写明的封面假阳性

// 42 个组合一次跑不完 CLI 的 180s 硬时限，用参数文件分批：
// 先浅档三套皮（纸面令牌压深底最容易出事的那一档），再补深档。
let P = { themes: ['', 'bianjun', 'jiangnan'], modes: ['light', 'dark'] };
try { P = JSON.parse(fs.readFileSync('E:/CardGame/_qa/ci_params.json', 'utf8')); } catch { /* 没有参数文件就跑全量 */ }
const res = { runs: [], params: P };
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

async function inject() {
  await page.evaluate(() => new Promise((done) => {
    if (window.__audit) return done(true);
    const s = document.createElement('script');
    s.src = '/scripts/contrast-audit.js';
    s.onload = () => done(true);
    s.onerror = () => done(false);
    document.head.appendChild(s);
  }));
  return page.evaluate(() => typeof window.__audit === 'function');
}

for (const theme of P.themes) {
  for (const mode of P.modes) {
    for (const s of SCREENS) {
      const save_ = mk(s.sc, s.scene, {
        stats: s.stats, duel: s.duel ? { cfgId: 'd_wang', data: duelData, wager: 0 } : undefined,
      });
      await page.goto('about:blank');
      await page.waitForTimeout(120);
      await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(([v, t, m]) => {
        localStorage.setItem('dicun_mode_v1', m);
        localStorage.setItem('dicun_empire_v1', JSON.stringify({
          ink: 999, grantedEnds: 0, warehouse: [], themes: t ? [t] : [], theme: t, boosts: {},
          brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {},
          endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [],
        }));
        localStorage.setItem('dicun_save_v4', v);
      }, [save_, theme, mode]);
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const okInj = await inject();
      await page.evaluate(() => { const b = document.querySelector('.resume-box .btn-main'); if (b) b.click(); });
      await page.waitForTimeout(2200);
      if (s.then) {
        await page.evaluate((sel) => { const b = document.querySelector(sel); if (b) b.click(); }, s.then);
        await page.waitForTimeout(900);
      }
      const r = await page.evaluate(([key, t, m, inj, knownFalse]) => {
        if (typeof window.__audit !== 'function') return { screen: key, error: 'no audit (script ' + inj + ')' };
        const a = window.__audit();
        const de = document.documentElement;
        return {
          screen: key, theme: t || '(默认)', mode: m,
          mountedClass: (document.querySelector('#root > div > *') || {}).className || '',
          checked: a.checked, fails: a.fails,
          real: a.list.filter((x) => !knownFalse.includes(x[0]))
            .map((x) => `${x[0]} ${x[1]}(需${x[2]}) x${x[5]} fg=${x[3]} bg=${x[4]} "${x[6]}"`),
        };
      }, [s.key, theme, mode, okInj, KNOWN_FALSE]);
      res.runs.push(r);
      save();
    }
  }
}
const bad = res.runs.filter((r) => (r.real || []).length || r.error);
res.verdict = { runs: res.runs.length, badRuns: bad.length, bad };
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
