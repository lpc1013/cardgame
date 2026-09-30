const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/verdict_qa.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 结案陈词死锁回归：mustPick=4，而"拣满才能呈"在线索不足时永远满足不了。
// 零线索走进这一屏，屏上只剩一个点不动的按钮——用户报的正是这个。
const seed = (clues) => JSON.stringify({
  version: 4, scenarioId: 'fuma', savedAt: Date.now(),
  state: {
    scenarioId: 'fuma', sceneId: 'verdict', viewpoint: null, flags: [], stats: {},
    clues, bag: [], deck: [], silver: 60, lineIndex: 0, visited: ['verdict'],
    boosts: [], retinue: [], usedCards: [],
  },
});

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

const enter = async (clues) => {
  await page.goto('about:blank');
  await page.waitForTimeout(250);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), seed(clues));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const b = document.querySelector('.resume-box .btn-main') || document.querySelector('.fab-resume');
    if (b) b.click();
  });
  await page.waitForTimeout(1600);
};

const read = () => page.evaluate(() => {
  const btn = [...document.querySelectorAll('.story-panel .btn-main')].pop();
  const st = JSON.parse(localStorage.getItem('dicun_save_v4') || '{}').state || {};
  return {
    at: st.sceneId,
    verdictOnScreen: !!document.querySelector('.clue-grid'),
    cards: document.querySelectorAll('.clue-card').length,
    btnText: btn ? btn.innerText.trim() : null,
    btnDisabled: btn ? btn.disabled : null,
    backLink: [...document.querySelectorAll('.story-panel .fix-prev-ghost')].map((x) => x.innerText.trim()),
    shortLine: !!document.querySelector('.verdict-short'),
    title: (document.querySelector('.story-panel h2') || {}).innerText || '',
  };
});

const pickAll = () => page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cards = [...document.querySelectorAll('.clue-card')];
  for (const c of cards) { c.click(); await sleep(140); }
  return cards.length;
});

const submit = () => page.evaluate(() => {
  const btn = [...document.querySelectorAll('.story-panel .btn-main')].pop();
  if (btn && !btn.disabled) { btn.click(); return true; }
  return false;
});

const cases = [
  ['zero', [], 'loseScene'],
  ['short', ['x1', 'x2'], 'loseScene'],
  ['full', ['x1', 'x2', 'x4', 'x9'], 'winScene'],
];

for (const [name, clues, expect] of cases) {
  await enter(clues);
  const before = await read();
  const n = await pickAll();
  await page.waitForTimeout(500);
  const afterPick = await read();
  const clicked = await submit();
  await page.waitForTimeout(2600);
  const landed = await page.evaluate(() => (JSON.parse(localStorage.getItem('dicun_save_v4') || '{}').state || {}).sceneId);
  res[name] = {
    clues: clues.length, expect, cards: n, clicked, landed,
    escaped: landed !== 'verdict',
    before, afterPick,
  };
  save();
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
save();
