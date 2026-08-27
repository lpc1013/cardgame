# 池子三层审计报告 · 2026-08-26（批次 D）

> 范围：13 部剧本全部玩家卡 + 对手专属 + 资产目录 + 所有引用池。只读审计，未动任何数据。
> 脚本：`scripts/pool_audit.mts`（新写，可复用）。
> **终态更新（19:15）**：按拍板方案完成修复——D1 错位清零；D3 从 123 张降至 **63 张**（案件 36 挂商店+招牌剧情发放、叙事 24 进对局 deck；剩余 63 张全为 8 叙事成术，留作批次 C 番外钥匙）。

---

## 总览

| 维度 | 结果 |
|---|---|
| 玩家卡 | 308 张 |
| 对手专属 | 31 张 |
| 资产图 | 304 张（四色+gu，根目录 0） |
| **D1 资产层** | ⚠️ 目录错位 70 张 + 跨目录重复 1 + 缺图 10（陷阱卡，预期） |
| **D2 数据层** | ✅ 全绿：陷阱错位 0 · 资源卡缺字段 0 · 悬空引用 0 |
| **D3 玩法层** | 🔴 **123 张卡（40%）无任何可用池**——抽到/持有永远无法上场 |

---

## D1 资产层（目录归属）

**⚠️ 目录错位 70 张**——分两类：

1. **物品/人物/资源卡 68 张按 suit 放进了四色目录**（而非规范要求的 gu）：
   - 人物 `r_*` 24 张在「势」（r_ande/r_jiashan/r_suyan…）
   - 物品 `i_*` 33 张在「器」（i_anyun/i_guanyin/i_zhu…）
   - 资源 `s_yin*` 11 张在「器」（s_yin10/30/50/100…）
   - 人物 `r_laoshao/r_neiting` 2 张在「隐」
   - 根因：add_130_cards.mjs 落图时按 suit 目录放，与"物品/人物/资源/孤品进 gu"规范冲突
2. **隐色成术 2 张在「策」**：`h_rang`（让棋一子）、`m_hao`（耗其心气）——真错位，应移「隐」

**跨目录重复 1**：`i_yinpiao`（多处存在，需确认去重）

**缺图**：玩家卡 10 张全是陷阱卡（f_tianji/f_dengxia/q_majing/q_cangjuan/s_yadi/s_kuiguan/x_huoxian/x_menhou/q_anshao/q_yezhong）——已知待生成，非新问题；对手卡缺图 25 张（预期不渲染）；资产多余 0。

---

## D2 数据层（语义/引用）——全绿

- 陷阱字段只在隐色成术上：0 错位
- 资源卡全部有 resource 字段
- 卡包 pool / 商店 stock / 暗柜 / 对局 deck / 翻牌 / 剧情 unlockCard / 结局奖励 / 初始卡组——**悬空引用 0 条**，所有引用 id 均存在于卡表

---

## D3 玩法层——🔴 123 张卡无可用池（40%）

**判定标准**：一张卡至少落在以下一个池才算"可获得/可上场"——对局 deck、初始卡组、商店 stock、卡包 pool、暗柜、翻牌三选一、剧情 unlockCard、结局奖励、随身位可携带。

**按剧本分布**：

| 剧本 | 无池卡 | 构成 |
|---|---|---|
| 案件 5 部 | 36 | 成术 31 + 资源 5（有 price 但**未挂商店/卡包**） |
| 叙事 8 部 | 87 | 全成术（无商店，**未进任何对局 deck**） |
| 合计 | **123** | 成术 118 + 资源 5 |

**关键结论**：
1. **案件剧本**：add_130 新卡的传级招牌（f_diantang 金殿玉墀 / q_changshi 题纸封条 / x_dengyou 灯油辨迹…）与其余成术/资源**有 price 但没挂任何商店货架或卡包**——商店只渲染 `shop.stock`，不是全量 price 卡，所以永远买不到
2. **叙事剧本**：8 部无卡系统（cardSystem=false）、无商店，对局 deck 写死——add_130 补的 80 张新卡**全部**没进对局 deck / 剧情发放 → **87 张全废**，纯躺在卡表里
3. **陷阱卡 12 张全部可用** ✅：10 张案件陷阱在卡包（案件 v2 有编组，抽到可入 deck），2 张叙事陷阱在写死对局 deck
4. 资源卡 `s_huangcai` 等 5 张：仅能靠翻牌/剧情/卡包获得，当前无处可得

