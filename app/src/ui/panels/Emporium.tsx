// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { INK_PER_ENDING, buyLuggageSlot, buyPeaceDeal, exchangeSilver, gainBoost, settleEmpire, setTheme as saveTheme, spendInk, unlockTheme } from "../../engine/save";
import type { CardDef, Scenario } from "../../engine/types";
import { useState } from "react";
import { ACHIEVEMENTS } from "../../data/achievements";
import { SHOP_BOOSTS, SHOP_THEMES } from "../../data/empireShop";
import { SCENARIOS } from "../../data/scenarios";
import { sfx } from "../../engine/sfx";
import { achArt } from "../art";
import { CardArt, CardZoomView } from "../cards";
import { IngotIcon, SuitGlyph, CardBand, ThemeSwatch } from "../icons";
import { luggageDefs, endingRewardDefs } from "../shared";

export function EmporiumPanel({ onClose, toast, onTheme }: { onClose: () => void; toast: (m: string) => void; onTheme: () => void }) {
  const [, setTick] = useState(0);
  const e = settleEmpire();
  const buyBoost = (b: { id: string; name: string; price: number }) => {
    if (!spendInk(b.price)) { toast("墨铤不足"); return; }
    gainBoost(b.id);
    sfx.card();
    toast(`已购「${b.name}」，出征时勾选生效`);
    setTick((t) => t + 1);
  };
  const applyTheme = (id: string) => { saveTheme(id); setTick((t) => t + 1); onTheme(); };
  const buyTheme = (t: { id: string; name: string; price: number }) => {
    if (!spendInk(t.price)) { toast("墨铤不足"); return; }
    unlockTheme(t.id);
    applyTheme(t.id);
    sfx.card();
    toast(`已解锁并换装「${t.name}」`);
  };
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel emporium" onClick={(ev) => ev.stopPropagation()}>
        <h3>帝国商市 <span className="ink-chip"><IngotIcon /> 墨铤 {e.ink}</span></h3>
        <p className="muted">解锁结局可获墨铤（每个 {INK_PER_ENDING}）。开局加成出征时勾选，用过即消耗。</p>
        <div className="bag-group">
          <div className="bag-group-title">开局加成</div>
          <div className="emporia-grid">
            {SHOP_BOOSTS.map((b) => (
              <div key={b.id} className="emporia-item">
                <div className="emporia-name">{b.name} {e.boosts[b.id] ? <span className="deck-tag">×{e.boosts[b.id]}</span> : null}</div>
                <div className="emporia-desc">{b.desc}</div>
                <button className="emporia-buy" onClick={() => buyGuard(() => buyBoost(b))} disabled={e.ink < b.price}>购 · {b.price} 墨铤</button>
              </div>
            ))}
          </div>
        </div>
        <div className="bag-group">
          <div className="bag-group-title">主题外观</div>
          <div className="emporia-grid">
            {/* 老存档可能穿着已下线的主题：那种情况实际渲染的就是默认皮肤，
                所以"当前"要按"不在白名单里"判定，而不是死看 e.theme === "" */}
            <div className={`emporia-item theme-card ${e.theme === "" || !SHOP_THEMES.some((t) => t.id === e.theme) ? "on" : ""}`}>
              <ThemeSwatch id="" />
              <div className="emporia-name">朝堂宣纸 {(e.theme === "" || !SHOP_THEMES.some((t) => t.id === e.theme)) && <span className="deck-tag">当前</span>}</div>
              <div className="emporia-desc">默认配色，宣纸内容面配大漆木框</div>
              <button className="emporia-buy" onClick={() => { applyTheme(""); sfx.card(); }}>换装</button>
            </div>
            {SHOP_THEMES.map((t) => {
              const owned = e.themes.includes(t.id);
              return (
                <div key={t.id} className={`emporia-item theme-card ${e.theme === t.id ? "on" : ""}`}>
                  <ThemeSwatch id={t.id} />
                  <div className="emporia-name">{t.name} {e.theme === t.id && <span className="deck-tag">当前</span>}</div>
                  <div className="emporia-desc">{t.desc}</div>
                  {owned ? (
                    <button className="emporia-buy" onClick={() => { applyTheme(t.id); sfx.card(); }}>换装</button>
                  ) : (
                    <button className="emporia-buy" onClick={() => buyGuard(() => buyTheme(t))} disabled={e.ink < t.price}>购 · {t.price} 墨铤</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="bag-group">
          <div className="bag-group-title">战略重器 · 岁币之约</div>
          <div className="emporia-item">
            <div className="emporia-name">岁币之约 {e.peaceDeal && <span className="deck-tag">已持</span>}</div>
            <div className="emporia-desc">一车银锭推到营门前，对面的刀就放下了。出征时勾选「递交和议之书」，本剧下一场战争对局免战——但该局奖励归零，威望有损。</div>
            {e.warLoses.length === 0 ? (
              <p className="muted" style={{ marginTop: 6 }}>战争失败一次后解锁——兵败了，才谈和。</p>
            ) : e.peaceDeal ? (
              <p className="muted" style={{ marginTop: 6 }}>已购入。出征准备时勾选生效。</p>
            ) : (
              <button className="emporia-buy" onClick={() => buyGuard(() => { if (!buyPeaceDeal()) { toast("墨铤不足（60）"); return; } sfx.card(); setTick((t) => t + 1); toast("购入「岁币之约」——银两能买的太平，也是太平。"); })} disabled={e.ink < 60}>购 · 60 墨铤</button>
            )}
            <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>※ 剧本「劫与烬」除外——大明不和亲、不赔款、不称臣。</p>
          </div>
        </div>
        <div className="bag-group">
          <div className="bag-group-title">随身扩容 · 银两兑换</div>
          <div className="emporia-item">
            <div className="emporia-name">随身位 +1 {e.luggageSlots > 0 && <span className="deck-tag">已扩 {e.luggageSlots} 次（共 {3 + e.luggageSlots} 格）</span>}</div>
            <div className="emporia-desc">永久扩容一格随身位（物品/随从共用）。位子永远不够——多一格，多一分选择。</div>
            {e.luggageSlots >= 2 ? (
              <p className="muted" style={{ marginTop: 6 }}>已扩至上限（5 格）。</p>
            ) : (
              <button className="emporia-buy" onClick={() => buyGuard(() => { if (!buyLuggageSlot()) { toast(e.ink < 300 ? "墨铤不足（300）" : "已扩至上限"); return; } sfx.card(); setTick((t) => t + 1); toast("随身位 +1——位子多了，能带的也多了。"); })} disabled={e.ink < 300}>扩位 · 300 墨铤</button>
            )}
          </div>
          <div className="emporia-item">
            <div className="emporia-name">银两储备 {e.spareSilver > 0 && <span className="deck-tag">存 {e.spareSilver} 两</span>}</div>
            <div className="emporia-desc">墨铤 1:1 兑换银两，出征时注入剧本（消耗制）。办案没钱，寸步难行。</div>
            <button className="emporia-buy" onClick={() => buyGuard(() => { const n = 10; if (!exchangeSilver(n)) { toast("墨铤不足"); return; } sfx.card(); setTick((t) => t + 1); toast(`兑换 ${n} 两入储备——开审即入账。`); })} disabled={e.ink < 10}>兑 10 两 · 10 墨铤</button>
          </div>
        </div>
        {e.titles.length > 0 && (
          <div className="bag-group">
            <div className="bag-group-title">称号（成就授予，展示用）</div>
            <div className="emporia-grid">
              {e.titles.map((t) => {
                // 称号不另产图：授予它的那条成就已有官定图标（如「不忘旧部」← 民助城防），
                // 直接复用同一张，免得同一个意思在库里长出两幅互相对不上的画
                const art = achArt(ACHIEVEMENTS.find((a) => a.reward?.includes(`称号「${t}」`))?.id ?? "");
                return (
                  <div key={t} className="emporia-item title-item">
                    {art && <img className="title-icon" src={art} alt="" />}
                    <div className="emporia-name">「{t}」</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <button className="btn-main" onClick={onClose}>离市</button>
      </div>
    </div>
  );
}

/** 行囊：已获得物品卡的自动收藏，出征时可勾选携带 */
/** 行囊跨剧本仓库：查一张全局物品卡所属的剧本（用于详情框「由来/作用」扫描） */
function scForZoom(c: CardDef): Scenario {
  return SCENARIOS.find((s) => s.cards.some((x) => x.id === c.id)) ?? SCENARIOS[0]!;
}

export function LuggagePanel({ onClose }: { onClose: () => void }) {
  // 行囊 = 各剧本获得的物品卡（随身位）+ 结局奖励卡（进卡组，不占随身位）
  const defs = [...luggageDefs(), ...endingRewardDefs()];
  const [zoom, setZoom] = useState<CardDef | null>(null);
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>行囊</h3>
        <p className="muted">物品卡（随身位）与结局奖励卡（进卡组）自动收入此处；出征新剧本时可勾选携带。点卡可展阅。</p>
        {defs.length === 0 ? (
          <p className="muted" style={{ padding: "24px 0" }}>行囊空空——先去剧本里攒几件趁手家伙。</p>
        ) : (
          <div className="bag-group">
            <div className="bag-group-title">在囊（{defs.length}）{endingRewardDefs().length > 0 && <span className="muted">· 含 {endingRewardDefs().length} 张结局奖励</span>}</div>
            <div className="bag-grid">
              {defs.map((c) => (
                <div key={c.id} className={`bag-card bag-item rarity-${c.rarity ?? "凡"} ${c.suit ? `suit-${c.suit}` : ""}`} onClick={() => { sfx.choice(); setZoom(c); }}>
                  {c.suit && <SuitGlyph suit={c.suit} />}
                  <div className="card-artwrap">
                    <CardArt id={c.id} name={c.name} compact />
                    <CardBand c={c} />
                  </div>
                  <div className="pc-text">{c.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <button className="btn-main" onClick={onClose}>合上行囊</button>
      </div>
      {zoom && (
        <CardZoomView sc={scForZoom(zoom)} c={zoom} seen onClose={() => setZoom(null)} />
      )}
    </div>
  );
}

/** 图鉴集合：结局图鉴（可点入详情）+ 各剧本卡牌图鉴入口 */

let _lastBuyAt = 0;
function buyGuard(fn: () => void): void {
  const now = Date.now();
  if (now - _lastBuyAt < 600) return;
  _lastBuyAt = now;
  fn();
}
