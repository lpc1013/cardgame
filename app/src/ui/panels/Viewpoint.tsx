// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import type { Scenario } from "../../engine/types";
import { sfx } from "../../engine/sfx";

export function ViewpointModal({ sc, onCancel, onPick }: {
  sc: Scenario; onCancel: () => void; onPick: (id: string) => void;
}) {
  return (
    <div className="clue-overlay" onClick={onCancel}>
      <div className="bag-panel prep-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>{sc.title} · 选视角</h3>
        <p className="muted">每个视角各有入口与专属起手卡；结局按视角单列。</p>
        <div className="vp-list">
          {(sc.viewpoints ?? []).map((v) => (
            <button key={v.id} className="vp-card" onClick={() => { sfx.choice(); onPick(v.id); }}>
              <span className="vp-name">{v.name}</span>
              <span className="vp-desc">{v.desc}</span>
              <span className="vp-meta muted">专属结局 {v.endings?.length ?? 0} · 起手卡 {v.initialDeck?.length ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="prep-actions">
          <button className="link-btn touch" onClick={onCancel}>再想想</button>
        </div>
      </div>
    </div>
  );
}
