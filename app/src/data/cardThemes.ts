// 卡牌「门类」映射表（乙·双轴方案的可视主类目）
// 用途：卡面主类目从「威/理/利/情」四字，改为更丰富的「门类」词汇，
//       跨剧本读到的是十几种不同词，单一词出现率再降一个数量级。
// 本表为侧查表，不改动 5 个游戏数据文件；UI 接入时 `import { cardThemes }` 即可显示。
// 归类依据：卡牌 name + lore（见 gen_art_prompts.mts 的 ART 概念）。

/** 门类词汇表（~13 词，描述卡牌"讲什么"） */
export const THEMES = [
  "刑名", // 司法·案件·律法·刑讯
  "盐铁", // 织造·丝绸·矿冶·垄断货物
  "漕运", // 水运·舟船·河工
  "科举", // 考场·士子·功名·文牍
  "闺阁", // 家眷·亲情·女性·私语
  "宫闱", // 朝堂·内廷·官印·密信·太监
  "江湖", // 市井·侠隐·暗流·底层
  "僧道", // 方外·寺观（预留）
  "边军", // 军伍·亲兵·武备
  "商贾", // 银钱·买卖·市集·账目
  "药石", // 毒药·医理·丹膏·化学
  "琴棋", // 诗书画·雅器·文心
  "工造", // 器物·百工·杂件
] as const;

export type Theme = (typeof THEMES)[number];

/** id → 门类。秋闱/丝绸共用的 w_* 成术卡同 id 同主题。 */
export const cardThemes: Record<string, string> = {
  // ===== 驸马醉酒杀人案 =====
  c_wei_yamen: "刑名",
  c_wei_liang: "刑名",
  c_li_qian: "商贾",
  c_li_mian: "江湖",
  c_qing_tong: "江湖",
  c_qing_nv: "闺阁",
  c_li_lun: "刑名",
  c_li_falv: "刑名",
  i_xin: "宫闱",
  i_yu: "闺阁",
  i_dao: "江湖",
  i_zhu: "工造",
  i_shu: "琴棋",
  i_yinpiao: "商贾",
  r_li_sanj: "江湖",
  r_zhang: "科举",
  r_zhou: "商贾",
  r_shen: "刑名",
  r_wang: "商贾",
  s_yin10: "商贾",
  s_yin30: "商贾",

  // ===== 江南秋闱舞弊案（w_* 与丝绸案共用） =====
  w_wei_chi: "科举",
  w_wei_ning: "科举",
  w_li_guan: "宫闱",
  w_li_yi: "科举",
  w_qing_tong: "科举",
  w_qing_jia: "闺阁",
  w_li_gui: "科举",
  w_li_fen: "科举",
  i_moji: "科举",
  i_siyin: "商贾",
  i_siyesh: "科举",
  i_wenji: "科举",
  i_suoyi: "工造",
  r_suyan: "科举",
  r_xuan: "科举",
  r_wenzy: "宫闱",
  r_chensan: "江湖",
  s_yin10e: "商贾",
  s_yin30d: "商贾",

  // ===== 丝绸贪腐通倭大案（w_* 同上） =====
  i_yinpiao2: "商贾",
  i_midce: "宫闱",
  i_mixin: "宫闱",
  i_guanyin: "宫闱",
  i_sangpizhi: "工造",
  i_anyun: "盐铁",
  r_jiashan: "商贾",
  r_atao: "盐铁",
  r_lvsiyuan: "商贾",
  r_chenhu: "边军",
  r_liuxiaosan: "宫闱",
  s_yin10b: "商贾",
  s_yin50: "商贾",
  s_yin100: "宫闱",

  // ===== 谢秀才自燃案 =====
  x_wen_kuan: "江湖",
  x_wen_bu: "盐铁",
  x_wei_gong: "刑名",
  x_wei_yin: "江湖",
  x_li_an: "江湖",
  x_qing_shi: "闺阁",
  i_jing: "工造",
  i_la: "药石",
  i_suo: "工造",
  i_shigao: "琴棋",
  i_wenjiu: "工造",
  r_zhifu: "盐铁",
  r_tingfeng: "江湖",
  r_ande: "商贾",
  r_leiru: "刑名",
  s_yin10c: "商贾",
  s_yin30b: "商贾",

  // ===== 秦淮河堤秘亡案 =====
  h_wei_zhang: "刑名",
  h_li_yin: "商贾",
  h_li_zhang: "刑名",
  h_qing_mu: "江湖",
  h_qing_nv: "闺阁",
  h_li_tui: "商贾",
  h_wei_chen: "宫闱",
  h_li_lun: "刑名",
  i_xiang: "闺阁",
  i_shui: "漕运",
  i_zhang: "商贾",
  i_gongxiang: "宫闱",
  i_yinzan: "闺阁",
  r_shishang: "商贾",
  r_liuzhou: "漕运",
  r_pei: "刑名",
  r_zhoumang: "江湖",
  s_yin10d: "商贾",
  s_yin30c: "漕运",

  // ===== 对手专属牌（对局） =====
  p_shen_1: "刑名",
  p_shen_2: "刑名",
  p_shen_3: "商贾",
  y_feng: "宫闱",
  y_xiao: "江湖",
  y_zhen: "刑名",
};

/** 兜底：无显式映射时，按父分类给一个合理默认（策→刑名，器→商贾，势→宫闱）。 */
export function themeOf(id: string, suit?: string): string {
  if (cardThemes[id]) return cardThemes[id];
  if (suit === "器") return "商贾";
  if (suit === "势") return "宫闱";
  return "刑名"; // 策 默认刑名
}
