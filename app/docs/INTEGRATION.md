# 《帝成观止》技术对接文档

> 版本：2026-08-25 · 配套代码库：`E:\CardGame\app`
> 定位：**模块间接口、数据流、外部依赖与对接规范**（内容工程维度的对接见根目录《项目对接文档.md》）
> 适用读者：后续开发/维护者、剧本作者、美术对接人

---

## 一、架构总览

单页 React 应用，无后端、无构建期数据获取。三层结构：

```
┌─────────────────────────────────────────────┐
│  UI 层  App.tsx（状态机 phase 八态）           │
│   Title / Story / Duel / Pick / Shop /        │
│   Verdict / Ending / MiniGame + 各面板组件    │
├─────────────────────────────────────────────┤
│  引擎层  engine/                              │
│   runtime.ts 叙事状态机 │ duel.ts 对局引擎     │
│   minigames.ts 小游戏 │ save.ts 持久化        │
├─────────────────────────────────────────────┤
│  数据层  data/*.ts（13 部剧本） + assets/      │
│  content/*.xlsx ⇄ scripts/content.mjs 管线    │
└─────────────────────────────────────────────┘
```

**数据驱动**：剧本全部为静态 TypeScript 数据（`src/data/*.ts` 的 `Scenario` 对象），
代码只解释执行，不写死剧情。新增剧本无需改引擎。

---

## 二、核心类型契约（engine/types.ts）

| 类型 | 用途 | 关键字段 |
|---|---|---|
| `Scenario` | 一部剧本 | `id/title/mode/cardSystem/initialDeck/initialSilver/stats/cards/clues/verdict/duels/scenes/startScene/viewpoints` |
| `Scene` | 场景（最小叙事单位） | `id/title/lines/next/choices/effects/duel/cardPick/shop/next2/minigame/ending` |
| `Choice` | 选项 | `text/hint/cond/effects/next` |
| `Cond` | 条件（选项可见性/败线分流） | `flag/flag2/notFlag/clue/cluesAtLeast/card/notCard/resourceAtLeast/statAtLeast` |
| `Effect` | 效果（进入场景/选支时结算） | `setFlag/stat/unlockClue/unlockCard/removeCard/gainSilver/spendSilver` |
| `CardDef` | 卡牌定义 | `id/name/layer(成术·物品·人物·资源)/rarity/suit/power/cost/itemEffect/passive/reveal/clueReveal/shopPeek/resource/price` |
| `DuelConfig` | 对局配置 | `id/mode(emotion·pressure)/title/opponent/goal/hp/script/deck/oppCards/rules(v2·classic)/gambit/seeOpp/winScene/loseScene/loseScene2` |
| `ClueDef` | 线索 | `id/name/kind(true·false·core)/desc` |
| `VerdictDef` | 复盘定谳规则 | `scene/mustPick/coreClue/minTrue/winScene/loseScene` |

四色相克环（贯穿全系统）：**策克势 · 势克器 · 器克隐 · 隐克策**（`RESTRAIN`）。

### 双模式花色语义（2026-08-26 定稿，封面规则书已同步）

| 色 | 探案模式（案件 v2） | 叙事模式（classic） | 克环释义 |
|---|---|---|---|
| 策 | 策略、方法（审讯话术/破局思路） | 韬略、战术 | 算计压过权贵（策克势） |
| 势 | 人证（人物卡，被动常驻） | 人物、士族/文官集团 | 集团压过器械之利（势克器） |
| 器 | 物证（实物与证据） | 物品、火器、科技成果 | 铁证戳穿隐秘（器克隐） |
| 隐 | 隐秘过往、道听途说的真相 | 不为人知的反转、特殊手段 | 暗手破算计（隐克策） |
| 孤品 | 特殊收集（不在四色之内） | 叙事剧本无孤品生态 | — |

**隐 = 藏起来的后手**：一切手段只要不落在明面、延后兑现，就是隐。**陷阱卡**是隐色的进阶玩法（`CardDef.trap`：反伤/抵消/蓄锋，盖放后下轮自动触发）；普通隐色卡照常即时打出。

---

## 三、引擎层接口

### 3.1 runtime.ts — 叙事运行时

