// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { useEffect, useState } from "react";
import { sfxEnabled, toggleSfx, sfx } from "../../engine/sfx";
import { allArtUrls } from "../art";

/** 离线分两档说清楚（审计 PWA 篇）：
 *  ①「基础离线可玩」= precache 的 js/css/html —— 剧本数据打在 scenario-data chunk 里，装完就带着走；
 *  ②「插画完整离线」= 运行时缓存只会存"已经请求过的图"，条目上限再大也不会凭空长出来，
 *    所以这一档必须显式预取。按钮取的就是 art.ts 各 glob 的实际命中集合，不手写清单。 */
export function SettingsPanel({ onClose, onCleared }: { onClose: () => void; onCleared: () => void }) {
  const [snd, setSnd] = useState(sfxEnabled());
  const [armed, setArmed] = useState(false);
  const [off, setOff] = useState<{ running: boolean; done: number; total: number; failed: number } | null>(null);
  const prefetchArt = async () => {
    const urls = allArtUrls();
    if (!urls.length) return;
    const q = [...urls];
    let done = 0, failed = 0;
    setOff({ running: true, done: 0, total: urls.length, failed: 0 });
    // 6 路并发：再多会把移动网络挤成"页面本身加载不动"，再少要等到玩家放弃
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (q.length) {
        const u = q.shift()!;
        try { await fetch(u, { cache: "force-cache" }); } catch { failed++; }
        done++;
        // 每 8 张报一次：逐张 setState 会让这个面板在预取期间一直重渲染
        if (done % 8 === 0 || !q.length) setOff({ running: true, done, total: urls.length, failed });
      }
    }));
    setOff({ running: false, done, total: urls.length, failed });
    sfx.coin();
  };
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
        <div className="settings-row">
          <span>离线插画</span>
          <button className="emporia-buy" disabled={!!off?.running} onClick={prefetchArt}>
            {off?.running ? `预取中 ${off.done}/${off.total}`
              : off && !off.running ? `已取 ${off.done}/${off.total}${off.failed ? ` · 失败 ${off.failed}` : ""} · 再取一次`
              : "全部预取"}
          </button>
        </div>
        <p className="muted">「基础离线可玩」装完即成立（剧本数据在预缓存的 JS 里）；「插画完整离线」必须点一次预取——运行时缓存只存请求过的图，条目上限再大也不会凭空长出来。体积较大，建议在 Wi-Fi 下进行。</p>
        <p className="muted">帝成观止 · 剧本引擎 × 卡牌系统 v2 × 四色相克（策克势·势克器·器克隐·隐克策）</p>
        <button className="btn-main" onClick={onClose}>合上</button>
      </div>
    </div>
  );
}

/** 出征准备：勾选开局加成 + 携带仓库物品 */
