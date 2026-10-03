// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import type { Scenario } from "../../engine/types";
import type { RunState } from "../../engine/runtime";
import { useEffect, useRef, useState } from "react";
import { sfx, sfxEnabled, toggleSfx } from "../../engine/sfx";
import { SyceeIcon } from "../icons";

export function TopBar({ sc, st, mode, onMode, dlg, onDlg, map, onMap, surveyLabel, onSurvey, onClues, onBag }: { sc: Scenario; st: RunState; mode: "light" | "dark"; onMode: () => void; dlg: boolean; onDlg: () => void; map: boolean; onMap: () => void; surveyLabel: string | null; onSurvey: () => void; onClues: () => void; onBag: () => void }) {
  const [snd, setSnd] = useState(sfxEnabled());
  // R-1：资源变化浮动提示——数值一变在字牌上浮出「+n / −n」+ 微光脉冲（朝望-2 之类不再悄无声息）。
  // 同帧多项变动（如 朝望-2 且 银+10）各浮各的；applyEffects 就地改 stats（浅拷贝共享引用），依赖用整个 st。
  const prevRef = useRef<{ stats: Record<string, number>; silver: number } | null>(null);
  const [deltas, setDeltas] = useState<{ id: number; key: string; d: number }[]>([]);
  const deltaTimer = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { stats: { ...st.stats }, silver: st.silver };
    if (!prev) return;
    const hits: { id: number; key: string; d: number }[] = [];
    sc.stats?.forEach((s) => {
      const d = (st.stats[s.key] ?? 0) - (prev.stats[s.key] ?? 0);
      if (d !== 0) hits.push({ id: Date.now() + hits.length, key: s.key, d });
    });
    if (sc.cardSystem && st.silver !== prev.silver) {
      hits.push({ id: Date.now() + hits.length, key: "__silver", d: st.silver - prev.silver });
    }
    if (!hits.length) return;
    setDeltas(hits);
    if (deltaTimer.current) window.clearTimeout(deltaTimer.current);
    deltaTimer.current = window.setTimeout(() => setDeltas([]), 1600);
  }, [st, sc]);
  useEffect(() => () => { if (deltaTimer.current) window.clearTimeout(deltaTimer.current); }, []);
  const deltaOf = (key: string) => deltas.find((x) => x.key === key);
  const DeltaTag = ({ k }: { k: string }) => {
    const d = deltaOf(k);
    return d ? (
      <i key={d.id} className={`stat-delta ${d.d < 0 ? "neg" : ""}`}>{d.d > 0 ? `+${d.d}` : d.d}</i>
    ) : null;
  };
  return (
    <div className="top-bar">
      <span className="tb-title">{sc.title}</span>
      {st.viewpoint && sc.viewpoints?.find((v) => v.id === st.viewpoint) && (
        <span className="stat-chip chip-vp">{sc.viewpoints.find((v) => v.id === st.viewpoint)!.name}</span>
      )}
      {sc.stats?.map((s) => (
        <span key={s.key} className={`stat-chip ${deltaOf(s.key) ? "stat-pulse" : ""}`}>
          {s.name} {st.stats[s.key]}
          <DeltaTag k={s.key} />
        </span>
      ))}
      {sc.cardSystem && (
        <span className={`stat-chip chip-silver ${deltaOf("__silver") ? "stat-pulse" : ""}`}>
          <SyceeIcon /> 银 {st.silver}
          <DeltaTag k="__silver" />
        </span>
      )}
      {st.clues.length > 0 && (
        <button className="clue-btn" onClick={() => { sfx.choice(); onClues(); }}>卷宗（{st.clues.length}）</button>
      )}
      {sc.cardSystem && (
        <button className="clue-btn" onClick={() => { sfx.choice(); onBag(); }}>背包（{st.deck.length}/{sc.deckLimit ?? 12}）</button>
      )}
      <button className="clue-btn" onClick={() => { sfx.choice(); onMode(); }} title={mode === "light" ? "切到深色" : "切回宣纸浅色"}>
        {mode === "light" ? "转墨" : "还宣"}
      </button>
      <button className="clue-btn" onClick={() => { sfx.choice(); onDlg(); }} title={dlg ? "回到长卷通读" : "改成一屏一段的对白档"}>
        {dlg ? "长卷" : "对白"}
      </button>
      {map && (
        <button className="clue-btn" onClick={() => { sfx.choice(); onMap(); }} title="探案舆图：这一幕去得了的地方">舆图</button>
      )}
      {surveyLabel && (
        <button className="clue-btn sv-btn" onClick={() => { sfx.choice(); onSurvey(); }} title="现场勘查：这一幕的现场图上埋着证物，点中才读得到。数字是剩余格数——勘一处入卷的证物花一格，闲看不花">
          {surveyLabel}
        </button>
      )}
      <button className="clue-btn snd-btn" onClick={() => setSnd(toggleSfx())} title={snd ? "关闭音效" : "开启音效"}>
        {snd ? "♪" : "✕♪"}
      </button>
    </div>
  );
}

// ============================================================
// 背包 / 编组
// ============================================================
