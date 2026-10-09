(function () {
  // 可点元素的"看得见、点得着"探针。针对两类真实缺陷：
  //  ① 被祖先 overflow 裁掉只剩一条边（牌桌 .gambit-bar 原先在 1440x900 下只剩 12px 上沿，
  //     像素上是个空框，没人会去点它）；
  //  ② 被另一个兄弟元素整个盖住（五艺竖排钉住的答题栏把"你的牌"压死）。
  // 对比度闸量的是颜色、几何闸只问"在不在视口内"，两类都放过它。
  var SEL = 'button, a, [role="button"], .loc-node, .sv-spot, .tcard, .choice';
  var all = [].slice.call(document.querySelectorAll(SEL));
  var vw = innerWidth, vh = innerHeight;
  function boxOf(e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function cls(e) { return (e && e.className && String(e.className).slice(0, 44)) || (e && e.tagName) || '?'; }
  function clippedByAncestor(e, b) {
    var n = e.parentElement;
    while (n) {
      var cs = getComputedStyle(n);
      var ov = cs.overflowY + '/' + cs.overflowX;
      if (/hidden|auto|scroll|clip/.test(ov)) {
        var nb = boxOf(n);
        var visTop = Math.max(b.y, nb.y), visBot = Math.min(b.y + b.h, nb.y + nb.h);
        var visH = Math.max(0, visBot - visTop);
        var visL = Math.max(b.x, nb.x), visR = Math.min(b.x + b.w, nb.x + nb.w);
        var visW = Math.max(0, visR - visL);
        // 判据不是"被可滚祖先裁了"——折叠线以下的内容本来就该被裁（市集卡墙一口气 5 条全是噪声）。
        // 判据是**标签还画不画得出来**：牌桌动作条原先只剩 5px / 29px，一行字渲染不出来，
        // 于是那个可点的按钮在屏幕上就是一个空框——这才是"粗糙"的症状本身。
        // 露出 118px 的卡片标题照常可见，属正常折叠，不算缺陷。
        var es = getComputedStyle(e);
        var lh = parseFloat(es.lineHeight);
        if (!isFinite(lh) || lh <= 0) lh = parseFloat(es.fontSize) * 1.35;
        var labelY = parseFloat(es.paddingTop) + lh;          // 第一行文字底边离元素顶的距离
        var tooShort = visH < labelY;
        var tooNarrow = visW < Math.min(b.w * 0.5, 24);
        if (b.h > 8 && (tooShort || tooNarrow)) {
          return { node: cls(n), overflow: ov, visH: Math.round(visH), visW: Math.round(visW),
                   h: Math.round(b.h), w: Math.round(b.w), labelY: Math.round(labelY) };
        }
      }
      n = n.parentElement;
    }
    return null;
  }
  // 顶栏那些按钮在模态浮层后面被盖住，是设计如此而不是缺陷。
  // 判"是不是模态"：从命中元素往上找第一个定位祖先，它若盖住大半个视口就是浮层。
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
  var out = { checked: 0, clipped: [], occluded: [], offscreen: [] };
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    var b = boxOf(e);
    if (b.w < 6 || b.h < 6) continue;                       // 零尺寸/装饰性小点不管
    if (getComputedStyle(e).visibility === 'hidden') continue;
    if (b.y > vh || b.y + b.h < 0 || b.x > vw || b.x + b.w < 0) {
      // 在可滚祖先里的屏外元素是折叠内容，不是缺陷；只有滚不到的才算
      if (!inScrollable(e)) out.offscreen.push({ cls: cls(e), txt: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 18), y: Math.round(b.y) });
      continue;
    }
    out.checked++;
    var clip = clippedByAncestor(e, b);
    if (clip) {
      out.clipped.push({ cls: cls(e), txt: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 18),
        by: clip.node, overflow: clip.overflow, visH: clip.visH, h: clip.h, visW: clip.visW, w: clip.w });
      continue;
    }
    // 中心命中测试：只在元素确实进了视口才做（屏外的交给上面那条）
    if (b.y >= 0 && b.y + b.h <= vh && b.x >= 0 && b.x + b.w <= vw) {
      var cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h / 2);
      var hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) {
        var hcs = getComputedStyle(hit);
        if (hcs.pointerEvents !== 'none' && hcs.opacity !== '0' && hcs.visibility !== 'hidden' && !isModalCover(hit)) {
          out.occluded.push({ cls: cls(e), txt: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 18),
            by: cls(hit), byTxt: (hit.innerText || '').replace(/\s+/g, ' ').slice(0, 14), at: [cx, cy] });
        }
      }
    }
  }
  out.screen = (document.querySelector('#root > div > *') || {}).className || '';
  out.viewport = [vw, vh];
  return JSON.stringify(out);
})()
