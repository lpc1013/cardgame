// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { useEffect, useState } from "react";
import { sfxEnabled, toggleSfx } from "../../engine/sfx";

export function SettingsPanel({ onClose, onCleared }: { onClose: () => void; onCleared: () => void }) {
  const [snd, setSnd] = useState(sfxEnabled());
  const [armed, setArmed] = useState(false);
  // L-5：确认层 1.5s 冷启动——惊慌误触率对半的经典防御（500ms×3 档）
  const [wait, setWait] = useState(3);
  useEffect(() => {
    if (!armed) { setWait(3); return; }
    const id = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 500);
    return () => clearInterval(id);
  }, [armed]);
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel settings-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>设置</h3>
        <div className="settings-row">
          <span>音效</span>
          <button className="emporia-buy" onClick={() => setSnd(toggleSfx())}>{snd ? "开（点关）" : "关（点开）"}</button>
        </div>
        <div className="settings-row">
          <span>存档</span>
          {armed ? (
            <span className="settings-confirm">
              确定放弃全部进度？此操作不可恢复。
              {/* L-5：「反悔」放大为主按钮；「确定放弃」缩为文字链且延迟 1.5s 可点 */}
              <button className="btn-main fix-undo-main" onClick={() => setArmed(false)}>反悔 · 留档</button>
              <button className="link-btn danger-final fix-abort-link" disabled={wait > 0} onClick={() => { onCleared(); onClose(); }}>{wait > 0 ? `${wait === 1 ? "最后想一秒" : "再想一会儿"}` : "确定放弃"}</button>
            </span>
          ) : (
            <button className="danger-ghost fix-danger-ghost" onClick={() => setArmed(true)}>放弃存档</button>
          )}
        </div>
        <p className="muted">帝成观止 · 剧本引擎 × 卡牌系统 v2 × 四色相克（策克势·势克器·器克隐·隐克策）</p>
        <button className="btn-main" onClick={onClose}>合上</button>
      </div>
    </div>
  );
}

/** 出征准备：勾选开局加成 + 携带仓库物品 */
