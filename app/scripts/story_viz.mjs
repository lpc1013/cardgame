// ============================================================
// story_viz.mjs —— 剧本分支可视化生成器
// 解析 13 部剧本 → 分层树（BFS from startScene）+ 节点详情
// 输出：app/docs/STORY_VISUAL.html（单文件，无外部依赖）
// 用法：node --experimental-strip-types scripts/story_viz.mjs
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";
import { jieyu } from "../src/data/jieyu.ts";
import { shumian } from "../src/data/shumian.ts";
import { changjiang } from "../src/data/changjiang.ts";
import { diaolan } from "../src/data/diaolan.ts";
import { changhen } from "../src/data/changhen.ts";
import { jianfeng } from "../src/data/jianfeng.ts";
import { xingxing } from "../src/data/xingxing.ts";
import { touming } from "../src/data/touming.ts";

const scs = [fuma, qiuwei, sichou, xie, qinhuai, jieyu, shumian, changjiang, diaolan, changhen, jianfeng, xingxing, touming];

function nodeType(s) {
  if (s.ending) return "ending";
  if (s.shop) return "shop";
  if (s.minigame) return "minigame";
  if (s.duel) return "duel";
  if (s.cardPick) return "pick";
  return "scene";
}

function buildScenario(sc) {
  const byId = new Map(sc.scenes.map((s) => [s.id, s]));
  const nodes = [];
  const edges = [];
  for (const s of sc.scenes) {
    const type = nodeType(s);
    nodes.push({
      id: s.id,
      title: s.title || s.id,
      type,
      lines: s.lines ?? [],
      desc: s.desc ?? "",
      choices: (s.choices ?? []).map((c) => ({
        text: c.text, hint: c.hint ?? "", next: c.next,
        cond: c.cond ? JSON.stringify(c.cond) : "",
        effects: (c.effects ?? []).map(effStr).filter(Boolean).join("；"),
      })),
      next: s.next ?? "",
      next2: s.next2 ?? "",
      effects: (s.effects ?? []).map(effStr).filter(Boolean).join("；"),
      ending: s.ending ? `${s.ending.name}（${s.ending.rank}）` : "",
      endingDesc: s.ending?.desc ?? "",
      shop: s.shop ? `${s.shop.name}${(s.shop.packs ?? []).length ? ` · 卡包${s.shop.packs.length}` : ""}` : "",
      duel: s.duel ?? "",
      pick: s.cardPick ? (s.cardPick.options ?? []).join("、") : "",
      minigame: s.minigame ? `${s.minigame.type} → 胜:${s.minigame.winNext} / 败:${s.minigame.loseNext}` : "",
    });
    // next 边（含 cardPick 自己的 next）
    if (s.next) edges.push({ from: s.id, to: s.next, kind: "next" });
    if (s.next2) edges.push({ from: s.id, to: s.next2, kind: "next" });
    if (s.cardPick?.next) edges.push({ from: s.id, to: s.cardPick.next, kind: "next" });
    // choices 边
    for (const c of s.choices ?? []) {
      edges.push({ from: s.id, to: c.next, kind: "choice", label: c.text.slice(0, 10) });
      // 真结局降级边（cond 不满足 → 近似非真结局）
      if (c.altNext) edges.push({ from: s.id, to: c.altNext, kind: "choice", label: "力有未逮" });
    }
    // 对局/小游戏胜负跳转边（from=承载该机制的场景 id）
    if (s.duel) {
      const d = sc.duels.find((x) => x.id === s.duel);
      if (d?.winScene) edges.push({ from: s.id, to: d.winScene, kind: "win" });
      if (d?.loseScene) edges.push({ from: s.id, to: d.loseScene, kind: "lose" });
      // 条件失败结局（loseScene2：带 cond 的另一种败法，如 diaolan 焚毒力战）
      if (d?.loseScene2?.scene) edges.push({ from: s.id, to: d.loseScene2.scene, kind: "lose" });
    }
    if (s.minigame) {
      edges.push({ from: s.id, to: s.minigame.winNext, kind: "win" });
      edges.push({ from: s.id, to: s.minigame.loseNext, kind: "lose" });
    }
  }
  // verdict 运行时跳转：线索拣选判定（hasCore && trueCount>=minTrue → winScene，否则 loseScene）。
  // 数据无静态 next，补边后「御书房外·夜」等后续场景与失败结局不再孤立。
  if (sc.verdict?.winScene) edges.push({ from: sc.verdict.scene, to: sc.verdict.winScene, kind: "win" });
  if (sc.verdict?.loseScene) edges.push({ from: sc.verdict.scene, to: sc.verdict.loseScene, kind: "lose" });
  // 去重边
  const seen = new Set();
  const uniq = edges.filter((e) => {
    const k = e.from + ">" + e.to + ">" + e.kind;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return { id: sc.id, title: sc.title, subtitle: sc.subtitle, mode: sc.mode, startScene: sc.startScene, viewpoints: (sc.viewpoints ?? []).map((v) => ({ id: v.id, name: v.name, desc: v.desc, start: v.startScene })), nodes, edges: uniq };
}

function effStr(e) {
  const parts = [];
  if (e.setFlag) parts.push(`旗标:${e.setFlag}`);
  if (e.stat) parts.push(Object.entries(e.stat).map(([k, v]) => `${k}${v >= 0 ? "+" : ""}${v}`).join(","));
  if (e.unlockClue) parts.push(`线索:${e.unlockClue}`);
  if (e.unlockCard) parts.push(`得卡:${e.unlockCard}`);
  if (e.removeCard) parts.push(`失卡:${e.removeCard}`);
  if (e.gainSilver) parts.push(`银+${e.gainSilver}`);
  if (e.spendSilver) parts.push(`银-${e.spendSilver}`);
  return parts.join("·");
}
const escapeXml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- 布局：幕 = BFS 层（同一幕的平行选择同列纵向排） ----------
// 从 startScene 出发按边（next/choices 目标/多视角入口）BFS 分层；
// 第 N 幕的多个平行场景（平行时空）共享同一列（x 相同，y 依次）。
// ---------- Sugiyama 风格布局：最少交叉 ----------
const NH_CONST = 56, OPT_H_CONST = 26;
function nodeH(n) {
  if (n.type === "ending") return NH_CONST;
  const cs = n.choices ?? [];
  return cs.length ? NH_CONST + cs.length * OPT_H_CONST + 10 : NH_CONST;
}
function groupByLayerArr(nodes, layer) {
  const m = new Map();
  for (const n of nodes) {
    const l = layer.get(n.id);
    if (!m.has(l)) m.set(l, []);
    m.get(l).push(n);
  }
  return m;
}
function barycenter(n, neighbors, y) {
  if (!neighbors.length) return 0;
  let s = 0, c = 0;
  for (const id of neighbors) if (y.has(id)) { s += y.get(id); c++; }
  return c ? s / c : 0;
}
function layout(sc) {
  const { nodes, edges, startScene, viewpoints } = sc;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const idSet = new Set(nodes.map((n) => n.id));
  const MECH_SET = new Set(["shop", "duel", "pick", "minigame"]);
  const adj = new Map(); // 出边邻接（id → [to,...]）
  const incoming = new Map(); // 入边（to → [{from,kind}]）
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push({ from: e.from, kind: e.kind });
  }
  // 视角泳道：主 startScene 为 lane 0，各 viewpoint.start 依次为 lane 1..n；
  // 从每个 lane 起点 DFS，节点归"最先到达它的 lane"（跨视角共享点归主视角）
  const laneStarts = [startScene, ...(viewpoints ?? []).map((v) => v.start)];
  const laneOf = new Map();
  laneStarts.forEach((s, li) => {
    if (laneOf.has(s) || !idSet.has(s)) return;
    const stack = [s];
    const seen = new Set([s]);
    while (stack.length) {
      const cur = stack.pop();
      if (laneOf.has(cur)) continue;
      laneOf.set(cur, li);
      for (const nx of adj.get(cur) ?? []) if (idSet.has(nx) && !seen.has(nx)) { seen.add(nx); stack.push(nx); }
    }
  });
  // 尾声泳道：多结局分裂点（choices 的不同选项通向不同的结局链）之后，每个分支独享一条泳道
  // ——用于"尾声双视角/多线收束"的剧本（如星火：孩童·队伍线 / 女教师·乡村线）
  const reachEnds = new Map();
  const calcReach = (id) => {
    if (reachEnds.has(id)) return reachEnds.get(id);
    const n = byId.get(id);
    const s = new Set();
    reachEnds.set(id, s); // 先占位防环（图中存在环时递归不终止）
    if (!n) return s;
    if (n.type === "ending") s.add(id);
    for (const nx of adj.get(id) ?? []) for (const e of calcReach(nx)) s.add(e);
    return s;
  };
  for (const n of nodes) calcReach(n.id);
  const splitPoints = new Set();
  for (const n of nodes) {
    if (n.type === "ending" || !(n.choices?.length >= 2)) continue;
    const sigs = new Set(n.choices.map((c) => [...(reachEnds.get(c.next) ?? new Set())].sort().join(",")));
    if (sigs.size >= 2) splitPoints.add(n.id);
  }
  let nextLane = laneStarts.length;
  const splitLaneNames = new Map();
  for (const sid of splitPoints) {
    const s = byId.get(sid);
    for (const c of s.choices ?? []) {
      if (!idSet.has(c.next) || (reachEnds.get(c.next) ?? new Set()).size === 0) continue;
      const lane = nextLane++;
      const _hint = c.hint || "";
      const _label = _hint.split("·").pop().trim().slice(0, 12) || (c.text || "").slice(0, 12);
      splitLaneNames.set(lane, _label);
      const stack = [c.next];
      const seen = new Set();
      while (stack.length) {
        const cur = stack.pop();
        if (!idSet.has(cur) || seen.has(cur)) continue;
        seen.add(cur);
        if (splitPoints.has(cur) || byId.get(cur)?.type === "ending") continue; // 不越过分裂点/结局
        laneOf.set(cur, lane);
        for (const nx of adj.get(cur) ?? []) stack.push(nx);
      }
    }
  }
  for (const n of nodes) if (!laneOf.has(n.id)) laneOf.set(n.id, 0); // 兜底归主视角
  // 主线 = next 链（玩家必走的推进路线；choices 分支不算主线）
  const isMain = new Set();
  const markChain = (id) => {
    if (!idSet.has(id) || isMain.has(id)) return;
    isMain.add(id);
    const s = byId.get(id);
    if (s?.next) markChain(s.next);
    if (s?.next2) markChain(s.next2);
  };
  markChain(startScene);
  for (const v of viewpoints ?? []) markChain(v.start);
  // 收获节点（意外收获/小彩蛋）：不影响主线推进，只在线索/卡牌/银两处起作用——独立下排轨道
  //  ① 叙事收获：从主线分支点岔出、极短、一步回到汇合点（li_night 类）
  //  ② 机制收获：小游戏 / 商店（黑白市·赌坊同属）——可选不进，输赢各自成支
  //  ③ 输赢子分支：仅被收获型小游戏的 win/lose 边指向的场景——留在轨道上开小分支
  const viewStarts = new Set([startScene, ...(viewpoints ?? []).map((v) => v.start)]);
  const bonus = new Set();
  for (const n of nodes) {
    if (n.type === "ending" || viewStarts.has(n.id)) continue;
    const ins = incoming.get(n.id) ?? [];
    // ② 机制收获：商店/小游戏场景
    if ((n.type === "shop" || n.type === "minigame")) {
      // 经由 choice 进入（有可跳过的主线分支）才算收获；对局/翻牌不在此列
      const viaChoice = ins.length && ins.every((e) => e.kind === "choice");
      if (viaChoice) { bonus.add(n.id); continue; }
    }
    if (MECH_SET.has(n.type)) continue;
    if ((n.choices?.length) || n.next2 || n.duel || n.minigame || n.cardPick) continue;
    if (!n.next || viewStarts.has(n.id)) continue;
    // ③ 输赢子分支：入边全部来自 bonus 内节点的 win/lose 边
    if (ins.length && ins.every((e) => (e.kind === "win" || e.kind === "lose") && bonus.has(e.from))) {
      bonus.add(n.id); continue;
    }
    // ① 叙事收获：入边全部来自主线节点的 choice，next 一步回到汇合点
    if (!ins.length) continue;
    let ok = true;
    for (const e of ins) {
      if (e.kind !== "choice" || !isMain.has(e.from)) { ok = false; break; }
    }
    if (!ok) continue;
    if ((incoming.get(n.next) ?? []).length < 2) continue;
    bonus.add(n.id);
  }
  // ① BFS 层
  const layer = new Map();
  const queue = [startScene];
  layer.set(startScene, 0);
  for (const v of viewpoints ?? []) if (v.start && !layer.has(v.start)) { layer.set(v.start, 0); queue.push(v.start); }
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    for (const nx of adj.get(cur) ?? []) if (!layer.has(nx) && idSet.has(nx)) { layer.set(nx, layer.get(cur) + 1); queue.push(nx); }
  }
  // ② ending 层 = max(来源层) + 1（跟着来源场景走，不强制聚到最右）
  const maxL = Math.max(0, ...layer.values());
  for (const n of nodes) {
    if (n.type === "ending" && layer.has(n.id)) {
      const ins = incoming.get(n.id) ?? [];
      let srcL = 0;
      for (const e of ins) { const l = layer.get(e.from); if (l != null && l > srcL) srcL = l; }
      layer.set(n.id, srcL + 1);
    }
  }
  const FINAL = maxL + 1; // 仅用于未达节点的占位列
  const realMax = Math.max(0, ...layer.values());
  for (const n of nodes) if (!layer.has(n.id)) layer.set(n.id, realMax);

  // ③ 初始 y（按 id 序）+ Barycenter 迭代排序层内节点
  const byLayer = groupByLayerArr(nodes, layer);
  // 稳定排序初值
  for (const arr of byLayer.values()) arr.sort((a, b) => (a.id < b.id ? -1 : 1));
  // 视角泳道分块：每层内按 lane 拆成若干块，块间固定间隙（泳道视觉分离）
  const LANE_PAD = 80;
  const laneBlocks = new Map();
  for (const [l, arr] of byLayer) {
    const lanesInLayer = [...new Set(arr.map((n) => laneOf.get(n.id)))].sort((a, b) => a - b);
    const blocks = [];
    for (const li of lanesInLayer) {
      const b = arr.filter((n) => laneOf.get(n.id) === li);
      if (b.length) blocks.push(b);
    }
    laneBlocks.set(l, blocks);
  }
  const y = new Map();
  const initY = () => {
    for (const [l, arr] of byLayer) {
      let cy = 0;
      for (const block of laneBlocks.get(l) ?? []) {
        for (const n of block) { y.set(n.id, cy); cy += nodeH(n) + 26; }
        cy += LANE_PAD;
      }
    }
  };
  initY();
  // 多次 Barycenter 双向扫描（仅在泳道块内排序，避免跨视角揉成一团）
  for (let iter = 0; iter < 32; iter++) {
    // 上→下：按入边上游 y 重心排
    for (let l = 1; l <= realMax; l++) {
      for (const block of laneBlocks.get(l) ?? []) {
        block.sort((a, b) => {
          const ia = (incoming.get(a.id) ?? []).map((x) => x.from);
          const ib = (incoming.get(b.id) ?? []).map((x) => x.from);
          return barycenter(a, ia, y) - barycenter(b, ib, y);
        });
      }
    }
    // 下→上：按出边下游 y 重心排（反序用）
    for (let l = realMax - 1; l >= 1; l--) {
      for (const block of laneBlocks.get(l) ?? []) {
        block.sort((a, b) => barycenter(a, adj.get(b.id) ?? [], y) - barycenter(b, adj.get(a.id) ?? [], y));
      }
    }
    initY();
  }

  // ④ 分配 x：主列照常；收获节点（bonus）从主链下方单独拉一条轨道
  const DX = 240, Y0 = 84;
  const pos = new Map();
  // 主列底部（非 bonus 节点的最大 y + 高度）
  let mainBottom = Y0;
  for (const n of nodes) if (!bonus.has(n.id)) {
    const ny = (y.get(n.id) ?? 0) + Y0 + nodeH(n) + 26;
    if (ny > mainBottom) mainBottom = ny;
  }
  const bonusOrder = new Map();
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0;
    if (bonus.has(n.id)) {
      const bi = bonusOrder.get(l) ?? 0;
      bonusOrder.set(l, bi + 1);
      pos.set(n.id, { x: l * DX + 40, y: mainBottom + 70 + bi * 64, bonus: true });
    } else {
      pos.set(n.id, { x: l * DX + 40, y: (y.get(n.id) ?? 0) + Y0 });
    }
  }

  // ⑤ 接入槽：每个目标节点按入边数 M 分配左缘 y 槽位（避免多条边挤一个点）
  const inSlot = new Map();
  for (const e of edges) {
    const ins = incoming.get(e.to) ?? [];
    const idx = ins.findIndex((x) => x.from === e.from);
    inSlot.set(`${e.from}|${e.to}|${idx}`, idx);
  }
  // 目标端口 y：按入边序号分配左缘 y（incoming[idx] 的 y 槽）—— 从"头"（左上方）进
  const portY = (id, slotIdx) => {
    const ins = incoming.get(id) ?? [];
    const M = ins.length || 1;
    const frac = 0.28 + (M === 1 ? 0.44 : (slotIdx / (M - 1)) * 0.44);
    return (pos.get(id)?.y ?? 0) + 56 * frac;
  };
  // 起点端口 y：分支点按选项行 y（nodeOptY ），其他从"屁股"（右下方）出
  const nodeOptY = new Map();
  for (const n of nodes) {
    const cs = n.choices ?? [];
    if (cs.length && n.type !== "ending") {
      const optY = [];
      let ly = 56 + 8;
      for (let i = 0; i < cs.length; i++) { optY.push(ly + 7); ly += 26; }
      nodeOptY.set(n.id, optY);
    }
  }
  const portYFrom = (id, slotIdx) => {
    const oys = nodeOptY.get(id);
    if (oys && oys[slotIdx] != null) return (pos.get(id)?.y ?? 0) + oys[slotIdx];
    return (pos.get(id)?.y ?? 0) + 40; // 节点底部（NH*0.71）→ 视觉"从下方出"
  };

  return { layer, byLayer, laneBlocks, laneOf, laneStarts, splitLaneNames, pos, portY, portYFrom, inSlot, nodeOptY, bonus, FINAL, maxL: realMax, edges, nodes };
}

