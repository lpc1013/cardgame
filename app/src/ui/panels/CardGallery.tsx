// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { getCardSeen } from "../../engine/save";
import type { CardDef, Scenario } from "../../engine/types";
import { useState } from "react";
import { sfx } from "../../engine/sfx";
import { TCard, CardZoomView } from "../cards";

export function CardGallery({ sc, onClose }: { sc: Scenario; onClose: () => void }) {
  const seen = new Set(getCardSeen()[sc.id] ?? []);
  // 点卡放大展阅：卡名被遮挡时点开看全，未收录的卡同样可点（仍是？？？样式）
  const [zoom, setZoom] = useState<CardDef | null>(null);
  // 资源卡翻到即折银、永不入袋：不计收集、不入图鉴（分母与分子口径一致）
  const groups: { key: string; label: string }[] = [
    { key: "成术", label: "成术卡" }, { key: "物品", label: "物品卡" },
    { key: "人物", label: "人物卡" },
  ];
  const collectible = sc.cards.filter((c) => (c.layer ?? "成术") !== "资源");
  const collected = collectible.filter((c) => seen.has(c.id)).length;
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel" onClick={(e) => e.stopPropagation()}>
        <h3>{sc.title} · 卡牌图鉴</h3>
        <p className="muted">已收录 {collected}/{collectible.length} 张（资源卡折银，不计收集）</p>
        {groups.map((g) => {
          const ids = sc.cards.filter((c) => (c.layer ?? "成术") === g.key);
          if (!ids.length) return null;
          return (
            <div key={g.key} className="bag-group">
              <div className="bag-group-title">{g.label}</div>
              <div className="bag-grid">
                {ids.map((c) => (
                  <TCard key={c.id} c={c} thumb unknown={!seen.has(c.id)} onClick={() => { sfx.choice(); setZoom(c); }} />
                ))}
              </div>
            </div>
          );
        })}
        <button className="btn-main" onClick={onClose}>合上图鉴</button>
        <span className="muted" style={{ marginLeft: 12 }}>非卖品孤品 {collectible.filter(c => c.rarity === "孤品" && seen.has(c.id)).length}/{collectible.filter(c => c.rarity === "孤品").length} 张现世</span>
      </div>
      {zoom && (
        <CardZoomView sc={sc} c={zoom} seen={seen.has(zoom.id)} onClose={() => setZoom(null)} />
      )}
    </div>
  );
}

/** 可携带出战：物品 / 结局奖励 / 随从（斥候·内应）——卡册徽记与行囊准入同一条规则 */
/** 卡册分组（性能）：memo 隔离——开缩放、翻其他组时未变的组整组跳过调和，
 *  345 张卡的面板从「任何一次点击都重排全墙」变成只动shell和被点的那组 */
