// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { getGlobalCard } from "../../engine/save";
import type { Scenario } from "../../engine/types";
import type { RunState } from "../../engine/runtime";
import { useEffect, useRef, useState } from "react";
import { cardCost } from "../../engine/duel";
import { sfx } from "../../engine/sfx";
import { TCard } from "../cards";

export function BagView({ sc, st, onClose, onMutate, toast, readOnly }: {
  sc: Scenario; st: RunState; onClose: () => void; onMutate: (s: RunState) => void; toast: (m: string) => void; readOnly: boolean;
}) {
  const limit = sc.deckLimit ?? 12;
  const def = (id: string) => sc.cards.find((c) => c.id === id) ?? getGlobalCard(id);
  // M-2：编组反馈闭环——入组角标 150ms scale pulse；卡组满时目标卡 shake 抖动 + toast
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [shakeId, setShakeId] = useState<string | null>(null);
  const pulseTimer = useRef<number | null>(null);
  const shakeTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
  }, []);
  const toggleDeck = (id: string) => {
    if (readOnly) return;
    // F-6：资源卡不占卡组槽——获得即折银，永不在编组内
    if (layerName(id) === "资源") { toast("资源卡不占卡组槽——翻到即折银入袋"); return; }
    const next = { ...st, deck: [...st.deck], bag: [...st.bag] };
    if (next.deck.includes(id)) {
      next.deck = next.deck.filter((c) => c !== id);
      sfx.card();
      onMutate(next);
      return;
    }
    if (next.deck.length >= limit) {
      setShakeId(id);
      if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShakeId(null), 450);
      toast(`卡组已满（${limit} 张）`);
      return;
    }
    next.deck.push(id);
    sfx.card();
    onMutate(next);
    setPulseId(id);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulseId(null), 150);
  };
  const layerName = (id: string) => def(id)?.layer ?? "成术";
  const groups: { key: string; label: string }[] = [
    { key: "成术", label: "成术卡" }, { key: "物品", label: "物品卡" },
    { key: "人物", label: "人物卡" }, { key: "资源", label: "资源卡" },
  ];
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel" onClick={(e) => e.stopPropagation()}>
        <h3>背包 · 编组（卡组 {st.deck.length}/{limit}，资源卡不占槽）</h3>
        <p className="muted">{readOnly ? "（当前只读）" : "点击卡片上/下卡组；对局只能使用卡组中的牌"}</p>
        {groups.map((g) => {
          const ids = st.bag.filter((id) => layerName(id) === g.key);
          if (!ids.length) return null;
          return (
            <div key={g.key} className="bag-group">
              <div className="bag-group-title">{g.label}</div>
              <div className="bag-grid">
                {ids.map((id) => {
                  const c = def(id)!;
                  const on = st.deck.includes(id);
                  return (
                    <TCard
                      key={id}
                      c={c}
                      thumb
                      cardCls={shakeId === id ? "fix-shake" : undefined}
                      onClick={() => toggleDeck(id)}
                      corner={on ? <span className={`deck-tag${pulseId === id ? " fix-pulse" : ""}`}>在组</span> : undefined}
                      footer={
                        <>
                          {c.power !== undefined && <span className="pc-power">点 {c.power} · 费 {c.cost ?? cardCost(c)}</span>}
                        </>
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        <button className="btn-main" onClick={onClose}>合上背包</button>
      </div>
    </div>
  );
}

// ============================================================
// 市集：买卡 / 卖卡 / 卡包 / 编组
// ============================================================
/** 随从卡判据（入册/出册同一把尺）：带斥候或内应被动的人物卡——判据本体在 ui/shared.isRetinueCard */
