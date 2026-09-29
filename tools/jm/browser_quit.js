// 尝试优雅关闭 Tabbit 浏览器：context.close() → browser.close()
// 为什么不走 taskkill：强杀会让 Chromium 跳过 flush/清理，scoped_dir* 沙盒反而留在盘上，
// 正是这条工作流要避免的事。退出后必须用进程表复核真的归 0。
//
// ⚠ 实测（2026-09-29）：这两个 close() 都会返回 ok，但**浏览器主进程并不退**——
// LocalAgent 控制器让它常驻，释放 task 也不退。所以这个脚本只能算"尽力而为"，
// 判据永远是 tasklist，不是本脚本的 log，也不是 CLI 的 status:"succeeded"。
// 真要进程归 0，得用户手动关窗口（唯一既退干净又让 Chromium 自动清 scoped_dir 的路）。
const fs = require('fs');
const log = [];

let br = null;
try { br = context.browser(); } catch (e) { log.push('context.browser() err: ' + String(e).slice(0, 90)); }

try {
  await context.close();
  log.push('context.close ok');
} catch (e) { log.push('context.close err: ' + String(e).slice(0, 90)); }

// context 关掉后 browser 句柄可能已失效，单独兜一次
try {
  if (br) { await br.close(); log.push('browser.close ok'); }
  else log.push('browser.close skipped (no handle)');
} catch (e) { log.push('browser.close err: ' + String(e).slice(0, 90)); }

fs.writeFileSync('E:/CardGame/_qa/quit.json', JSON.stringify({ log }, null, 1));
