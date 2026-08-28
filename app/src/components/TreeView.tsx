import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { Scenario, Scene } from "../engine/types";
import { getTree } from "../engine/save";

interface Node {
  scene: Scene;
  /** 布局 X（叶子槽位单位，可为小数=父节点居中值） */
  col: number;
  /** 深度（行） */
  row: number;
  seen: boolean;
}

interface Edge { from: string; to: string; kind: "next" | "choice" }

/**
 * Tidy Tree 布局（Reingold-Tilford 简化版）：
 *  - 叶子节点按前序遍历序获得连续槽位（间距 CELL_W，完全一致）
 *  - 内部节点 X = 子树首尾叶子中点（父居子中，连线短）
 *  - 兄弟子树槽位连续 → 天然不重叠，层内相邻节点间距恒 ≥ CELL_W
 *  - 行距 = CELL_H 恒定 → 距离一致、固定倍数
 */
/**
 * 非对称网格：行距 CELL_H（深度方向收紧）≠ 列距 CELL_W（横向加宽撑满容器）
 * —— 深树在 fit 时高度占比下降 → 节点视觉更大；宽度被列距填满 → 无左右留白，空间利用高效。
 * 叶子间距恒 = CELL_W，行距恒 = CELL_H，仍满足"距离一致、固定倍数"。
 */
const CELL_W = 132;
const CELL_H = 48;
const NODE_R = 20;
const NODE_R_ENDING = 26;
const PAD = 20;
const MAX_ZOOM = 6;
const MIN_ZOOM = 0.3;

function computeTree(sc: Scenario, seenIds: Set<string>) {
  const adj = new Map<string, string[]>();
  const edges: Edge[] = [];
  const addEdge = (from: string, to: string, kind: Edge["kind"]) => {
    edges.push({ from, to, kind });
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  };
  for (const s of sc.scenes) {
    if (s.next) addEdge(s.id, s.next, "next");
    for (const c of s.choices ?? []) addEdge(s.id, c.next, "choice");
    if (s.duel) {
      const d = sc.duels.find((x) => x.id === s.duel);
      if (d) { addEdge(s.id, d.winScene, "next"); addEdge(s.id, d.loseScene, "next"); if (d.loseScene2) addEdge(s.id, d.loseScene2.scene, "next"); }
    }
    if (s.cardPick) addEdge(s.id, s.cardPick.next, "next");
    if (s.next2) addEdge(s.id, s.next2, "next");
    if (s.minigame) { addEdge(s.id, s.minigame.winNext, "next"); addEdge(s.id, s.minigame.loseNext, "next"); }
  }
  if (sc.verdict) {
    addEdge(sc.verdict.scene, sc.verdict.winScene, "next");
    addEdge(sc.verdict.scene, sc.verdict.loseScene, "next");
  }

  const roots = [sc.startScene, ...(sc.viewpoints?.map((v) => v.startScene).filter((id) => id !== sc.startScene) ?? [])];

  // 最短深度（BFS 松弛取 min，回环不撑大）
  const depth = new Map<string, number>();
  for (const r of roots) depth.set(r, 0);
  for (let pass = 0; pass < sc.scenes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const d = depth.get(e.from);
      if (d !== undefined && (depth.get(e.to) ?? Number.POSITIVE_INFINITY) > d + 1) {
        depth.set(e.to, d + 1); changed = true;
      }
    }
    if (!changed) break;
  }

  // 建树：DFS 序第一个父（用于确定 children 结构）
  const children = new Map<string, string[]>();
  for (const s of sc.scenes) children.set(s.id, []);
  const visited = new Set<string>();
  const build = (id: string): void => {
    for (const to of adj.get(id) ?? []) {
      if (visited.has(to) || to === id) continue;
      visited.add(to);
      children.get(id)!.push(to);
      build(to);
    }
  };
  for (const r of roots) if (!visited.has(r)) { visited.add(r); build(r); }
  // 孤儿（不可达）：并入尾部虚拟行，避免漏画
  const orphanRow = (depth.size > 0 ? Math.max(...depth.values()) : 0) + 1;
  for (const s of sc.scenes) {
    if (!depth.has(s.id)) depth.set(s.id, orphanRow);
    if (!children.has(s.id)) children.set(s.id, []);
  }

  // Tidy 布局：后序，叶子连续槽位，内部节点取子中点
  let cursor = 0;
  const xOf = new Map<string, number>();
  const layout = (id: string): void => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) { xOf.set(id, cursor++); return; }
    for (const k of kids) layout(k);
    const first = xOf.get(kids[0]!);
    const last = xOf.get(kids[kids.length - 1]!);
    if (first === undefined && last === undefined) { xOf.set(id, cursor++); return; }
    const lo = first ?? last!, hi = last ?? first!;
    xOf.set(id, (lo + hi) / 2);
  };
  for (const r of roots) if (!xOf.has(r)) layout(r);
  for (const s of sc.scenes) if (!xOf.has(s.id)) { xOf.set(s.id, cursor++); depth.set(s.id, orphanRow); }

  const nodes: Node[] = sc.scenes
    .filter((s) => depth.has(s.id))
    .map((s) => ({ scene: s, col: xOf.get(s.id) ?? 0, row: depth.get(s.id)!, seen: seenIds.has(s.id) }));
  return { nodes, edges, leafCount: Math.max(1, cursor) };
}

