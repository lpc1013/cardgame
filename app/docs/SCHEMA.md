# 剧本数据表格规范（SCHEMA）

> ⚠️ **管线现状（2026-08-24 审计后标注）**：`scripts/content.mjs` 尚未实现下文全部 v2 列，
> 按本文档制表的新剧本经 Excel→CSV→.ts 转换会被**静默降级**。目前仅直编 `src/data/*.ts` 可保真。
> **尚未支持的列**：卡牌表 `layer / rarity / itemEffect / passive / resource / price / image / theme`（导入连 `cost` 也丢）；
> 场景表 `cardPick / shop / minigame / next2`；选项条件 `card / notCard / resourceAtLeast`；
> 效果 `removeCard / gainSilver / spendSilver`；对局表 `rules / oppCards`；总表 `cardSystem / deckLimit / initialDeck / initialSilver`。
> 管线补齐前，请勿用表格产出含上述字段的内容。
>
> 目标：剧本内容全部由表格（Excel/CSV）维护，代码只负责解释执行。
> 对应代码：`src/engine/types.ts`。转换流程：Excel 每个_sheet_ → CSV → 构建时转为 `src/data/*.ts`。

## 一张剧本 = 六张表

### 1. 总表（Scenario）
| 列 | 说明 |
|---|---|
| id / title / subtitle | 剧本标识、标题、副标题 |
| mode | `case`（案件模式）/ `story`（叙事模式） |
| stats | 数值条定义，如 `军心=50,信用=50`（按剧本启用不同子集） |
| startScene | 入口场景 id |

### 2. 场景表（Scene）——核心表
| 列 | 说明 |
|---|---|
| id | 场景唯一标识 |
| title | 小节标题（可选） |
| lines | 正文段落，一格一段（Excel 里用「换行分格」或一行一段多行记录） |
| next | 无选项时的下一场景 id |
| effects | 进入时结算：`旗标=x` / `数值+=n` / `解锁线索=x` / `解锁卡牌=x` |
| duel | 进入时发起对局（填对局 id） |
| ending | 章节结束标记（结局名/评级/结语） |

### 3. 选项表（Choice）
| 列 | 说明 |
|---|---|
| sceneId | 挂在哪个场景下 |
| text / hint | 选项文本 / 倾向提示 |
| cond | 显示条件：`旗标=x` `无旗标=x` `有线索=x` `数值≥n` |
| effects | 选择时结算（同上） |
| next | 前往场景 id |

### 4. 卡牌表（CardDef · 四层卡体系）
| 列 | 说明 |
|---|---|
| id / name | 标识与名称 |
| layer | 四层：`成术`（对局四色牌）/ `物品`（对局道具+剧情钥匙）/ `人物`（携带被动）/ `资源`（银两，不占卡组槽） |
| rarity | 五档：`凡`（墨灰）/ `良`（黛青）/ `精`（藤紫）/ `传`（鎏金）/ `孤品`（朱砂，全剧唯一） |
| suit | 成术卡花色（四色）：`策 / 器 / 势 / 隐`（相克环：策克势 · 势克器 · 器克隐 · 隐克策） |
| text / lore | 出牌说明 / **卡面碎片叙事** |
| power | 成术卡点数（压制制） |
| cost | 行动力费用（压制制缺省 1；情绪制不耗行动力；一般不必填） |
| itemEffect | 物品卡道具效果：`破防/回气/强牌/共鸣/抽牌`（用后本局消耗） |
| passive | 人物卡被动：`bonusSuit+bonusPower`（花色加点）/ `bonusQi`（气力上限）/ `extraDraw` |
| trap / trapTrigger | 隐色陷阱卡：效果 `反伤/抵消/蓄锋/落空/借力/回生`；M4 起可配触发条件 `trapTrigger`（缺省 always=对手下一手主攻即触发），可选 `{kind:"oppSuit",suit}` / `{kind:"oppPowerAtLeast",n}` / `{kind:"selfHpBelow",n}`，条件未满足保持盖放不消耗 |
| topics | M5 情绪制内容化：话题词数组，与本手「话头」（对局 emotionTopics）命中即算接话（花色层照常并行） |
| resource | 资源卡面额（获得即入钱袋） |
| price | 市集售价；非卖品不填（引擎默认按 10 两结算）。**显式填 0 = 陈列非卖品**：买/卖均被拒（2026-08-24 审计后补语义） |

**条件（Cond）新增**：`card=x`（背包有该卡——卡牌即钥匙）、`notCard=x`、`resourceAtLeast=n`。
**效果（Effect）新增**：`unlockCard=x`（入背包，卡组未满自动上组）、`removeCard=x`（打出/送出/烧毁）、`gainSilver=n`、`spendSilver=n`。
**总表新增**：`cardSystem=true`（启用 v2）、`deckLimit=12`、`initialDeck=[...]`、`initialSilver`。

### 5. 线索表（ClueDef）——案件模式用
| 列 | 说明 |
|---|---|
| id / name / desc | 线索信息 |
| kind | `true` 重要真线索 / `false` 伪线索 / `core` 核心必备 |

### 场景级玩法挂点（场景表新列）
| 列 | 说明 |
|---|---|
| cardPick | 三选一翻牌：`title / options[3] / next`（翻到资源卡自动折银） |
| shop | 市集：`name / desc / stock[]` + `packs[]`（卡包 price/pool/draws）；界面含货架/卡包/编组/赌坊四页 |
| minigame | 场景化小游戏：`type: gobang | jiuling` + 各自配置 + `winNext / loseNext`（骰宝在市集赌坊页，不入场景表） |

