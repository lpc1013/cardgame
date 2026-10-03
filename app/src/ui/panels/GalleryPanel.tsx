// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import { getCardSeen } from "../../engine/save";
import type { Scenario } from "../../engine/types";
import { useState } from "react";
import { SCENARIOS } from "../../data/scenarios";
import { sfx } from "../../engine/sfx";
import { endArt, endThumbOf } from "../art";

export function GalleryPanel({ gallery, onClose, onCardGallery }: {
  gallery: { scenarioId: string; endingName: string; rank: string }[];
  onClose: () => void;
  onCardGallery: (s: Scenario) => void;
}) {
  const [detail, setDetail] = useState<{ scId: string; name: string; rank: string } | null>(null);
  const dSc = detail ? SCENARIOS.find((s) => s.id === detail.scId) : undefined;
  const dScene = dSc?.scenes.find((x) => x.ending?.name === detail?.name);
  const dArt = dSc && dScene ? endArt(dSc.id, dScene.id) : undefined;
  return (
    <div className="clue-overlay" onClick={onClose}>
      <div className="bag-panel gallery-panel" onClick={(ev) => ev.stopPropagation()}>
        <h3>图鉴 · 天下事与天下牌</h3>
        <div className="bag-group">
          <div className="bag-group-title">结局图鉴（{gallery.length}）· 点击翻阅</div>
          {gallery.length === 0 ? (
            <p className="muted">尚未解锁任何结局。</p>
          ) : (
            <div className="gallery-ends">
              {SCENARIOS.map((s) => {
                const endScenes = s.scenes.filter((x) => x.ending);
                const unlockedNames = new Set(gallery.filter((g) => g.scenarioId === s.id).map((g) => g.endingName));
                if (!endScenes.length || !unlockedNames.size) return null;
                return (
                  <div key={s.id} className="gallery-end-row">
                    <div className="gallery-end-sc">{s.title}<span className="muted">{unlockedNames.size}/{endScenes.length}</span></div>
                    <div className="end-grid">
                      {endScenes.map((scene) => {
                        const vpName = s.viewpoints?.find((v) => v.endings?.includes(scene.id))?.name;
                        const on = unlockedNames.has(scene.ending!.name);
                        if (!on) {
                          return (
                            <div key={scene.id} className="end-tile end-tile-unknown">
                              <div className="end-tile-art">？？？</div>
                              <span className="end-tile-name">？？？</span>
                              <span className="end-tile-rank">{vpName ? `${vpName} · ` : ""}未探明</span>
                            </div>
                          );
                        }
                        const art = endArt(s.id, scene.id);
                        return (
                          <button key={scene.id} className="end-tile" onClick={() => { sfx.choice(); setDetail({ scId: s.id, name: scene.ending!.name, rank: scene.ending!.rank }); }}>
                            {art ? (
                              <img className="end-tile-art" src={endThumbOf(s.id, scene.id)} alt={scene.ending!.name} loading="lazy" decoding="async" />
                            ) : (
                              <div className="end-tile-art end-tile-noart">墨色尚缺</div>
                            )}
                            <span className="end-tile-name">{scene.ending!.name}</span>
                            <span className="end-tile-rank">{vpName ? `${vpName} · ` : ""}{scene.ending!.rank}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="bag-group">
          <div className="bag-group-title">卡牌图鉴</div>
          <div className="gallery-sc-list">
            {SCENARIOS.filter((s) => s.cardSystem).map((s) => {
              const seen = (getCardSeen()[s.id] ?? []).length;
              const total = s.cards.filter((c) => (c.layer ?? "成术") !== "资源").length;
              return (
                <button key={s.id} className="gallery-sc-btn" onClick={() => { sfx.choice(); onCardGallery(s); }}>
                  {s.title}
                  <span className="gsc-progress"><i style={{ width: `${total ? Math.round((seen / total) * 100) : 0}%` }} /></span>
                  <span className="muted">{seen}/{total}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button className="btn-main" onClick={onClose}>合上图鉴</button>
      </div>
      {detail && (
        <div className="clue-overlay ending-detail-overlay" onClick={(ev) => { ev.stopPropagation(); setDetail(null); }}>
          <div className="bag-panel ending-detail" onClick={(ev) => ev.stopPropagation()}>
            {dArt ? (
              <img className="ending-detail-art" src={dArt} alt={detail.name} />
            ) : (
              <div className="ending-detail-art ending-detail-noart">卷轴空留 · 墨色尚缺</div>
            )}
            <div className="ending-detail-rank">{detail.rank}</div>
            <h3 className="ending-detail-name">{detail.name}</h3>
            <p className="ending-detail-sc">《{dSc?.title ?? detail.scId}》</p>
            {dScene?.ending?.desc && <p className="ending-detail-desc">{dScene.ending.desc}</p>}
            <button className="btn-main" onClick={() => setDetail(null)}>合上此页</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 设置：音效 / 存档管理 */
