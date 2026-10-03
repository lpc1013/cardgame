// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import type { CardDef, Scenario } from "../../engine/types";
import { useEffect, useRef, useState } from "react";
import { settleEmpire } from "../../engine/save";
import { SHOP_BOOSTS } from "../../data/empireShop";
import { sfx } from "../../engine/sfx";
import { cardArt } from "../art";
import { artFailToFallback } from "../cards";
import { luggageDefs, retinueDefs, endingRewardDefs, type PrepChoice } from "../shared";

export function PrepModal({ sc, onCancel, onGo }: {
  sc: Scenario; empire: ReturnType<typeof settleEmpire>;
  onCancel: () => void; onGo: (prep: PrepChoice) => void;
}) {
  const e = settleEmpire();
  const [boosts, setBoosts] = useState<string[]>([]);
  const [slots, setSlots] = useState<{ carry: string[]; retinue: string[] }>({ carry: [], retinue: [] });
  const [deckBonus, setDeckBonus] = useState<string[]>([]);
  const [peaceDeal, setPeaceDeal] = useState(false);
  const luggageItems = luggageDefs();
  const retinuePool = retinueDefs();
  const rewardPool = endingRewardDefs();
  const slotCap = 3 + e.luggageSlots; // 随身位：基础 3 格 + 商市扩容（上限 5）
  const slotsUsed = slots.carry.length + slots.retinue.length;
  const toggleBoost = (id: string) => {
    setBoosts((xs) => xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);
  };
  // 随身位物/人争位（合并 state 保证原子读最新值，防闭包竞态超格）
  // PrepModal 满员高亮：满员时不再默默 return——就地高亮已入槽可替换卡片 + 提示文案
  const [replaceHint, setReplaceHint] = useState(false);
  const replaceTimer = useRef<number | null>(null);
  const triggerReplaceHint = () => {
    setReplaceHint(true);
    if (replaceTimer.current) window.clearTimeout(replaceTimer.current);
    replaceTimer.current = window.setTimeout(() => setReplaceHint(false), 2500);
  };
  useEffect(() => () => { if (replaceTimer.current) window.clearTimeout(replaceTimer.current); }, []);
  const slotsRef = useRef(slots);
  useEffect(() => { slotsRef.current = slots; }, [slots]);
  const toggleCarry = (id: string) => {
    if (slotsRef.current.carry.includes(id)) {
      setReplaceHint(false);
      setSlots((s) => ({ ...s, carry: s.carry.filter((x) => x !== id) }));
      return;
    }
    if (slotsRef.current.carry.length + slotsRef.current.retinue.length >= slotCap) {
      triggerReplaceHint();
      return;
    }
    setSlots((s) => ({ ...s, carry: [...s.carry, id] }));
  };
  const toggleRetinue = (id: string) => {
    if (slotsRef.current.retinue.includes(id)) {
      setReplaceHint(false);
      setSlots((s) => ({ ...s, retinue: s.retinue.filter((x) => x !== id) }));
      return;
    }
    if (slotsRef.current.retinue.length + slotsRef.current.carry.length >= slotCap) {
      triggerReplaceHint();
      return;
    }
    setSlots((s) => ({ ...s, retinue: [...s.retinue, id] }));
  };
  const toggleBonus = (id: string) => {
    setDeckBonus((xs) => xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);
  };
  // 品级边框色（与 app.css 固定色板同源：凡=墨灰#6b6558，改档需两处同步）
  const RARITY_COLOR: Record<string, string> = { 凡: "#6b6558", 良: "#5b8fb8", 精: "#8b7ab8", 传: "#d2a44f", 孤品: "#e0745a" };
  const cardMeta = (id: string) => [...luggageItems, ...retinuePool, ...rewardPool].find((x) => x.id === id);
  const slotItems = [...slots.carry, ...slots.retinue].map((id) => cardMeta(id)).filter((x): x is CardDef => !!x);
  // 卡面迷你块（左池候选网格共用）
  const Mini = ({ c, sel, onToggle, badge }: { c: CardDef; sel: boolean; onToggle: () => void; badge?: string }) => (
    <button type="button" className={`prep-card ${sel ? "on" : ""}`} style={{ borderColor: RARITY_COLOR[c.rarity ?? "凡"] }} onClick={() => { sfx.choice(); onToggle(); }}>
      <span className="prep-card-art">
        {cardArt(c.id) ? <img src={cardArt(c.id)} alt={c.name} loading="lazy" onError={(e) => artFailToFallback(e, c.name)} /> : <span className="prep-card-fallback">{c.name.slice(0, 1)}</span>}
        {sel && <span className="prep-card-check">✓</span>}
        {badge && <span className="prep-card-badge">{badge}</span>}
      </span>
      <span className="prep-card-name">{c.name}</span>
    </button>
  );
  return (
    <div className="clue-overlay" onClick={onCancel}>
      <div className="bag-panel prep-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>出征 · {sc.title}</h3>
        <p className="muted">左选右槽——点卡携带，点槽取出。随身位物/人争位，共 {slotCap} 格。</p>
        <div className="prep-split">
          <div className="prep-pool">
            <div className="bag-group">
              <div className="bag-group-title">开局加成</div>
              {SHOP_BOOSTS.every((b) => !(e.boosts[b.id] ?? 0)) ? (
                <p className="muted">暂无加成——去商市用墨铤购置。</p>
              ) : (
                <div className="prep-list">
                  {SHOP_BOOSTS.filter((b) => (e.boosts[b.id] ?? 0) > 0).map((b) => (
                    <label key={b.id} className={`prep-item ${boosts.includes(b.id) ? "prep-checked" : ""}`}>
                      <input type="checkbox" checked={boosts.includes(b.id)} onChange={() => toggleBoost(b.id)} />
                      <span>{b.name} ×{e.boosts[b.id]} <span className="muted">· {b.desc}</span></span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="bag-group">
              <div className="bag-group-title">随身位候选 <span className="muted">（物/人争位 · 已用 {slotsUsed}/{slotCap}）</span></div>
              <div className="prep-sub-title">▸ 器物（行囊物品，对局内道具）</div>
              {luggageItems.length === 0 ? (
                <p className="muted">行囊中没有可携带的物品——先在剧本里获得几件物品卡。</p>
              ) : (
                <div className="prep-grid">
                  {luggageItems.map((c) => <Mini key={c.id} c={c} sel={slots.carry.includes(c.id)} onToggle={() => toggleCarry(c.id)} />)}
                </div>
              )}
              <div className="prep-sub-title">▸ 随从（斥候/内应，对局内刺探/收买）</div>
              {retinuePool.length === 0 ? (
                <p className="muted">暂无随从——黑市/暗柜雇人，或剧情收编。</p>
              ) : (
                <div className="prep-grid">
                  {retinuePool.map((c) => (
                    <Mini key={c.id} c={c} sel={slots.retinue.includes(c.id)} onToggle={() => toggleRetinue(c.id)}
                      badge={`斥${c.passive?.scout ?? 0}/内${c.passive?.insider ?? 0}${c.passive?.sharedTotal ? `共${c.passive.sharedTotal}` : ""}`} />
                  ))}
                </div>
              )}
            </div>
            <div className="bag-group">
              <div className="bag-group-title">结局奖励卡与和议</div>
              <div className="prep-sub-title">▸ 奖励卡（直接进卡组，不占随身位）</div>
              {rewardPool.length === 0 ? (
                <p className="muted">暂无奖励卡——打出特定结局即可解锁专属卡。</p>
              ) : (
                <div className="prep-grid">
                  {rewardPool.map((c) => <Mini key={c.id} c={c} sel={deckBonus.includes(c.id)} onToggle={() => toggleBonus(c.id)} badge={c.rarity ?? "凡"} />)}
                </div>
              )}
              <div className="prep-sub-title">▸ 和议之书（岁币之约 · 非「劫与烬」可用）</div>
              {e.peaceDeal && sc.id !== "jieyu" ? (
                <label className="prep-item prep-checked">
                  <input type="checkbox" checked={peaceDeal} onChange={() => setPeaceDeal(!peaceDeal)} />
                  <span>递交和议之书 <span className="muted">· 下一场战争对局免战（该局奖励归零，威望有损）</span></span>
                </label>
              ) : (
                <p className="muted">{sc.id === "jieyu" ? "劫与烬除外——大明不和亲、不赔款、不称臣。" : "商市未购「岁币之约」。"}</p>
              )}
            </div>
          </div>
          <div className="prep-slots">
            <div className="prep-slots-title">随身位 <b>{slotsUsed}/{slotCap}</b></div>
            <div className="prep-slot-grid">
              {slotItems.map((c) => (
                <button key={c.id} type="button" className={`prep-slot filled ${c.layer === "人物" ? "person" : "item"} ${replaceHint ? "fix-slot-replace" : ""}`} style={{ borderColor: RARITY_COLOR[c.rarity ?? "凡"] }} title="点击取出，腾出位置" onClick={() => { sfx.choice(); (c.layer === "人物" ? toggleRetinue : toggleCarry)(c.id); }}>
                  {cardArt(c.id) ? <img src={cardArt(c.id)} alt={c.name} onError={(e) => artFailToFallback(e, c.name)} /> : <span className="prep-card-fallback">{c.name.slice(0, 1)}</span>}
                  <span className="prep-slot-tag">{c.layer === "人物" ? "随从" : "器物"} · 点击取出</span>
                </button>
              ))}
              {Array.from({ length: Math.max(0, slotCap - slotItems.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="prep-slot empty">空</div>
              ))}
            </div>
            {replaceHint && <p className="fix-prep-full-hint">随身位已满——点选已入槽的卡片即可取出，腾出位置。</p>}
            <p className="muted">物品与人物共争这 {slotCap} 格；奖励卡不占位。</p>
          </div>
        </div>
        <div className="prep-actions">
          <button className="btn-main" onClick={() => { sfx.card(); onGo({ boosts, carry: slots.carry, retinue: slots.retinue, deckBonus, peaceDeal }); }}>开审</button>
          <button className="link-btn touch" onClick={onCancel}>再想想</button>
        </div>
      </div>
    </div>
  );
}

/** 视角选择（多视角剧本：先选定主视角才能进入，其余视角折为插叙） */
