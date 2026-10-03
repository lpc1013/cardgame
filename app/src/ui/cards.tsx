// ============================================================
// 卡面组件：CardArt / 占位 / TCard（图鉴、卡册、手牌共用的最小卡单元）/ 卡详情放大
// 2026-10-02 从 App.tsx 抽出。thumb 模式走 thumbs/ 小图，放大视图保持全尺寸。
// ============================================================
import { useState, type ReactNode } from "react";
import type { CardDef, Scenario } from "../engine/types";
import { sfx } from "../engine/sfx";
import { bonusOfCard, bonusUnlockDesc } from "../data/bonus";
import { getBonuses } from "../engine/save";
import { cardArt, cardThumbOf } from "./art";
import { RESTRAIN_UI } from "./shared";
import { LAYER_MARK, BandSeal, ThemeTag, SuitGlyph } from "./icons";

/** 气力条 */
export function CardArt({ id, name, compact }: { id: string; name: string; compact?: boolean }) {
  const src = cardArt(id);
  // U-9：加载失败（有 src 但 404/解码失败）不再 display:none 留半空白，回落占位图
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <CardArtPlaceholder name={name} compact={!!compact} />;
  return (
    <img
      className={compact ? "card-art card-art-compact" : "card-art"}
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** 美术缺失时的占位（保证卡牌可视化一致、行囊无黑底） */
export function CardArtPlaceholder({ name, compact }: { name: string; compact: boolean }) {
  const initial = (name || "?").trim().charAt(0);
  return (
    <div className={`card-art card-art-placeholder ${compact ? "card-art-compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet">
        <rect x="2" y="2" width="96" height="136" rx="3" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.35" />
        <text x="50" y="78" textAnchor="middle" fontSize="42" fontFamily="serif" fill="currentColor" opacity="0.4">{initial}</text>
        <text x="50" y="128" textAnchor="middle" fontSize="6" fill="currentColor" opacity="0.3">暂无图</text>
      </svg>
    </div>
  );
}

/** prep 系裸 <img> 解码失败时就地换首字占位（与 CardArt 的 U-9 回退策略对齐，不留破图） */
export function artFailToFallback(e: { currentTarget: HTMLImageElement }, name: string) {
  const img = e.currentTarget;
  const holder = img.parentElement;
  img.remove();
  const fb = document.createElement("span");
  fb.className = "prep-card-fallback";
  fb.textContent = (name || "?").trim().charAt(0) || "?";
  holder?.appendChild(fb);
}

/** 竖向实体卡：底层卡图 + 上卡名 + 下介绍，底色随稀有度（图鉴/背包/市集/翻牌/开包共用） */
export function TCard({ c, unknown, onClick, corner, footer, cardCls, thumb }: {
  c: CardDef; unknown?: boolean; onClick?: () => void;
  corner?: ReactNode; footer?: ReactNode; cardCls?: string;
  /** 小格模式：卡墙/格子里走 thumbs 缩略图（384px），放大视图保持全尺寸 */
  thumb?: boolean;
}) {
  const src = thumb ? cardThumbOf(c.id) : cardArt(c.id);
  const [artFailed, setArtFailed] = useState(false);
  const cls = `tcard rarity-${c.rarity ?? "凡"} ${c.suit ? `suit-${c.suit}` : ""} ${unknown ? "card-unknown" : ""} ${onClick ? "clickable" : ""} ${cardCls ?? ""}`;
  return (
    <div className={cls} onClick={onClick}>
      <div className="tcard-art">
        {unknown ? null : src && !artFailed
          ? <img src={src} alt={c.name} loading="lazy" onError={() => setArtFailed(true)} />
          : <CardArtPlaceholder name={c.name} compact />}
      </div>
      {!unknown && c.suit && <SuitGlyph suit={c.suit} />}
      {corner && <span className="tcard-corner">{corner}</span>}
      {!unknown && (() => {
        // C-3/C-5：右上角 = 「层语言」位——成术显点数（fix-corner-power），物品/人物显层徽（fix-layer-seal），资源显银锭+面额。
        // 左上角已由 .suit-glyph（花色圆章）与 .tcard-corner（在组等角标）占据，故角标置于右上，与左上级别对角呼应。
        const layer = c.layer ?? "成术";
        if (layer === "资源") return <span className="fix-layer-seal l-资源" title={`资源 · ${c.resource ?? 0} 两（不占卡组槽）`}>{LAYER_MARK["资源"]}<b>{c.resource}</b></span>;
        if (layer === "物品") return <span className="fix-layer-seal l-物品" title="物品 · 一次性道具">{LAYER_MARK["物品"]}</span>;
        if (layer === "人物") return <span className="fix-layer-seal l-人物" title="人物 · 携带被动">{LAYER_MARK["人物"]}</span>;
        return typeof c.power === "number"
          ? <span className="fix-corner-power" title={`点数 ${c.power}${c.cost ? ` · 费 ${c.cost}` : ""}`}>{c.power}</span>
          : null;
      })()}
      <div className="tcard-top">
        {!unknown && c.suit ? <BandSeal suit={c.suit} /> : null}
        <span className="tcard-name">{unknown ? "？？？" : c.name}</span>
        {!unknown ? <ThemeTag id={c.id} suit={c.suit} /> : null}
      </div>
      <div className="tcard-bottom">{unknown ? "尚未收录" : c.text}</div>
      {footer && <div className="tcard-footer">{footer}</div>}
    </div>
  );
}


/** 卡牌效果 → 结构化中文说明（详情框「作用」段） */
function effectLines(c: CardDef): string[] {
  const out: string[] = [];
  const layer = c.layer ?? "成术";
  if (layer === "成术") {
    const bits: string[] = [];
    if (c.suit) bits.push(`花色「${c.suit}」——克「${RESTRAIN_UI[c.suit]}」、被「${Object.entries(RESTRAIN_UI).find(([, v]) => v === c.suit)?.[0]}」克`);
    if (c.power !== undefined) bits.push(`点数 ${c.power}${c.suit === "势" ? "（基础点×1.5，反噬 1 气）" : ""}`);
    if (c.cost !== undefined) bits.push(`费 ${c.cost} 行动力`);
    if (c.reveal === "card") bits.push("打出后看破对手下一手（全牌）");
    else if (c.reveal === "suit") bits.push("打出后看破对手下一手（花色）");
    // F-11：机制位补全——此前情境/牺牲/抽牌/陷阱不入「作用」栏，图鉴与实现脱节
    if (c.situational) bits.push(`情境位：对手出「${c.situational.suit}」色时本张 +${c.situational.bonus}`);
    if (c.sacrifice && c.sacrifice > 0) bits.push(`牺牲：打出时自伤 ${c.sacrifice} 点、本张 +${c.sacrifice * 2}`);
    if (c.drawOnPlay && c.drawOnPlay > 0) bits.push(`抽牌：打出时抽 ${c.drawOnPlay} 张（牌库空自动洗回）`);
    if (bits.length) out.push(bits.join(" · "));
    if (c.trap) out.push(`隐色陷阱：打出即盖放（限 1 张），下一轮对手出牌时自动触发——${c.trap === "反伤" ? "所受伤害原样弹回" : c.trap === "抵消" ? "敌招作废" : "蓄锋：本张牌 +2"}`);
    if (c.text) out.push(`出牌：${c.text}`);
  } else if (layer === "物品") {
    const eff: Record<string, string> = {
      破防: "对局中使用：情绪制破防并共鸣+1；压制制直接造成 4 点伤害",
      回气: "对局中使用：恢复 3 点气力（上限内）",
      强牌: "对局中使用：下一张成术牌点数 +3（情绪制兑现为额外共鸣）",
      共鸣: "对局中使用：情绪制共鸣 +2；压制制造成 3 点伤害",
      抽牌: "对局中使用：再抽 2 张手牌（牌库空时自动洗回弃牌堆）",
      观牌: "对局中使用：看破对手下一手全牌",
      观色: "对局中使用：看破对手下一手花色",
      观点: "对局中使用：看破对手下一手点数",
    };
    if (c.itemEffect) out.push(`效果：${eff[c.itemEffect] ?? c.itemEffect}`);
    if (c.clueReveal === 1) out.push("携带入局：复盘时标出核心线索");
    else if (c.clueReveal === 2) out.push("携带入局：复盘时标出全部真线索");
    if (c.shopPeek) out.push("携带入市集：卡包页出现「先验一封」");
    if (c.text) out.push(`使用：${c.text}`);
  } else if (layer === "人物") {
    const p = c.passive;
    const bits: string[] = [];
    if (p?.bonusSuit) bits.push(`${p.bonusSuit}牌 +${p.bonusPower ?? 1}`);
    if (p?.bonusQi) bits.push(`气力上限 +${p.bonusQi}`);
    if (p?.extraDraw) bits.push(`每回合多抽 ${p.extraDraw}`);
    if (p?.peekEvery) bits.push(`每 ${p.peekEvery} 回合看破对手下一手`);
    if (p?.readScript) bits.push("第 4 回合起读透对手出牌循环");
    if (bits.length) out.push(`被动：${bits.join(" · ")}`);
    if (c.text) out.push(`携带：${c.text}`);
  } else if (layer === "资源") {
    out.push(`资源卡：翻到即入钱袋 +${c.resource} 两。`);
  }
  if (c.rarity) out.push(`稀有度：${c.rarity}（卡面底色/边框即稀有度色）`);
  return out;
}

/** 卡牌出现位置（详情框「由来」段）：全剧本扫描该卡的一切获得途径 */
function originLines(sc: Scenario, c: CardDef): string[] {
  const out: string[] = [];
  if ((sc.initialDeck ?? []).includes(c.id)) out.push("初始编组自带");
  for (const s of sc.scenes) {
    for (const e of s.effects ?? []) if (e.unlockCard === c.id) out.push(`剧情获得：《${s.title ?? s.id}》`);
    for (const ch of s.choices ?? []) {
      for (const e of ch.effects ?? []) if (e.unlockCard === c.id) out.push(`选支获得：《${s.title ?? s.id}》`);
    }
    if (s.cardPick?.options.includes(c.id)) out.push(`三选一：《${s.title ?? s.id}》`);
    if (s.shop) {
      if (s.shop.stock.includes(c.id)) out.push(`市集出售：${s.shop.name}`);
      if (s.shop.hiddenStock?.some((h) => h.id === c.id)) out.push(`暗柜出售：${s.shop.name}`);
      for (const p of s.shop.packs ?? []) if (p.pool.includes(c.id)) out.push(`卡包「${p.name}」：${s.shop.name}`);
    }
  }
  const vs = sc.viewpoints?.filter((v) => (v.initialDeck ?? []).includes(c.id));
  if (vs?.length) out.push(`视角专属起手：${vs.map((v) => v.name).join(" / ")}`);
  if (!out.length) out.push("非卖品 · 无固定获得途径（多周目探索）");
  return out;
}

/** 卡牌详情弹层：左侧大卡 + 右侧「由来 / 作用 / 卡面」详情框；点外部空白返回上一层 */
export function CardZoomView({ sc, c, seen = true, onClose }: { sc: Scenario; c: CardDef; seen?: boolean; onClose: () => void }) {
  const bonus = bonusOfCard(c.id);
  const [readBonus, setReadBonus] = useState(false);
  return (
    <div className="clue-overlay card-zoom-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="card-zoom-body" onClick={(e) => e.stopPropagation()}>
        <TCard c={c} unknown={!seen} cardCls="fix-zoom-collapsed" />
        <div className="card-detail">
          <h3 className="card-detail-name">{seen ? c.name : "？？？"}</h3>
          {!seen && (
            <>
              <div className="card-detail-tags">
                <span className="detail-tag">{c.layer ?? "成术"}</span>
              </div>
              <p className="muted detail-line">此牌尚未收录——在剧本中打出、购入或翻见后，图鉴即揭封显形。</p>
              <button className="btn-main" onClick={onClose}>收回</button>
            </>
          )}
          {seen && <>
          <div className="card-detail-tags">
            <span className="detail-tag">{c.layer ?? "成术"}</span>
            {c.suit && <span className={`detail-tag s-${c.suit}`}>{c.suit}</span>}
            {c.rarity && <span className={`detail-tag rarity-${c.rarity}`}>{c.rarity}</span>}
          </div>
          <div className="card-detail-sec">
            <div className="card-detail-sec-title">由来</div>
            {originLines(sc, c).map((l, i) => <p key={i} className="detail-line">{l}</p>)}
          </div>
          <div className="card-detail-sec">
            <div className="card-detail-sec-title">作用</div>
            {effectLines(c).map((l, i) => <p key={i} className="detail-line">{l}</p>)}
          </div>
          {c.lore && (
            <div className="card-detail-sec">
              <div className="card-detail-sec-title">卡面</div>
              <p className="detail-line detail-lore">{c.lore}</p>
            </div>
          )}
          {bonus && (
            <div className="card-detail-sec">
              <div className="card-detail-sec-title">番外</div>
              {getBonuses().includes(bonus.id) ? (
                <>
                  <p className="detail-line">「{bonus.title}」已解锁——{bonus.desc}</p>
                  <button className="link-btn" onClick={() => { sfx.choice(); setReadBonus(true); }}>展阅番外</button>
                </>
              ) : (
                <p className="detail-line muted">{bonusUnlockDesc(bonus)}</p>
              )}
            </div>
          )}
          <button className="btn-main" onClick={onClose}>收回</button>
          </>}
        </div>
      </div>
      {readBonus && bonus && (
        <div className="clue-overlay bonus-read" onClick={() => setReadBonus(false)}>
          <div className="bag-panel bonus-read-panel" onClick={(e) => e.stopPropagation()}>
            <h3>番外 · {bonus.title}</h3>
            <p className="muted">{bonus.desc}</p>
            <div className="bonus-lines">
              {bonus.lines.map((l, i) => <p key={i} className="detail-line">{l}</p>)}
            </div>
            <button className="btn-main" onClick={() => setReadBonus(false)}>合卷</button>
          </div>
        </div>
      )}
    </div>
  );
}

