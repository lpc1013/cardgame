// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { bumpCounter, getCounter } from "../../engine/save";
import { useState } from "react";
import { initSicbo, sicboRoll, sicboPayout, sicboSetBet, type SicboState } from "../../engine/minigames";
import { sfx } from "../../engine/sfx";

export function SicboPanel({ silver, onSilver }: { silver: number; onSilver: (delta: number, msg: string) => void }) {
  const [st, setSt] = useState<SicboState>(() => initSicbo());
  const [side, setSide] = useState<"大" | "小" | "豹">("大");
  const [cheat, setCheat] = useState(false);
  // W-1：出千次数——查获率随之递增（0.2 + n×0.05，封顶 1）。
  // M9.5（P0-1 遗留）：账记在帝国档（achCounters）而非组件态——旧实现 F5 即清零，刷新可遁
  const [cheatCount, setCheatCount] = useState(() => getCounter("sicbo_heat"));
  const roll = () => {
    if (st.bet <= 0 || st.bet > silver) { onSilver(0, "押注超过身家"); return; }
    if (cheat) setCheatCount(bumpCounter("sicbo_heat"));
    const n = structuredClone(st);
    sicboRoll(n, side, cheat, cheat ? cheatCount : 0);
    const pay = sicboPayout(n);
    sfx.card();
    if (n.result === "win") sfx.win(); else sfx.lose();
    setSt(n);
    onSilver(pay, n.log + (pay !== 0 ? `（${pay > 0 ? "+" : ""}${pay} 两）` : ""));
  };
  return (
    <div className="story-panel" style={{ maxWidth: 640 }}>
      <p className="muted">三枚骰盅，买定离手。大（11-17）/ 小（4-10）一赔一，豹子（三同）一赔五。出千七成胜面——但庄家的眼睛不瞎：出千的账记在总簿上（关店刷新也不销），千得越多次，被抓的概率越高（起始两成，每次递增半成），抓到输双倍。</p>
      <div className="duel-status">
        <span>身家 {silver} 两</span>
        <span>押注 {st.bet} 两</span>
        <span>当前买：{side}{cheat ? `（出千 · 第 ${cheatCount + 1} 次）` : ""}</span>
      </div>
      {st.dice && <p className="story-line show">{st.log}</p>}
      <div className="choices">
        <button className="choice" onClick={() => { const n = structuredClone(st); sicboSetBet(n, n.bet + 5, silver); setSt(n); }}>押注 +5</button>
        <button className="choice" onClick={() => { const n = structuredClone(st); sicboSetBet(n, Math.max(5, n.bet - 5), silver); setSt(n); }}>押注 -5</button>
        {(["大", "小", "豹"] as const).map((s) => (
          <button key={s} className={`choice ${side === s ? "on-choice" : ""}`} onClick={() => setSide(s)}>买「{s}」</button>
        ))}
        <button className={`choice ${cheat ? "on-choice" : ""}`} onClick={() => setCheat(!cheat)}>{cheat ? "已备骱子（出千）" : "袖里藏骱（出千）"}</button>
        <button className="choice" onClick={roll} disabled={st.bet <= 0 || st.bet > silver}>{st.bet > silver ? "押注超过身家" : "摇盅！"}</button>
      </div>
    </div>
  );
}


// ============================================================
// 卡牌图鉴：收集进度（未见过 = ？？？）
// ============================================================