// ---------- 生成 HTML ----------
const DX = 240, NW = 200, NH = 56, OPT_H = 26; // 列距(分支线舒展) / 节点宽 / 标题高 / 选项行高
const TYPE_COLOR = {
  scene: "#5b8fb8", ending: "#d2a44f", shop: "#5fa877", duel: "#c05b4d",
  pick: "#d99a4e", minigame: "#8b7ab8",
};
const TYPE_ICON = { scene: "□", ending: "★", shop: "市", duel: "战", pick: "翻", minigame: "戏" };
const TYPE_NAME = { scene: "场景", ending: "结局", shop: "商店", duel: "对局", pick: "翻牌", minigame: "小游戏" };

// ---------- 深度检查（边悬空/重复/自环/孤立） ----------
{
  for (const sc of scs) {
    const data = buildScenario(sc);
    const ids = new Set(data.nodes.map((n) => n.id));
    const seenKey = new Set();
    const dangling = [], dup = [], selfLoop = [], iso = [];
    const reach = new Set([data.startScene]);
    for (const e of data.edges) { reach.add(e.from); reach.add(e.to); }
    for (const e of data.edges) {
      if (e.from === e.to) selfLoop.push(e);
      if (!ids.has(e.from)) dangling.push(['from', e]);
      if (!ids.has(e.to)) dangling.push(['to', e]);
      const k = e.from + '>' + e.to + '>' + e.kind;
      if (seenKey.has(k)) dup.push(e);
      seenKey.add(k);
    }
    for (const n of data.nodes) if (!reach.has(n.id) && n.id !== data.startScene) iso.push(n.id);
    console.log(`[${sc.id}] 边 ${data.edges.length} | 悬空 ${dangling.length} | 重复 ${dup.length} | 自环 ${selfLoop.length} | 孤立 ${iso.length}${iso.length ? " " + iso.join(",") : ""}`);
  }
}

