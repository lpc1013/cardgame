// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { getCardSeen } from "../../engine/save";
import type { CardDef, Scenario, Suit } from "../../engine/types";
import { memo, useCallback, useMemo, useState } from "react";
import { SCENARIOS } from "../../data/scenarios";
import { sfx } from "../../engine/sfx";
import { TCard, CardZoomView } from "../cards";

function carryable(c: CardDef, seen: boolean): boolean {
  return seen && ((c.layer ?? "成术") === "物品" || !!c.endingReward || ((c.passive?.scout ?? 0) > 0 || (c.passive?.insider ?? 0) > 0));
}
const EMPTY_SEEN: string[] = [];

/** 卡册某组的列卡（花色 × 只看缺卡两道筛，资源卡不入册）——组渲染与面板计数共用一份逻辑 */
function albumCols(s: Scenario, seenIds: string[] | undefined, suitF: "全部" | Suit, missingOnly: boolean): CardDef[] {
  const seen = new Set(seenIds ?? []);
  return s.cards.filter((c) =>
    (c.layer ?? "成术") !== "资源"
    && (suitF === "全部" || c.suit === suitF)
    && (!missingOnly || !seen.has(c.id)));
}

const AlbumGroup = memo(function AlbumGroup({ s, seenIds, folded, suitF, missingOnly, onOpen, onToggle }: {
  s: Scenario; seenIds: string[]; folded: boolean; suitF: "全部" | Suit; missingOnly: boolean;
  onOpen: (s: Scenario, c: CardDef, seen: boolean) => void; onToggle: (id: string) => void;
}) {
  const seen = new Set(seenIds);
  const cols = albumCols(s, seenIds, suitF, missingOnly);
  if (!cols.length) return null;
  const gotN = cols.filter((c) => seen.has(c.id)).length;
  return (
    <div className="bag-group">
      <div className="bag-group-title" onClick={() => { sfx.choice(); onToggle(s.id); }}>
        {/* M-1：折叠态 chevron——展开朝下（rotate(-90°)），折叠朝右 */}
        <span className={`fix-group-fold${folded ? " folded" : ""}`} aria-hidden="true">▸</span>
        {s.title}<span className="muted">（{gotN}/{cols.length}）</span>
      </div>
      {!folded && (
        <div className="bag-grid">
          {cols.map((c) => {
            const isSeen = seen.has(c.id);
            return (
              <div key={c.id} className="album-cell">
                <TCard c={c} thumb unknown={!isSeen} onClick={() => { sfx.choice(); onOpen(s, c, isSeen); }} />
                {carryable(c, isSeen) && <span className="album-carry" title="可携带出战">可携带</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

/** 天下卡册：全部剧本全部卡的三态总览（未见？？？ / 已见 / 已得·可携带） */
export function AlbumPanel({ onClose }: { onClose: () => void }) {
  // 收录名单在面板开着时不会被写入（recordCardsSeen 只在对局/剧情里发生），
  // 挂载时读一次拿稳身份——每渲染重解 JSON 会让下面的 memo 全部失效
  const seenMap = useMemo(() => getCardSeen(), []);
  const [zoom, setZoom] = useState<{ sc: Scenario; c: CardDef; seen: boolean } | null>(null);
  // 稳定回调：memo 组的 props 不随面板重渲染漂移（否则 memo 形同虚设）
  const openCard = useCallback((s: Scenario, c: CardDef, seen: boolean) => { setZoom({ sc: s, c, seen }); }, []);
  const toggleGroup = useCallback((id: string) => {
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const [suitF, setSuitF] = useState<"全部" | Suit>("全部");
  const [scF, setScF] = useState<string>("全部");
  // M-1b：只看缺卡——过滤掉已见卡，聚焦收集缺口
  const [missingOnly, setMissingOnly] = useState(false);
  // M-1 卡册懒展开：组头可点击折叠（剧本 id 集合），默认全展开保 UX
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  let total = 0, got = 0;
  for (const s of SCENARIOS) {
    for (const c of s.cards) {
      if ((c.layer ?? "成术") === "资源") continue;
      total++;
      if ((seenMap[s.id] ?? []).includes(c.id)) got++;
    }
  }
  // M-1b 筛选：花色行（第一行常驻）× 剧本下拉 × 只看缺卡（AND）
  const shownSc = scF === "全部" ? SCENARIOS : SCENARIOS.filter((s) => s.id === scF);
  let shownTotal = 0, shownGot = 0;
  for (const s of shownSc) {
    for (const c of albumCols(s, seenMap[s.id], suitF, missingOnly)) {
      shownTotal++;
      if ((seenMap[s.id] ?? []).includes(c.id)) shownGot++;
    }
  }
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel gallery-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>天下卡册 · 全册 {got}/{total} <span className="muted">（当前 {shownGot}/{shownTotal}）</span></h3>
        <p className="muted">未见=？？？ · 已见=亮起 · 「可携带」=入行囊/卡组（物品与结局奖励卡、随从）</p>
        <div className="album-filters fix-album-filters">
          {/* M-1b：花色升为第一行常驻（5 chip）；chip 选中态统一填充色板底 + 深色字（fix-chip-solid 由 CSS 接管） */}
          <div className="album-filter-row fix-album-row-suit">
            <span className="album-filter-label">花色</span>
            <div className="album-chips">
              {(["全部", "策", "器", "势", "隐"] as const).map((s) => (
                <button key={s} className={`album-chip ${suitF === s ? "on fix-chip-solid" : ""} ${s !== "全部" ? `s-${s}` : ""}`} onClick={() => { sfx.choice(); setSuitF(s); }}>{s === "全部" ? "全部" : s}</button>
              ))}
            </div>
          </div>
          {/* M-1b：剧本筛选降为下拉选择器（取代 13 chip 横滑溢出） */}
          <div className="album-filter-row fix-album-row-sc">
            <span className="album-filter-label">剧本</span>
            <select className="album-select fix-album-select" value={scF} onChange={(e) => { sfx.choice(); setScF(e.target.value); }}>
              <option value="全部">全部剧本</option>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <label className="album-missing fix-album-missing">
              <input type="checkbox" checked={missingOnly} onChange={() => { sfx.choice(); setMissingOnly(!missingOnly); }} />
              只看缺卡
            </label>
          </div>
        </div>
        {shownSc.map((s) => (
          <AlbumGroup key={s.id} s={s} seenIds={seenMap[s.id] ?? EMPTY_SEEN} folded={collapsed.has(s.id)}
            suitF={suitF} missingOnly={missingOnly} onOpen={openCard} onToggle={toggleGroup} />
        ))}
        {shownTotal === 0 && <p className="muted" style={{ padding: "16px 0" }}>此筛选下暂无卡牌。</p>}
        <button className="btn-main" onClick={onClose}>合上卡册</button>
      </div>
      {zoom && <CardZoomView sc={zoom.sc} c={zoom.c} seen={zoom.seen} onClose={() => setZoom(null)} />}
    </div>
  );
}

/** 成就面板：跨周目硬性挑战（奖励不产卡，走墨铤/称号/边框） */