| 函数 | 签名 | 说明 |
|---|---|---|
| `initState` | `(sc: Scenario, vpId?: string) => RunState` | 开局状态：stats 初始化、起手卡 bag/deck（视角专属 > 全局默认 > 全卡）、银两 |
| `checkCond` | `(cond, st) => boolean` | 条件判定（全部 AND 语义） |
| `applyEffects` | `(effects, st) => void` | 效果结算：旗标/数值/线索/卡牌/银两；新卡自动进编组（未满 deckLimit） |
| `findScene` | `(sc, id) => Scene` | 场景查找，**不存在即 throw**（数据校验依赖此行为） |
| `visibleChoices` | `(scene, st) => Choice[]` | 过滤不满足 cond 的选项 |
| `registerScenarios` | `(list: Scenario[]) => void` | 剧本注册表（applyEffects 查 deckLimit 用）；App 启动时调用 |

`RunState`：`scenarioId/sceneId/viewpoint/flags(Set)/stats/clues/bag/deck/silver/lineIndex/visited/boosts`

### 3.2 duel.ts — 对局引擎（双规则 + 博弈）

| 函数 | 说明 |
|---|---|
| `initDuel(cfg, deck, allCards, boosts?)` | 初始化对局：v2 洗牌抽 4、解析人物被动、物品卡不入库、帝国加成叠加 |
| `playEmotion(st, card)` | 情绪制出牌：同色共鸣+1 / 克色破防 / 被克-2 / 错色-1；强牌 buff 兑现；v2 出牌不耗行动力 |
| `playPressure(st, card, oppCardId, cardOf)` | 压制制出牌：比点伤气、四色克制 ±1、势牌×2 反噬 1、招式用老 -2、蓄势层加成、破招作废 |
| `endTurn(st)` | v2 换气：回满行动力（含帝国加成）+ 补牌至 4+被动 |
| `revealEmotion(st)` | 亮对手情绪色（博弈局每 3 招虚张一次）；幂等，**不清 lastResult** |
| `readEmotion(st)` | 博弈·读牌：耗 1 气力验虚实，拆穿亮真色 |
| `chargeUp(st, oppId, cardOf)` | 博弈·蓄势：叠蓄力层（上限 2，下张每层 +2） |
| `breakMove(st, suit, oppId, cardOf)` | 博弈·破招：宣言敌招花色，押中作废 |
| `playItem(st, card)` | 物品卡：破防/回气/强牌/共鸣/抽牌(空库洗回弃牌堆)/观牌/观色/观点 |
| `cardCost(c)` / `suitBonus(st, c)` | 费用 / 花色被动加成 |
| `setDuelShuffle(fn)` | 测试注入确定性洗牌（verify 用） |

`DuelState`：`cfg/mode/rules/round/rapport/guard/qi/opponentShown/opponentTrue/bluffed/lastResult/hpPlayer/hpOpponent/hpMax/charge/foresuit/lastPlay/finished/library/hand/discard/ap/baseAp/usedCards/buffPower/seeNext/passives`

**UI 合同（务必遵守）**：
- 情绪制 `script` 存**花色字符串**（策/器/势/隐），不是卡牌 ID——UI 层不得对 emotion 局查卡（历史 P1 卡死根因）
- `playEmotion`/`playPressure` 成功后、未 finish 前 `st.lastResult` 必须非空（反馈文案，verify 已加断言）

### 3.3 minigames.ts — 场景化小游戏

| 模块 | 说明 |
|---|---|
| 骰宝 Sicbo | `initSicbo/sicboRoll/sicboPayout/sicboSetBet`（市集赌坊） |
| 棋局残局 Gobang | `initPuzzle/puzzlePlay`（五子棋残局） |
| 宴上行令 Jiuling | `initJiuling/jiulingDraw/jiulingPlay`（行令三巡 ≥3 胜；手牌含克色容错） |

### 3.4 save.ts — 持久化（localStorage）

| 模块 | Key | 内容 |
|---|---|---|
| 存档 | `dicun_save_v3` | `{version, scenarioId, state, duel?, savedAt}`；形状校验（version=3 且 bag/deck/boosts 等字段齐全，不符即清除） |
| 结局图鉴 | `dicun_gallery_v1` | `{scenarioId, endingName, rank, at}[]` |
| 剧情树 | `dicun_tree_v1` | `scenarioId -> 已见场景 id[]` |
| 卡牌图鉴 | `dicun_cards_v1` | `scenarioId -> 已见卡 id[]` |
| 帝国元进度 | `dicun_empire_v1` | `ink/grantedEnds/warehouse/themes/theme/boosts/brokenSeals` |
| 全局卡注册表 | `dicun_global_cards_v1` | 跨剧本携带物品的定义快照 |