interface ViewBox { x: number; y: number; w: number; h: number }

/** 原生触屏手势状态：单指平移 / 双指捏合缩放 */
type TouchState =
  | { mode: "pan"; startX: number; startY: number; lastX: number; lastY: number; moved: boolean }
  | { mode: "pinch"; d0: number; vb0: ViewBox; cx0: number; cy0: number };

export function TreeView({ sc, onClose }: { sc: Scenario; onClose: () => void }) {
  const tree = useMemo(() => computeTree(sc, new Set(getTree()[sc.id] ?? [])), [sc.id]);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {});
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const seenCount = tree.nodes.filter((n) => n.seen).length;
  const endings = tree.nodes.filter((n) => n.scene.ending);

  // —— 坐标：X = col·CELL_W（叶子槽位/父中点），Y = row·CELL_H ——
  const maxRow = Math.max(0, ...tree.nodes.map((n) => n.row));
  const toX = (n: Node) => PAD + n.col * CELL_W;
  const toY = (n: Node) => PAD + n.row * CELL_H;
  const contentW = tree.leafCount * CELL_W + PAD * 2;
  const contentH = (maxRow + 1) * CELL_H + PAD * 2;

  // —— viewBox：默认 fit 全部（无需拖动），拖拽/滚轮可微调 ——
  const fitVb = (): ViewBox => ({ x: -PAD, y: -PAD, w: contentW, h: contentH });
  const [vb, setVb] = useState<ViewBox>(fitVb());
  const vbRef = useRef(vb);
  vbRef.current = vb;
  useEffect(() => { setVb(fitVb()); }, [contentW, contentH]);

  const clampVb = useCallback((n: ViewBox): ViewBox => {
    const minW = contentW * MIN_ZOOM, maxW = contentW * MAX_ZOOM;
    const w = Math.max(minW, Math.min(maxW, n.w));
    const h = w * (contentH / contentW);
    const cx = -PAD + contentW / 2, cy = -PAD + contentH / 2;
    const tol = 0.6;
    const minX = cx - (w / 2) - contentW * tol;
    const maxX = cx + (w / 2) + contentW * tol;
    const minY = cy - (h / 2) - contentH * tol;
    const maxY = cy + (h / 2) + contentH * tol;
    return { x: Math.max(minX, Math.min(maxX, n.x)), y: Math.max(minY, Math.min(maxY, n.y)), w, h };
  }, [contentW, contentH]);

  const reset = () => setVb(fitVb());

  const dragRef = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);
  const touchRef = useRef<TouchState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailScene = detailId ? sc.scenes.find((s) => s.id === detailId) ?? null : null;
  const detailSeen = detailId ? tree.nodes.some((n) => n.scene.id === detailId && n.seen) : false;
  const detailPreview = detailScene ? detailScene.lines.join("").slice(0, 100) : "";
  const [legendOpen, setLegendOpen] = useState(false);

  /** 屏幕坐标命中场景节点：命中→打开详情；未命中→关闭详情 */
  const openDetailAt = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const cur = vbRef.current;
    const px = cur.x + ((clientX - rect.left) / rect.width) * cur.w;
    const py = cur.y + ((clientY - rect.top) / rect.height) * cur.h;
    const target = tree.nodes.find((n) => {
      const r = (n.scene.ending ? NODE_R_ENDING : NODE_R) + 6;
      const dx = toX(n) - px, dy = toY(n) - py;
      return dx * dx + dy * dy <= r * r;
    });
    setDetailId(target ? target.scene.id : null);
  };
  const openDetailAtRef = useRef(openDetailAt);
  openDetailAtRef.current = openDetailAt;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return; // 触屏走原生 touch 手势
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, vb: { ...vbRef.current } };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { x, y, vb: vb0 } = dragRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const sx = vb0.w / rect.width, sy = vb0.h / rect.height;
    setVb(clampVb({ x: vb0.x - (e.clientX - x) * sx, y: vb0.y - (e.clientY - y) * sy, w: vb0.w, h: vb0.h }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      const d = dragRef.current;
      // 位移 < 4px 视为点击：打开/切换/关闭节点详情
      if (d && Math.abs(e.clientX - d.x) < 4 && Math.abs(e.clientY - d.y) < 4) {
        openDetailAt(e.clientX, e.clientY);
      }
    }
    dragRef.current = null;
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const cur = vbRef.current;
      const mx = cur.x + (e.clientX - rect.left) / rect.width * cur.w;
      const my = cur.y + (e.clientY - rect.top) / rect.height * cur.h;
      const dir = e.deltaY > 0 ? 1.12 : 0.89;
      const w = cur.w * dir;
      const ratio = w / contentW;
      if (ratio > MAX_ZOOM || ratio < MIN_ZOOM) return;
      const h = w * (contentH / contentW);
      setVb(clampVb({ x: mx - (mx - cur.x) * dir, y: my - (my - cur.y) * dir, w, h }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clampVb, contentW, contentH]);

  // —— 触屏手势（U-6）：单指平移 / 双指捏合缩放 / 轻点节点看详情 ——
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        const t0 = e.touches[0]!;
        const t1 = e.touches[1]!;
        const d0 = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1;
        const rect = svgRef.current?.getBoundingClientRect();
        const cur = vbRef.current;
        let cx0 = cur.x + cur.w / 2;
        let cy0 = cur.y + cur.h / 2;
        if (rect && rect.width > 0 && rect.height > 0) {
          cx0 = cur.x + (((t0.clientX + t1.clientX) / 2 - rect.left) / rect.width) * cur.w;
          cy0 = cur.y + (((t0.clientY + t1.clientY) / 2 - rect.top) / rect.height) * cur.h;
        }
        touchRef.current = { mode: "pinch", d0, vb0: { ...cur }, cx0, cy0 };
      } else if (e.touches.length === 1) {
        const t = e.touches[0]!;
        touchRef.current = { mode: "pan", startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastY: t.clientY, moved: false };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      const st = touchRef.current;
      if (!st) return;
      if (st.mode === "pinch" && e.touches.length >= 2) {
        e.preventDefault();
        const t0 = e.touches[0]!;
        const t1 = e.touches[1]!;
        const d1 = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1;
        const w = st.vb0.w * (d1 / st.d0);
        if (w / contentW > MAX_ZOOM || w / contentW < MIN_ZOOM) return;
        const h = w * (contentH / contentW);
        const nx = st.cx0 - (st.cx0 - st.vb0.x) * (w / st.vb0.w);
        const ny = st.cy0 - (st.cy0 - st.vb0.y) * (h / st.vb0.h);
        setVb(clampVb({ x: nx, y: ny, w, h }));
      } else if (st.mode === "pan" && e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0]!;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        const cur = vbRef.current;
        if (Math.abs(t.clientX - st.startX) + Math.abs(t.clientY - st.startY) > 8) st.moved = true;
        const sx = cur.w / rect.width, sy = cur.h / rect.height;
        setVb(clampVb({ x: cur.x - (t.clientX - st.lastX) * sx, y: cur.y - (t.clientY - st.lastY) * sy, w: cur.w, h: cur.h }));
        st.lastX = t.clientX;
        st.lastY = t.clientY;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      const st = touchRef.current;
      if (e.touches.length === 0) {
        if (st && st.mode === "pan" && !st.moved) openDetailAtRef.current(st.startX, st.startY);
        touchRef.current = null;
      } else if (e.touches.length === 1 && st?.mode === "pinch") {
        const t = e.touches[0]!;
        touchRef.current = { mode: "pan", startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastY: t.clientY, moved: false };
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [clampVb, contentW, contentH]);

  return (
    <div className="tree-overlay" onClick={onClose}>
      <div className="tree-panel" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <div className="tree-header">
          <h3>{sc.title} · 剧情树</h3>
          <span className="muted">已探索 {seenCount}/{tree.nodes.length} 节 · {endings.filter(n=>n.seen).length}/{endings.length} 个结局</span>
          <button className="btn-main tree-reset" onClick={reset}>还原</button>
          <button className="btn-main" onClick={onClose}>合上</button>
        </div>
        <div className="tree-pan-hint muted">拖拽/单指平移 · 滚轮/双指缩放 · 轻点节点看详情</div>
        <div className="tree-scroll" ref={containerRef}>
          <svg
            ref={svgRef}
            width="100%" height="100%"
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {tree.edges.map((e, i) => {
              const a = tree.nodes.find((n) => n.scene.id === e.from);
              const b = tree.nodes.find((n) => n.scene.id === e.to);
              if (!a || !b) return null;
              const lit = a.seen && b.seen;
              const x1 = toX(a), y1 = toY(a) + NODE_R + 1;
              const x2 = toX(b), y2 = toY(b) - NODE_R - 1;
              const dy = y2 - y1;
              const upward = dy < 0; // 回环：子比父浅
              // 树枝曲线：父端竖直深坠（bend1 大）→ 子端水平平收（bend2 小），S 弧舒展有分叉感
              const bend1 = 0.72, bend2 = 0.5;
              const s1 = upward ? -1 : 1;
              const c1x = x1, c1y = y1 + s1 * Math.abs(dy) * bend1;
              const c2x = x2, c2y = y2 - s1 * Math.abs(dy) * bend2;
              const d = `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={lit ? "#6e3524" : "#2c2823"}
                  strokeWidth={lit ? 2.2 : 1.4}
                  strokeDasharray={e.kind === "choice" || upward ? "4 3" : undefined}
                  opacity={lit ? 0.9 : 0.55}
                />
              );
            })}
            {tree.nodes.map((n) => {
              const isEnding = !!n.scene.ending;
              const r = isEnding ? NODE_R_ENDING : NODE_R;
              const x = toX(n), y = toY(n);
              return (
                <g key={n.scene.id}>
                  <title>{n.scene.title ?? n.scene.id}</title>
                  <circle
                    cx={x} cy={y} r={r}
                    fill={n.seen ? (isEnding ? "#c9a86a" : "#b3452c") : "#26221d"}
                    stroke={n.seen ? "#c9a86a" : "#3a352d"} strokeWidth="2"
                  />
                  {n.seen && isEnding && (
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={NODE_R_ENDING - 4} fill="#2b2314" pointerEvents="none">★</text>
                  )}
                  {n.seen && (
                    <text x={x} y={y + r + 16} textAnchor="middle" fontSize={15} fill="#d8d0c0">
                      {(n.scene.title ?? n.scene.id).slice(0, 6)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        {detailScene && (
          <div
            className="tree-detail"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 54, right: 16, zIndex: 5,
              maxWidth: 340, maxHeight: "calc(100% - 72px)", overflowY: "auto",
              background: "rgba(20,17,14,.94)", border: "1px solid var(--line)",
              borderLeft: "3px solid var(--gold)", boxShadow: "0 10px 30px rgba(0,0,0,.55)",
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h4 style={{ margin: 0, color: "var(--gold)", fontSize: 15, letterSpacing: 1, flex: 1 }}>
                {detailScene.title ?? detailScene.id}
              </h4>
              <button className="btn-main" style={{ padding: "2px 10px", fontSize: 12, flexShrink: 0 }} onClick={() => setDetailId(null)}>关闭</button>
            </div>
            <div className="detail-line" style={{ fontSize: 12 }}>ID：{detailScene.id}</div>
            <div className="detail-line" style={{ fontSize: 12 }}>
              {detailScene.ending ? (
                <span style={{ color: "var(--gold)" }}>★ 结局 · {detailScene.ending.name}（{detailScene.ending.rank}）</span>
              ) : (
                <span>普通场景</span>
              )}
              <span> · {detailSeen ? "已见" : "未探索"}</span>
            </div>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.8 }}>
              {detailPreview || "（无正文）"}{detailPreview.length >= 100 ? "…" : ""}
            </p>
          </div>
        )}
        <div className="tree-legend" style={{ margin: "10px 0 0", textAlign: "center" }}>
          <button
            className="tree-legend-toggle"
            onClick={() => setLegendOpen((v) => !v)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--ink-dim)", fontSize: 12, letterSpacing: 1, padding: "2px 10px",
            }}
          >
            {legendOpen ? "图例 ▾" : "图例 ▸"}
          </button>
          {legendOpen && (
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.8 }}>
              ◆ 金色★=已见结局 · 红点=已见场景 · 空心=未探索 — 深色虚线=跨折转/回环
              <br />轻点节点查看场景详情 · 触屏双指捏合缩放
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