const scenarioViews = scs.map((sc) => {
  const data = buildScenario(sc);
  const L = layout(data);
  const MECH = new Set(["shop", "duel", "pick", "minigame"]);
  // 幕号刻度（顶部，每 5 幕一组；结局列 maxL+1 也标）
  const maxL = L.maxL;
  let actTicks = "";
  for (let l = 0; l <= maxL + 1; l += 5) {
    actTicks += `<text x="${l * DX + 40}" y="22" font-size="11" fill="#9a8f7d" opacity="0.85">第${l + 1}幕 ▸</text>`;
  }
  // 分支点节点内选项行的 y（layout 算好）
  const nodeOptY = L.nodeOptY;
  const nodeSvg = data.nodes.map((n) => {
    const p = L.pos.get(n.id);
    const c = TYPE_COLOR[n.type];
    const icon = TYPE_ICON[n.type];
    const t = n.title || n.id;
    const t1 = t.slice(0, 8);
    const t2 = t.length > 8 ? t.slice(8, 16) : "";
    const isStart = n.id === data.startScene;
    const isBonus = !!p?.bonus;
    if (MECH.has(n.type) && !isBonus) {
      // 机制节点（非收获：对局/翻牌等仍贴主线）：小圆点标注
      return `<g class="node" data-id="${n.id}" transform="translate(${p.x + NW / 2},${p.y + 28})" opacity="0.9">
        <title>${escapeXml(n.title)}（${TYPE_NAME[n.type]}${n.shop ? " · " + escapeXml(n.shop) : ""}）</title>
        <circle r="13" fill="${c}" fill-opacity="0.22" stroke="${c}" stroke-width="1.2" class="node-rect"/>
        <text y="4.5" font-size="12" fill="${c}" text-anchor="middle" font-weight="700">${icon}</text>
      </g>`;
    }
    const cs = n.choices ?? [];
    if (cs.length && n.type !== "ending") {
      // 分支点：标题 + 选项列表（深底高对比，选项行对应 choice 边起点）
      const h = nodeH(n);
      const optY = nodeOptY.get(n.id) || [];
      const rows = cs.map((cx, i) => {
        const oy = optY[i] ?? 0;
        const tag = cx.text.match(/^【([^】]*)】/)?.[1] ?? "";
        const body = cx.text.replace(/^【[^】]*】/, "").trim().slice(0, 15) + (cx.text.replace(/^【[^】]*】/, "").trim().length > 15 ? "…" : "");
        return `<line x1="12" y1="${oy - 7}" x2="${NW - 12}" y2="${oy - 7}" stroke="#3a342b" stroke-width="1"/>
          <circle cx="17" cy="${oy - 2}" r="3.5" fill="${c}" opacity="0.95"/>
          ${tag ? `<text x="27" y="${oy}" font-size="11" font-weight="700" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3px" fill="${c}">【${escapeXml(tag)}】</text>` : ""}
          <text x="${tag ? 27 + (tag.length + 2) * 11 + 2 : 27}" y="${oy}" font-size="12" font-weight="500" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px" fill="#f5e8c8">${escapeXml(body)}</text>`;
      }).join("");
      return `<g class="node" data-id="${n.id}" transform="translate(${p.x},${p.y})" opacity="${n.lines.length ? 1 : 0.75}">
        <rect width="${NW}" height="${h}" rx="6" fill="#14110e" fill-opacity="0.85" stroke="${c}" stroke-width="${isStart ? 2.5 : 1.5}" ${isStart ? 'stroke-dasharray="5 3"' : ""} class="node-rect"/>
        <text x="10" y="19" font-size="14" fill="${c}" font-weight="700">${icon}</text>
        <text x="30" y="18" font-size="13.5" fill="#e8d9b0" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px">${escapeXml(t1)}</text>
        ${t2 ? `<text x="30" y="33" font-size="13" fill="#e8d9b0" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px">${escapeXml(t2)}</text>` : ""}
        <text x="10" y="${t2 ? 48 : 44}" font-size="10" fill="${c}" font-weight="600">${TYPE_NAME[n.type]} · 抉择</text>
        ${rows}
      </g>`;
    }
    return `<g class="node" data-id="${n.id}" transform="translate(${p.x},${p.y})" opacity="${n.lines.length ? 1 : 0.75}">
      <rect width="${NW}" height="56" rx="6" fill="#1c1915" fill-opacity="0.8" stroke="${c}" stroke-width="${isStart ? 2.5 : 1.5}" ${isBonus ? 'stroke-dasharray="6 4"' : isStart ? 'stroke-dasharray="5 3"' : ""} class="node-rect"/>
      <text x="8" y="18" font-size="14" fill="${c}" font-weight="700">${isBonus ? "✦" : icon}</text>
      <text x="27" y="17" font-size="13.5" fill="#e8d9b0" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px">${escapeXml(t1)}</text>
      ${t2 ? `<text x="27" y="32" font-size="13" fill="#e8d9b0" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px">${escapeXml(t2)}</text>` : ""}
      <text x="8" y="${t2 ? 48 : 44}" font-size="10" fill="#9a8f7d">${isBonus ? "✦ " + (MECH.has(n.type) ? TYPE_NAME[n.type] : "意外收获") : TYPE_NAME[n.type]}</text>
    </g>`;
  }).join("");
  // 边路由：起点 y = 分支点选项行 y（layout 算好 portYFrom）；终点 y = 目标接入槽 y（layout.portY）
  // 预计算 incoming 数组以与 layout.inSlot 同步算 slotIdx
  const incMap = new Map();
  for (const x of data.edges) { if (!incMap.has(x.to)) incMap.set(x.to, []); incMap.get(x.to).push(x.from); }
  const edgeSvg = data.edges.map((e) => {
    const a = L.pos.get(e.from), b = L.pos.get(e.to);
    if (!a || !b) return "";
    const mechOf = (id) => MECH.has(data.nodes.find((n) => n.id === id)?.type);
    const x1 = mechOf(e.from) ? a.x + NW / 2 : a.x + NW;
    const x2 = mechOf(e.to) ? b.x + NW / 2 : b.x;
    const slotIdx = (incMap.get(e.to) ?? []).indexOf(e.from);
    const y1 = L.portYFrom(e.from, slotIdx);
    const y2 = L.portY(e.to, slotIdx);
    const dash = e.kind === "choice" ? "6 4" : e.kind === "next" ? "2 3" : "";
    const col = e.kind === "choice" ? "#d99a4e" : e.kind === "win" ? "#5fa877" : e.kind === "lose" ? "#c05b4d" : "#8a7f6e";
    const midx = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${midx},${y1} ${midx},${y2} ${x2},${y2}" fill="none" stroke="${col}" stroke-width="1.3" stroke-dasharray="${dash}" opacity="0.9"/>`;
  }).join("");
  // 图高 = 最"胖"列（含分支点节点）的总高度（泳道块 + 间隙）+ 收获轨道
  let maxColH = 0;
  for (const [l, arr] of L.byLayer.entries()) {
    let h = 84;
    for (const block of L.laneBlocks.get(l) ?? []) {
      for (const n of block) h += nodeH(n) + 14;
      h += 80;
    }
    maxColH = Math.max(maxColH, h);
  }
  // 泳道背景带 + 视角/尾声标签（多视角剧本：主视角 lane0 + 各 viewpoint/尾声分支泳道）
  const laneLabel = (li) => {
    if (li === 0) return `${data.title}`;
    const v = data.viewpoints?.[li - 1];
    if (v) return `视角 · ${v.name}`;
    const sn = L.splitLaneNames?.get(li);
    return sn ? `尾声 · ${sn}` : `泳道 ${li}`;
  };
  const laneRanges = [];
  {
    const laneCount = Math.max(0, ...L.laneOf.values()) + 1;
    for (let li = 0; li < laneCount; li++) {
      let minY = Infinity, maxY = -Infinity;
      for (const n of data.nodes) {
        if (L.laneOf.get(n.id) !== li) continue;
        const p = L.pos.get(n.id);
        if (!p || p.bonus) continue;
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y + nodeH(n));
      }
      if (minY < Infinity) laneRanges.push({ y0: minY - 14, y1: maxY + 16, label: laneLabel(li) });
    }
  }
  // 收获节点轨道（bonus）在主列下方：每层最多 1-2 个 → 底部 +70 + 轨道高
  let bonusH = 0;
  const bonusCols = new Map();
  for (const n of data.nodes) if (L.bonus?.has(n.id)) {
    const l = L.layer.get(n.id) ?? 0;
    bonusCols.set(l, (bonusCols.get(l) ?? 0) + 1);
  }
  for (const c of bonusCols.values()) bonusH = Math.max(bonusH, c);
  const H = maxColH + 60 + (bonusH ? 70 + bonusH * 64 : 0);
  const W = (maxL + 2) * DX + 50;
  const laneSvg = laneRanges.map((r) =>
    `<rect x="0" y="${r.y0}" width="${W}" height="${r.y1 - r.y0}" fill="#d2a44f" fill-opacity="0.045"/>` +
    `<text x="14" y="${r.y0 + 15}" font-size="11.5" fill="#d2a44f" letter-spacing="3" font-weight="600">${escapeXml(r.label)}</text>`
  ).join("");
  const view = { id: data.id, title: data.title, subtitle: data.subtitle, mode: data.mode, startScene: data.startScene, W, H, nodeSvg, actTicks, edgeSvg, laneSvg, nodes: data.nodes, viewpoints: data.viewpoints };
  return view;
});

