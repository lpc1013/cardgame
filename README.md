# 帝成观止 · 中式权谋叙事卡牌

十三部剧本（五案八卷）——以四色卡牌（策·器·势·隐，相克环：策克势·势克器·器克隐·隐克策）对话博弈，以旗标与线索铺陈权谋。

## 目录

| 路径 | 说明 |
|---|---|
| `app/` | 游戏本体（Vite + React 19 + TypeScript） |
| `app/src/engine/` | 纯逻辑引擎：对局 `duel` / 剧情运行时 `runtime` / 小游戏 `minigames` / 存档 `save`（无 DOM 依赖，可被 node 直接驱动） |
| `app/src/data/` | 13 部剧本数据（5 案件 + 8 叙事），直编 `.ts` |
| `app/src/assets/` | 卡图 / 立绘 / 场景 / 封面（按卡/场景 id 精确匹配，缺图自动降级为文字卡） |
| `app/docs/SCHEMA.md` | 剧本数据表格规范（含 Excel 管线现状标注） |
| `app/scripts/verify.mts` | 回归验证套件：场景图完整性 / 可达性 / 对局真实 UI 合同穷举 / 复盘门控 / 钥匙卡可达性 |
| `scripts_txt/` | 剧本文稿底稿 |
| `art/` | 美术提示词与素材存档 |

## 常用命令（`app/` 目录下）

```bash
npm run dev                        # 本地开发
node --experimental-strip-types scripts/verify.mts   # 回归验证（改动引擎/数据后必跑）
node node_modules/typescript/bin/tsc -b              # 类型检查
node node_modules/vite/bin/vite.js build             # 生产构建
```
