// ============================================================
// 美术接入（皮）：运行时按 id 载入 src/assets/{cards,portraits,scenes}/<id>.{jpg,png}
// 图片缺失（外部生成尚未落位）则不出图，文本布局照常，游戏完全不受影响。
// 2026-10-02 从 App.tsx 抽出：纯查图层，无 React 依赖；glob 相对路径以本文件为基准。
// ============================================================
import { SCENE_SETTING } from "../data/sceneSettings";

const _CARD_ART = import.meta.glob("../assets/cards/*/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const _PORTRAIT_ART = import.meta.glob("../assets/portraits/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const _SCENE_ART = import.meta.glob("../assets/scenes/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
/** 探案舆图底：assets/maps/<剧本id>.jpg（即梦产的明清城邑手绘图），缺图则回落 CSS 纸底 */
const _MAP_ART = import.meta.glob("../assets/maps/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
/** 主题织锦样片：assets/themes/<主题id>.jpg，商市主题卡顶上的那块布样（纯装饰，不承文字） */
const _THEME_SWATCH = import.meta.glob("../assets/themes/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const _COVER_ART = import.meta.glob("../assets/covers/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const _END_ART = import.meta.glob("../assets/endings/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
/** 成就图标：assets/achievements/ach_<id>.{jpg,png}（无图时 UI 用 SVG 纹章兜底） */
const _ACH_ART = import.meta.glob("../assets/achievements/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
export const achArt = (id: string) => _ACH_ART[`../assets/achievements/ach_${id}.jpg`] ?? _ACH_ART[`../assets/achievements/ach_${id}.png`];
/** 动态背景特效层：assets/scenes/motion/<剧本id>_<场景id>.webp
 *  anim-forge（Godot）烘出的透明无缝循环粒子层，叠在原画之上；缺文件即回落淡水印底 */
const _SCENE_MOTION = import.meta.glob("../assets/scenes/motion/*.webp", { eager: true, import: "default" }) as Record<string, string>;
export const sceneMotion = (scenarioId: string, id: string): string | undefined =>
  _SCENE_MOTION[`../assets/scenes/motion/${scenarioId}_${id}.webp`];
/** 叙述者立绘：优先 assets/narrators/<视角id>.jpg（多视角剧本），单视角剧本按
 *  CASE_SCENARIOS / <剧本id>.jpg 回落。台词是小说化第一人称，说话人即叙述主体，
 *  故不做逐句 speaker 解析。缺图即不出栏，布局自动回落全宽。 */
const _NARRATOR_ART = import.meta.glob("../assets/narrators/*.{png,jpg,jpeg}", { eager: true, import: "default" }) as Record<string, string>;
const _NARRATOR_IDX = buildArtIndex(_NARRATOR_ART);
/** 五桩案件同属一名大理寺卿的断案卷宗（用户 2026-09-28 确认），共用一张立绘与一个名牌 */
export const CASE_SCENARIOS: Record<string, string> = {
  fuma: "大理寺卿", qiuwei: "大理寺卿", sichou: "大理寺卿", xie: "大理寺卿", qinhuai: "大理寺卿",
};
export const narratorArt = (scenarioId: string, vpId?: string): string | undefined =>
  _artUrl(_NARRATOR_IDX, vpId ?? "") ?? _artUrl(_NARRATOR_IDX, CASE_SCENARIOS[scenarioId] ? "dalisi" : scenarioId);

/** 按 id 查图（C-3）：模块加载时预构建 id→url 索引（兼容 cards 五子目录/portraits/scenes 前缀命名等任意目录层级），
 *  _artUrl 直接 Map.get，避免每次渲染都线性扫描 Object.entries()。
 *  后缀优先级与旧逻辑一致：.jpg > .jpeg > .png > .webp（同一 id 多后缀时取先命中的）。 */
function buildArtIndex(map: Record<string, string>): Map<string, string> {
  const idx = new Map<string, string>();
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    for (const key of Object.keys(map)) {
      if (key.endsWith(ext)) {
        const id = key.slice(key.lastIndexOf("/") + 1, key.length - ext.length);
        if (!idx.has(id)) idx.set(id, map[key]!);
      }
    }
  }
  return idx;
}
const _CARD_ART_IDX = buildArtIndex(_CARD_ART);
const _PORTRAIT_ART_IDX = buildArtIndex(_PORTRAIT_ART);
const _SCENE_ART_IDX = buildArtIndex(_SCENE_ART);
const _MAP_ART_IDX = buildArtIndex(_MAP_ART);
const _SWATCH_IDX = buildArtIndex(_THEME_SWATCH);
/** 默认皮（id 为空串）的样片叫 xuanzhi——宣纸帘纹 */
export const themeSwatch = (id: string) => _SWATCH_IDX.get(id === "" ? "xuanzhi" : id);
const _COVER_ART_IDX = buildArtIndex(_COVER_ART);
const _END_ART_IDX = buildArtIndex(_END_ART);
function _artUrl(idx: Map<string, string>, id: string): string | undefined {
  return idx.get(id);
}
export function cardArt(id: string): string | undefined {
  return _artUrl(_CARD_ART_IDX, id) ?? _artUrl(_PORTRAIT_ART_IDX, id);
}
/** 对手立绘：portraits/ 里两种命名并存——专绘走 opp_<对局id>，与人物卡同源的角色走
 *  r_<对局id 去掉 d_>（d_wang 的「王满财」就是卡 r_wang 本人）。都够不到时牌桌落一枚朱印。 */
export function opponentArt(duelId: string): string | undefined {
  return _artUrl(_PORTRAIT_ART_IDX, `opp_${duelId}`)
    ?? _artUrl(_PORTRAIT_ART_IDX, `r_${duelId.replace(/^d_/, "")}`);
}
export function sceneArt(scenarioId: string, id: string): string | undefined {
  // 优先「剧本前缀」命名（跨剧本场景 id 会重名，如 start）；兼容旧的 scn_* 全局唯一命名
  const direct = _artUrl(_SCENE_ART_IDX, `${scenarioId}_${id}`) ?? _artUrl(_SCENE_ART_IDX, `scn_${id}`) ?? _artUrl(_SCENE_ART_IDX, id);
  if (direct) return direct;
  // 缺图幕按「地点」复用：同一间房在不同幕必须长得一样，故 487 幕塌成 116 个地点共用背景
  const key = SCENE_SETTING[scenarioId]?.[id];
  return key ? _artUrl(_SCENE_ART_IDX, `${scenarioId}__${key}`) : undefined;
}
/** 结局插画：src/assets/endings/end_<剧本id>_<结局场景id>.{jpg,png} */
export function endArt(scenarioId: string, sceneId: string): string | undefined {
  return _artUrl(_END_ART_IDX, `end_${scenarioId}_${sceneId}`);
}
/** 舆图底图（LocationMap）：assets/maps/<剧本id>.jpg */
export const mapArt = (scenarioId: string): string | undefined => _artUrl(_MAP_ART_IDX, scenarioId);
/** 剧本封面（出征轮播大图） */
export function coverOf(id: string): string | undefined {
  return _artUrl(_COVER_ART_IDX, "cover_" + id);
}

/** 缩略图（小格专用）：tools/slim_thumbs.py 按「渲染槽位 2x」离线产的小图，落在 assets/thumbs/<kind>/。
 *  原图一个字节不动：详情 / 放大 / 全幅仍走原图；缺文件回退原图（回退失败链路不变）。
 *  查图走 basename 索引（与卡图/立绘同法）——glob 键在 dev 是 /src/...、build 是别的形态，
 *  裸键直查两头都对不上，首版就是这么静默全回退的。 */
const _THUMB_ART = import.meta.glob("../assets/thumbs/{covers,endings,cards}/*.jpg", { eager: true, import: "default" }) as Record<string, string>;
const _THUMB_IDX = buildArtIndex(_THUMB_ART);
const thumbUrl = (kind: "covers" | "endings" | "cards", id: string): string | undefined => {
  const u = _THUMB_IDX.get(id);
  return u && u.includes(`/thumbs/${kind}/`) ? u : undefined;
};

/** 三类小格的缩略图包装：thumb 缺文件时逐级回退原图，调用方无需判空。
 *  covers 的源文件名带 cover_ 前缀（与 coverOf 同一约定），查找时补齐——
 *  首版用裸剧本 id 查，全库 miss 静默回退全图。 */
export const coverThumbOf = (id: string): string | undefined => thumbUrl("covers", `cover_${id}`) ?? coverOf(id);
export const endThumbOf = (scId: string, sceneId: string): string | undefined =>
  thumbUrl("endings", `end_${scId}_${sceneId}`) ?? endArt(scId, sceneId);
export const cardThumbOf = (id: string): string | undefined => thumbUrl("cards", id) ?? cardArt(id);