**修正此前判断**：之前说"案件陷阱玩家带不进对局"不准确——案件剧本是 v2 卡系统（ShopView 有 deck 编组页），卡包抽到的陷阱可编组进对局。真正的问题是**叙事剧本**：无卡系统，新卡完全无入口。

---

## 待拍板项

### 拍板 1：D1 目录规范（70 张错位怎么算）
- **A. 执行既有规范**：68 张物品/人物/资源移回 `cards/gu`，h_rang/m_hao 移「隐」（用 card_organize.mts）
- **B. 改规范**：物品/人物/资源按 suit 进四色目录（与 add_130 落图一致），规范更新为"成术按 suit、物品/人物/资源按 suit 并入同色、孤品进 gu"

### 拍板 2：D3 无池卡接入方向（123 张怎么救）
- **A. 案件挂商店/卡包 + 叙事进对局 deck**：案件 36 张按 price 挂对应剧本 shop stock（或并入卡包 pool）；叙事 87 张精选进对局 deck（改变对局体验需谨慎）或改剧情 unlockCard
- **B. 全量"商店/卡包化"**：案件正常挂；叙事剧本也加商店/卡包节点（8 部叙事结构大改）
- **C. 分批接**：先接每部传级招牌（13 张）+ 资源卡，其余成术并入卡包/后续分批
- **D. 其他**（你定）

---

## 附录：123 张无池卡完整清单

**案件（36）**：fuma：c_li_qian/f_diantang/f_tangji/f_yeyan/f_gongnei/f_anxiang/f_yandu/s_huangcai；qiuwei：q_changshi/q_bishi/q_xiaosheng/q_zhuangao/q_yinbao/q_guanting/s_wenjufei；sichou：s_yingsi/s_huodizhang/s_yanchuan/s_qiaocheng/s_banhuo/s_yaoshi/s_chaosi；xie：x_dengyou/x_jumen/x_zhiying/x_huoyan/x_chuangzhi/x_tieqi/s_zhibi；qinhuai：q_hua/q_yanzhi/q_shuixian/q_tingzhou/q_jinshui/q_yelu/s_heyi

**叙事（87）**：jieyu：j_gucheng/j_xuncheng/j_liangdao/j_huobing/j_wengcheng/j_haojiao/j_junzhang/j_xiema/j_shuimian/j_jiyu；shumian：s_jinggu/s_hanxin/s_chutian/s_gaixia/s_wujiang/s_yuxin/s_zhangchi/s_qibing/s_huoshou/s_liangcai；changjiang：c_jiangjiao/c_chenchen/c_zhoudu/c_shuizhen/c_chaoji/c_shaijun/c_jingyi/c_mouli/c_guoshi/c_yulao；diaolan：d_bi/d_tui/d_taihou/d_waioi/d_huanzhe/d_gongbian/d_jiaosuo/d_guiren/d_duanbi/d_cefan/d_manshu/d_zhuchen；changhen：h_chi/h_huan/h_jiange/h_taiwei/h_tongji/h_jiangzuo/h_qiuzhuang/h_lingjun/h_wuji/h_zaici/h_miling/h_guanshi；jianfeng：j_duan/jf_tianxia/jf_huangquan/jf_shuishi/jf_junzhou/jf_anshi/jf_chengzhou/jf_guyu/jf_mingdao/jf_dongwu/jf_jiangxin；xingxing：g_wei_ding/g_ren_shou/x_shenghuo/x_geshi/x_duizhang/x_citang/x_tiankan/x_jiutui/x_maozi/x_gesheng/x_huodu/x_litu；touming：t_yuye/t_liangjia/t_shaoming/t_haohan/t_baodao/t_zhenwei/t_mishu/t_yinji/t_duanhe/t_ciji