关键函数：`saveGame/loadGame/clearSave/unlockEnding/getGallery/recordTreeVisit/getTree/recordCardsSeen/getCardSeen/settleEmpire/spendInk/gainBoost/consumeBoosts/unlockTheme/setTheme/unsealScenario/registerGlobalCards/getGlobalCards/getGlobalCard`

**存档自动保存时机**（App.tsx useEffect）：st 或对局进度变化即写；对局进行中存 `{cfgId, data}` 可断点续对局。

---

## 四、UI 层接口（App.tsx）

### 4.1 状态机 phase

```
title ──start()──▶ story ──advance()/choose()/gotoFrom()──▶ story(下一场景)
   ▲                  │
   │                  ├─enterSceneOf(duel)─────▶ duel ──finished 结算──▶ story
   │                  ├─enterSceneOf(cardPick)─▶ pick ──afterPick()────▶ story
   │                  ├─enterSceneOf(shop)─────▶ shop ──afterShop()────▶ story
   │                  ├─enterSceneOf(minigame)─▶ minigame ──onFinish()─▶ story
   │                  └─enterSceneOf(verdict)──▶ verdict ──doVerdict()─▶ story(结局)
   └────resume()/ending 结算────┘
```

核心转移函数：
- `gotoFrom(base, id, opts?)`：**唯一**的状态推进入口（计算 next state → applyEffects → setSt → enterSceneOf 分派相位）；`holdView` 用于对局战果定格
- `enterSceneOf(cur, id)`：按目标场景类型切相位（duel/pick/shop/minigame/verdict/story/ending），不动 RunState
- `choose(i)` / `advance()`：选项 / 推进文本（空格/点击）
- `afterPick` / `afterShop` / `doVerdict`：子流程回接

### 4.2 组件 props 契约

| 组件 | 关键 props | 职责 |
|---|---|---|
| `DuelView` | `sc/duel/setDuel/toast/silver/wager/onWager` | 对局渲染：手牌/行动条/博弈动作/押注/洞察揭示；出牌走 `structuredClone` + 引擎 mutate 再 setDuel（防 in-place 反模式） |
| `BagView` | `sc/st/onClose/onMutate/toast/readOnly` | 背包/编组（readOnly 用于行囊携带选择） |
| `ShopView` | `sc/st/shop/onLeave/toast` | 市集（案件内）：买卡/卖卡（钥匙卡禁卖）/卡包/骰宝 |
| `MiniGameView` | `sc/sceneId/onFinish(win, mutated?)` | 棋局/行令 |
| `TreeView` | `sc/onClose` | 剧情树可视化（只读）：固定 cell 间距 84×56、跨级边折返禁长线、viewBox 默认 1/5 缩放、拖拽平移 + 滚轮缩放、还原按钮 |
| `CardZoomView` | `sc/c/seen/onClose` | 卡牌详情弹层（图鉴/行囊共用）：左侧大卡 + 右侧「由来（originLines 全剧本扫描）/ 作用（effectLines 结构化）/ 卡面（lore）」；点外部空白仅关弹层返回上一层 |
| `EmporiumPanel` / `LuggagePanel` / `GalleryPanel` / `SettingsPanel` | `onClose` 等 | 标题页面板（帝国商市/行囊/图鉴/设置） |
| `PrepModal` | `sc/onCancel/onGo(prep, vpId?)` | 出征准备：开局加成勾选 + 行囊携带（至多 2 件） |

---

## 五、数据流

### 5.1 一局流程

```
title 选剧本
  → [多视角剧本] ViewpointModal 选视角
  → PrepModal 勾选开局加成(boosts)/携带物品(carry)
  → start(): initState → applyEffects(start 场景) → setPhase("story")
  → 阅读推进: advance() 逐段显示 lines；到底后自动 goto(scene.next) 或显示 choices
  → choose(i): applyEffects(choice.effects) → gotoFrom(next)
  → 进入对局场景: enterSceneOf 检测 scene.duel → initDuel → setPhase("duel")
  → 对局结束: useEffect(duel.finished) → 押注结算 → gotoFrom(win/loseScene, holdView)
      → 1.6s 定格后 enterSceneOf 切相位
  → [案件] verdict 复盘: 选 mustPick 条线索 → doVerdict 按 coreClue+minTrue 判 win/lose 结局
  → ending: unlockEnding + clearSave → title
```

