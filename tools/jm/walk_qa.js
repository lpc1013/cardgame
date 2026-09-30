const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/walk_audit.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 剧情内部的界面（市集/翻牌/结案/出征准备/小游戏/结局/对局展开态）此前只在 duel_qa
// 里量过对局一页。这里改成"一路走下去，每见一个新界面就量一次"，
// 键取 #root 顶层类 + 浮层类 + 几个专属标记，遇到没见过的组合就落一条审计。
const SAVE = (sc, scene) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: scene, viewpoint: null, flags: [], stats: {},
    clues: [], bag: [], deck: [], silver: 60, lineIndex: 0, visited: [scene],
    boosts: [], retinue: [], usedCards: [],
  },
});

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const surface = () => page.evaluate(() => {
  const top = document.querySelector('#root > div');
  const ov = document.querySelector('.clue-overlay > *');
  const flag = ['.duel-root', '.pick-root', '.shop-root', '.story-panel.ending', '.prep-panel',
    '.minigame-root', '.mg-root', '.gallery-sc-btn', '.tree-root'].find((s) => document.querySelector(s));
  // 幕名不能只靠 .scene-title：对白档把它换成了 .dlg-scene，取不到就一直得到同一个键，
  // 于是"走了十二幕"在探针眼里是"在同一屏转了十二步"，被卡住保护掐掉。改读存档坐标。
  const st = (() => { try { return JSON.parse(localStorage.getItem('dicun_save_v4') || '{}').state || {}; } catch (e) { return {}; } })();
  const scene = (document.querySelector('.scene-title') || document.querySelector('.dlg-scene') || {}).innerText || '';
  const base = [top ? String(top.className).split(' ')[0] : 'none',
    ov ? String(ov.className).split(' ').slice(0, 2).join('.') : '',
    flag || '', scene.trim()].join('|');
  return {
    // key 只按结构去重（同一界面走十幕只量一次）；sig 再叠存档坐标，
    // 否则"换了幕"在探针眼里是"同一屏原地打转"，会被卡住保护误掐
    key: base,
    sig: `${base}|${st.sceneId || '?'}#${st.lineIndex ?? '?'}`,
    nodes: document.querySelectorAll('#root *').length,
  };
});

const measure = () => page.evaluate(() => {
  if (!window.__audit) return { checked: 0, fails: -1, list: [] };
  const a = window.__audit();
  return {
    checked: a.checked, fails: a.fails,
    list: a.list.filter((y) => y[0] !== '.sub' && y[0] !== '.cover-ends').slice(0, 12)
      .map((y) => y[0] + ':' + y[1] + '@' + y[4]),
  };
});

const step = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  // 顺序即优先级：先走剧情分支，再走"离开当前界面"的出口，最后才点正文推进。
  // 早先这里放了 .shop-card，结果一进市集就反复点同一张卡出不来，整趟遍历停在第二个界面。
  const sels = ['.choices .choice', '.pick-row button', '.clue-overlay .btn-main',
    '.shop-root .btn-main', '.minigame-root button', '.duel-root button',
    '.story-panel .btn-main', '.story-panel'];
  const hit = sels.map((s) => [s, [...document.querySelectorAll(s)].filter(vis)])
    .find(([, a]) => a.length);
  if (hit) {
    // 同一界面里换着元素点：只点第一个会在"选卡/翻牌"这种一排按钮上原地打转
    const [sel, pool] = hit;
    const i = (window.__stepN = ((window.__stepN || 0) + 1) % pool.length);
    pool[i].click();
    return sel;
  }
  return null;
});

// tag / 主题 / 明暗 / 剧本 / 存档落点。后三个种子直接落在"进幕即进那个相位"的幕上：
// wenchat 是 minigame、search_pick 是 cardPick——这两块界面此前从没进过探针，
// 靠从头走图走不到（90 步全花在剧情里）。
for (const [tag, theme, mode, sc, scene] of [
  ['mg', '', 'light', 'fuma', 'wenchat'],
  ['pick', '', 'light', 'fuma', 'search_pick'],
  ['mgB', 'bianjun', 'dark', 'fuma', 'wenchat'],
  ['pickB', 'bianjun', 'dark', 'fuma', 'search_pick'],
]) {
  await page.goto('about:blank');
  await page.waitForTimeout(250);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((m) => localStorage.setItem('dicun_mode_v1', m), mode);
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), SAVE(sc, scene));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2400);
  await page.evaluate(([t, m]) => {
    if (t) document.documentElement.dataset.theme = t;
    document.documentElement.dataset.mode = m;
  }, [theme, mode]);
  await page.addScriptTag({ url: BASE + 'scripts/contrast-audit.js' }).catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const b = document.querySelector('.resume-box .btn-main') || document.querySelector('.fab-resume');
    if (b) b.click();
  });
  await page.waitForTimeout(2600);
  // 种子幕若是"进幕即进某相位"（minigame/cardPick），应用只在 startRun 里做这个分派，
  // 读档不会自动进——不手动进就把这两块界面整个测漏。先量落在的相位，再按文案进。
  const landed = await surface();
  if (!res[`${tag}/${landed.key}`]) {
    res[`${tag}/${landed.key}`] = { ...(await measure()), nodes: landed.nodes, steps: 0 };
    save();
  }
  if (landed.key.includes('story-root')) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.story-panel .btn-main, .choices .choice, .story-panel')]
        .find((x) => /小游戏|对局|翻牌|抽卡|三选一/.test(x.innerText || ''));
      if (b) b.click();
    });
    await page.waitForTimeout(1800);
  }

  const seen = [];
  let lastKey = null;
  let repeat = 0;
  let stuckAt = null;
  for (let i = 0; i < 90; i++) {
    const s = await surface();
    const k = `${tag}/${s.key}`;
    if (!res[k]) {
      const m = await measure();
      res[k] = { ...m, nodes: s.nodes, steps: i };
      save();
      seen.push(s.key);
    }
    // 同一个界面连转 14 步出不去 = 卡住了，记下来别再烧剩下的额度
    repeat = s.sig === lastKey ? repeat + 1 : 1;
    lastKey = s.sig;
    if (repeat > 14) { stuckAt = s.key; break; }
    const acted = await step();
    await page.waitForTimeout(acted === '.story-panel' ? 380 : 780);
    if (!acted) break;
  }
  res['__walk_' + tag] = { visited: seen.length, stuckAt, keys: seen };
  save();
}
res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
