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
  { id: "b_qi", name: "底气十足", desc: "本局全部对局气力上限 +2", price: 20 },
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
export const SHOP_THEMES: ThemeDef[] = [
  { id: "zhusha", name: "朱砂主题", desc: "朱红为魂，庙堂气象", price: 40 },
  { id: "daiqing", name: "黛青主题", desc: "青灰冷调，江湖夜雨", price: 40 },
  { id: "liujin", name: "鎏金主题", desc: "金碧辉煌，盛世长安", price: 60 },
];

export const boostOf = (id: string): BoostDef | undefined => SHOP_BOOSTS.find((b) => b.id === id);
export const themeOf = (id: string): ThemeDef | undefined => SHOP_THEMES.find((t) => t.id === id);
