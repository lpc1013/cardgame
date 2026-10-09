#!/usr/bin/env node
/*
 * 像素复核驱动：直接开一个 headless Chrome，用 CDP 走"导航 → 注入状态 → 真点击 → 截图"。
 *
 * 为什么不用 Tabbit：它的窗口一旦被遮挡就不再合成帧，page.screenshot 连 547x43 的 clip
 * 都会 30s 超时——本轮有六块面因此只拿到计算样式、没拿到像素。
 * 为什么不用 chrome --headless --screenshot 一把梭：那条路只能加载一个 URL，
 * 没法先写 localStorage 再点"继续"/"规则书"；套 iframe 的壳页在虚拟时间下渲染不出来。
 *
 * 零依赖：Node 24 自带全局 WebSocket，不必装 ws。
 *
 * 用法：
 *   node tools/px_shot.mjs --out _qa/x.png --url http://localhost:5199/ \
 *        --w 1440 --h 900 --cfg '{"mode":"light","theme":"jiangnan","clicks":["text:规则书"]}'
 * cfg 字段：mode / theme / empire / save / cards / ach:false / clicks[] / settle / wait
 * clicks 里的 "text:xxx" 按 innerText 前缀找 button/a/.loc-node/.sv-spot，其余当 CSS 选择器。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt;
};
const out = arg('out', '_qa/px.png');
const url = arg('url', 'http://localhost:5199/');
const W = Number(arg('w', 1440));
const H = Number(arg('h', 900));
const cfgRaw = arg('cfg', '{}');
const chromePath = arg('chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
const settle = Number(arg('settle', 900));

let cfg;
try { cfg = JSON.parse(cfgRaw); } catch (e) { console.error('cfg 不是合法 JSON:', e.message); process.exit(2); }

const port = Number(arg('port', 9333));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pxshot-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${W},${H}`, `--remote-debugging-port=${port}`,
  `--user-data-dir=${userData}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeErr = '';
chrome.stderr.on('data', (b) => { chromeErr += b.toString(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const kill = () => { try { chrome.kill('SIGKILL'); } catch { /* 已退出 */ } };
process.on('exit', kill);

// 等调试端点起来，拿到 page 的 webSocketDebuggerUrl
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(300);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const tabs = await res.json();
    const page = tabs.find((t) => t.type === 'page' && /localhost/.test(t.url)) || tabs.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* 还没起 */ }
}
if (!wsUrl) { console.error('拿不到 CDP 端点。chrome stderr:\n' + chromeErr.slice(-800)); process.exit(3); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 连接失败')); });

let msgId = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
  else if (m.method) events.push(m);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const waitEvent = async (name, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (events.some((e) => e.method === name)) return true;
    await sleep(80);
  }
  return false;
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await waitEvent('Page.loadEventFired', 25000);
await sleep(1200);

// 注入：同源，直接写 localStorage 再 reload，比在应用里模拟更贴近"用户带着这个档进来"
const seedExpr = `(() => {
  ${cfg.mode ? `localStorage.setItem('dicun_mode_v1', ${JSON.stringify(cfg.mode)});` : ''}
  ${cfg.theme !== undefined ? `localStorage.setItem('dicun_empire_v1', JSON.stringify(Object.assign({
    ink: 999, grantedEnds: 0, warehouse: [], themes: ${JSON.stringify(cfg.theme ? [cfg.theme] : [])}, theme: ${JSON.stringify(cfg.theme || '')},
    boosts: {}, brokenSeals: [], retinue: [], warLoses: [], peaceDeal: false, achCounters: {},
    endMile: 0, luggageSlots: 0, spareSilver: 0, titles: [] }, ${JSON.stringify(cfg.empire || {})})));` : ''}
  ${cfg.save !== undefined ? `localStorage.setItem('dicun_save_v4', JSON.stringify(${JSON.stringify(cfg.save)}));` : ''}
  ${cfg.cards !== undefined ? `localStorage.setItem('dicun_cards_v1', JSON.stringify(${JSON.stringify(cfg.cards)}));` : ''}
  ${cfg.ach === false ? `localStorage.setItem('dicun_achievements_v1', '[]');` : ''}
  return 'seeded';
})()`;
await send('Runtime.evaluate', { expression: seedExpr, returnByValue: true });
await send('Page.navigate', { url });
await waitEvent('Page.loadEventFired', 25000);
await sleep(1800);

const clickExpr = `(() => {
  const find = (spec) => {
    if (spec.indexOf('text:') === 0) {
      const t = spec.slice(5);
      return [...document.querySelectorAll('button, a, .loc-node, .sv-spot')]
        .find((e) => (e.innerText || '').trim().startsWith(t));
    }
    return document.querySelector(spec);
  };
  const out = [];
  for (const spec of ${JSON.stringify(cfg.clicks || [])}) {
    const el = find(spec);
    out.push(spec + '=' + (el ? 'clicked' : 'MISS'));
    if (el) el.click();
  }
  return out.join(' | ');
})()`;
const clicked = await send('Runtime.evaluate', { expression: clickExpr, returnByValue: true });
if (clicked.result && /MISS/.test(clicked.result.value || '')) console.log('  点击未命中: ' + clicked.result.value);
await sleep(settle);

const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
// --eval 让同一个驱动兼作"看图 → 立刻问 DOM 那是什么"：
// 截图能指出有一个空框，但说不出它是谁；elementFromPoint 反过来看不见视觉。
const evalExpr = arg('eval', '');
let evalOut = '';
if (evalExpr) {
  const r = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true, awaitPromise: true });
  evalOut = typeof r.result?.value === 'string' ? r.result.value : JSON.stringify(r.result?.value ?? r.exceptionDetails ?? null);
}
const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({w:innerWidth,h:innerHeight,root:(document.querySelector('#root > div > *')||{}).className||'',title:document.title})`,
  returnByValue: true,
});
console.log(`${out}  ${fs.statSync(out).size} bytes  ${probe.result.value}`);
if (evalExpr) console.log(`  eval: ${evalOut}`);
ws.close();
kill();
process.exit(0);
