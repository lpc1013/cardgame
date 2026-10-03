// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import type { Scenario, Scene } from "../../engine/types";
import type { RunState } from "../../engine/runtime";
import { LOC_LABEL, MAP_POS, locBase } from "../../data/locations";
import { SCENE_SETTING } from "../../data/sceneSettings";
import { visibleChoices } from "../../engine/runtime";
import { mapArt } from "../art";

export function LocationMap({ sc, st, scene, canPick, onPick, onAdvance, onClose }: {
  sc: Scenario; st: RunState; scene: Scene; canPick: boolean;
  onPick: (i: number) => void; onAdvance: () => void; onClose: () => void;
}) {
  const pos = MAP_POS[sc.id] ?? {};
  const mapImg = mapArt(sc.id);
  const place = (id: string) => locBase(SCENE_SETTING[sc.id]?.[id] ?? "");
  const here = place(scene.id);
  const seen = new Set(st.visited.map(place).filter((k) => k && pos[k]));
  const chs = visibleChoices(scene, st);
  // 一个地点可能对应好几个选项，取第一个当下标；没对应选项的地点在图上只是"看得见"
  const reach: Record<string, number> = {};
  // 同一处地方挂着好几件事（ silk 案的大牢里既是提审山本一郎、又是对坐周书年）时，
  // 图上只能落一个点——用 nOf 标出"这里不止一件"，否则玩家以为少了一条线
  const nOf: Record<string, number> = {};
  chs.forEach((c, i) => {
    const k = place(c.next);
    if (!k || !pos[k]) return;
    nOf[k] = (nOf[k] ?? 0) + 1;
    if (reach[k] === undefined) reach[k] = i;
  });
  // 一个地点可能对应好几个选项，取第一个当下标；没对应选项的地点在图上只是"看得见"
  const nextPlace = chs.length === 0 && scene.next ? place(scene.next) : "";
  const isReach = (k: string) => canPick && (reach[k] !== undefined || k === nextPlace);
  return (
    <div className="loc-map" onClick={onClose}>
      <div className="loc-ground" onClick={(e) => e.stopPropagation()}>
        <div className="loc-head">
          <span className="loc-title">舆图 · {sc.title}</span>
          <span className="loc-sub">{here ? `所在 · ${LOC_LABEL[here] ?? here}` : "所在 · 未标注之地"}</span>
          <button className="loc-close" onClick={onClose}>收图</button>
        </div>
        <div className="loc-field">
          {mapImg && <img className="loc-art" src={mapImg} alt={`${sc.title}舆图底`} />}
          {(["北", "东", "南", "西"] as const).map((d) => (
            <span key={d} className={`loc-dir loc-dir-${d}`}>{d}</span>
          ))}
          {Object.entries(pos).map(([k, [x, y]]) => {
            // 「在此」不能盖掉「可去」：hub 这一幕就站在河堤（sichou.hub → river），而【河堤】勘堤
            // 正是这一幕第一条选项——旧写法 state 先判 here，于是图上最该点的那颗点显示成"当前"、
            // 既不打脉冲也不给指针，看着是死的（实测四桩 hub 各吞掉 1~2 个去处）。
            const isHere = k === here;
            const can = isReach(k);
            // 类名要各自带 loc- 前缀：写成 `loc-${"here reach"}` 只会给第一个词加上前缀，
            // 第二个词变成裸 reach，.loc-reach 的样式与组合规则全都落不到它身上。
            const cls = [
              "loc-node",
              isHere ? "loc-here" : "",
              can ? "loc-reach" : "",
              !isHere && !can && seen.has(k) ? "loc-seen" : "",
              !isHere && !can && !seen.has(k) ? "loc-dark" : "",
            ].filter(Boolean).join(" ");
            const go = reach[k];
            const n = nOf[k] ?? 0;
            return (
              <button key={k} className={cls} style={{ left: `${x}%`, top: `${y}%` }}
                disabled={!can}
                onClick={() => {
                  if (!can) return;
                  if (go !== undefined) onPick(go); else onAdvance();
                  onClose();
                }}>
                <span className="loc-dot" />
                <span className="loc-name">{!isHere && !can && !seen.has(k) ? "未至" : LOC_LABEL[k] ?? k}</span>
                {/* 一处地方挂两件事（大牢里既提审山本一郎、又对坐周书年）时图上只有一个点，
                    不标出来就像少了一条线。点它走第一条，剩下的仍在下面这排选项里 */}
                {n > 1 && <span className="loc-multi" title={`此地另有 ${n - 1} 件事要做`}>×{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="loc-legend">
          <span><i className="loc-key loc-key-here" />当前</span>
          <span><i className="loc-key loc-key-reach" />可去</span>
          <span><i className="loc-key loc-key-seen" />已探</span>
          <span><i className="loc-key loc-key-dark" />未至</span>
          {!canPick && <span className="loc-note">读完这一幕才走得动</span>}
        </div>
      </div>
    </div>
  );
}

/** 现场勘查层：把这一幕的现场图铺开，证物埋在图上，点中才读得到。
 *  勘查格数有限（Survey.budget），所以"先看哪一处"是笔要花的钱，不是清单打勾。
 *  入卷一律走 applyEffects——和选项同一套 Effect 词汇，不另开一条改状态的口子。 */
