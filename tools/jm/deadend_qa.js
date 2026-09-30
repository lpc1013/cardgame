const fs = require('fs');
const OUT = 'E:/CardGame/_qa';
const FILE = `${OUT}/deadend_audit.json`;
const BASE = 'http://localhost:5199/';

let page = (typeof pages === 'function' ? pages()[0] : null) || context.pages()[0];
await page.setViewportSize({ width: 1440, height: 900 });

// 用户肉眼抓到的是"走不下去"——结案陈词零证据死锁。这类问题不该靠肉眼撞。
// 这里从每部的开场幕出发，一路按"有选项就选、能推进就推进、进市集就离席、
// 进对局就出牌"走下去，撞到三种结局就记账：
//   dead-end  屏上找不到任何可点的动作（真死锁）
//   loop      同一坐标原地转超过阈值（走不动但也没报错）
//   ending    正常走到结局页（合法终点）
//   budget    步数用完（只算覆盖到哪儿，不算 bug）
const SCEN = ['changhen', 'changjiang', 'diaolan', 'fuma', 'jianfeng', 'jieyu',
  'qinhuai', 'qiuwei', 'shumian', 'sichou', 'touming', 'xie', 'xingxing'];

const seed = (sc) => JSON.stringify({
  version: 4, scenarioId: sc, savedAt: Date.now(),
  state: {
    scenarioId: sc, sceneId: 'start', viewpoint: null, flags: [], stats: {},
    clues: [], bag: [], deck: [], silver: 60, lineIndex: 0, visited: ['start'],
    boosts: [], retinue: [], usedCards: [],
  },
});

const res = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(FILE, JSON.stringify(res, null, 1));

// 每轮只跑没跑过的剧本，且最多 4 部——一次 CLI 调用压进 180s 硬时限。
// 沙箱里不一定有 process，取不到就按 4 算
const todo = SCEN.filter((s) => !res[s]);
const N = (typeof process !== 'undefined' && process.env && Number(process.env.DEAD_BATCH)) || 4;
const batch = todo.slice(0, N);

// 页内步进策略：顺序即优先级。返回 null 表示"这一屏没有任何可点的东西"
// preferEnd=true 时对局直接按「换气/结束回合」——连续出牌打不动时，这是唯一保证推进的一下
const ACT = (preferEnd) => {
  // disabled 必须一起排掉：把它们当"可点动作"，点了其实什么都没发生，
  // 于是遍历器以为自己还在动，最后被判成 loop——报出来的是假 bug
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3 && !e.disabled; };
  const pick = (s) => { const a = [...document.querySelectorAll(s)].filter(vis); return a.length ? a : null; };
  if (document.querySelector('.story-panel.ending')) return { done: 'ending' };
  let a = pick('.choices .choice'); if (a) { a[0].click(); return { act: 'choice' }; }
  // 翻牌三选一渲染的是 TCard（div.tcard），不是 button——只写 button 会误报 dead-end
  a = pick('.pick-root .tcard, .pick-root button'); if (a) { a[0].click(); return { act: 'pick' }; }
  // 市集离席：必须限定在 .shop-actions 里。MiniGameView 复用同一个 .shop-root 外壳，
  // 早先写 .shop-root .btn-main 会把牌九自己的"开牌/下一局"当成离席反复点，
  // 于是 silk 案在 sc_paijiu 上原地打转——报出来的是假 loop。
  a = pick('.shop-root .shop-actions .btn-main'); if (a) { a[0].click(); return { act: 'shop-leave' }; }
  // 小游戏（推牌九/残局/行令/对联/骰子）：下注/落子是 .choice，终局领彩是 .btn-main。
  // 先点 .choice 再点 .btn-main——真市集里没有 .choice，所以这个顺序不会挡住离席之后的结算按钮
  a = pick('.shop-root .choice'); if (a) {
    const i = (window.__miniN = ((window.__miniN || 0) + 1) % a.length);
    a[i].click(); return { act: 'mini' };
  }
  a = pick('.shop-root .btn-main'); if (a) { a[0].click(); return { act: 'mini-end' }; }
  // 对局：手牌两段式——先立起来，再点同一张才真打出；打不出就换气/结束回合
  if (document.querySelector('.duel-root')) {
    // 局终有 1.6s 战果定格（gotoFrom(holdView) → setTimeout 才切相位），这期间屏上确实没有按钮。
    // 把它当 dead-end 报是探针抢跑，不是游戏锁死——交回等待，让那个定时器走完。
    if (document.querySelector('.duel-log.win, .duel-log.lose')) return { act: 'duel-settle', wait: 2000 };
    const raised = document.querySelector('.play-card.hand-top');
    if (raised && !preferEnd) { raised.click(); return { act: 'duel-play' }; }
    if (!preferEnd) {
      const pc = pick('.duel-root .play-card'); if (pc) { pc[0].click(); return { act: 'duel-raise' }; }
    }
    const air = pick('.duel-root .end-turn-btn'); if (air) { air[0].click(); return { act: 'duel-end-turn' }; }
    a = pick('.duel-root .gambit-btn'); if (a) { a[0].click(); return { act: 'duel-btn' }; }
    const over = pick('.duel-root .btn-main'); if (over) { over[0].click(); return { act: 'duel-over' }; }
    const pc2 = pick('.duel-root .play-card'); if (pc2) { pc2[0].click(); return { act: 'duel-raise' }; }
    return { done: 'dead-end', where: 'duel-root 里没有任何可点元素' };
  }
  a = pick('.clue-overlay .btn-main'); if (a) { a[0].click(); return { act: 'overlay-close' }; }
  const p = document.querySelector('.story-panel');
  if (p) { p.click(); return { act: 'advance' }; }
  return { done: 'dead-end', where: '既无 .story-panel 也无任何按钮' };
};