const json = JSON.stringify(scenarioViews);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>帝成观止 · 剧本分支图谱</title>
<style>
  :root { --bg:#171512; --panel:#201d19; --line:#3a342b; --ink:#e8d9b0; --dim:#9a8f7d; --gold:#d2a44f; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--ink); font-family: "Songti SC","Noto Serif SC",serif; min-height: 100vh; }
  header { position: sticky; top: 0; z-index: 20; background: rgba(23,21,18,.96); border-bottom: 1px solid var(--line); padding: 12px 18px; }
  header h1 { font-size: 20px; letter-spacing: 6px; color: var(--gold); font-weight: 600; }
  header p { font-size: 12px; color: var(--dim); margin-top: 4px; letter-spacing: 1px; }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; padding: 12px 18px 4px; }
  .tab { background: none; border: 1px solid var(--line); color: var(--dim); padding: 6px 14px; cursor: pointer; font-size: 13px; letter-spacing: 2px; border-radius: 5px; font-family: inherit; }
  .tab.on { color: var(--gold); border-color: var(--gold); background: rgba(210,164,79,.08); }
  .tab small { opacity: .7; margin-left: 4px; }
  .stage { padding: 8px 18px 24px; }
  .graph-wrap { position: relative; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); overflow: auto; }
  svg { display: block; cursor: grab; }
  svg.dragging { cursor: grabbing; }
  .node { cursor: pointer; }
  .node:hover .node-rect { filter: brightness(1.35); }
  .node.hot .node-rect { filter: brightness(1.6); stroke-width: 2.5; }
  .legend { font-size: 11px; color: var(--dim); background: rgba(20,18,15,.85); padding: 6px 12px; border-radius: 5px; margin-bottom: 8px; border: 1px solid var(--line); }
  .legend b { color: var(--ink); }
  .controls { display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end; }
  .controls button { background: rgba(0,0,0,.5); border: 1px solid var(--line); color: var(--ink); padding: 4px 10px; cursor: pointer; border-radius: 4px; font-family: inherit; font-size: 12px; }
  .controls button:hover { border-color: var(--gold); color: var(--gold); }
  .detail { position: fixed; right: 0; top: 0; bottom: 0; width: 430px; max-width: 92vw; background: var(--panel); border-left: 1px solid var(--line); z-index: 30; overflow-y: auto; padding: 20px; transform: translateX(105%); transition: transform .22s ease; }
  .detail.open { transform: translateX(0); }
  .detail h2 { color: var(--gold); font-size: 18px; letter-spacing: 3px; margin-bottom: 4px; }
  .detail .meta { font-size: 12px; color: var(--dim); margin-bottom: 12px; }
  .detail .sec { margin: 12px 0; padding: 10px 12px; background: rgba(0,0,0,.22); border: 1px solid var(--line); border-left-width: 3px; border-radius: 4px; }
  .detail .sec-t { font-size: 11px; letter-spacing: 3px; color: var(--gold); margin-bottom: 6px; }
  .detail p { font-size: 13.5px; line-height: 1.9; color: var(--ink); margin: 4px 0; }
  .detail .line { color: var(--dim); }
  .detail .choice { border-left: 3px solid var(--gold); padding-left: 10px; margin: 8px 0; }
  .detail .choice b { color: var(--ink); font-weight: 600; }
  .detail .hint { color: var(--dim); font-size: 12px; }
  .detail .close { position: absolute; top: 12px; right: 14px; background: none; border: 1px solid var(--line); color: var(--dim); width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 15px; }
  .detail .close:hover { color: var(--gold); border-color: var(--gold); }
  .ends { margin: 10px 18px; display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--dim); }
  .ends span { border: 1px solid var(--line); padding: 3px 10px; border-radius: 12px; }
  .ends b { color: var(--gold); }
  @media (max-width: 700px) { .detail { width: 100%; } header h1 { font-size: 16px; } }
