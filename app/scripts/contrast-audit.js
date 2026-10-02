// 自动对比度审计（开发期工具，不进生产包：不在 public/，也不被任何模块 import）
// 用法：页面里注入本文件后调 window.__audit()
//   const s=document.createElement('script'); s.src='/scripts/contrast-audit.js';
//   document.head.appendChild(s);
// 原理：遍历叶子文字节点，向上合成真实背景（含 background-image 渐变与半透明层），
// 按 WCAG 2.1 相对亮度算对比度，字号≥24px（或≥18.66px且粗体）用 3:1，其余 4.5:1。
//
// 已知作用域局限（都会造成假阳性，读数前先想到）：
//  1) 祖先只有 background-image 没 background-color 时，只取到渐变第一个色阶 → 给容器补实色底
//  2) CSS 热替换后 150ms 颜色过渡的中间态 → 等 ≥1s 再测
//  3) 面板背后仍挂载着的首屏元素也会被扫到（这里只跳零尺寸，不跳被遮挡）
//  4) 文字压在 <img> 上时取到的是 img 之后的页面底，不是图本身。
//     已知唯一命中：封面 .cover-info .sub 恒报 1.07（浅字压米黄底），
//     实际它画在封面立绘上、带 text-shadow，是假阳性，别再当缺陷查。
window.__sweep = async function (labels) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const clickByText = async (txt) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === txt);
    if (!b) return false;
    b.click();
    await sleep(520);
    return true;
  };
  for (const l of labels) {
    if (await clickByText(l)) {
      const a = window.__audit();
      out.push([l, a.fails, a.checked, a.list.slice(0, 5).map((x) => x[0] + ':' + x[1] + 'x' + x[5])]);
      await clickByText('关闭');
      await sleep(260);
    } else {
      out.push([l, 'no-button']);
    }
  }
  return out;
};
window.__audit = function (opts) {
  const only = opts && opts.only;
  const px = (c) => {
    const s = String(c);
    // Chrome 会把 color-mix(in srgb,…) 计算成 color(srgb r g b)，通道是 0–1 浮点；
    // 当成 0–255 读会把浅色算成近黑，对深底报出假阳性（实测 .opp-line 假报 1.15:1）
    const sm = s.match(/^color\(srgb(?:\s+linear)?\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s+\/\s*([\d.]+))?\)/);
    if (sm) return [+sm[1] * 255, +sm[2] * 255, +sm[3] * 255, sm[4] === undefined ? 1 : +sm[4]];
    const m = s.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]] : null;
  };
  const over = (f, b) => [
    f[0] * f[3] + b[0] * (1 - f[3]),
    f[1] * f[3] + b[1] * (1 - f[3]),
    f[2] * f[3] + b[2] * (1 - f[3]),
  ];
  const lum = (c) => {
    const g = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * g(c[0]) + 0.7152 * g(c[1]) + 0.0722 * g(c[2]);
  };
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const own = (n) => {
    const cs = getComputedStyle(n);
    const c = px(cs.backgroundColor);
    if (c && c[3] > 0) return c;
    const bi = cs.backgroundImage;
    if (bi && bi !== 'none' && /gradient/.test(bi)) {
      const g = bi.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (g) return [+g[1], +g[2], +g[3], g[4] === undefined ? 1 : +g[4]];
    }
    return null;
  };
  const effBg = (el) => {
    const stack = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const c = own(n);
      if (c) stack.push(c);
      n = n.parentElement;
    }
    let out = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
    return out;
  };
  const bad = {};
  let checked = 0;
  const scope = only ? document.querySelectorAll(only) : document.querySelectorAll('*');
  const nodes = only ? [...scope].flatMap((r) => [r, ...r.querySelectorAll('*')]) : [...scope];
  for (const el of nodes) {
    // 只测"直接挂在它身上的文本"，不再因为"有子元素"就整块跳过：
    // <button>999<span/></button> 里的 999 原先永远量不到——.fab-capsule 的
    // 墨铤数字（浅金压中灰，实测 2.0）就是这么漏过去的
    let ownText = '';
    for (const n of el.childNodes) if (n.nodeType === 3) ownText += n.nodeValue;
    const t = ownText.trim();
    if (!t) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const f = px(cs.color);
    if (!f || f[3] === 0) continue;
    const b = effBg(el);
    const cr = ratio(over(f, b), b);
    checked++;
    const size = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    if (cr < need) {
      const k = (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
      const cur = bad[k];
      if (!cur || cur.cr > cr) {
        bad[k] = { n: (cur ? cur.n : 0) + 1, cr: +cr.toFixed(2), need, fg: cs.color,
          bg: b.map((x) => Math.round(x)).slice(0, 3), sample: t.slice(0, 12) };
      } else cur.n++;
    }
  }
  return {
    mode: document.documentElement.dataset.mode || 'light',
    viewport: [innerWidth, innerHeight],
    checked,
    fails: Object.keys(bad).length,
    list: Object.entries(bad).sort((a, b) => a[1].cr - b[1].cr).slice(0, 14)
      .map(([k, v]) => [k, v.cr, v.need, v.fg, 'rgb(' + v.bg.join(',') + ')', v.n, v.sample]),
  };
};
