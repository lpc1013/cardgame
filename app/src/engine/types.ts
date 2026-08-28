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
  | "抽牌"   // 立即再抽 2 张手牌
  | "观牌"   // 压制制：揭示对手下一手（牌名+点数+花色）
  | "观色"   // 压制制：仅揭示对手下一手花色
  | "观点";  // 压制制：仅揭示对手下一手点数

/** 人物卡被动 */
export interface PassiveDef {
  bonusSuit?: Suit;    // 该花色成术牌 +X 点
  bonusPower?: number; // 默认 +1
  bonusQi?: number;    // 气力(HP)上限 +X（开局生效）
  extraDraw?: number;  // 每回合多抽 X 张
  /** 洞察·瞥见：每 N 回合自动揭示对手下一手（压制制，信息型，不耗行动力） */
  peekEvery?: number;
  /** 洞察·读悉：携带后第 4 回合起显示对手出牌循环（压制制 script 记忆外置） */
  readScript?: boolean;
  /** 斥候（随从·刺探）：对局内可花银两看破对手下一手全牌的次数（压制制） */
  scout?: number;
  /** 内应（随从·收买）：对局内可花银两使对手一招作废的次数（压制制） */
  insider?: number;
  /** 共用次数（精级=1：斥候/内应二选一；传级=2：任选搭配）。缺省=斥候/内应各自独立 */
  sharedTotal?: number;
}

import type { GobangPuzzle, JiulingConfig, QuizConfig, PaijiuConfig } from "./minigames";

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
  /** 成术卡：打出后揭示对手下一手（压制制；"suit"=仅花色，"card"=全牌） */
  reveal?: "suit" | "card";
  /** 成术卡·情境位：对手为该花色时本张 +bonus（压制制；普通卡的功能位——读对手，加在四色克制之外） */
  situational?: { suit: Suit; bonus: number };
  /** 成术卡·机制位·抽牌：打出时抽 N 张（v2 压制制；零交互自动触发） */
  drawOnPlay?: number;
  /** 成术卡·机制位·牺牲：打出时自伤 N 点、本张 +2N（零交互；负向换强） */
  sacrifice?: number;
  /** 隐色陷阱卡：打出=盖放（台面下），下一轮对手出牌时自动触发——反伤(伤害弹回)/抵消(本轮作废)/蓄锋(本张牌+2)；盖位限 1 张 */
  trap?: "反伤" | "抵消" | "蓄锋";
  /** 物品/人物：背包持有即生效 —— 1=复盘时标出核心线索；2=复盘时标出全部真线索 */
  clueReveal?: 1 | 2;
  /** 物品：持有后市集卡包页出现「先验一封」 */
  shopPeek?: boolean;
  /** 人物卡：被动 */
  passive?: PassiveDef;
  /** 资源卡：银两面额（不占卡组槽位） */
  resource?: number;
  /** 市集售价（银两）；非卖品不填 */
  price?: number;
  /** 结局奖励卡：唯一出处=某结局解锁，获得后跨周目可携带（进行囊/卡组） */
  endingReward?: boolean;
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
  flag2?: string;         // 需要第二个旗标（与 flag 同时成立）
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
  /** script 变体池（常驻扰动）：开局随机选一个作为实际 script——玩家背板失效，斥候/破招价值凸显；verify 对每个变体穷举可胜性 */
  scriptVariants?: string[][];
  /** 可用卡牌（卡池子集；经典模式直接全用） */
  deck: string[];
  /** 对手专属牌（气力压制制下 cardOf 的解析来源） */
  oppCards?: CardDef[];
  /** 对局规则：v2=手牌+行动力+道具+被动；缺省 classic（旧剧本兼容） */
  rules?: "classic" | "v2";
  /** 博弈开关（第三批）：启用后解锁心理博弈动作——
   *  情绪制：对手虚张（周期性亮假色）+ 玩家读牌（耗气拆穿）；
   *  压制制：蓄势（蓄力层加成下张）+ 破招（宣言敌色，押中作废敌招）。
   *  设计性死局（必败叙事）不得开启。 */
  gambit?: boolean;
  /** 对手出牌可见性：缺省=案件模式（case）v2 压制局藏牌、其余开牌；"open" 强制明牌，"hidden" 强制藏牌 */
  seeOpp?: "open" | "hidden";
  /** 设计性死局（剧情杀）：玩家必败，败后走败线叙事——verify 跳过可胜性穷举（pressure 已天然放行，emotion 豁免） */
  unwinnable?: boolean;
  winScene: string;
  loseScene: string;
  /** 可选条件败线：满足 cond 时优先于 loseScene（同局多形态败局） */
  loseScene2?: { cond: Cond; scene: string };
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
  /** 暗柜（隐藏货架）：满足 needCard/needSilver 才陈列；price 可覆写卡表价 */
  hiddenStock?: { id: string; price?: number; needCard?: string; needSilver?: number }[];
}

/** 场景（场景表）：叙事的最小单位 */
export interface Scene {
  id: string;
  title?: string;
  /** 场景简介（标题下展示，如夜市的差异化叙事） */
  desc?: string;
  /** 正文段落，按次逐段呈现 */
  lines: string[];
  /**
   * 文本回响（选择承接）：进入场景时按 cond 顺序匹配，首个满足者的 lines
   * **追加到默认正文末尾**（场景结尾给出"决策的结果"）。全部不满足 → 仅默认正文（无条件兜底）。
   * 用于让前置选择在后续剧情产生可见文本差异。
   */
  variantLines?: { cond?: Cond; lines: string[] }[];
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
    type: "gobang" | "jiuling" | "duilian" | "logic" | "paijiu";
    gobang?: GobangPuzzle;
    jiuling?: JiulingConfig;
    quiz?: QuizConfig;
    paijiu?: PaijiuConfig;
    winNext: string;
    loseNext: string;
  };
  /** 章节结束标记（结算画面） */
  ending?: { name: string; rank: string; desc: string; /** 该结局解锁的专属奖励卡 id（唯一出处，跨周目可携带） */ reward?: string };
}

export interface Choice {
  text: string;
  hint?: string;
  cond?: Cond;
  effects?: Effect[];
  next: string;
  /**
   * 降级结局（真结局硬门槛）：选项始终可见；cond 满足 → next（真结局），
   * cond 不满足 → altNext（与真结局最近似的非真结局）。
   * 未定义 altNext 时保持原语义：cond 不满足 = 选项隐藏。
   */
  altNext?: string;
}

/** 视角（多视角剧本体验通道）：开局选定主视角，其余视角折为插叙 */
export interface Viewpoint {
  id: string;
  /** 视角人物名（如「于谦」） */
  name: string;
  /** 一句话视角简介（选视角界面展示） */
  desc: string;
  /** 该视角入口场景 */
  startScene: string;
  /** 专属起手卡（玩法差异；缺省用剧本全局默认） */
  initialDeck?: string[];
  /** 归属该视角的结局场景 id（结局图鉴按视角单列；缺省不归类） */
  endings?: string[];
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
  /** 多视角剧本：开局须先选定主视角才能进入 */
  viewpoints?: Viewpoint[];
}
