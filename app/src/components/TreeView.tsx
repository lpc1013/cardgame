import { useMemo } from "react";
import type { Scenario, Scene } from "../engine/types";
import { getTree } from "../engine/save";

// ============================================================
// 剧情树：场景分支可视化。金色=已见，暗灰=未探明。
// 横轴：以 startScene（多视角剧本含各视角入口）为根的 DFS 生成树
//       紧凑分列（子树相邻、父居子中），使分支聚集而非按定义序平铺；
//       纵轴：图深度（最长路径）。
// ============================================================

interface Node {
  scene: Scene;
  x: number;
  y: number;
  seen: boolean;
}

interface Edge { from: string; to: string; kind: "next" | "choice" }

function layout(sc: Scenario, seenIds: Set<string>) {
  // 邻接表（按定义序：next → choices → duel → cardPick/next2/minigame）
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

  // 深度：有向图上最长路径的迭代近似（场景数 < 30，|V| 轮收敛）
  const roots = [sc.startScene, ...(sc.viewpoints?.map((v) => v.startScene).filter((id) => id !== sc.startScene) ?? [])];
  const depth = new Map<string, number>();
  for (const r of roots) depth.set(r, 0);
  for (let pass = 0; pass < sc.scenes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const d = depth.get(e.from);
      if (d !== undefined && (depth.get(e.to) ?? -1) < d + 1) {
        depth.set(e.to, d + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // DFS 生成树紧凑分列：叶按序占列，父取子区间中位 → 同支脉聚拢、全图收窄；
  // 多视角时先遍历主根，再补遍历各视角入口（代笔开场等挂在其下）
  const parent = new Map<string, string>();
  const visited = new Set<string>([sc.startScene]);
  const dfs = (id: string): void => {
    for (const to of adj.get(id) ?? []) {
      if (!visited.has(to)) { visited.add(to); parent.set(to, id); dfs(to); }
    }
  };
  dfs(sc.startScene);
  for (const r of roots) if (!visited.has(r)) { visited.add(r); dfs(r); }
  let cursor = 0;
  const colOf = new Map<string, number>();
  const assign = (id: string): void => {
    const kids = (adj.get(id) ?? []).filter((t) => parent.get(t) === id);
    if (kids.length === 0) { colOf.set(id, cursor++); return; }
    for (const k of kids) assign(k);
    colOf.set(id, Math.round((colOf.get(kids[0]!)! + colOf.get(kids[kids.length - 1]!)!) / 2));
  };
  assign(sc.startScene);
  for (const r of roots) if (!colOf.has(r)) assign(r);
  // 异常兜底：不可达场景（verify 会拦）排在末尾，保证图上可见
  for (const s of sc.scenes) if (!colOf.has(s.id)) colOf.set(s.id, cursor++);

  const nodes: Node[] = sc.scenes
    .filter((s) => depth.has(s.id))
    .map((s) => ({
      scene: s,
      x: colOf.get(s.id)!,
      y: depth.get(s.id)!,
      seen: seenIds.has(s.id),
    }));
  return { nodes, edges, depth };
}

export function TreeView({ sc, onClose }: { sc: Scenario; onClose: () => void }) {
  const tree = useMemo(() => layout(sc, new Set(getTree()[sc.id] ?? [])), [sc.id]);

  const COL_W = 46, ROW_H = 80, PAD = 40;
  const maxX = tree.nodes.reduce((m, n) => Math.max(m, n.x), 0);
  const maxY = tree.nodes.reduce((m, n) => Math.max(m, n.y), 0);
  const width = (maxX + 1) * COL_W + PAD * 2;
  const height = (maxY + 1) * ROW_H + PAD * 2;
  const px = (x: number) => PAD + x * COL_W;
  const py = (y: number) => PAD + y * ROW_H;

  const seenCount = tree.nodes.filter((n) => n.seen).length;
  const endings = tree.nodes.filter((n) => n.scene.ending);

  return (
    <div className="tree-overlay" onClick={onClose}>
      <div className="tree-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tree-header">
          <h3>{sc.title} · 剧情树</h3>
          <span className="muted">已探明 {seenCount}/{tree.nodes.length} 幕 · {endings.filter(n=>n.seen).length}/{endings.length} 个结局</span>
          <button className="btn-main" onClick={onClose}>合上</button>
        </div>
        <div className="tree-scroll">
          <svg width={width} height={height} style={{ minWidth: "100%" }}>
            {tree.edges.map((e, i) => {
              const a = tree.nodes.find((n) => n.scene.id === e.from);
              const b = tree.nodes.find((n) => n.scene.id === e.to);
              if (!a || !b) return null;
              const lit = a.seen && b.seen;
              const x1 = px(a.x), y1 = py(a.y) + 14, x2 = px(b.x), y2 = py(b.y) - 14;
              return (
                <path
                  key={i}
                  d={`M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}`}
                  fill="none"
                  stroke={lit ? "#6e3524" : "#2c2823"}
                  strokeWidth={lit ? 1.8 : 1.2}
                  strokeDasharray={e.kind === "choice" ? "4 3" : undefined}
                  opacity={lit ? 0.9 : 0.5}
                />
              );
            })}
            {tree.nodes.map((n) => {
              const isEnding = !!n.scene.ending;
              const r = isEnding ? 10 : 7;
              return (
                <g key={n.scene.id}>
                  <circle
                    cx={px(n.x)} cy={py(n.y)} r={r}
                    fill={n.seen ? (isEnding ? "#c9a86a" : "#b3452c") : "#26221d"}
                    stroke={n.seen ? "#c9a86a" : "#3a352d"} strokeWidth="1.5"
                  />
                  <text
                    x={px(n.x)} y={py(n.y) + 26}
                    textAnchor="middle"
                    fontSize="11"
                    fill={n.seen ? "#d8d0c0" : "#5a544a"}
                  >
                    {n.seen
                      ? (n.scene.title ?? n.scene.id).slice(0, 6)
                      : "？？？"}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <p className="muted tree-legend">
          ● 金色=已见结局 · 红点=已见场景 · 空心=未探明的剧情 —— 多结局的意义，就在那些「？？？」里
        </p>
      </div>
    </div>
  );
}