</style>
</head>
<body>
<header>
  <h1>帝成观止 · 剧本分支图谱</h1>
  <p>场景节点按流程分层（左→右：起点→发展→结局）；点击节点查看文本与分支详情；滚轮缩放 / 拖拽平移。</p>
</header>
<div class="tabs" id="tabs"></div>
<div class="stage">
<div class="legend"><b>□</b>场景 <b style="color:#d2a44f">★</b>结局 <b style="color:#8fa8c8">✦</b>意外收获（含小游戏·黑白市，输赢各自成支）· 小圆点=贴主线机制（<b style="color:#c05b4d">战</b>对局 <b style="color:#d99a4e">翻</b>翻牌）· 实线=推进 虚线=分支 <b style="color:#5fa877">绿=胜</b> <b style="color:#c05b4d">红=败</b></div>
<div class="graph-wrap" id="wrap">
  <svg id="svg" xmlns="http://www.w3.org/2000/svg"></svg>
</div>
<div class="controls"><button id="fitBtn">适配</button><button id="resetBtn">复位</button></div>
<div class="ends" id="ends"></div></div>
<div class="detail" id="detail">
  <button class="close" id="closeBtn">✕</button>
  <div id="detailBody"></div>
</div>
<script>
const DATA = ${json};
const TYPE_NAME = ${JSON.stringify(TYPE_NAME)};
const TYPE_ICON = ${JSON.stringify(TYPE_ICON)};
const TYPE_COLOR = ${JSON.stringify(TYPE_COLOR)};
let cur = 0;
const svg = document.getElementById('svg');
const wrap = document.getElementById('wrap');
const tabsEl = document.getElementById('tabs');
const detailEl = document.getElementById('detail');
const detailBody = document.getElementById('detailBody');
const endsEl = document.getElementById('ends');

