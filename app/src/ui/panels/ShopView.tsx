// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { addRetinue, canAddRetinue, removeRetinue } from "../../engine/save";
import type { Scenario } from "../../engine/types";
import type { RunState } from "../../engine/runtime";
import { SicboPanel } from "./SicboPanel";
import { isRetinueCard } from "../shared";
import { BagView } from "./BagView";
import { useState } from "react";
import { sfx } from "../../engine/sfx";
import { TCard } from "../cards";

export function ShopView({ sc, st, shop, onLeave, onSync, toast }: {
  sc: Scenario; st: RunState; shop: NonNullable<Scenario["scenes"][number]["shop"]>;
  onLeave: (s: RunState) => void;
  /** M8（审计 P0-1）：市集每笔成交即时回写全局 RunState——旧「离市才落账」让刷新一键撤销赌坊亏损。
   *  调用方（App）除 setSt 外还同步 flush 存档：local 只是渲染镜像，真账在 st + localStorage */
  onSync: (s: RunState) => void;
  toast: (m: string) => void;
}) {
  // M9.5（P0-2 遗留）：旧写法只克隆 bag/deck，retinue/flags/boosts 等仍与全局 st 共享引用——
  // 任何就地 push 都会绕过 onSync 偷写全局。整体 structuredClone，local 与 st 从此彻底两本账
  const [local, setLocalState] = useState<RunState>(() => structuredClone(st));
  const setLocal = (next: RunState) => { setLocalState(next); onSync(next); };
  const [opened, setOpened] = useState<{ ids: string[]; dup: Set<string> } | null>(null);
  const [tab, setTab] = useState<"buy" | "pack" | "deck" | "dice">("buy");
  const def = (id: string) => sc.cards.find((c) => c.id === id);
  const limit = sc.deckLimit ?? 12;
  // 钥匙卡：被剧情选项条件（card/notCard）引用的卡，卖出会永久关闭分支 → 禁卖
  const keyIds = new Set<string>();
  for (const s of sc.scenes) {
    for (const c of s.choices ?? []) {
      if (c.cond?.card) keyIds.add(c.cond.card);
      if (c.cond?.notCard) keyIds.add(c.cond.notCard);
    }
  }

  const buy = (id: string, priceOverride?: number) => {
    const c = def(id);
    if (!c) return;
    if (c.price === 0) { toast("此物非卖——人情不以银钱论"); return; }
    const price = priceOverride ?? c.price ?? 10;
    if (local.silver < price) { toast("银两不足"); return; }
    if (local.bag.includes(id)) { toast("已有此卡"); return; }
    // F-6：资源卡即银两面额——买入直接折银，不入袋不入组
    if ((c.layer ?? "成术") === "资源") {
      const net = (c.resource ?? 0) - price;
      setLocal({ ...local, silver: local.silver + net });
      sfx.coin();
      toast(net >= 0 ? `「${c.name}」兑成现银（+${net} 两）` : `购得「${c.name}」（${net} 两）`);
      return;
    }
    // 随从卡（斥候/内应被动的人物卡）购买后入帝国随从池（全局 ≤3，供跨剧本出征携带）
    const isRetinue = isRetinueCard(c);
    // M8（审计 P0-2）：先查册再花钱——旧序是银货两讫后才被告知满员退不掉
    if (isRetinue && !canAddRetinue(id)) { toast("随从册已满员（最多 3 人）——先辞退一人，再来买。"); return; }
    const next = { ...local, silver: local.silver - price, bag: [...local.bag, id], deck: local.deck.length < limit ? [...local.deck, id] : local.deck };
    // 落册是这笔买卖的权威裁决（addRetinue 自行拒绝满员）：先落册、后扣银，落册不成一分不花。
    // 反过来写就会留下「银已扣、人未入册」的半笔账——册与银必须同一提交点（审计 P0-2）
    if (isRetinue && !addRetinue(id)) { toast("随从册已满员（最多 3 人）——先辞退一人，再来买。"); return; }
    sfx.card();
    setLocal(next);
    if (isRetinue) toast(`购得「${c.name}」（-${price} 两），已入随从册（跨剧本可携带）`);
    else toast(`购得「${c.name}」（-${price} 两）`);
  };
  const sell = (id: string) => {
    const c = def(id);
    if (!c) return;
    if (keyIds.has(id)) { toast("案关要物，不可发卖——卖了，前头的路就断了。"); return; }
    if (c.price === 0) { toast("此物非卖，亦不可售。"); return; }
    const isRetinue = isRetinueCard(c);
    // M8（审计 P0-2）：随从卡出手即出册——银两收回去了，人不能再白留着。
    // 采「出册」而非「禁卖已入册者」：货架对已持有的卡一律亮卖出按钮、买侧文案也写着「先辞退一人，
    // 再来买」，禁卖会与既有 UI 语义自相矛盾。销账先于收钱，两笔同一同步任务落盘（随 P0-1 写穿）
    if (isRetinue) removeRetinue(id);
    const gain = Math.floor((c.price ?? 10) / 2);
    const next = { ...local, silver: local.silver + gain, bag: local.bag.filter((x) => x !== id), deck: local.deck.filter((x) => x !== id), retinue: local.retinue.filter((x) => x !== id) };
    sfx.choice();
    setLocal(next);
    toast(isRetinue ? `卖出「${c.name}」（+${gain} 两），随从同时辞出册` : `卖出「${c.name}」（+${gain} 两）`);
  };
  /** M8（审计 P2-4）：试珠验出的结果被锁定——「先验一封」与随后开包各摇各的，等于给玩家假样本诱导消费 */
  const [peeked, setPeeked] = useState<Record<string, string[]>>({});
  const openPack = (packId: string) => {
    const p = shop.packs?.find((x) => x.id === packId);
    if (!p) return;
    if (local.silver < p.price) { toast("银两不足"); return; }
    const plan = peeked[packId];
    if (plan) setPeeked((m) => { const n = { ...m }; delete n[packId]; return n; });
    const got: string[] = [];
    const dup = new Set<string>();
    const next = { ...local, silver: local.silver - p.price, bag: [...local.bag], deck: [...local.deck] };
    for (let i = 0; i < p.draws; i++) {
      const id = (plan && plan[i]) ?? p.pool[Math.floor(Math.random() * p.pool.length)]!;
      const c = def(id);
      if (c?.resource) next.silver += c.resource;
      else if (!next.bag.includes(id)) { next.bag.push(id); if (next.deck.length < limit) next.deck.push(id); }
      else {
        dup.add(id); // M8（审计 P2-3）：重复卡不再白吞——按售价半价折银
        next.silver += Math.floor((c?.price ?? 10) / 2);
      }
      got.push(id);
    }
    sfx.win();
    setLocal(next);
    setOpened({ ids: got, dup });
  };
  /** 琉璃试珠：先验一封（只展示开出结果，不动银两/背包；看完再决定买不买——所见即所得） */
  const canPeek = local.bag.some((id) => def(id)?.shopPeek);
  const peekPack = (packId: string) => {
    const p = shop.packs?.find((x) => x.id === packId);
    if (!p) return;
    const got: string[] = [];
    const dup = new Set<string>();
    for (let i = 0; i < p.draws; i++) {
      const id = p.pool[Math.floor(Math.random() * p.pool.length)]!;
      got.push(id);
      if (local.bag.includes(id)) dup.add(id);
    }
    sfx.card();
    setPeeked((m) => ({ ...m, [packId]: got }));
    setOpened({ ids: got, dup });
    toast("琉璃试珠验了一封——这一封的结果已替你定下，买它就开出这些。");
  };
  /** 暗柜（隐藏货架）：持有账房先生等密钥才陈列 */
  const hidden = (shop.hiddenStock ?? []).filter((h) =>
    (!h.needCard || local.bag.includes(h.needCard)) &&
    (!h.needSilver || local.silver >= h.needSilver)
  );

  return (
    <div className="shop-root">
      <div className="shop-header">
        <h2>{shop.name}</h2>
        <span className="chip-silver stat-chip">银 {local.silver} 两</span>
        <div className="shop-tabs">
          {(["buy", "pack", "deck", "dice"] as const).map((t) => (
            <button key={t} className={`shop-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
              {t === "buy" ? "货架" : t === "pack" ? "卡包" : t === "deck" ? "编组" : "赌坊"}
            </button>
          ))}
        </div>
        <button className="btn-main" onClick={() => { setOpened(null); onLeave(local); }}>离市</button>
      </div>
      {shop.desc && <p className="muted shop-desc">{shop.desc}</p>}

      {opened && (
        <div className="pick-root overlay-mini">
          <h3>卡包开出</h3>
          <div className="pick-row">
            {opened.ids.map((id, i) => {
              const c = def(id);
              if (!c) return null;
              return (
                <TCard
                  key={i}
                  c={c}
                  corner={opened.dup.has(id) ? <span className="rarity-tag corner-owned">已有 · 不入袋</span> : undefined}
                  footer={<span className="pc-layer">{c.layer ?? "成术"}{c.resource ? ` · +${c.resource} 两` : ""}</span>}
                />
              );
            })}
          </div>
          <button className="link-btn" onClick={() => setOpened(null)}>收起</button>
        </div>
      )}

      {tab === "buy" && (
        <div className="shop-grid">
          {shop.stock.map((id) => {
            const c = def(id);
            if (!c) return null;
            const owned = local.bag.includes(id);
            return (
              <TCard
                key={id}
                c={c}
                thumb
                corner={owned ? <span className="rarity-tag corner-owned">已有</span> : undefined}
                footer={
                  <div className="shop-actions">
                    {/* 只标数字银两：买不起=置灰，已有=角标提示 */}
                    <button className="btn-main" disabled={owned || c.price === 0 || local.silver < (c.price ?? 10)} onClick={() => buy(id)}>
                      {c.price === 0 ? "非卖" : `${c.price ?? 10} 两`}
                    </button>
                    {owned && (keyIds.has(id) ? (
                      <span className="link-btn sell-locked" title="剧情钥匙卡：卖出会永久关闭分支，不可发卖">案证</span>
                    ) : c.price === 0 ? (
                      <span className="link-btn sell-locked" title="非卖之物，不可发卖">非卖</span>
                    ) : (
                      <button className="link-btn" onClick={() => sell(id)}>{Math.floor((c.price ?? 10) / 2)} 两</button>
                    ))}
                  </div>
                }
              />
            );
          })}
          {hidden.length > 0 && (
            <div className="shop-hidden">
              <div className="shop-hidden-title">暗柜 · 好货不上明面</div>
              <div className="shop-grid">
                {hidden.map((h) => {
                  const c = def(h.id);
                  if (!c) return null;
                  const owned = local.bag.includes(h.id);
                  const price = h.price ?? c.price ?? 10;
                  return (
                    <TCard
                      key={h.id}
                      c={c}
                      thumb
                      corner={owned ? <span className="rarity-tag corner-owned">已有</span> : undefined}
                      footer={
                        <div className="shop-actions">
                          <button className="btn-main" disabled={owned || c.price === 0 || local.silver < price} onClick={() => buy(h.id, price)}>
                            {c.price === 0 ? "非卖" : `${price} 两`}
                          </button>
                          {owned && (
                            <span className="link-btn sell-locked" title="暗柜之物，不可发卖">暗柜</span>
                          )}
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "pack" && (
        <div className="shop-grid">
          {shop.packs?.map((p) => (
            <div key={p.id} className="shop-card">
              <div className="bag-card-name">{p.name}</div>
              <div className="pc-text">随机 {p.draws} 张，出自 {p.pool.length} 种卡池。</div>
              <button className="btn-main" disabled={local.silver < p.price} onClick={() => openPack(p.id)}>{p.price} 两</button>
              {canPeek && <button className="link-btn" onClick={() => peekPack(p.id)}>先验一封（白看）</button>}
            </div>
          ))}
          {!shop.packs?.length && <p className="muted">此处没有卡包出售。</p>}
        </div>
      )}

      {tab === "dice" && <SicboPanel silver={local.silver} onSilver={(delta, msg) => {
        const next = { ...local, silver: Math.max(0, local.silver + delta) };
        setLocal(next);
        toast(msg);
      }} />}

      {tab === "deck" && (
        <BagView sc={sc} st={local} onClose={() => setTab("buy")} onMutate={setLocal} toast={toast} readOnly={false} />
      )}
    </div>
  );
}

// ============================================================
// 对局视图（v2：手牌 / 行动力 / 道具 / 被动；classic：原样）
// ============================================================
