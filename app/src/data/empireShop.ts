// ============================================================
// 帝国商市：全局商店商品定义（墨铤本位，跨剧本生效）
//   - 开局加成：消耗品，出征面板勾选后对「下一局剧本」生效
//   - 主题外观：永久解锁，切换全局配色
// ============================================================

export interface BoostDef {
  id: string;
  name: string;
  desc: string;
  price: number; // 墨铤
}

/** 开局加成（单局生效，用过即消耗） */
export const SHOP_BOOSTS: BoostDef[] = [
  { id: "b_silver", name: "粮草丰足", desc: "本局初始银两 +10", price: 15 },
  { id: "b_qi", name: "底气十足", desc: "本局压制制对局气力上限 +2", price: 20 },
  { id: "b_ap", name: "援军接济", desc: "本局压制制初始行动力 +1", price: 20 },
  { id: "b_draw", name: "精锐随行", desc: "本局 v2 对局起手多抽 1 张", price: 25 },
];

export interface ThemeDef {
  id: string;
  name: string;
  desc: string;
  price: number; // 墨铤
}

/** 主题外观（永久解锁，随时切换） */
// 2026-09-29 用户定：只留三套主题，每套要有自己的完整视觉语言。
// 原六套（朱砂/黛青/鎏金/青瓷雅韵/黛蓝幽梦/鎏金富贵）整体下线，
// 连同 app.css 里 36 个规则块一并删除。默认「朝堂宣纸」占第一套，
// 这里补一深一浅：边军（铁甲风沙）/ 江南（粉墙黛瓦）。
export const SHOP_THEMES: ThemeDef[] = [
  { id: "bianjun", name: "边军", desc: "铁甲风沙，旌旗铆钉——沙碛褐地与方折角饰", price: 60 },
  { id: "jiangnan", name: "江南", desc: "粉墙黛瓦，水波冰裂——墙白湖绿与瓦当圆角", price: 60 },
];

export const boostOf = (id: string): BoostDef | undefined => SHOP_BOOSTS.find((b) => b.id === id);
export const themeOf = (id: string): ThemeDef | undefined => SHOP_THEMES.find((t) => t.id === id);
