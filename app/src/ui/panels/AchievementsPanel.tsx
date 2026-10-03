// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import type { AchCategory, AchievementDef } from "../../data/achievements";
import { useState } from "react";
import { ACHIEVEMENTS } from "../../data/achievements";
import { SCENARIOS } from "../../data/scenarios";
import { getAchievements } from "../../engine/save";
import { sfx } from "../../engine/sfx";
import { achArt } from "../art";
import { AchSeal } from "../icons";

export function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const owned = new Set(getAchievements());
  const [tab, setTab] = useState<AchCategory>("deck");
  const tabs: { key: AchCategory; label: string }[] = [
    { key: "deck", label: "卡组" }, { key: "duel", label: "对局" }, { key: "minigame", label: "小游戏" },
    { key: "collect", label: "收集" }, { key: "hidden", label: "隐藏" },
  ];
  const baseShown = ACHIEVEMENTS.filter((a) => tab === "hidden" ? a.hidden : a.category === tab);
  const shown = baseShown;
  const done = ACHIEVEMENTS.filter((a) => owned.has(a.id)).length;
  const tabDone = (k: AchCategory) => ACHIEVEMENTS.filter((a) => (k === "hidden" ? a.hidden : a.category === k)).filter((a) => owned.has(a.id)).length;
  const [zoomAch, setZoomAch] = useState<AchievementDef | null>(null);
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel gallery-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>成就 · {done}/{ACHIEVEMENTS.length}</h3>
        <p className="muted">图标即达成徽记（暖橙简笔）；点击任意一条可放大展阅。卡组构成挑战让普通卡成为入场券。</p>
        <div className="ach-tabs">
          {tabs.map((t) => (
            <button key={t.key} className={`ach-tab ${tab === t.key ? "on" : ""}`} onClick={() => { sfx.choice(); setTab(t.key); }}>
              {t.label}<span className="muted"> {tabDone(t.key)}/{ACHIEVEMENTS.filter((a) => t.key === "hidden" ? a.hidden : a.category === t.key).length}</span>
            </button>
          ))}
        </div>
        <div className="ach-list">
          {shown.map((a) => {
            const on = owned.has(a.id);
            return (
              <div key={a.id} className={`ach-item ${on ? "on" : ""} ${a.hidden && !on ? "hidden" : ""}`} onClick={() => { sfx.choice(); setZoomAch(a); }}>
                <span className="ach-icon" aria-hidden="true">{achArt(a.id) ? <img className="ach-icon-img" src={achArt(a.id)} alt="" /> : <AchSeal on={on} hidden={a.hidden} />}</span>
                <span className="ach-name">{on ? a.name : (a.hidden ? "？？？" : a.name)}</span>
                <span className="ach-cond">{on ? a.cond : (a.hidden ? "达成条件不祥——多探探边角。" : a.cond)}</span>
                <span className="ach-reward">{a.reward}</span>
              </div>
            );
          })}
          {shown.length === 0 && <p className="muted">此分类暂无成就。</p>}
        </div>
        <button className="btn-main" onClick={onClose}>合上</button>
      </div>
      {zoomAch && (() => {
        const on = owned.has(zoomAch.id);
        return (
          <div className="ach-zoom-overlay clue-overlay" onClick={() => setZoomAch(null)}>
            <div className="ach-zoom" onClick={(ev) => ev.stopPropagation()}>
              <div className="ach-zoom-art">
                {achArt(zoomAch.id) ? (
                  <img className="ach-zoom-img" src={achArt(zoomAch.id)} alt={zoomAch.name} />
                ) : (
                  <AchSeal on={on} hidden={zoomAch.hidden} />
                )}
              </div>
              <div className="ach-zoom-info">
                <h3>{on ? zoomAch.name : (zoomAch.hidden ? "？？？" : zoomAch.name)}</h3>
                <p className={`ach-zoom-state ${on ? "on" : ""}`}>{on ? "已达成" : "未达成"}</p>
                <p className="muted ach-zoom-cond">{on ? zoomAch.cond : (zoomAch.hidden ? "达成条件不祥——多探探边角。" : zoomAch.cond)}</p>
                <p className="ach-zoom-reward">{zoomAch.reward}</p>
                {zoomAch.scenario && <p className="muted ach-zoom-sc">归属剧本 · {SCENARIOS.find((s) => s.id === zoomAch.scenario)?.title ?? zoomAch.scenario}</p>}
                <button className="btn-main" onClick={() => setZoomAch(null)}>合上</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// 帝国：商市 / 行囊（跨剧本仓库）/ 图鉴集合 / 设置 / 出征准备
// ============================================================

/** 帝国商市：开局加成（消耗品）+ 主题外观（永久） */
