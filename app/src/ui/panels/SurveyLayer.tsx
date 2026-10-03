// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import type { Survey, SurveySpot } from "../../data/survey";
import type { Scene } from "../../engine/types";
import type { RunState } from "../../engine/runtime";
import { useState } from "react";
import { foundSpots, spotCost, surveyLeft } from "../../data/survey";

export function SurveyLayer({ st, scene, sv, art, onFound, onClose }: {
  st: RunState; scene: Scene; sv: Survey; art: string | undefined;
  onFound: (spot: SurveySpot) => void; onClose: () => void;
}) {
  const [reading, setReading] = useState<string | null>(null);
  const found = foundSpots(st.survey, scene.id);
  const left = surveyLeft(sv, found);
  const spot = sv.spots.find((p) => p.id === reading);
  return (
    <div className="sv-layer" onClick={onClose}>
      <div className="sv-ground" onClick={(e) => e.stopPropagation()}>
        <div className="sv-head">
          <span className="sv-title">{sv.title}</span>
          <span className="sv-sub">勘查余 {left} 格 · 已入卷 {found.length}/{sv.spots.length} 处</span>
          <button className="sv-close" onClick={onClose}>收队</button>
        </div>
        <div className="sv-field">
          {art ? <img className="sv-art" src={art} alt="" aria-hidden="true" /> : <div className="sv-art sv-art-none" />}
          {sv.spots.map((p) => {
            const got = found.includes(p.id);
            const cost = spotCost(p);
            // 已录的要能回看（点它只重读那句话，不再扣格）；格数不够的暗下去。
            // 不入卷的闲看不要格——若看风景也花钱，就没人看风景，"取舍"也就成了假的
            const dead = !got && cost > 0 && left < cost;
            return (
              <button key={p.id} className={`sv-spot${got ? " got" : ""}${dead ? " dead" : ""}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }} disabled={dead}
                onClick={() => { setReading(p.id); if (!got) onFound(p); }}>
                <span className="sv-ring" />
                <span className="sv-tag">{got ? "已录" : cost ? `勘 ${cost}` : "看"}</span>
              </button>
            );
          })}
        </div>
        <div className="sv-read">
          {spot
            ? <p className="sv-note">{spot.note}</p>
            : <p className="sv-hint">蹲下去看——图上每一处朱点，都是这案子里没人念出声的东西。</p>}
        </div>
        <div className="sv-legend">
          <span><i className="sv-key sv-key-free" />未勘</span>
          <span><i className="sv-key sv-key-got" />已录</span>
          <span><i className="sv-key sv-key-dead" />格数不足</span>
          <span className="sv-note-hint">勘查格数有限，先挑要紧的看</span>
        </div>
      </div>
    </div>
  );
}

/** 商市主题卡顶上那块布样：纯装饰条，不承文字，所以不走对比度那套令牌 */