const sig = () => page.evaluate(() => {
  const st = (() => { try { return JSON.parse(localStorage.getItem('dicun_save_v4') || '{}').state || {}; } catch (e) { return {}; } })();
  const root = ['#root > div', '.duel-root', '.shop-root', '.pick-root', '.story-panel.ending']
    .map((s) => document.querySelector(s)).find(Boolean);
  return {
    scene: st.sceneId, line: st.lineIndex,
    phase: root ? String(root.className).split(' ')[0] : 'none',
    head: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
  };
});

for (const sc of batch) {
  await page.goto('about:blank');
  await page.waitForTimeout(250);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((v) => localStorage.setItem('dicun_save_v4', v), seed(sc));
  await page.evaluate(() => localStorage.setItem('dicun_dlg_v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const b = document.querySelector('.resume-box .btn-main') || document.querySelector('.fab-resume');
    if (b) b.click();
  });
  await page.waitForTimeout(1800);

  let last = null;
  let repeat = 0;
  let duelTicks = 0;
  let outcome = 'budget';
  const trail = [];
  for (let i = 0; i < 70; i++) {
    const s = await sig();
    // 签名必须带上画面文本：五局推牌九整局都停在同一个 sceneId#lineIndex 上，
    // 只看坐标会把"正在一局局赢下去"判成 loop（实测 sichou sc_paijiu 假 loop）
    const k = `${s.phase}@${s.scene}#${s.line}|${(s.head || '').slice(0, 48)}`;
    if (s.scene !== (trail[trail.length - 1] || {}).scene) trail.push(s);
    repeat = k === last ? repeat + 1 : 1;
    last = k;
    if (repeat > 26) { outcome = 'loop'; break; }
    // 对局里连转 4 下就强制按一下「换气/结束回合」：两段式出牌可能一直"举起来又放下"，
    // 只有交回合能保证局子往前挪
    if (s.phase === 'duel-root') duelTicks++;
    const preferEnd = s.phase === 'duel-root' && duelTicks % 4 === 0;
    const r = await page.evaluate(ACT, preferEnd);
    if (r.done) { outcome = r.done; break; }
    await page.waitForTimeout(r.wait || (r.act === 'advance' ? 260 : 520));
  }
  const end = await sig();
  res[sc] = { outcome, end, trail: trail.length, scenes: trail.map((t) => t.scene) };
  save();
}

res.pageCount = (typeof pages === 'function' ? pages().length : -1);
res.remaining = SCEN.filter((s) => !res[s]);
save();
