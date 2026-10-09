(function () {
  // 可点元素的"看得见、点得着"探针。针对两类真实缺陷：
  //  ① 被祖先 overflow 裁到标签渲染不出来（牌桌 .gambit-bar 原先只剩 12px 上沿，
  //     像素上是个空框，没人会去点它）；
  //  ② 被另一个兄弟元素整个盖住（五艺竖排钉住的答题栏把"你的牌"压死）。
  // 对比度闸量的是颜色、几何闸只问"在不在视口内"，两类都放过它。
  //
  // 已知局限（第一版跑出一屏噪声后逐条收出来的，动手前先读这段）：
  //  · 面板是叠在标题页上的，标题页元素仍然挂载着。第一版扫 8 个面板屏，每屏都报同一条
  //    标题页封面轮播（visW=0，横向滚出视野），16 条全是假阳性。现在靠"可见带中心落在
  //    模态层后面就整条跳过"挡掉（behindModal 计数）。
  //  · 折叠线以下的内容被可滚祖先裁掉是正常的。判据不是"被裁"，是**标签还画不画得出来**：
  //    露 118px 的卡面标题照常可见 ⇒ 不报；只剩 5px 的按钮一行字渲染不出来 ⇒ 报。
  //  · 横向溢出（visW=0 而纵向完整）是轮播/横滚列表的正常折叠，所以不再单列 tooNarrow 判据。
  var SEL = 'button, a, [role="button"], .loc-node, .sv-spot, .tcard, .choice';
  var all = [].slice.call(document.querySelectorAll(SEL));
  var vw = innerWidth, vh = innerHeight;
  function boxOf(e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function cls(e) { return (e && e.className && String(e.className).slice(0, 44)) || (e && e.tagName) || '?'; }
  function txtOf(e) { return (e.innerText || '').replace(/\s+/g, ' ').slice(0, 18); }

  // 把元素盒跟所有 overflow 非 visible 的祖先盒求交，得到"真正露在外面的那一条带"。
  // 必须求交而不是取第一个命中的祖先：一个按钮可以同时被"牌桌滚动区"和"外层壳"各裁一刀。
  function visibleBand(e, b) {
    var band = { top: b.y, bot: b.y + b.h, left: b.x, right: b.x + b.w, by: null, overflow: null };
    var n = e.parentElement;
    while (n) {
      var cs = getComputedStyle(n);
      var ov = cs.overflowY + '/' + cs.overflowX;
      if (/hidden|auto|scroll|clip/.test(ov)) {
        var nb = boxOf(n);
        var t = Math.max(band.top, nb.y), bo = Math.min(band.bot, nb.y + nb.h);
        var l = Math.max(band.left, nb.x), r = Math.min(band.right, nb.x + nb.w);
        if (bo - t < band.bot - band.top || r - l < band.right - band.left) {
          band.top = t; band.bot = bo; band.left = l; band.right = r;
          band.by = cls(n); band.overflow = ov;
        }
      }
      n = n.parentElement;
    }
    band.top = Math.max(band.top, 0); band.bot = Math.min(band.bot, vh);
    band.left = Math.max(band.left, 0); band.right = Math.min(band.right, vw);
    band.visH = Math.max(0, band.bot - band.top);
    band.visW = Math.max(0, band.right - band.left);
    return band;
  }
  // 元素自己第一行文字的底部离它顶边多远：可见带比这个还浅，标签就渲染不出来
  function labelDepth(e) {
    var es = getComputedStyle(e);
    var lh = parseFloat(es.lineHeight);
    if (!isFinite(lh) || lh <= 0) lh = parseFloat(es.fontSize) * 1.35;
    return parseFloat(es.paddingTop) + lh;
  }
  // 顶栏按钮在模态浮层后面被盖住是设计如此。判"是不是模态"：
  // 从命中元素往上找定位祖先，它若盖住大半个视口就是浮层。
  function isModalCover(hit) {
    var n = hit;
    while (n && n !== document.body) {
      var cs = getComputedStyle(n);
      if (cs.position === 'fixed' || cs.position === 'absolute') {
        var nb = boxOf(n);
        if (nb.w * nb.h >= vw * vh * 0.35) return true;
      }
      n = n.parentElement;
    }
    return false;
  }
  function inScrollable(e) {
    var n = e.parentElement;
    while (n) {
      var ov = getComputedStyle(n).overflowY;
      if (ov === 'auto' || ov === 'scroll') return true;
      n = n.parentElement;
    }
    return false;
  }

  var out = { checked: 0, clipped: [], occluded: [], behindModal: 0, offscreen: 0 };
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    var b = boxOf(e);
    if (b.w < 6 || b.h < 6) continue;                       // 零尺寸/装饰性小点不管
    if (getComputedStyle(e).visibility === 'hidden') continue;
    if (b.y > vh || b.y + b.h < 0 || b.x > vw || b.x + b.w < 0) {
      if (!inScrollable(e)) out.offscreen++;                 // 可滚祖先里的屏外元素是折叠内容，不算
      continue;
    }
    out.checked++;
    var band = visibleBand(e, b);
    // 命中点取"可见带的中心"，不是元素几何中心：被裁掉一半的元素，几何中心往往已经在
    // 裁剪带外面，拿它做命中测试会把"被裁"误判成"被遮挡"，两条结论就都不可信了。
    var cx = Math.round((band.left + band.right) / 2), cy = Math.round((band.top + band.bot) / 2);
    var hit = (band.visH > 1 && band.visW > 1) ? document.elementFromPoint(cx, cy) : null;
    var unrelated = hit && hit !== e && !e.contains(hit) && !hit.contains(e);
    if (unrelated && isModalCover(hit)) { out.behindModal++; continue; }   // 面板背后的首屏元素
    if (band.visH < labelDepth(e) && band.visH < b.h) {
      out.clipped.push({ cls: cls(e), txt: txtOf(e), by: band.by, overflow: band.overflow,
        visH: Math.round(band.visH), h: Math.round(b.h), need: Math.round(labelDepth(e)) });
      continue;
    }
    if (unrelated) {
      var hcs = getComputedStyle(hit);
      if (hcs.pointerEvents !== 'none' && hcs.opacity !== '0' && hcs.visibility !== 'hidden') {
        out.occluded.push({ cls: cls(e), txt: txtOf(e), by: cls(hit),
          byTxt: (hit.innerText || '').replace(/\s+/g, ' ').slice(0, 14), at: [cx, cy] });
      }
    }
  }
  out.screen = (document.querySelector('#root > div > *') || {}).className || '';
  out.viewport = [vw, vh];
  return JSON.stringify(out);
})()