### 5.2 存档流

```
任意 st/duel 变化 → saveGame (自动)
title 页 loadGame → 有档则显示「继续上次」
resume(): 校验 scenario 存在 + 场景 id 合法（不合法清档）
  → v2 剧本旧档补齐 bag/deck/silver
  → 存档含 duel → 断点续对局（补全博弈字段 charge/foresuit/opponentTrue/bluffed）
```

### 5.3 帝国元进度流

```
解锁结局 → unlockEnding → settleEmpire 补发墨铤(每个 20, 幂等)
商市花墨铤 → gainBoost(开局加成)/unlockTheme(主题)/unsealScenario(破封 60)
出征勾选 → consumeBoosts → RunState.boosts → duelBoostsOf() → 对局参数叠加
跨剧本物品 → noteCards → registerGlobalCards + luggageDefs() 自动入行囊
```

---

## 六、外部依赖

### 6.1 npm 依赖

| 包 | 类型 | 用途 |
|---|---|---|
| `react` / `react-dom` | 生产 | UI（19.x） |
| `vite` / `@vitejs/plugin-react` | 开发 | 构建/开发服务器 |
| `typescript` | 开发 | 类型检查（`tsc -b`） |
| `oxlint` | 开发 | 代码检查（`npm run lint`） |
| `vite-plugin-pwa` | 开发 | PWA 离线（Service Worker + manifest） |
| `xlsx` | 开发 | 内容管线（Excel ⇄ TS，仅 scripts 用） |

无运行时后端、无 API、无第三方运行时依赖。`import.meta.glob` 打包全部资产。

### 6.2 资产目录约定（src/assets/）

| 目录 | 命名 | 说明 |
|---|---|---|
| `cards/策` `cards/器` `cards/势` `cards/隐` | `<卡id>.jpg` | **成术卡**按花色分子目录存放（suit=策/器/势/隐） |
| `cards/gu` | `<卡id>.jpg` | **无花色卡**：物品/人物/资源/孤品稀有度归此（孤） |
| `portraits/` | `<卡id>.jpg` | 人物立绘（大图，`cardArt` 兜底链第二位） |
| `scenes/` | `<剧本id>_<场景id>.jpg`（兼容旧 `scn_*`） | 场景底图（案件级优先剧本前缀） |
| `covers/` | `cover_<剧本id>.jpg` | 封面轮播图（13/13 全） |
| `endings/` | `end_<剧本id>_<场景id>.jpg` | 结局插画（76/76 全，**仅 jpg**） |

**卡图五类归属规则**（`cards/` 子目录）：
- 成术卡（`w_*`/`c_*`/`m_*` 且 layer=成术、有 `suit`）→ 按 suit 进 `策/器/势/隐`
- 物品（`i_*`）/人物（`r_*`）/资源（`s_*`）/孤品稀有度 → `gu/`
- 对手专属牌（`DuelConfig.oppCards`）**不渲染卡面图**，无需图片
- **每张卡图只在分类目录存唯一一份**：禁止根目录散放、禁止跨目录重复（2026-08-25 已清理 98 张重复副本并归位 68 张散图，根目录已清空）；补图直接落入上述子目录

**画幅与安全区规范（2026-08-27 审计 C-1 落定）**：
- 卡图统一 **3:4 竖版（1728×2304 主规格）**；2:3 残留旧图为待办重裁项，逐批替换，不做构建期处理；
- **主体安全区 = 中央 60%×60%**：人物面部／器物全貌／关键笔势必须落在该区内；四边各 ~12% 为可遮挡出血区——tcard 底部说明叠层与顶部名牌、play-card 卡带只允许压住出血区；
- 该条款已写入 `PROMPTS.md` §五模板与 `scripts/gen_art_prompts.mts` 全部出图模板；AI 出稿一律带此约束。

**运行时查找**：`_artUrl` 遍历全部 glob key 匹配 `/<id>.jpg|jpeg|png` 结尾（兼容任意子目录层级）；jpg 优先，png 兜底。图片缺失不阻塞运行（`CardArtPlaceholder` 兜底显示卡名首字占位）。