function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// tabs
DATA.forEach((d, i) => {
  const b = document.createElement('button');
  b.className = 'tab' + (i === 0 ? ' on' : '');
  b.innerHTML = esc(d.title) + ' <small>' + d.nodes.length + '场景</small>';
  b.onclick = () => { cur = i; render(); };
  tabsEl.appendChild(b);
});

function render(){
  const d = DATA[cur];
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('on', i === cur));
  svg.innerHTML = '<g id="lanes">' + (d.laneSvg || "") + '</g><g id="ticks">' + d.actTicks + '</g><g id="edges">' + d.edgeSvg + '</g><g id="nodes">' + d.nodeSvg + '</g>';
  svg.setAttribute('viewBox', '0 0 ' + d.W + ' ' + d.H);
  // svg 实际尺寸 = viewBox 全尺寸（让 wrap 横向滚动查看完整长图，不再用 transform 强行缩放）
  svg.style.width = d.W + 'px';
  svg.style.height = d.H + 'px';
  wrap.style.maxHeight = '78vh';
  svg.setAttribute('width', d.W); svg.setAttribute('height', d.H);
  // 滚到左上
  wrap.scrollTo({ left: 0, top: 0 });
  // 结局栏
  const ends = d.nodes.filter(n => n.type === 'ending');
  endsEl.innerHTML = '<span>结局 ' + ends.length + ' 个</span>' + ends.map(n => '<span><b>★</b>' + esc(n.ending) + '</span>').join('');
  // 节点点击
  svg.querySelectorAll('.node').forEach(g => {
    g.addEventListener('click', () => openDetail(d, g.dataset.id));
  });
  // 连线端点高亮
  svg.querySelectorAll('.node').forEach(g => {
    g.addEventListener('mouseenter', () => { g.classList.add('hot'); });
    g.addEventListener('mouseleave', () => { g.classList.remove('hot'); });
  });
}

