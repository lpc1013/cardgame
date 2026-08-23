import { useMemo } from "react";
import type { Scenario, Scene } from "../engine/types";
import { getTree } from "../engine/save";

// ============================================================
// 剧情树：场景分支可视化。金色=已见，暗灰=未探明。
// 以场景在剧本中的定义序为横轴，图深度为纵轴（BFS 最长路径）。
// ============================================================

interface Node {
  scene: Scene;
  x: number;
  y: number;
  seen: boolean;
}

interface Edge { from: string; to: string; kind: "next" | "choice" }

function layout(sc: Scenario, seenIds: Set<string>) {
  const colIdx = new Map<string, number>();
  sc.scenes.forEach((s, i) => colIdx.set(s.id, i));

  // 深度：有向图（可能含回环，如调查枢纽）上求最长路径深度的迭代近似；
  // 场景数 < 30，经过 |V| 轮迭代后收敛到稳定分层，足够树形布局使用。
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  const edges: Edge[] = [];
  const addEdge = (from: string, to: string, kind: Edge["kind"]) => {
    edges.push({ from, to, kind });
    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to)!.push(from);
  };
  for (const s of sc.scenes) {
    if (s.next) addEdge(s.id, s.next, "next");
    for (const c of s.choices ?? []) addEdge(s.id, c.next, "choice");
    if (s.duel) {
      const d = sc.duels.find((x) => x.id === s.duel);
      if (d) { addEdge(s.id, d.winScene, "next"); addEdge(s.id, d.loseScene, "next"); }
    }
  }
  if (sc.verdict) {
    addEdge(sc.verdict.scene, sc.verdict.winScene, "next");
    addEdge(sc.verdict.scene, sc.verdict.loseScene, "next");
  }
  // 简单迭代求最长路径深度（DAG，场景数 < 30，安全）
  depth.set(sc.startScene, 0);
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

  const nodes: Node[] = sc.scenes
    .filter((s) => depth.has(s.id))
    .map((s) => ({
      scene: s,
      x: colIdx.get(s.id)!,
      y: depth.get(s.id)!,
      seen: seenIds.has(s.id),
    }));
  return { nodes, edges, depth };
}

export function TreeView({ sc, onClose }: { sc: Scenario; onClose: () => void }) {
  const tree = useMemo(() => layout(sc, new Set(getTree()[sc.id] ?? [])), [sc.id]);

  const COL_W = 52, ROW_H = 86, PAD = 40;
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