**当前覆盖率（2026-08-25 资产重核）**：玩家卡 176 张，卡图实有 157/176（缺 19 张新卡，前缀 `g_`/`y_`/`j_`/`z_`/`u_`/`e_`，待补）· 对手专属 22 张不渲染卡面 · portraits 28 · covers 13/13 ✅ · endings 76/76 ✅ · scenes 35/249（~14%，用户指示暂缓）。校验命令：`node --experimental-strip-types scripts/card_audit.mts`

### 6.3 内容管线

```bash
node scripts/content.mjs export              # TS 剧本 → content/*.xlsx（六张表）
node scripts/content.mjs import <xlsx> <id>  # xlsx → src/data/<id>.gen.ts
```

表格列规范见 `docs/SCHEMA.md`；多值字段 `||` 分隔，kv 字段 `k=v;k2=v2`。

---

## 七、对接规范（新增内容三步走）

### 新增剧本
1. `src/data/<id>.ts` 导出 `Scenario`（字段见 §二）；有 Excel 源则用 content.mjs import
2. `src/App.tsx`：import + 加入 `SCENARIOS` 数组（顺序即封面/解锁链顺序）
3. 跑门禁：`verify`（可达性/对局可胜性/复盘门控/钥匙卡可达）→ `tsc -b` → `vite build`

### 新增对局
1. `duels` 数组加 `DuelConfig`（§二）；情绪制 `script` 用花色、压制制用卡 id 或花色（同 script 语义统一为花色，oppCards 供压制制解析）
2. 关联场景：`scene.duel = "<id>"`；补 `winScene/loseScene`（败即结局剧本：loseScene 直指结局场景）
3. 设计性死局（必败叙事）不得开 `gambit`；验证以 verify 全绿为闸

### 新增美术
1. 卡图/立绘/封面/结局图按 §6.2 命名放入 assets 对应目录
2. 重新 build（import.meta.glob 打包）；不需要改代码

> 完整命令见根目录 `README.md`「常用命令」段；门禁链：`verify → tsc -b → vite build`，全绿才可提交。

---

## 八、已知边界与设计取舍

| 项 | 说明 |
|---|---|
| 场景底图覆盖 ~14%（35/249） | 用户指示暂不接入，`scene-bg` 空置属预期 |
| 平衡性「严苛」档 | 11/23 对局普通玩家胜率 <50%（BFS 最优可胜为闸），属已声明取舍；调参备忘见根目录 `_archive/docs/平衡性摸查报告.md` |
| 卡牌稀有度 | 凡·墨灰｜良·黛青｜精·藤紫｜传·鎏金｜孤品·朱砂；仅作**视觉**（卡面边框 + 详情 tag 同色板，均用固定色、不引主题变量），卡面不再显示文字角标；花色「策/器/势/隐」为左上角标识 |
| 线索展示规则 | 结案复盘只呈现 `st.clues`（已解锁线索），未在前文触发的线索不展示 |
| 剧情树视图 | 固定 cell 间距 + viewBox 缩放模型（无滑动条）；`DEFAULT_VIEW=5` 默认缩至 1/5，`MAX_ZOOM=6`/`MIN_ZOOM=0.3` 缩放钳制 |
| 情绪制/压制制双规则 | classic（旧剧本）与 v2（卡牌系统剧本）并存；`rules` 字段分流 |
| 存档版本 | `SAVE_VERSION = 4`；改 RunState 结构须升版本并加迁移（v4：对局 trap/charge/foresuit 等博弈字段缺省补全） |
| 跨剧本卡池「江南流通卡」 | qiuwei 与 sichou 共享 7 张成术（`w_wei_ning/w_li_yi/w_qing_jia/w_li_gui/w_li_guan/w_qing_tong/w_li_fen`）为**有意声明**：同属江南商贸圈，商货流通——非设计失误，勿"修复" |
| 黑市/白市分层 | sichou 牙行为 13 部**唯一黑市**（强卡/雇人/暗柜/死当卡包，货不上明面），三山市集为白市（明码标价走量）；4 个夜市（金陵/桥头/县前/夫子庙）机制同构，靠各自 `desc` 与独有卡包叙事区分 |
| 钥匙卡一律凡级 | `needCard` 触发的钥匙卡（现仅 `r_zhanggui` 账房先生）统一**凡级**——最不起眼的小物件开最深的门 |
| 历史归档 | 根目录 `_archive/`（过程文档/临时脚本/原始剧本素材）；`_archive/README.md` 有索引 |
