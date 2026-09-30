const fs = require('fs');
// 即梦的对话线程 UI 每次 submit 会自己弹一张页；p.close() 在只绑单页的运行里够不到它们。
// 这次用 --group 绑整组——组里只有我自己的 4 张（localhost + 3 张弹出来的即梦线程页），
// 用户自己那张即梦页不在组内，天然不会被碰。逐张 close 后**重新数一遍**，
// 只信 close 的返回会假绿（上一轮就是这么骗过我的）。
const all = (typeof pages === 'function' ? pages() : context.pages());
const log = [];
for (const p of all) {
  const u = p.url() || '';
  if (!u.includes('jimeng.jianying.com')) { log.push('keep ' + u.slice(0, 66)); continue; }
  try { await p.close(); log.push('closed ' + u.slice(0, 66)); }
  catch (e) { log.push('err ' + String(e).slice(0, 66)); }
}
const rest = (typeof pages === 'function' ? pages() : context.pages()).map((p) => (p.url() || '').slice(0, 66));
fs.writeFileSync('E:/CardGame/_qa/close_jm.json', JSON.stringify({
  before: all.length, log, after: rest,
}, null, 1));
