// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { bumpCounter, getGlobalCard } from "../../engine/save";
import type { CardDef, Scenario, Suit } from "../../engine/types";
import type { DuelState } from "../../engine/duel";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { revealEmotion, playEmotion, playPressure, endTurn, readEmotion, chargeUp, breakMove, cardCost, duelSpend, respondOpponent, passResponse, forfeitDuel, dmgRoom, ITEM_YANLI_COST, EMOTION_FREE_PLAYS, DEFAULT_GOAL } from "../../engine/duel";
import { sfx } from "../../engine/sfx";
import { opponentArt, sceneArt } from "../art";
import { CardArt } from "../cards";
import { SuitSeal, QiBar, SuitGlyph, CardBand } from "../icons";
import { RESTRAIN_UI, RESTRAINED_BY } from "../shared";

export function DuelView({ sc, duel, setDuel, toast, silver, wager, onWager, wagersLeft }: {
  sc: Scenario; duel: DuelState; setDuel: (d: DuelState) => void; toast: (m: string) => void;
  silver: number;
  wager: number; onWager: (n: number) => void;
  /** M1 押注风控：本周目剩余押注次数 */
  wagersLeft: number;
}) {
  const cardOfOpt = (id: string): CardDef | undefined =>
    sc.cards.find((x) => x.id === id) ?? duel.cfg.oppCards?.find((x) => x.id === id) ?? getGlobalCard(id);
  const cardOf = (id: string): CardDef => {
    const c = cardOfOpt(id);
    if (!c) throw new Error(`卡牌不存在: ${id}（对局 ${duel.cfg.id}）`);
    return c;
  };

  const gambit = !!duel.cfg.gambit;
  const v2 = duel.rules === "v2";
  /** M2 交替回合：phased=真回合结构；inOppTurn=对手回合（等待我方应手）；light=轻回合（classic 压制局） */
  const phased = (duel.turnSchema ?? "legacy") === "phased";
  const inOppTurn = phased && duel.phase === "oppTurn";
  const light = !!duel.light;
  /** W-2：言力预算（情绪制）——另一 agent 注入 DuelState.yanli/yanliMax；字段不存在（undefined）则隐藏不报错 */
  const duelExtra = duel as DuelState & { yanli?: number; yanliMax?: number };
  // 牌桌要"看得见"的两样：这一幕的场景底，和对手的立绘（缺图则席上落一枚朱印，不是空槽）
  const duelScene = sceneArt(sc.id, sc.scenes.find((s) => s.duel === duel.cfg.id)?.id ?? "");
  const oppArt = opponentArt(duel.cfg.id);
  // 弃牌堆顶那张的花色：数组下标在 noUncheckedIndexedAccess 下是 string | undefined，先收口
  const discardTopId = duel.discard[duel.discard.length - 1];
  const discardTopSuit = discardTopId ? cardOfOpt(discardTopId)?.suit : undefined;
  /** 本回合敌方招式（script 循环）；v2 博弈局展示层藏牌，引擎结算仍用真招 */
  const oppIdOf = (d: DuelState) => d.cfg.script[d.round % d.cfg.script.length] ?? d.cfg.script[0]!;

  // ---- 藏牌与洞察（案件模式 v2 压制制对手出牌默认不可见） ----
  const caseMode = sc.mode === "case";
  const oppSee = duel.cfg.seeOpp ?? (caseMode && v2 && duel.mode === "pressure" ? "hidden" : "open");
  const oppHidden = oppSee === "hidden";
  /** P0-4（第四轮审计）战报「他打出」一行的遮蔽闸：三把尺取并——
   *  ① duel.redactLog：引擎 pushLog 罩 duel.log 用的就是它，同口径才不打架；
   *  ② oppHidden：由 cfg 现算，不信存档里可被改写的布尔字段；
   *  ③ v2 博弈局：下一手本应▓▓▓，结算后外泄真名等于白送洞察。
   *  任一为真即隐去对手真名与点数，否则几回合内即可从战报反推整条 script 循环，
   *  M3 反背板与观牌经济全部作废 */
  const oppPlayHidden = !!duel.redactLog || oppHidden || (v2 && gambit);
  /** 洞察·道具/诈问揭示粒度（seeNext） */
  const seeLevel: "none" | "suit" | "card" | "power" = duel.seeNext ?? "none";
  /** 洞察·青眼被动：每 N 回合瞥见（第 N、2N…回合自动揭示下一手） */
  const peekEvery = (duel.passives ?? []).reduce((s, p) => s || (p.peek ?? 0), 0);
  const peekHit = peekEvery > 0 && duel.round > 0 && duel.round % peekEvery === 0;
  /** 洞察·内廷耳报：第 4 回合起读切忌 script 循环（记忆外置） */
  const scanOn = (duel.passives ?? []).some((p) => p.scan);
  /** 当前可知粒度：道具/诈问 > 青眼被动 */
  const knownLevel: "none" | "suit" | "card" | "power" = seeLevel !== "none" ? seeLevel : peekHit ? "card" : "none";
  const oppNext = duel.mode === "pressure" ? cardOfOpt(oppIdOf(duel)) ?? null : null;
  const knownSuit = knownLevel !== "none" ? (oppNext?.suit ?? null) : null;

  const moodText = useMemo(() => {
    if (duel.mode !== "emotion" || !duel.opponentShown) return null;
    const mood: Record<string, string> = {
      策: "他目光闪动，话里藏着机锋，像在盘算什么。",
      器: "他摩挲着手边一件物事，话里尽是实打实的好处。",
      势: "他往椅背上一靠，气派先压了人半截。",
      隐: "他垂着眼，语焉不详——有些事，只能意会，不可明言。",
    };
    return mood[duel.opponentShown];
  }, [duel.mode, duel.opponentShown]);

  // M5 对手小动作：情绪制每一手他在做什么（纯质感层，随对局与回合确定性取词——他的"回合"看得见）
  /** M6 预演用：解析人物被动对该花色的加成（只读，与引擎 suitBonus 同口径） */
  const suitBonusOf = (d: DuelState, c: CardDef): number => {
    if (!c.suit) return 0;
    return (d.passives ?? []).filter((pp) => pp.suit === c.suit).reduce((s, pp) => s + pp.power, 0);
  };

  const oppActionText = useMemo(() => {
    if (duel.mode !== "emotion" || duel.finished) return null;
    let h = 5381;
    const s = duel.cfg.id + "@" + duel.round;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
    const acts = [
      "他呷了口茶，慢慢开口——轮到你接了。",
      "他指节在案上敲了两下，眼睛望着你。",
      "他笑了一声，话锋忽然一转。",
      "他沉默片刻，目光在你脸上停了停。",
      "他往椅背上一靠，抱起了手臂。",
      "他抬手止住话头，先问了一句闲话。",
    ];
    return acts[h % acts.length]!;
  }, [duel.mode, duel.finished, duel.cfg.id, duel.round]);

  const passiveText = duel.passives.length
    ? duel.passives.map((p) => `${p.suit ? `${p.suit}牌+${p.power}` : ""}${p.qi ? ` 气力上限+${p.qi}` : ""}${p.draw ? ` 多抽${p.draw}` : ""}`.trim()).join("；")
    : null;

  const clickCard = (id: string) => {
    if (duel.finished) return;
    sfx.card();
    const card = cardOf(id);
    // 先深拷贝再交引擎 mutate：根治 in-place mutate + 浅拷贝反模式（memo/并发渲染隐患）
    const d = structuredClone(duel);
    if (d.mode === "emotion") {
      if (!d.opponentShown) return;
      // M1：观X/揭底物品在情绪局无消费路径（引擎已拒绝），提前给出人话提示
      if ((card.layer ?? "成术") === "物品" && (card.itemEffect === "观牌" || card.itemEffect === "观色" || card.itemEffect === "观点" || card.itemEffect === "揭底")) {
        toast("对谈局里，这件观牌物件派不上用场——留着压制局再用。");
        return;
      }
      // M9（审计 P0-3）：物品同样耗言力——按强度定价，付不起先拒用（引擎同口径，零副作用）
      if ((card.layer ?? "成术") === "物品" && card.itemEffect && typeof d.yanli === "number" && d.yanli < ITEM_YANLI_COST[card.itemEffect]) {
        toast(`「${card.name}」这一手要使 ${ITEM_YANLI_COST[card.itemEffect]} 点言力才做得实——你话已穷了。`);
        return;
      }
      // M7（审计 P2）：言力耗尽的失败必须报真因，不再错挂「人物卡是被动」
      if (typeof d.yanli === "number" && (card.layer ?? "成术") === "成术" && d.round >= EMOTION_FREE_PLAYS && d.yanli <= 0) {
        toast("言力已尽，成术接不上了——看看物品牌，或拱手退让。");
        return;
      }
      if ((card.layer ?? "成术") === "人物") { toast("人物卡是被动，不能打出"); return; }
      const ok = playEmotion(d, card);
      if (!ok) { toast("此刻打不出这张牌"); return; }
      const kind = d.lastResult?.kind;
      if (kind === "match") sfx.match();
      else if (kind === "press" || kind === "item") sfx.press();
      else if (kind === "miss") sfx.miss();
      else if (kind === "win") sfx.win();
      else if (kind === "lose") sfx.lose();
      if (d.finished !== "win") revealEmotion(d);
    } else if (inOppTurn) {
      // M2：对手回合——从手牌/整副选一张「应手」接他的主攻（守方+1）
      if ((card.layer ?? "成术") !== "成术" || card.trap) { toast("物品与陷阱牌做不得应手——出一招成术接他。"); return; }
      const ok = respondOpponent(d, card, cardOf);
      if (!ok) { toast("此刻接不下这一手"); return; }
      if (d.finished) (d.finished === "win" ? sfx.win : sfx.lose)();
      else sfx.press();
    } else {
      const oppId = d.cfg.script[d.round % d.cfg.script.length] ?? d.cfg.script[0]!;
      const ok = playPressure(d, card, oppId, cardOf);
      if (!ok) {
        // M7（审计 P2）：报真因——旧实现统一「行动力不足」，掩盖陷阱占位与对手回合门控
        if ((card.layer ?? "成术") === "人物") toast("人物卡是被动，不能打出");
        else if (card.trap && duel.trap) toast("案上已经扣着一张牌了——只能盖一张。");
        else if (inOppTurn) toast("他招式已出——先接这一手，或【硬接不接】");
        else toast("行动力不足——【换气】另起一回合");
        return;
      }
      // 盖放陷阱计数（刚盖未触发的回合）；F-7：触发单独计数（盖放 ≠ 触发——陷阱大师按触发算）
      if (!duel.trap && d.trap) bumpCounter("traps");
      if (duel.trap && !d.trap && d.lastPlay?.playerCard) bumpCounter("trap_triggers");
      if (d.finished) (d.finished === "win" ? sfx.win : sfx.lose)();
      else sfx.press();
    }
    setDuel(d);
  };

  const doEndTurn = () => {
    sfx.choice();
    const d = structuredClone(duel);
    endTurn(d);
    setDuel(d);
  };

  // ---- M7 逃生口（审计 P0-3：死锁必须给出路，且只在全然无解时露出） ----
  const doPass = () => {
    sfx.choice();
    const d = structuredClone(duel);
    if (!passResponse(d, cardOf)) { toast("此刻不必硬接"); return; }
    if (d.finished) (d.finished === "win" ? sfx.win : sfx.lose)();
    else sfx.press();
    setDuel(d);
  };
  const doForfeit = () => {
    sfx.choice();
    const d = structuredClone(duel);
    if (!forfeitDuel(d)) return;
    sfx.lose();
    setDuel(d);
  };

  // ---- 博弈动作（仅 gambit 局） ----
  const doRead = () => {
    sfx.choice();
    const d = structuredClone(duel);
    if (!readEmotion(d)) { toast("言力已尽，读不动牌了"); return; }
    setDuel(d);
  };
  const doCharge = () => {
    sfx.choice();
    const d = structuredClone(duel);
    if (!chargeUp(d, oppIdOf(d), cardOf)) { toast(v2 ? "行动力不足" : "蓄力已满（上限 2 层）"); return; }
    bumpCounter("charges");
    if (d.finished) sfx.lose();
    setDuel(d);
  };
  const doBreak = (suit: Suit) => {
    sfx.choice();
    const d = structuredClone(duel);
    if (!breakMove(d, suit, oppIdOf(d), cardOf)) { toast(v2 ? "行动力不足或已破过招" : "已宣过招了"); return; }
    bumpCounter("breaks");
    if (d.finished) sfx.lose();
    setDuel(d);
  };

  // ---- 随从动作（刺探/收买，压制制；须携带斥候/内应随从，只消耗次数不耗银两） ----
  const doSpend = (kind: "scout" | "insider" | "scoutTrap") => {
    const d = structuredClone(duel);
    const r = duelSpend(d, kind);
    if (!r.ok) { toast(r.log ?? "无法行动"); return; }
    sfx.choice();
    if (r.log) toast(r.log);
    bumpCounter(kind === "scout" ? "scouts" : "insiders");
    setDuel(d);
  };

  const handIds = v2 ? duel.hand : duel.cfg.deck;
  // M7（审计 P0-3）：绝境逃生口——情绪制言力耗尽/牌库尽，或对手主攻时手里没有能接的成术，才递上「退让/硬接」按钮
  const emotionStuck = duel.mode === "emotion" && !duel.finished
    && ((typeof duelExtra.yanli === "number" && duel.round >= EMOTION_FREE_PLAYS && duelExtra.yanli <= 0)
      || (v2 && duel.hand.length === 0 && duel.library.length === 0 && duel.discard.length === 0));
  const canRespondNow = handIds.some((id) => { const c = cardOfOpt(id); return !!c && (c.layer ?? "成术") === "成术" && !c.trap; });
  const oppTurnStuck = inOppTurn && !duel.finished && duel.oppIntent?.kind === "attack" && !canRespondNow;
  /** 押注窗口：仅开局未出手时可押；选过「不押」后不再追问；M1：每周目限 3 次 */
  const [wagerDismissed, setWagerDismissed] = useState(false);
  const wagerOpen = gambit && !duel.finished && !wagerDismissed && wager === 0 && duel.round === 0 && !duel.lastResult && wagersLeft > 0;
  /** W-6：押注档位随身家浮动——10%/25%/50%，取整到 5 两；F-17：不足 5 两的档位直接不渲染（旧实现渲染成「0 两（不足）」死按钮） */
  const wagerTiers: { pct: number; n: number; ok: boolean }[] = [0.1, 0.25, 0.5]
    .map((pct) => {
      const n = Math.floor((silver * pct) / 5) * 5;
      return { pct, n, ok: n >= 5 };
    })
    .filter(({ n }) => n >= 5);

  // 手牌两段式（截断文看全再出牌）：点卡先弹起选中，全文/逸闻/比点预演钉在牌门上方的详情条里；
  // 再点同一张才真正打出。桌面鼠标悬浮即时预览（只看不选）；手机横屏上滑仍一键直接出（老手感保留）。
  const [raisedId, setRaisedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const swipeYRef = useRef<number | null>(null);
  // M7（审计 P1-13）：上滑出牌后浏览器仍可能补发 click——同卡 350ms 内的二次触发直接吞掉，防一手两出
  const lastPlayRef = useRef<{ id: string; t: number } | null>(null);
  const guardedClick = (id: string) => {
    const t = Date.now();
    const last = lastPlayRef.current;
    if (last && last.id === id && t - last.t < 350) return;
    lastPlayRef.current = { id, t };
    clickCard(id);
  };
  const lastLogRef = useRef<string | null>(null);
  useEffect(() => {
    // 手牌变化（出牌/补牌）后顶卡失效则复位
    if (raisedId && !handIds.includes(raisedId)) setRaisedId(null);
    // F-2：仅在结算文案更新时把舞台滚到底——旧实现每次渲染无条件滚底，
    // 把「所求·X」情绪横幅 / 对手情报 /【换气】挤出可视区（桌面手牌两行挤压舞台时全盲）
    const t = duel.lastResult?.text ?? null;
    if (t !== lastLogRef.current) {
      lastLogRef.current = t;
      const el = stageRef.current;
      if (el && el.scrollHeight > el.clientHeight + 24) el.scrollTop = el.scrollHeight;
    }
  });

  // M6 结算预演：对手下一手可知（明牌/已洞察）时给出比点预告（引擎为准，此处只读展示）——
  // 手牌角标与详情条共用同一函数，两处口径不会分叉
  const previewOf = (id: string): string | null => {
    if (duel.finished || duel.mode !== "pressure" || !oppNext) return null;
    const show = !oppHidden || knownLevel === "card";
    if (!show) return null;
    const c = cardOfOpt(id);
    if (!c || (c.layer ?? "成术") !== "成术" || c.trap) return null;
    const base = (c.power ?? 1) + suitBonusOf(duel, c);
    let edge = 0;
    if (c.suit && oppNext.suit) {
      if (RESTRAIN_UI[c.suit] === oppNext.suit) edge = 1;
      else if (RESTRAIN_UI[oppNext.suit] === c.suit) edge = -1;
    }
    const situ = c.situational && oppNext.suit === c.situational.suit ? c.situational.bonus : 0;
    // 敌招作废：内应收买（两分支通用）；破招宣言——phased 押其主攻（只在应手兑现），legacy 押下一手
    const oppDead = duel.insiderActive || (!!duel.foresuit && duel.foresuit === oppNext.suit && (!phased || inOppTurn));
    if (inOppTurn) {
      // 引擎口径（resolveOppAttack）：守方+1、势按基础点×1.5；不引强牌/蓄力/牺牲/招式用老
      const p = (c.suit === "势" ? Math.floor(base * 1.5) : base) + 1 + edge + situ;
      const o = oppDead ? 0 : (oppNext.power ?? 1) + (duel.oppCharge ?? 0) * 2;
      // M8（审计 P2-1）：轻回合免 AP 的破招押空额外赔 1 点，三种结果都要如实报
      const gambleMiss = !!duel.breakGamble && !!duel.foresuit && !!oppNext.suit && duel.foresuit !== oppNext.suit;
      if (p > o) return `≈反伤他${Math.min(Math.max(1, Math.floor((p - o) / 2)), dmgRoom(duel))}${gambleMiss ? "·破招押空你-1" : ""}`;
      if (o > p) return `≈挡不住（你-${Math.min(o - p, 6) + (gambleMiss ? 1 : 0)}）`;
      return `≈平（各-1${gambleMiss ? "，押空再-1" : ""}）`;
    }
    let p = base + duel.buffPower + duel.charge * 2 + edge + situ;
    if (c.sacrifice) p += c.sacrifice * 2;
    if (duel.lastCardId === c.id) p -= 2;
    if (c.suit === "势") p = Math.floor(base * 1.5) + (p - base);
    if (light) p += 1;
    if (phased && duel.oppForesuit && c.suit === duel.oppForesuit) p = 0;
    const o = oppDead ? 0 : oppNext.power ?? 1;
    if (p > o) return `≈伤他${Math.min(p - o, dmgRoom(duel))}`;
    if (o > p) return `≈你损${Math.min(o - p, 6)}`;
    return "≈平（各-1）";
  };

  return (
    <div className="duel-root">
      {duelScene && <img className="duel-backdrop" src={duelScene} alt="" aria-hidden="true" />}
      <div className="duel-header">
        <div className="duel-title">{duel.cfg.title}{gambit && <span className="gambit-tag">博弈局</span>}</div>
        <div className="muted">{v2 ? "【v2 手牌制】" : "【经典制】"}{passiveText ? ` · 携带被动：${passiveText}` : ""}</div>
        {wagerOpen && silver > 0 && (
          <div className="wager-bar">
            <span className="st-label">押注此局？胜得两倍，败失本金</span>
            {wagerTiers.map(({ pct, n }) => (
              <button key={pct} className="wager-btn" onClick={() => { sfx.coin(); onWager(n); toast(`押下 ${n} 两——此局胜则连彩头入账 ${Math.round(n * 1.6)} 两`); }}>{n} 两</button>
            ))}
            <span className="fix-wager-note muted">档位随身家浮动</span>
            <button className="wager-btn skip" onClick={() => { sfx.choice(); setWagerDismissed(true); }}>不押</button>
          </div>
        )}
        {wager > 0 && <div className="wager-on muted">已押 {wager} 两 · 胜入 {Math.round(wager * 1.6)} 两</div>}
      </div>

      {/* ── 案面 ──：对面是他，中间是刚交完的那一手，这边是你。
          此前这三样摊在标题下的一行小字和一栏滚动文字里——牌桌有牌、有规则，就是没有"桌"。
          整块是一块大漆岛，自带 --ink/--gold/--line（见 app.css .dt-table），不跟皮肤翻。 */}
      <div className="dt-table">
        <div className="dt-opp">
          <div className="dt-seat">
            {oppArt
              ? <img className="dt-seat-img" src={oppArt} alt={duel.cfg.opponent.name} />
              : <span className="dt-seat-seal" aria-hidden="true">{(duel.cfg.opponent.name || "?").slice(0, 1)}</span>}
            <span className="dt-seat-name">{duel.cfg.opponent.name}</span>
          </div>
          <div className="dt-seat-mid">
            <div className="dt-seat-desc">{duel.cfg.opponent.desc}</div>
            <div className="dt-bars">
              {duel.mode === "emotion" ? (
                <>
                  <span><span className="st-label">共鸣</span>
                    <span className="rapport-dots">
                      {Array.from({ length: duel.cfg.goal ?? DEFAULT_GOAL }, (_, i) => (
                        <i key={i} className={i < duel.rapport ? "on" : ""} />
                      ))}
                    </span>
                  </span>
                  <span><span className="st-label">防备</span>{duel.guard}</span>
                  {typeof duelExtra.yanliMax === "number" && (
                    <span><span className="st-label">言力</span>{duelExtra.yanli}/{duelExtra.yanliMax}</span>
                  )}
                </>
              ) : (
                <>
                  <span><span className="st-label">他气力</span><QiBar cur={duel.hpOpponent} max={duel.cfg.hp?.opponent ?? 10} foe /></span>
                  {v2 && <span><span className="st-label">蓄势</span>{duel.charge > 0 ? `${duel.charge} 层` : "无"}</span>}
                  {(duel.oppCharge ?? 0) > 0 && <span className="trap-on"><span className="st-label">他蓄势</span>{duel.oppCharge} 层</span>}
                </>
              )}
              {duel.mode === "pressure" && duel.oppForesuit && (
                <span className="trap-on"><span className="st-label">他宣言</span>你必出「{duel.oppForesuit}」</span>
              )}
            </div>
          </div>
          <div className={`dt-placard${duel.opponentShown ? " shown" : ""}`}>
            {duel.opponentShown ? (
              <>
                <SuitSeal suit={duel.opponentShown} />
                <span className="dt-placard-label">{inOppTurn ? "他主攻" : "他亮出的手段"}</span>
                {duel.bluffed && <span className="dt-bluff">虚张？</span>}
              </>
            ) : (
              <>
                <span className="dt-placard-back" aria-hidden="true" />
                <span className="dt-placard-label">待他亮牌</span>
              </>
            )}
          </div>
        </div>

        {phased && duel.mode === "pressure" && (
          <div className="dt-turn">{inOppTurn ? "—— 他的回合 ——" : "—— 你的回合 ——"}</div>
        )}

        {/* 交锋带：上一步双方实际打出的两张牌面对面摆开，中间是判定。
            引擎一直存着 lastPlay，此前只把结果写成一句话，案面上看不见交手。 */}
        {duel.lastPlay && (duel.lastPlay.playerCard || duel.lastPlay.oppCard) ? (
          <div className={`dt-clash${duel.lastPlay.stale ? " stale" : ""}`}>
            <span className="dt-clash-side">
              <span className="dt-clash-who">你</span>
              {duel.lastPlay.playerCard ? (
                <>
                  <SuitSeal suit={duel.lastPlay.playerCard.suit} />
                  <em>{duel.lastPlay.playerCard.name}</em>
                </>
              ) : <em className="dim">未出牌</em>}
            </span>
            <span className={`dt-clash-verdict ${duel.lastResult?.kind ?? ""}`}>
              {duel.lastResult?.kind === "match" ? "共鸣" : duel.lastResult?.kind === "press" ? "破防"
                : duel.lastResult?.kind === "miss" ? "失言" : duel.lastResult?.kind === "item" ? "用物"
                  : duel.lastResult?.kind === "gambit" ? "博弈" : duel.lastPlay.to === "o" ? "伤他"
                    : duel.lastPlay.to === "p" ? "你损" : "平"}
              {duel.lastPlay.damage > 0 && <b>{duel.lastPlay.damage}</b>}
              {duel.lastPlay.trapNote && <i className="dt-clash-trap">{duel.lastPlay.trapNote}</i>}
            </span>
            <span className="dt-clash-side">
              {duel.lastPlay.oppCard ? (
                <>
                  {/* 与战报同一把遮蔽闸：观牌没买到、又该隐名时，牌名和点数都不能从案面上漏出去 */}
                  <em>{(oppPlayHidden && !duel.lastPlay.oppSeen) ? "▓▓" : duel.lastPlay.oppCard.name}</em>
                  <SuitSeal suit={(oppPlayHidden && !duel.lastPlay.oppSeen) ? "隐" : duel.lastPlay.oppCard.suit ?? "隐"} />
                </>
              ) : duel.lastPlay.oppSuit ? (
                <>
                  <em>所求 · {duel.lastPlay.oppSuit}</em>
                  <SuitSeal suit={duel.lastPlay.oppSuit} />
                </>
              ) : <em className="dim">未出牌</em>}
              <span className="dt-clash-who">他</span>
            </span>
          </div>
        ) : (
          <div className="dt-clash idle">
            <span className="dt-clash-note">{duel.finished ? "案上已无动静" : inOppTurn ? "他出手了——从手牌挑一张接招" : "案上未有一牌——请出手"}</span>
          </div>
        )}

        <div className="dt-me">
          <div className="dt-seat">
            <span className="dt-seat-seal me" aria-hidden="true">我</span>
            <span className="dt-seat-name">你</span>
          </div>
          <div className="dt-seat-mid">
            <div className="dt-bars">
              <span><span className="st-label">{duel.mode === "emotion" ? "气力" : "我气力"}</span>
                <QiBar cur={duel.mode === "emotion" ? duel.qi : duel.hpPlayer}
                  max={duel.mode === "emotion" ? (duel.qiMax ?? 10) : (duel.hpMax ?? (duel.cfg.hp?.player ?? 10))} />
              </span>
              {v2 && duel.mode === "pressure" && <span><span className="st-label">行动力</span>{duel.ap}</span>}
              {v2 && <span><span className="st-label">手牌</span>{duel.hand.length}</span>}
            </div>
            {/* 我方意图：宣言、盖牌、内应——它们描述的是你下一步要干什么，该贴着手牌这一侧 */}
            <div className="dt-intent">
              {duel.mode === "pressure" && duel.foresuit && (
                <span><span className="st-label">破招宣言</span>{inOppTurn ? "其主攻" : "敌出"}「{duel.foresuit}」</span>
              )}
              {duel.mode === "pressure" && duel.trap && (
                <span className="trap-on"><span className="st-label">盖牌</span>「{duel.trap.name}」扣在案上（{duel.trap.effect}）</span>
              )}
              {duel.mode === "pressure" && duel.insiderActive && (
                <span className="trap-on"><span className="st-label">内应</span>已买通——他下一招作废</span>
              )}
              {wager > 0 && <span><span className="st-label">押</span>{wager} 两 · 胜入 {Math.round(wager * 1.6)} 两</span>}
            </div>
          </div>
          {v2 && (
            <div className="dt-stacks">
              <span className="dt-stack dt-lib" title="牌库"><b>{duel.library.length}</b><i>牌库</i></span>
              <span className="dt-stack dt-discard" title="弃牌堆">
                {discardTopSuit && <SuitSeal suit={discardTopSuit} />}
                <b>{duel.discard.length}</b><i>弃牌</i>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="duel-stage" ref={stageRef}>
        {duel.mode === "emotion" && duel.opponentShown && (
          <div className={`mood-banner`} style={{ borderLeftColor: `var(--suit-${duel.opponentShown === "策" ? "ce" : duel.opponentShown === "器" ? "qi" : duel.opponentShown === "势" ? "shi" : "yin"})` }}>
            <SuitSeal suit={duel.opponentShown} />
            <span className={`mood-suit-name s-${duel.opponentShown}`}>所求 · {duel.opponentShown}</span>
            {moodText && <p className="opp-line">{moodText}</p>}
          </div>
        )}
        {duel.mode === "emotion" && !duel.opponentShown && moodText && <p className="opp-line">{moodText}</p>}
        {duel.mode === "emotion" && oppActionText && !duel.finished && <p className="opp-line opp-action">{oppActionText}</p>}
        {duel.mode === "pressure" && !v2 && !phased && (
          <p className="dt-hint">对手蓄势待发……出牌比点，点高者伤敌；势牌基础点数×1.5（反噬自身一点气力）；单次点差至多伤 6。</p>
        )}
        {duel.mode === "pressure" && light && (
          <p className="dt-hint">轻回合：每回合你可走一个主行动（出牌 / 蓄势 / 破招 / 盖放），随后对手行动。你的主攻享先手 +1；他主攻时你选牌「应手」，守方 +1、反击差值减半；单次点差至多伤 6。</p>
        )}
        {inOppTurn && duel.oppIntent?.kind === "attack" && (
          <p className="opp-line opp-attack-turn">
            他抢攻了——<b>从手牌选一张「应手」接招（守方 +1）</b>。
            <span className="edge-hint">应手不引发挥牌位与蓄力；盖放中的陷阱会在这一刻发动。</span>
          </p>
        )}
        {v2 && duel.mode === "pressure" && !oppHidden && !gambit && oppNext && (
          <p className="opp-line">
            对手下一手：「{oppNext.name}」
            <SuitSeal suit={oppNext.suit} />
            <span className="edge-hint">出「{RESTRAINED_BY[oppNext.suit ?? "策"]}」牌可克敌（+1）；每牌耗 1 行动力，行动力尽可【换气】。</span>
          </p>
        )}
        {v2 && duel.mode === "pressure" && oppHidden && (
          <p className={`opp-line ${knownLevel !== "none" ? "peek-line" : ""}`}>
            {knownLevel === "none" && (
              <>
                对手藏住了下一手▓▓▓——他眼底有诈，凭你的眼力去猜。
                <span className="edge-hint">市集里的观牌物件、老刑名的眼力、或一句诈问，都能看破他；看破后【破招】必中。</span>
              </>
            )}
            {knownLevel === "suit" && (
              <>
                〔洞察〕他下一手的路数是<span className={`s-${knownSuit}`}>「{knownSuit}」</span>。
                <span className="edge-hint">已【破招】宣言此色则这招作废；出「{RESTRAINED_BY[knownSuit ?? "策"]}」牌可克敌（+1）。</span>
              </>
            )}
            {knownLevel === "card" && oppNext && (
              <>
                〔洞察〕他下一手：「{oppNext.name}」
                <SuitSeal suit={oppNext.suit} />（点数 {oppNext.power}）
                <span className="edge-hint">出「{RESTRAINED_BY[oppNext.suit ?? "策"]}」牌可克敌（+1）。</span>
              </>
            )}
            {knownLevel === "power" && oppNext && (
              <>
                〔洞察〕他下一手的劲道约为{oppNext.power}点，花色不明。
                <span className="edge-hint">够不够换血，你心里有数。</span>
              </>
            )}
          </p>
        )}
        {scanOn && duel.round >= 4 && duel.mode === "pressure" && (
          <p className="opp-line scan-hint">
            <span className="fix-term-tip" title="耳报：携带「读悉」被动的人物卡，第 4 回合起读透对手出牌循环">〔耳报〕</span>他的路数你已摸透：{duel.cfg.script.map((id) => cardOfOpt(id)?.suit ?? "▓").join("→")}——眼下这一手是「{oppNext?.suit ?? "▓"}」。
          </p>
        )}
        {v2 && duel.mode === "pressure" && gambit && !oppHidden && (
          <p className="opp-line">
            对手藏住了下一手▓▓▓——他眼底有诈，凭你的眼力去猜。
            <span className="edge-hint">【破招】可宣言敌招花色，押中则该招作废；【蓄势】缓一手，下张牌更狠。</span>
          </p>
        )}
        {duel.mode === "emotion" && gambit && duel.opponentShown && (
          <p className="opp-line gambit-hint">这局他嘴上未必老实——亮出的色三成是虚张，且未必是老式反色（反着出也要赌，撞枪口气力-2）；拿不准时，【读牌】验一验（言力-1）。</p>
        )}
        {phased && duel.oppTrap && !duel.seeTrap && (
          <p className="opp-line trap-on">他袖手一掩，案下似有异动——你的下一手主攻可能撞上暗算。出张废牌喂掉它，或【刺探·案下】、【揭底】破之。</p>
        )}
        {phased && duel.oppTrap && duel.seeTrap && (
          <p className="opp-line trap-on peek-line">〔刺探〕他的暗算：「{duel.oppTrap.name}」（{duel.oppTrap.effect}）——下一手主攻若撞上便落空。出张废牌喂掉它，或用【揭底】拆了。</p>
        )}
        {gambit && !duel.finished && (
          <div className="gambit-bar">
            {duel.mode === "emotion" ? (
              <button className="gambit-btn" disabled={!duel.opponentShown || (duelExtra.yanli ?? 0) <= 0} onClick={doRead}>
                {/* M5.2：读牌改价言力——虚张不可反推后它是唯一可靠验色手段 */}
                {(duelExtra.yanli ?? 0) <= 0 ? "读牌（言力已尽——只能凭眼力赌了）" : "读牌（言力-1，验其虚实）"}
              </button>
            ) : (
              <>
                <button className="gambit-btn" disabled={inOppTurn || duel.charge >= 2 || (v2 && duel.ap < 1)} onClick={doCharge}>蓄势{duel.charge > 0 && `（${duel.charge}层）`}（下张+2/层{light ? "，交先手" : v2 ? "，耗1行动力" : "，硬接敌一招"}）</button>
                {(["策", "器", "势", "隐"] as const).map((s) => (
                  <button key={s} className={`gambit-btn break-${s} ${knownSuit === s ? "peek-hit" : ""}`} disabled={inOppTurn || !!duel.foresuit || (v2 && duel.ap < 1)} onClick={() => doBreak(s)}>{inOppTurn ? "" : "破"}「{s}」{phased && !inOppTurn ? "（宣言其主攻）" : ""}</button>
                ))}
              </>
            )}
          </div>
        )}
        {duel.mode === "pressure" && !duel.finished && duel.retinueNames.length > 0 && (
          <div className="gambit-bar retinue-bar">
            <span className="retinue-tag" title="随从：斥候看破敌手，内应买通敌阵">
              {duel.retinueNames.join("、")}
            </span>
            {phased && <>
              <button className="gambit-btn" disabled={inOppTurn || duel.scoutLeft <= 0} onClick={() => doSpend("scout")}>刺探·下一手（余 {duel.scoutLeft}）</button>
              <button className="gambit-btn" disabled={inOppTurn || duel.scoutLeft <= 0} onClick={() => doSpend("scoutTrap")}>刺探·案下暗算（余 {duel.scoutLeft}）</button>
            </>}
            {!phased && <button className="gambit-btn" disabled={inOppTurn || duel.scoutLeft <= 0} onClick={() => doSpend("scout")}>刺探（余 {duel.scoutLeft} 次）</button>}
            <button className="gambit-btn" disabled={inOppTurn || duel.insiderLeft <= 0} onClick={() => doSpend("insider")}>收买（余 {duel.insiderLeft} 次）</button>
            {duel.sharedTotal > 0 && <span className="muted">随从合计还可动用 {Math.max(0, duel.sharedTotal - duel.sharedUsed)} 次</span>}
          </div>
        )}
        {duel.log && duel.log.length > 0 && (
          <details className="duel-history">
            <summary>战报（近 {duel.log.length} 手）</summary>
            {duel.log.map((l, i) => <p key={i} className={`duel-log hist ${l.kind}`}>「第{l.round + 1}手」{l.text}</p>)}
          </details>
        )}
        {duel.lastResult && <p className={`duel-log ${duel.lastResult.kind}`}>{duel.lastResult.text}</p>}
        {duel.lastPlay && duel.mode === "pressure" && !duel.lastResult?.kind.includes("item") && (
          <p className="duel-log press">
            {duel.lastPlay.stale && "（招式用老，点数-2！）"}
            {duel.lastPlay.edge === 1 && "（克敌牌色，点数+1）"}
            {duel.lastPlay.edge === -1 && "（被敌牌色所克，点数-1）"}
            你打出「{duel.lastPlay.playerCard?.name}」（{duel.lastPlay.playerCard?.power}{duel.lastPlay.playerCard?.suit === "势" ? "×1.5" : ""}{duel.lastPlay.stale ? "-2" : ""}{duel.lastPlay.edge ? (duel.lastPlay.edge > 0 ? "+1" : "-1") : ""}），他打出「{(oppPlayHidden && !duel.lastPlay.oppSeen) ? "▓▓" : duel.lastPlay.oppCard?.name}」（{(oppPlayHidden && !duel.lastPlay.oppSeen) ? "▓" : duel.lastPlay.oppCard?.power}）——
            {duel.lastPlay.to === "o"
              ? `他折了 ${(oppPlayHidden && !duel.lastPlay.oppSeen) ? "▓" : duel.lastPlay.damage} 点气力！`
              : duel.lastPlay.to === "p"
                ? `你折了 ${(oppPlayHidden && !duel.lastPlay.oppSeen) ? "▓" : duel.lastPlay.damage} 点气力！`
                : duel.lastPlay.damage === 0
                  ? "空耗一手，没能伤他（封顶已尽）。"
                  : "两败俱伤。"}
            {duel.lastPlay.selfBroke && "（你的招被他看破了！）"}
            {duel.lastPlay.trapNote && <span className="trap-on">（{duel.lastPlay.trapNote}）</span>}
          </p>
        )}
        {duel.finished && (
          <p className={`duel-log ${duel.finished}`}>{duel.finished === "win" ? "—— 此局，胜。" : "—— 此局，败。"}</p>
        )}
        {v2 && !duel.finished && duel.mode === "pressure" && !inOppTurn && (
          <button className="btn-main end-turn-btn" onClick={doEndTurn}>{phased ? "结束回合（交出先手——他将有所动作）" : "换气（结束本回合，补牌+行动力）"}</button>
        )}
        {emotionStuck && (
          <button className="btn-main end-turn-btn forfeit-btn" onClick={doForfeit}>拱手退让（认输此局，走败局叙事）</button>
        )}
        {oppTurnStuck && (
          <button className="btn-main end-turn-btn" onClick={doPass}>硬接不接（护住门户，这一手白吃下来）</button>
        )}
      </div>

      {(() => {
        const detailId = raisedId ?? hoverId;
        const dc = detailId ? cardOfOpt(detailId) : null;
        if (!dc) return null;
        const sticky = raisedId !== null && raisedId === detailId;
        const dp = previewOf(dc.id);
        return (
          <div className={`hand-detail${sticky ? " sticky" : ""}`}>
            <div className="hd-head">
              <b>{dc.name}</b>
              <span className="hd-meta">
                {dc.layer ?? "成术"}{dc.suit ? ` · ${dc.suit}` : ""} · {dc.rarity ?? "凡"}
                {v2 && duel.mode === "pressure" && (dc.layer ?? "成术") === "成术" && !dc.trap ? ` · 费${cardCost(dc)}` : ""}
                {dc.power !== undefined ? ` · 点数${dc.power}${dc.suit === "势" ? "×1.5（反噬1）" : ""}` : ""}
              </span>
              <span className="hd-hint">{sticky ? "再点这张牌＝打出 · 上滑＝直接打出" : "点卡面立起来细看，再点它才打出"}</span>
            </div>
            <div className="hd-text">{dc.text}</div>
            {dc.lore && <div className="hd-lore">{dc.lore}</div>}
            {dp && <div className="hd-preview">{dp}</div>}
            {(dc.layer ?? "成术") === "人物" && <div className="hd-passive">被动 · 开局场外生效，不可打出</div>}
          </div>
        );
      })()}

      <div className="hand">
        {handIds.map((id, i) => {
          // M6 结算预演角标（与详情条同源：previewOf）
          const preview = previewOf(id);
          const c = cardOf(id);
          // M7（审计 P1-4）→M9：言力耗尽后成术灰掉；物品按各自言力价灰掉（引擎同口径）
          const yanliSpentOut = duel.mode === "emotion" && typeof duelExtra.yanli === "number"
            && duelExtra.yanli <= 0 && duel.round >= EMOTION_FREE_PLAYS;
          const itemPrice = (c.layer ?? "成术") === "物品" && c.itemEffect && duel.mode === "emotion" && typeof duelExtra.yanli === "number"
            ? ITEM_YANLI_COST[c.itemEffect] : 0;
          // M2：对手回合手牌=应手候选（只允许成术非陷阱）；我方主阶段维持行动力门槛
          const disabled = !!duel.finished
            || (duel.mode === "emotion" && (!duel.opponentShown || (yanliSpentOut && (c.layer ?? "成术") === "成术") || (itemPrice > 0 && duelExtra.yanli < itemPrice)))
            || (inOppTurn && ((c.layer ?? "成术") !== "成术" || !!c.trap))
            || (!inOppTurn && v2 && duel.mode === "pressure" && duel.ap < cardCost(c));
          const isChar = (c.layer ?? "成术") === "人物";
          const d = i - (handIds.length - 1) / 2;
          const raised = raisedId === id;
          // 真按钮级禁用只留给「对局已终/情绪局等对手亮牌」；「此刻打不出」的牌灰而不锁——
          // 点它照样弹起看全文，二次打出时由 clickCard 报真因（行动力/言力/应手门槛）
          const hardLock = !!duel.finished || (duel.mode === "emotion" && !duel.opponentShown);
          return (
            <button
              key={id}
              className={`play-card rarity-${c.rarity ?? "凡"} ${c.suit ? `suit-${c.suit}` : ""} ${isChar ? "char-card" : ""} ${raised ? "hand-top" : ""} ${disabled && !hardLock ? "card-disabled" : ""}`}
              style={{ "--d": d, "--z": Math.abs(d) } as CSSProperties}
              disabled={hardLock}
              onClick={() => {
                if (raised) { setRaisedId(null); guardedClick(id); }
                else setRaisedId(id);
              }}
              onMouseEnter={() => setHoverId(id)}
              onMouseLeave={() => setHoverId((h) => (h === id ? null : h))}
              onTouchStart={(e) => { swipeYRef.current = e.touches[0]?.clientY ?? null; }}
              onTouchEnd={(e) => {
                const y0 = swipeYRef.current;
                swipeYRef.current = null;
                if (y0 !== null && y0 - (e.changedTouches[0]?.clientY ?? y0) > 24) { setRaisedId(null); guardedClick(id); }
              }}
            >
              {c.suit && <SuitGlyph suit={c.suit} />}
              {c.power !== undefined && !isChar && <span className="pc-power-badge">{c.power}</span>}
              <div className="card-artwrap">
                <CardArt id={c.id} name={c.name} compact />
                <CardBand c={c} extra={v2 && duel.mode === "pressure" ? <span className="cost-tag">费{cardCost(c)}</span> : undefined} />
              </div>
              <div className="pc-text">{c.text}</div>
              {preview && <div className="pc-preview">{preview}</div>}
              {c.trap && c.suit === "隐" && <div className="pc-power trap-tag">陷阱 · 盖放（{c.trap}）</div>}
              {c.power !== undefined && !c.trap && <div className="pc-power">点数 {c.power}{c.suit === "势" ? "×1.5（反噬1）" : ""}</div>}
              {isChar && <div className="pc-power">被动 · 不可打出</div>}
            </button>
          );
        })}
      </div>
      <details className="dt-rules">
        <summary>本局规则</summary>
        <p className="duel-rule muted">
        {duel.mode === "emotion"
          ? v2
            ? "v2 规则：出牌不耗行动力；打出的牌进弃牌堆，每轮补牌至 4 张。同色=共鸣+1；克色=破防备（破防伤神，气力-1）；被克=失言气力-2，错色=失言气力-1。"
            : "规则：同色接话=共鸣+1；克色=破其防备（破防伤神，气力-1）；被克=失言气力-2，错色=失言气力-1。共鸣满则胜，气力尽则败。"
          : v2
            ? "v2 规则：每牌耗费 1 行动力，点差即伤害（单次至多 6）；克敌牌色+1、被克-1；势牌基础点×1.5反噬1；连出同张「招式用老」-2；物品卡一锤定音。"
            : light
            ? "轻回合规则：每回合一个主行动；主攻先手+1，应手守方+1、反击差减半（保底1）；势牌基础点×1.5（应手不反噬）。"
            : "规则：每回合各出一牌比点，点差即伤害（单次至多 6）；势牌基础点×1.5但反噬1；连出同一张牌招式用老-2。先打空对方气力者胜。"}
        {gambit && (duel.mode === "emotion"
          ? " 博弈：他亮出的色三成是虚张（不可由回合数或环序反推）；【读牌】耗 1 言力验色，虚张则拆穿亮真色。"
          : " 博弈：【蓄势】叠蓄力层（上限2，下张每层+2）；【破招】宣言敌招花色，押中则该招作废。")}
        </p>
      </details>
    </div>
  );
}


// ============================================================
// 场景化小游戏
// ============================================================