### 6. 对局表（DuelConfig）
| 列 | 说明 |
|---|---|
| mode | `emotion`（情绪匹配制）/ `pressure`（气力压制制） |
| goal / hp | 情绪制目标共鸣数 / 压制制双方气力 |
| script | 对手出牌序列（情绪制填花色序列；压制制填对手牌 id 序列），循环取用；**不得为空** |
| deck | 玩家可用卡池子集（卡 id 必须存在于卡牌表或本对局 oppCards） |
| oppCards | 对手专属牌（压制制对手牌在此定义；情绪制不需要） |
| rules | `classic`（叙事剧本：固定手牌）/ `v2`（案件剧本：牌库抽牌+行动力+道具+被动） |
| turnSchema | M2 回合制结构：`phased`=交替回合（我方主阶段→对手回合主行动→我方应手）；缺省 `legacy`（按出手推进）。**压制局应填 `phased`**；classic 压制局在 phased 下自动进入轻回合（每回合一个主行动，出完自动交先手） |
| ai | M3 对手 AI 条件规则集（phased 生效，缺省全开）：`finisherCharge`（蓄力满放杀招）/ `defensiveHpPct`（残血蓄势阈值，0=关闭）/ `counterRepeat`（我方连出同色则宣言破招，缺省随 gambit）/ `oppTraps`（中盘埋伏，缺省开）。**剧情杀（unwinnable）必须配无情 AI**：`{finisherCharge:false, defensiveHpPct:0, counterRepeat:false, oppTraps:false}` |
| emotionTopics | M5 情绪制话头：按回合索引循环的话题词数组（`[["敲打"],["恩宠"],…]`），与卡牌 topics 求交命中即算接话 |
| winScene / loseScene | 胜/败去向场景 |

## 结局判定（verdict，案件模式）
在总表附：`复盘场景 id`、`可选线索数`、`核心线索 id`、`最少真线索数`、`胜/败场景 id`。
规则：选中的线索包含核心线索 **且** 真线索数达标 → 真相结局；否则 → 庸判/坏结局。

## 双规则对局
四色相克环（单向）：**策克势 · 势克器 · 器克隐 · 隐克策**。
**接口（函数/参数/UI 合同）详见 `INTEGRATION.md` §3.2**；本文档不重复引擎实现，只列两规则之间的字段差异：

| 维度 | 情绪匹配制（emotion） | 气力压制制（pressure） |
|---|---|---|
| `script` 填法 | 花色字符串序列（策/器/势/隐） | 对手牌 id 序列（可用 `oppCards`） |
| `goal` 含义 | 共鸣数（缺省 5）满即胜 | — |
| `hp` 含义 | — | 双方气力（缺省 10） |
| `cost` 是否耗 | 不耗（v2） | 压制制每回合 3 点行动力 |
| `oppCards` 是否需要 | 否 | 是 |
| `rules` | `classic` / `v2` | `classic` / `v2` |

`rules: "v2"`（卡牌系统剧本）：卡组洗入牌库（**人物卡不进牌库、开局即场外生效**），起手抽 4，出牌入弃、回合末补至 4；牌库空时洗回弃牌堆；物品卡打出触发 `itemEffect` 并本局消耗。

### 真回合（turnSchema: "phased"，2026-09 duels-v3 起）
- **回合结构**：我方主阶段（出牌/蓄势/破招宣言/盖放，v2 受行动力约束）→ 结束回合交出先手 → 对手回合主行动（出招/蓄势/盖暗算/宣言破招）→ 我方应手 → 下一回合。
- **应手**：对手主攻时从手牌选一张成术接招——守方 +1，反击差值减半（保底 1），不引爆发动位（牺牲/抽牌不结算），势牌同享 ×1.5 但不反噬。
- **轻回合**：classic 压制局自动启用——无手牌无行动力，每回合一个主行动，出完自动交先手；主攻享先手 +1。
- **陷阱**：伏击对手的主攻（我方盖的在他回合触发，他的暗算在我方主攻时触发）；盖位双方各 1。
- **数值护栏**：势倍率只作用基础点数（power+被动）；单次交换伤害上限 6（TURN_DAMAGE_CAP）。
- **verify 门禁**：phased 全合同 BFS + 逐变体穷举 + 首回合极限伤害 ≤6 + 剧情杀 unwinnable 反向断言；新对局数据必须过 `node --experimental-strip-types scripts/verify.mts`。

场景化小游戏（骰宝/棋局残局/宴会行令）的配置字段见 `INTEGRATION.md` §3.3。

## 校验
`npm run verify`（已接入 build）检查：场景图可达性、对局 script/deck 卡牌引用、
effects/cond 引用的线索/卡牌/数值是否存在、复盘门控合法性、裸卡组四色覆盖、
全部对局按**真实 UI 合同**穷举可解性（情绪制无换气通道；压制制含出牌+换气）。
设计性必败局（叙事剧本败线演出）允许穷举不可胜。

## 命名约定
- 场景 id：`start / origin / witness / a_xxx / b_xxx / end_a_win ...`（A=正道线，B=权谋线）
- 线索 id：`x1..x9`；卡牌 id：`c_花色_名`（前缀表语义分类，与四色 suit 字段独立）；旗标：全小写下划线（`line_A` 除外，保留可读性）