// 缩放（改 svg 实际尺寸触发 wrap 滚动条）+ 平移（用 wrap.scrollTo 替代 transform）
function getScale(){
  const d = DATA[cur];
  return svg.getAttribute('width') ? parseFloat(svg.getAttribute('width')) / d.W : 1;
}
function setScale(k){
  const d = DATA[cur];
  const w = Math.max(200, d.W * k);
  const h = d.H * (w / d.W);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.width = w + 'px';
  svg.style.height = h + 'px';
}
function fit(){
  // 适配 wrap 宽：缩到能完整显示宽（不缩小于 0.3，避免看不清字）
  const d = DATA[cur];
  const rw = wrap.clientWidth - 8;
  const k = Math.max(0.25, Math.min(1, rw / d.W));
  setScale(k);
  wrap.scrollTo({ left: 0, top: 0 });
}
function reset(){
  const d = DATA[cur];
  setScale(1);
  wrap.scrollTo({ left: 0, top: 0 });
}
document.getElementById('fitBtn').onclick = fit;
document.getElementById('resetBtn').onclick = reset;
wrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  const curK = getScale();
  const nk = Math.max(0.2, Math.min(4, curK * (e.deltaY < 0 ? 1.12 : 0.9)));
  setScale(nk);
}, { passive: false });
// 拖动用 wrap 自身滚动（更原生，支持触控板）
let drag = null;
wrap.addEventListener('mousedown', (e) => {
  if (e.target.closest('.node')) return;
  drag = { x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop };
  svg.classList.add('dragging');
});
wrap.addEventListener('mousemove', (e) => {
  if (!drag) return;
  wrap.scrollLeft = drag.sl - (e.clientX - drag.x);
  wrap.scrollTop = drag.st - (e.clientY - drag.y);
});
window.addEventListener('mouseup', () => { drag = null; svg.classList.remove('dragging'); });

