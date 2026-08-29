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
  // 泳道按视角划分：主 startScene = lane 0，各 viewpoint.start 依次为 lane 1..n。
  // 多结局分支（尾声）不再单独开泳道——分支节点与后续节点都归所属视角泳道（DFS laneOf），
  // 避免泳道数量膨胀、占用多余空间。
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

  // ③ 泳道垂直分离布局（v6，整理重排）：
  // - 泳道 = 视角（主 start + 各 viewpoint）；多结局分支不额外占泳道
  // - 每条泳道独立垂直带：lane 0 顶 → lane n 底，间距 LANE_PAD 固定且紧凑
  // - **泳道内节点垂直叠排**（同列多节点上下排），泳道高自适应 = max(该泳道各列叠排高)
  // - 所有节点（场景/结局/共享/收获）都归位自己泳道，禁止侵占别人泳道
  // - 列内顺序按"剧情叙述顺序"（父节点选项序号优先）整理
  const byLayer = groupByLayerArr(nodes, layer);
  const Y0 = 84, LANE_PAD = 80, VGAP = 12; // 垂直叠排间距
  const laneCount = Math.max(0, ...laneOf.values()) + 1;
  // lane → 层 → [节点]
  const laneCols = new Map();
  for (const n of nodes) {
    const li = laneOf.get(n.id), l = layer.get(n.id) ?? 0;
    const k = `${li}|${l}`;
    if (!laneCols.has(k)) laneCols.set(k, []);
    laneCols.get(k).push(n);
  }
  // 剧情叙述顺序：同列多节点的位次 = 父节点（同泳道）choices 数组中该目标的序号
  const optRank = (id) => {
    const ins = incoming.get(id) ?? [];
    for (const e of ins) {
      if (laneOf.get(e.from) !== laneOf.get(id)) continue;
      const pn = byId.get(e.from);
      const idx = (pn?.choices ?? []).findIndex((c) => c.next === id);
      if (idx >= 0) return idx;
    }
    return 0;
  };
  for (const arr of laneCols.values()) {
    arr.sort((a, b) => {
      const ra = optRank(a.id), rb = optRank(b.id);
      if (ra !== rb) return ra - rb;
      return a.id < b.id ? -1 : 1;
    });
  }
  // 泳道带高自适应：= 该泳道各列叠排高的最大值（+padding）
  const laneH = new Map();
  for (let li = 0; li < laneCount; li++) {
    let h = 0;
    for (const [k, arr] of laneCols) {
      const kli = Number(k.split("|")[0]);
      if (kli !== li) continue;
      let ch = 0;
      for (const n of arr) ch += nodeH(n) + VGAP;
      if (ch > h) h = ch;
    }
    laneH.set(li, Math.max(h, 56) + 10);
  }
  // 泳道带起点：lane 0 顶 → 依次下排
  const laneTop = new Map();
  {
    let cur = Y0;
    for (let li = 0; li < laneCount; li++) { laneTop.set(li, cur); cur += laneH.get(li) + LANE_PAD; }
  }
  // y：泳道带内按列垂直叠排（同列多节点上下排）
  const y = new Map();
  for (const [k, arr] of laneCols) {
    const li = Number(k.split("|")[0]);
    let cy = laneTop.get(li) + 8;
    for (const n of arr) { y.set(n.id, cy); cy += nodeH(n) + VGAP; }
  }
  // 未入列节点兜底归主泳道顶部
  for (const n of nodes) if (!y.has(n.id)) y.set(n.id, laneTop.get(laneOf.get(n.id)) + 8);
  // ④ 分配 x：列推进（layer * DX + 40），无横向偏移
  const DX = 320;
  const pos = new Map();
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0;
    pos.set(n.id, { x: l * DX + 40, y: y.get(n.id) ?? laneTop.get(laneOf.get(n.id)) + 8, bonus: bonus.has(n.id) });
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

  return { layer, byLayer, laneOf, laneStarts, laneTop, laneH, pos, portY, portYFrom, inSlot, nodeOptY, bonus, FINAL, maxL: realMax, edges, nodes };
}

