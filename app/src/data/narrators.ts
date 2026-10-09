// 叙述者归属表：纯数据、零 import。
// 之所以单独成模块而不是并到 data/scenarios.ts 或 ui/art.ts：
// scripts/verify.mts 要按 ui/art.ts 里 narratorArt() 的同一条回落链判「某个视角有没有配立绘」，
// 而 art.ts 带 import.meta.glob（node 侧 import 会炸）、scenarios.ts 的相邻 import 不带 .ts 后缀
// （node 的 ESM loader 要求显式后缀，同样进不来）。手抄一份就会变成两处判据，迟早一处说真话一处说假话。
/** 五桩案件同属一名大理寺卿的断案卷宗（用户 2026-09-28 确认），共用一张立绘与一个名牌 */
export const CASE_SCENARIOS: Record<string, string> = {
  fuma: "大理寺卿", qiuwei: "大理寺卿", sichou: "大理寺卿", xie: "大理寺卿", qinhuai: "大理寺卿",
};
