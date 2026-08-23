// ============================================================
// 剧本数据 Schema（表格驱动）
// 对应表格规范见 docs/SCHEMA.md —— 每个接口对应一张 Excel/CSV 表
// 卡牌系统 v2：四层卡（成术/物品/人物/资源）+ 稀有度 + 费用
// ============================================================

/** 卡牌花色（对话手段的四类体系）：策=谋略招式 / 器=实物器物 / 势=势力人脉 / 隐=暗桩阴私。
 * 成术卡主归策（借势类例外归势）；人物卡归势；物品/资源归器。 */
export type Suit = "策" | "器" | "势" | "隐";
// 四色相克环（单向）：策克势 · 势克器 · 器克隐 · 隐克策

/** 卡牌层级：四层卡体系 */
export type CardLayer = "成术" | "物品" | "人物" | "资源";

/** 稀有度五档：凡→良→精→传→孤品 */
export type Rarity = "凡" | "良" | "精" | "传" | "孤品";

/** 物品卡的对局内效果 */
export type ItemEffect =
  | "破防"   // 情绪制：防备归零并共鸣+1 / 压制制：造成 4 点伤害
  | "回气"   // 恢复 3 点气力(HP)
  | "强牌"   // 本回合下一张成术牌点数+3
  | "共鸣"   // 情绪制：共鸣+2 / 压制制：造成 3 点伤害
  | "抽牌";  // 立即再抽 2 张手牌

/** 人物卡被动 */
export interface PassiveDef {
  bonusSuit?: Suit;    // 该花色成术牌 +X 点
  bonusPower?: number; // 默认 +1
  bonusQi?: number;    // 气力(HP)上限 +X（开局生效）
  extraDraw?: number;  // 每回合多抽 X 张
}

import type { GobangPuzzle, JiulingConfig } from "./minigames";

/** 场景模式 */
export type ScenarioMode = "case" | "story";

/** 卡牌定义（卡牌表） */
export interface CardDef {
  id: string;
  name: string;
  /** 四层卡；旧数据未填按「成术」处理 */
  layer?: CardLayer;
  /** 稀有度；缺省「凡」 */
  rarity?: Rarity;
  /** 成术卡花色 */
  suit?: Suit;
  /** 出牌说明 */
  text: string;
  /** 卡面描述 —— 碎片化叙事藏在这里 */
  lore: string;
  /** 成术卡点数（气力压制制） */
  power?: number;
  /** 行动力费用（对局 v2·压制制；缺省 1；情绪制不耗行动力） */
  cost?: number;
  /** 物品卡：对局内效果（使用后消耗） */
  itemEffect?: ItemEffect;
  /** 人物卡：被动 */
  passive?: PassiveDef;
  /** 资源卡：银两面额（不占卡组槽位） */
  resource?: number;
  /** 市集售价（银两）；非卖品不填 */
  price?: number;
  /** 卡面图路径（美术接入用；亦可运行时查 cardThemes 取门类） */
  image?: string;
  /** 门类（乙·双轴方案的可视主类目；缺省按 cardThemes 查表） */
  theme?: string;
}

/** 线索定义（线索表） */
export interface ClueDef {
  id: string;
  name: string;
  /** 真伪：true=重要真线索 / false=伪线索；core 标记核心必备 */
  kind: "true" | "false" | "core";
  desc: string;
}

/** 数值/条件/效果（通用） */
export interface Cond {
  flag?: string;          // 需要该旗标
  notFlag?: string;       // 需要没有该旗标
  clue?: string;          // 需要已解锁该线索
  cluesAtLeast?: number;  // 需要已解锁线索总数 ≥ n
  card?: string;          // 需要背包中有该卡（卡牌即钥匙）
  notCard?: string;       // 需要背包中没有该卡
  resourceAtLeast?: number; // 银两 ≥ n
  statAtLeast?: Record<string, number>;
}