// ---------- 生成 HTML ----------
const DX = 320, NW = 200, NH = 56, OPT_H = 26; // 列距(分支线舒展) / 节点宽 / 标题高 / 选项行高
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
      return `<g class="node" data-id="${n.id}" transform="translate(${p.x + NW / 2},${p.y + 28})" opacity="0.95">
        <title>${escapeXml(n.title)}（${TYPE_NAME[n.type]}${n.shop ? " · " + escapeXml(n.shop) : ""}）</title>
        <circle r="13" fill="${c}" fill-opacity="0.32" stroke="${c}" stroke-width="1.5" class="node-rect"/>
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
        // 文字超框截断：有【】只显示【】内（截 7 字）；无【】取前 8 字
        const tagShort = tag.slice(0, 7) + (tag.length > 7 ? "…" : "");
        const bodyFull = cx.text.replace(/^【[^】]*】/, "").trim();
        let label;
        if (tag) {
          label = `【${escapeXml(tagShort)}】`;
          if (bodyFull) label += bodyFull.slice(0, 4) + (bodyFull.length > 4 ? "…" : "");
        } else {
          label = bodyFull.slice(0, 8) + (bodyFull.length > 8 ? "…" : "");
        }
        const labelLen = label.replace(/<[^>]*>/g, "").length;
        return `<line x1="12" y1="${oy - 7}" x2="${NW - 12}" y2="${oy - 7}" stroke="#3a342b" stroke-width="1"/>
          <circle cx="17" cy="${oy - 2}" r="3.5" fill="${c}" opacity="0.95"/>
          <text x="27" y="${oy}" font-size="12" font-weight="600" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px" fill="#f5e8c8">${label}</text>`;
      }).join("");
      return `<g class="node" data-id="${n.id}" transform="translate(${p.x},${p.y})" opacity="${n.lines.length ? 1 : 0.78}">
        <rect width="${NW}" height="${h}" rx="6" fill="#14110e" fill-opacity="1" stroke="${c}" stroke-width="${isStart ? 2.5 : 1.5}" ${isStart ? 'stroke-dasharray="5 3"' : ""} class="node-rect"/>
        <text x="10" y="19" font-size="14" fill="${c}" font-weight="700">${icon}</text>
        <text x="30" y="18" font-size="13.5" fill="#e8d9b0" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px">${escapeXml(t1)}</text>
        ${t2 ? `<text x="30" y="33" font-size="13" fill="#e8d9b0" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px">${escapeXml(t2)}</text>` : ""}
        <text x="10" y="${t2 ? 48 : 44}" font-size="10" fill="${c}" font-weight="600">${TYPE_NAME[n.type]} · 抉择</text>
        ${rows}
      </g>`;
    }
    return `<g class="node" data-id="${n.id}" transform="translate(${p.x},${p.y})" opacity="${n.lines.length ? 1 : 0.78}">
      <rect width="${NW}" height="56" rx="6" fill="#1c1915" fill-opacity="1" stroke="${c}" stroke-width="${isStart ? 2.5 : 1.5}" ${isBonus ? 'stroke-dasharray="6 4"' : isStart ? 'stroke-dasharray="5 3"' : ""} class="node-rect"/>
      <text x="8" y="18" font-size="14" fill="${c}" font-weight="700">${isBonus ? "✦" : icon}</text>
      <text x="27" y="17" font-size="13.5" fill="#e8d9b0" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px">${escapeXml(t1)}</text>
      ${t2 ? `<text x="27" y="32" font-size="13" fill="#e8d9b0" style="paint-order:stroke;stroke:#0e0c0a;stroke-width:3.5px">${escapeXml(t2)}</text>` : ""}
      <text x="8" y="${t2 ? 48 : 44}" font-size="10" fill="#9a8f7d">${isBonus ? "✦ " + (MECH.has(n.type) ? TYPE_NAME[n.type] : "意外收获") : TYPE_NAME[n.type]}</text>
    </g>`;
  }).join("");
  // 边路由：横/竖分类决定端口位置
  //  ——同层（next 链纵向推进）：源节点底中心 → 目标节点顶中心（"屁股"→"头"）
  //  ——跨层（横向流转）：源节点右侧中心 → 目标节点左侧中心
  //  机制节点是小圆点，没有"边"，统一用中心点
  const incMap = new Map();
  for (const x of data.edges) { if (!incMap.has(x.to)) incMap.set(x.to, []); incMap.get(x.to).push(x.from); }
  const byIdE = new Map(data.nodes.map((n) => [n.id, n]));
  const edgeSvg = data.edges.map((e) => {
    const a = L.pos.get(e.from), b = L.pos.get(e.to);
    if (!a || !b) return "";
    const fromMech = MECH.has(byIdE.get(e.from)?.type);
    const toMech = MECH.has(byIdE.get(e.to)?.type);
    const sameLayer = L.layer.get(e.from) === L.layer.get(e.to);
    const hFrom = nodeH(byIdE.get(e.from));
    const hTo = nodeH(byIdE.get(e.to));
    let x1, y1, x2, y2;
    if (sameLayer && !fromMech && !toMech) {
      // 同层竖直：源"屁股" → 目标"头"
      x1 = a.x + NW / 2;
      y1 = a.y + hFrom;
      x2 = b.x + NW / 2;
      y2 = b.y;
    } else {
      // 横向流转：右侧中心 → 左侧中心
      x1 = fromMech ? a.x + NW / 2 : a.x + NW;
      y1 = a.y + (fromMech ? 28 : hFrom / 2);
      x2 = toMech ? b.x + NW / 2 : b.x;
      y2 = b.y + (toMech ? 28 : hTo / 2);
    }
    const dash = e.kind === "choice" ? "6 4" : e.kind === "next" ? "2 3" : "";
    const col = e.kind === "choice" ? "#d99a4e" : e.kind === "win" ? "#5fa877" : e.kind === "lose" ? "#c05b4d" : "#8a7f6e";
    // 路径方向分类：同层竖直走直线；跨层走 Z 型正交（竖段在列间通道，避免长斜线穿过节点）
    let d;
    if (sameLayer && !fromMech && !toMech) {
      d = `M${x1},${y1} L${x2},${y2}`;
    } else {
      const CH = DX - NW; // 列间通道宽
      let xm;
      if (b.x >= a.x + NW) xm = b.x - CH / 2;           // 目标在右：竖段走目标列左通道
      else if (a.x >= b.x + NW) xm = a.x - CH / 2;      // 目标在左：竖段走源列左通道
      else xm = (x1 + x2) / 2;                          // 同列兜底
      d = `M${x1},${y1} L${xm},${y1} L${xm},${y2} L${x2},${y2}`;
    }
    return `<path data-from="${e.from}" data-to="${e.to}" d="${d}" fill="none" stroke="${col}" stroke-width="1.4" stroke-dasharray="${dash}" opacity="0.9"/>`;
  }).join("");
  // 图高：泳道带最底（各泳道带之和）+ 余量
  let maxColH = 0;
  for (const [l, arr] of L.byLayer.entries()) {
    let h = 84;
    for (const n of arr) h += nodeH(n) + 14;
    maxColH = Math.max(maxColH, h);
  }
  // 泳道背景带：按泳道真实 y 范围铺淡金色底（不再画左侧标签文字，保持干净）
  const laneBounds = [];
  {
    const laneCount = Math.max(0, ...L.laneOf.values()) + 1;
    for (let li = 0; li < laneCount; li++) {
      let minY = Infinity, maxY = -Infinity;
      for (const n of data.nodes) {
        if (L.laneOf.get(n.id) !== li) continue;
        const p = L.pos.get(n.id);
        if (!p) continue; // bonus 节点也计入泳道范围（保证所有节点都在泳道带内）
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y + nodeH(n));
      }
      if (minY < Infinity) laneBounds.push({ minY, maxY });
    }
  }
  const laneRanges = laneBounds.map((b) => ({ y0: b.minY - 14, y1: b.maxY + 16 }));
  // 收获节点轨道（bonus）在主列下方：每层最多 1-2 个 → 底部 +70 + 轨道高
  let bonusH = 0;
  const bonusCols = new Map();
  for (const n of data.nodes) if (L.bonus?.has(n.id)) {
    const l = L.layer.get(n.id) ?? 0;
    bonusCols.set(l, (bonusCols.get(l) ?? 0) + 1);
  }
  for (const c of bonusCols.values()) bonusH = Math.max(bonusH, c);
  // 图高：泳道带最底 + 余量（bonus 已计入 laneBounds，故不再重复加）
  const laneMaxY = Math.max(0, ...laneRanges.map((r) => r.y1));
  const H = Math.max(maxColH, laneMaxY) + 60;
  const W = (maxL + 2) * DX + 50;
  const laneSvg = laneRanges.map((r) =>
    `<rect x="0" y="${r.y0}" width="${W}" height="${r.y1 - r.y0}" fill="#d2a44f" fill-opacity="0.045"/>`
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