function openDetail(d, id){
  const n = d.nodes.find(x => x.id === id);
  if (!n) return;
  const c = TYPE_COLOR[n.type] || '#5b8fb8';
  let html = '<h2>' + esc(n.title) + '</h2><div class="meta">' + TYPE_NAME[n.type] + ' · ' + esc(n.id) + (n.ending ? ' · ' + esc(n.ending) : '') + '</div>';
  if (n.desc) html += '<div class="sec"><div class="sec-t">简介</div><p>' + esc(n.desc) + '</p></div>';
  if (n.lines && n.lines.length) html += '<div class="sec"><div class="sec-t">文本</div>' + n.lines.map(l => '<p class="line">' + esc(l) + '</p>').join('') + '</div>';
  if (n.effects) html += '<div class="sec"><div class="sec-t">效果</div><p>' + esc(n.effects) + '</p></div>';
  if (n.choices && n.choices.length) html += '<div class="sec"><div class="sec-t">分支选项</div>' + n.choices.map(cx => '<div class="choice"><b>' + esc(cx.text) + '</b>' + (cx.hint ? '<div class="hint">—— ' + esc(cx.hint) + '</div>' : '') + '<div class="hint">→ ' + esc(cx.next) + (cx.cond ? ' · 需: ' + esc(cx.cond) : '') + (cx.effects ? ' · ' + esc(cx.effects) : '') + '</div></div>').join('') + '</div>';
  if (n.next) html += '<div class="sec"><div class="sec-t">推进 → ' + esc(n.next) + '</div></div>';
  if (n.shop) html += '<div class="sec"><div class="sec-t">商店</div><p>' + esc(n.shop) + '</p></div>';
  if (n.duel) html += '<div class="sec"><div class="sec-t">对局</div><p>' + esc(n.duel) + '</p></div>';
  if (n.pick) html += '<div class="sec"><div class="sec-t">三选一翻牌</div><p>' + esc(n.pick) + '</p></div>';
  if (n.minigame) html += '<div class="sec"><div class="sec-t">小游戏</div><p>' + esc(n.minigame) + '</p></div>';
  if (n.endingDesc) html += '<div class="sec"><div class="sec-t">结局</div><p>' + esc(n.endingDesc) + '</p></div>';
  detailBody.innerHTML = html;
  detailEl.classList.add('open');
}
document.getElementById('closeBtn').onclick = () => detailEl.classList.remove('open');
render();
</script>
</body>
</html>`;

const out = join(process.cwd(), "docs", "STORY_VISUAL.html");
writeFileSync(out, html, "utf8");
console.log("已生成:", out, "字节:", html.length);