export interface Effect {
  setFlag?: string;
  stat?: Record<string, number>;   // 增量
  unlockClue?: string;
  unlockCard?: string;             // 获得卡（进背包）
  removeCard?: string;             // 失去/消耗卡（打出、送出、烧毁）
  gainSilver?: number;             // 获得银两（资源本位）
  spendSilver?: number;            // 花费银两
}

/** 对局配置 */
export interface DuelConfig {
  id: string;
  mode: "emotion" | "pressure";
  title: string;
  intro: string;
  opponent: { name: string; desc: string };
  /** 情绪匹配制：需要“接住”的次数 */
  goal?: number;
  /** 气力压制制：双方初始气力 */
  hp?: { player: number; opponent: number };
  /** 对手出牌序列（按回合索引循环取用），为 suit 或 cardId */
  script: string[];
  /** 可用卡牌（卡池子集；经典模式直接全用） */
  deck: string[];
  /** 对手专属牌（气力压制制下 cardOf 的解析来源） */
  oppCards?: CardDef[];
  /** 对局规则：v2=手牌+行动力+道具+被动；缺省 classic（旧剧本兼容） */
  rules?: "classic" | "v2";
  winScene: string;
  loseScene: string;
}

/** 三选一翻牌（剧情奖励点） */
export interface CardPick {
  title: string;
  /** 候选卡（翻面三选一） */
  options: string[];
  next: string;
}

/** 卡包（市集可购） */
export interface PackDef {
  id: string;
  name: string;
  price: number;
  /** 随机池 */
  pool: string[];
  /** 抽取张数 */
  draws: number;
}

/** 市集配置 */
export interface ShopDef {
  name: string;
  desc?: string;
  /** 常驻货架（卡 id → 售价可覆写卡表 price） */
  stock: string[];
  packs?: PackDef[];
}

/** 场景（场景表）：叙事的最小单位 */
export interface Scene {
  id: string;
  title?: string;
  /** 正文段落，按次逐段呈现 */
  lines: string[];
  /** 选项（互斥分支；不满足 cond 的选项隐藏） */
  choices?: Choice[];
  /** 无选项时点击继续前往的下一场景 */
  next?: string;
  /** 进入场景时自动结算的效果 */
  effects?: Effect[];
  /** 进入场景时自动发起对局 */
  duel?: string;
  /** 进入场景时弹出三选一翻牌 */
  cardPick?: CardPick;
  /** 进入场景时进入市集（买卖/编组/卡包） */
  shop?: ShopDef;
  /** 离开市集/翻牌后前往的场景 */
  next2?: string;
  /** 场景化小游戏（胜/败分别跳转） */
  minigame?: {
    type: "gobang" | "jiuling";
    gobang?: GobangPuzzle;
    jiuling?: JiulingConfig;
    winNext: string;
    loseNext: string;
  };
  /** 章节结束标记（结算画面） */
  ending?: { name: string; rank: string; desc: string };
}

export interface Choice {
  text: string;
  hint?: string;
  cond?: Cond;
  effects?: Effect[];
  next: string;
}

/** 剧本（一张总表 + 子表引用） */
export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  mode: ScenarioMode;
  /** 启用卡牌系统 v2（背包/编组/市集）；旧剧本缺省关闭走经典模式 */
  cardSystem?: boolean;
  /** 编组上限（缺省 12；资源卡不占槽） */
  deckLimit?: number;
  /** 初始携带卡（cardSystem 剧本） */
  initialDeck?: string[];
  /** 初始银两 */
  initialSilver?: number;
  /** 数值条说明（按剧本启用不同子集） */
  stats?: { key: string; name: string; init: number }[];
  cards: CardDef[];
  clues?: ClueDef[];
  /** 结局判定：结局场景前的“复盘”场景由此规则评分 */
  verdict?: {
    scene: string;              // 触发复盘的场景 id
    mustPick: number;           // 玩家可选线索数
    coreClue: string;           // 核心必备线索
    minTrue: number;            // 至少 N 条重要真线索
    winScene: string;
    loseScene: string;
  };
  duels: DuelConfig[];
  scenes: Scene[];
  startScene: string;
}
