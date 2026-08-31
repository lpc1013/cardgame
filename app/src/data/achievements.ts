// ============================================================
// 成就系统 v2：核心 = 让大量普通卡被用得上
// 卡组构成挑战（弱卡点名/禁强/形态）占主体，行为/收集为副
// 判定钩子：对局胜利 / 小游戏结算 / 结局结算（剧本级 usedCards）
// ============================================================

export type AchCategory = "deck" | "duel" | "minigame" | "collect" | "hidden";

export interface AchievementDef {
  id: string;
  name: string;
  /** 达成条件（人类可读） */
  cond: string;
  category: AchCategory;
  hidden?: boolean;
  reward: string;
  /** 归属剧本（弱卡点名等剧本级成就；空=通用，任何剧本都可达成） */
  scenario?: string;
  /** stat 硬门槛：结局结算时校验（达标即达成）——打通「朝望/圣眷/时限」等 stat 博弈闭环 */
  statAtLeast?: Record<string, number>;
  statAtMost?: Record<string, number>;
}

/** 弱卡点名：13 部各 3 张"最冷门"凡卡（power 低/无功能），剧本级判定（usedCards 含该卡且通关） */
const WEAK_CARDS: [string, string][] = [
  ["fuma", "c_li_mian"], ["fuma", "c_qing_tong"], ["fuma", "c_wei_yamen"],
  ["qiuwei", "w_li_guan"], ["qiuwei", "w_qing_tong"], ["qiuwei", "w_wei_ning"],
  ["sichou", "r_zhanggui"], ["sichou", "w_li_guan"], ["sichou", "w_qing_tong"],
  ["xie", "x_wen_kuan"], ["xie", "x_wei_yin"], ["xie", "x_wen_bu"],
  ["qinhuai", "h_li_zhang"], ["qinhuai", "h_qing_nv"], ["qinhuai", "h_li_yin"],
  ["jieyu", "j_min"], ["jieyu", "j_bi"], ["jieyu", "j_hou"],
  ["shumian", "m_fang"], ["shumian", "m_zun"], ["shumian", "m_wen"],
  ["changjiang", "c_qi_qi"], ["changjiang", "c_ben_yi"], ["changjiang", "c_qi_shou"],
  ["diaolan", "d_shou"], ["diaolan", "d_tui"], ["diaolan", "d_wen"],
  ["changhen", "h_yong"], ["changhen", "h_fang"], ["changhen", "h_chi"],
  ["jianfeng", "j_qu"], ["jianfeng", "jf_shi"], ["jianfeng", "j_wei"],
  ["xingxing", "g_qing_huo"], ["xingxing", "g_li_zheng"], ["xingxing", "g_li_shi"],
  ["touming", "t_wen"], ["touming", "t_dun"], ["touming", "t_li"],
];

const WEAK_CARD_NAMES: Record<string, string> = {
  "weak_fuma_c_li_mian": "抬出靠山", "weak_fuma_c_qing_tong": "将心比心", "weak_fuma_c_wei_yamen": "官威压顶",
  "weak_qiuwei_w_li_guan": "官场人情", "weak_qiuwei_w_qing_tong": "雨中体恤", "weak_qiuwei_w_wei_ning": "冷眼威压",
  "weak_sichou_r_zhanggui": "账房先生", "weak_sichou_w_li_guan": "官场人情", "weak_sichou_w_qing_tong": "雨中体恤",
  "weak_xie_x_wen_kuan": "温言宽慰", "weak_xie_x_wei_yin": "隐于夜色", "weak_xie_x_wen_bu": "不动声色",
  "weak_qinhuai_h_li_zhang": "算利害账", "weak_qinhuai_h_qing_nv": "闺阁叙话", "weak_qinhuai_h_li_yin": "攻心设饵",
  "weak_jieyu_j_min": "民助城防", "weak_jieyu_j_bi": "避其锋芒", "weak_jieyu_j_hou": "固守反击",
  "weak_shumian_m_fang": "放其生路", "weak_shumian_m_zun": "全其体面", "weak_shumian_m_wen": "缓图",
  "weak_changjiang_c_qi_qi": "弃子", "weak_changjiang_c_ben_yi": "弃辎轻进", "weak_changjiang_c_qi_shou": "守拙",
  "weak_diaolan_d_shou": "按兵不动", "weak_diaolan_d_tui": "断腕求生", "weak_diaolan_d_wen": "步步为营",
  "weak_changhen_h_yong": "恩宠有加", "weak_changhen_h_fang": "外放夺权", "weak_changhen_h_chi": "急宣回京",
  "weak_jianfeng_j_qu": "劝降不屠", "weak_jianfeng_jf_shi": "诛心之议", "weak_jianfeng_j_wei": "十倍围之",
  "weak_xingxing_g_qing_huo": "念念伤员", "weak_xingxing_g_li_zheng": "据理力争", "weak_xingxing_g_li_shi": "陈述实情",
  "weak_touming_t_wen": "缓言", "weak_touming_t_dun": "据守", "weak_touming_t_li": "算账",
};
const SCENARIO_NAMES: Record<string, string> = {
  fuma: "驸马醉酒杀人案", qiuwei: "江南秋闱舞弊案", sichou: "丝绸通倭案", xie: "谢秀才自燃案",
  qinhuai: "秦淮河堤秘亡案", jieyu: "劫与烬", shumian: "十面埋伏", changjiang: "不尽长江滚滚流",
  changhen: "人生长恨水长东", jianfeng: "剑锋之上", xingxing: "星星之火，可以燎原",
  touming: "投名状", diaolan: "雕栏玉彻朱颜再",
};
/** F-14：弱卡成就跨剧本同名（官场人情/雨中体恤在秋闱案与丝绸案各一条）——重名时行名追加剧本短名 */
const SCENARIO_SHORT: Record<string, string> = {
  fuma: "驸马案", qiuwei: "秋闱案", sichou: "丝绸案", xie: "灯案", qinhuai: "秦淮案",
  jieyu: "劫与烬", shumian: "埋伏", changjiang: "长江", diaolan: "雕栏", changhen: "长恨",
  jianfeng: "剑锋", xingxing: "星火", touming: "投名状",
};
const WEAK_NAME_COUNT: Record<string, number> = {};
for (const [sc, cardId] of WEAK_CARDS) {
  const nm = WEAK_CARD_NAMES[`weak_${sc}_${cardId}`] ?? cardId;
  WEAK_NAME_COUNT[nm] = (WEAK_NAME_COUNT[nm] ?? 0) + 1;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ============ 卡组 · 弱卡点名（39，剧本级） ============
  ...WEAK_CARDS.map(([sc, cardId]) => {
    const cardName = WEAK_CARD_NAMES[`weak_${sc}_${cardId}`] ?? cardId;
    // F-14：跨剧本同名卡（如两案的「官场人情」）行名追加剧本短名，消除同屏重复行的歧义
    const disp = (WEAK_NAME_COUNT[cardName] ?? 0) > 1 ? `${cardName}（${SCENARIO_SHORT[sc] ?? sc}）` : cardName;
    return {
      id: `weak_${sc}_${cardId}`,
      name: `沧海遗珠 · ${disp}`,
      cond: `携带「${cardName}」通关剧本 ${SCENARIO_NAMES[sc] ?? sc}（它不弱，是没人用）`,
      category: "deck" as const,
      reward: "墨铤 +3",
      scenario: sc,
    };
  }),

  // ============ 卡组 · 禁强（8） ============
  { id: "all_common", name: "白衣卿相", cond: "只用凡级卡组赢下一局", category: "deck", hidden: true, reward: "称号「白衣卿相」" },
  { id: "no_relic", name: "不假于物", cond: "不带任何孤品卡赢下一局", category: "deck", reward: "墨铤 +5" },
  { id: "no_person", name: "孤军奋战", cond: "不带任何人物卡赢下一局", category: "deck", reward: "墨铤 +5" },
  { id: "no_item", name: "空手入白刃", cond: "不带任何物品卡赢下一局", category: "deck", reward: "墨铤 +5" },
  { id: "no_legend", name: "凡良之师", cond: "卡组全为凡/良（禁精传孤）赢下一局", category: "deck", reward: "墨铤 +8" },
  { id: "no_rare", name: "不慕荣华", cond: "不带任何传级卡赢下一局", category: "deck", reward: "墨铤 +5" },
  { id: "pure_art", name: "纯正之艺", cond: "纯成术卡组（无物无人）赢下一局", category: "deck", reward: "墨铤 +6" },
  { id: "bare_deck", name: "白手起家", cond: "不带任何外带卡（裸卡组）赢下一局", category: "deck", hidden: true, reward: "墨铤 +10" },

  // ============ 卡组 · 形态（13） ============
  { id: "mono_ce", name: "一策到底", cond: "只用策色成术卡赢下一局", category: "deck", hidden: true, reward: "墨铤 +8" },
  { id: "mono_qi", name: "一器到底", cond: "只用器色成术卡赢下一局", category: "deck", hidden: true, reward: "墨铤 +8" },
  { id: "mono_shi", name: "一势到底", cond: "只用势色成术卡赢下一局", category: "deck", hidden: true, reward: "墨铤 +8" },
  { id: "mono_yin", name: "一隐到底", cond: "只用隐色成术卡赢下一局", category: "deck", hidden: true, reward: "墨铤 +8" },
  { id: "minimal_deck", name: "以少胜多", cond: "卡组不超过 6 张赢下一局", category: "deck", reward: "墨铤 +6" },
  { id: "full_deck", name: "兵强马壮", cond: "卡组满编 12 张赢下一局", category: "deck", reward: "墨铤 +4" },
  { id: "dual_suit", name: "两仪相济", cond: "只用两种花色成术卡赢下一局", category: "deck", reward: "墨铤 +6" },
  { id: "all_qi", name: "物尽其用", cond: "卡组全为器色卡赢下一局", category: "deck", hidden: true, reward: "墨铤 +8" },
  { id: "all_ce", name: "算无遗策", cond: "卡组全为策色卡赢下一局", category: "deck", hidden: true, reward: "墨铤 +8" },
  { id: "all_shi", name: "势不可当", cond: "卡组全为势色卡赢下一局", category: "deck", hidden: true, reward: "墨铤 +8" },
  { id: "all_yin", name: "神出鬼没", cond: "卡组全为隐色卡赢下一局", category: "deck", hidden: true, reward: "墨铤 +8" },
  { id: "no_resource", name: "视金钱如粪土", cond: "不带资源卡赢下一局", category: "deck", reward: "墨铤 +4" },
  { id: "weak_card", name: "民助城防", cond: "携带「民助城防」赢下德胜门", category: "deck", hidden: true, reward: "称号「不忘旧部」" },

  // ============ 对局（12） ============
  { id: "first_win", name: "初战告捷", cond: "任意对局获胜", category: "duel", reward: "墨铤 +3" },
  { id: "perfect_win", name: "毫发无伤", cond: "以满气力赢下一局", category: "duel", reward: "墨铤 +5" },
  { id: "last_stand", name: "力挽狂澜", cond: "只剩 1 点气力时赢下一局", category: "duel", reward: "墨铤 +5" },
  { id: "speedy_win", name: "速战速决", cond: "一局 ≤3 回合获胜", category: "duel", reward: "墨铤 +5" },
  { id: "break_ten", name: "破招十连", cond: "累计破招成功 10 次", category: "duel", reward: "墨铤 +8" },
  { id: "charge_master", name: "蓄势待发", cond: "累计蓄势 5 次（行为成就）", category: "duel", reward: "墨铤 +5" },
  { id: "trap_kill", name: "陷阱大师", cond: "隐色陷阱触发后赢下一局", category: "duel", hidden: true, reward: "墨铤 +6" },
  { id: "scout_win", name: "斥候建功", cond: "用刺探看破后获胜", category: "duel", reward: "墨铤 +4" },
  { id: "insider_win", name: "内应得手", cond: "用收买策反后获胜", category: "duel", reward: "墨铤 +4" },
  { id: "st_changjiang_tuchu_win", name: "血路突围", cond: "不尽长江：太子亲自带队突围，杀出血路", category: "duel", reward: "墨铤 +6", scenario: "changjiang" },
  { id: "win_20", name: "百战不殆", cond: "累计获胜 20 局", category: "duel", reward: "称号「百战之身」" },
  { id: "classic_5", name: "复古棋手", cond: "classic 对局累计获胜 5 次", category: "duel", reward: "墨铤 +6" },
  { id: "retinue_duo", name: "左膀右臂", cond: "带 2 名随从出战并赢下一局", category: "duel", reward: "墨铤 +5" },

  // ============ 小游戏（8） ============
  { id: "duilian_master", name: "工对三要", cond: "文萃堂吟诗作对胜出", category: "minigame", reward: "墨铤 +3" },
  { id: "logic_master", name: "断案如神", cond: "证词真假推理胜出", category: "minigame", reward: "墨铤 +3" },
  { id: "paijiu_master", name: "赌坊贵客", cond: "牙行推牌九胜出", category: "minigame", reward: "墨铤 +5" },
  { id: "gobang_master", name: "棋逢对手", cond: "棋局残局胜出", category: "minigame", reward: "墨铤 +3" },
  { id: "jiuling_master", name: "令行禁止", cond: "宴会行令胜出", category: "minigame", reward: "墨铤 +3" },
  { id: "quiz_all", name: "满堂彩", cond: "任意问答类小游戏三题全对", category: "minigame", reward: "墨铤 +4" },
  { id: "mg_cycle", name: "五艺俱全", cond: "五种小游戏各胜一次", category: "minigame", hidden: true, reward: "称号「五艺俱通」" },
  { id: "paijiu_high", name: "庄家肉疼", cond: "牌九单局净胜 ≥30 两", category: "minigame", reward: "墨铤 +6" },

  // ============ 收集（8） ============
  { id: "rich_man", name: "腰缠万贯", cond: "单剧本银两攒满 100 两", category: "collect", reward: "墨铤 +6" },
  { id: "tycoon", name: "富可敌国", cond: "单剧本银两攒满 200 两", category: "collect", hidden: true, reward: "墨铤 +12" },
  { id: "album_50", name: "博览群书", cond: "天下卡册达成率 50%", category: "collect", reward: "墨铤 +8" },
  { id: "album_80", name: "学富五车", cond: "天下卡册达成率 80%", category: "collect", reward: "墨铤 +15" },
  { id: "album_100", name: "天下全知", cond: "天下卡册达成率 100%", category: "collect", hidden: true, reward: "称号「天下全知」" },
  { id: "item_5", name: "行囊满满", cond: "跨剧本行囊物品 ≥5 件", category: "collect", reward: "墨铤 +5" },
  { id: "all_scenarios", name: "全境首通", cond: "13 部剧本各达成至少 1 个结局", category: "collect", reward: "墨铤 +15" },
  { id: "all_cases", name: "五案全破", cond: "五个案件剧本各达成至少一个结局", category: "collect", reward: "墨铤 +10" },
  { id: "story_all", name: "叙事通览", cond: "8 部叙事剧本全部通关", category: "collect", reward: "墨铤 +15" },
  { id: "hero_letter", name: "信在人在", cond: "劫与烬：石亨线达成「信在人在」结局", category: "hidden", hidden: true, reward: "墨铤 +8" },
  // ============ stat 博弈成就（结局结算校验 statAtLeast/statAtMost，21 条） ============
  { id: "st_fuma_chaoting60", name: "清名御史", cond: "驸马案：朝望≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "fuma", statAtLeast: { chaoting: 60 } },
  { id: "st_fuma_daoyi35", name: "白手套", cond: "驸马案：道义≤35 通关（B 线圆谎）", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "fuma", statAtMost: { daoyi: 35 } },
  { id: "st_qiuwei_chaoting60", name: "清名御史", cond: "秋闱案：朝望≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "qiuwei", statAtLeast: { chaoting: 60 } },
  { id: "st_qiuwei_shijian2", name: "惜时如金", cond: "秋闱案：三日限期剩余≥2 通关", category: "collect", reward: "墨铤 +8", scenario: "qiuwei", statAtLeast: { shijian: 2 } },
  { id: "st_qiuwei_shijian0", name: "夜以继日", cond: "秋闱案：三日限期耗尽通关", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "qiuwei", statAtMost: { shijian: 0 } },
  { id: "st_sichou_shengjuan60", name: "圣眷正隆", cond: "丝绸案：圣眷≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "sichou", statAtLeast: { shengjuan: 60 } },
  { id: "st_sichou_minxin65", name: "为民请命", cond: "丝绸案：民命≥65 通关", category: "collect", reward: "墨铤 +8", scenario: "sichou", statAtLeast: { minxin: 65 } },
  { id: "st_xie_shengyuan60", name: "圣眷正隆", cond: "灯案：圣眷≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "xie", statAtLeast: { shengyuan: 60 } },
  { id: "st_qinhuai_shenwang60", name: "望重江南", cond: "秦淮案：圣望≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "qinhuai", statAtLeast: { shenwang: 60 } },
  { id: "st_jieyu_junwei60", name: "军威赫赫", cond: "劫与烬：军威≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "jieyu", statAtLeast: { junwei: 60 } },
  { id: "st_jieyu_renwen35", name: "孤家寡人", cond: "劫与烬：人心≤35 通关", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "jieyu", statAtMost: { renwen: 35 } },
  { id: "st_jieyu_renwen60", name: "一呼百应", cond: "劫与烬：人心≥60 通关（刀下留人/道歉/送冬衣）", category: "collect", reward: "墨铤 +8", scenario: "jieyu", statAtLeast: { renwen: 60 } },
  { id: "st_jieyu_daoge", name: "倒戈一击", cond: "劫与烬：也先最后一战（德胜门·最后一战）获胜", category: "duel", reward: "墨铤 +6", scenario: "jieyu" },
  { id: "st_jieyu_wanjing", name: "晚景", cond: "劫与烬：达成「晚景」结局（南迁线·新世界线）", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "jieyu" },
  { id: "st_jieyu_shihou", name: "忠国公", cond: "劫与烬：石亨达成「忠国公」结局（夺门线）", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "jieyu" },
  { id: "st_jieyu_bingzu", name: "边关老卒", cond: "劫与烬：石亨达成「边关老卒」结局（拒夺门）", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "jieyu" },
  { id: "st_shumian_junji60", name: "令行禁止", cond: "十面埋伏：军纪≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "shumian", statAtLeast: { junji: 60 } },
  { id: "st_shumian_diye60", name: "三分天下", cond: "十面埋伏（主公）：帝业≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "shumian", statAtLeast: { diye: 60 } },
  { id: "st_changjiang_jungong60", name: "功高震主", cond: "不尽长江：军功≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "changjiang", statAtLeast: { junGong: 60 } },
  { id: "st_changjiang_dixin35", name: "帝心难测", cond: "不尽长江：帝心≤35 通关", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "changjiang", statAtMost: { dixin: 35 } },
  { id: "st_changjiang_minxin60", name: "载舟", cond: "不尽长江：民心≥60 通关（水能载舟）", category: "collect", reward: "墨铤 +8", scenario: "changjiang", statAtLeast: { minxin: 60 } },
  { id: "st_diaolan_quanli60", name: "权倾朝野", cond: "雕栏玉彻：权柄≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "diaolan", statAtLeast: { quanli: 60 } },
  { id: "st_diaolan_renmai35", name: "众叛亲离", cond: "雕栏玉彻：人心≤35 通关", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "diaolan", statAtMost: { renmai: 35 } },
  { id: "st_changhen_junchen60", name: "君臣相得", cond: "长恨：君臣之分≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "changhen", statAtLeast: { junchen: 60 } },
  { id: "st_jianfeng_weiwang60", name: "威震四方", cond: "剑锋之上：王威≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "jianfeng", statAtLeast: { weiwang: 60 } },
  { id: "st_xingxing_junxin60", name: "三军用命", cond: "星火：军心≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "xingxing", statAtLeast: { junxin: 60 } },
  { id: "st_touming_junxin60", name: "军心可用", cond: "投名状：军心≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "touming", statAtLeast: { junxin: 60 } },
  { id: "st_touming_xinyong35", name: "信用破产", cond: "投名状：信用≤35 通关", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "touming", statAtMost: { xinyong: 35 } },
];

// F-7：卡组构成类成就只在 v2 卡牌系统剧本有判定意义——classic 剧本 deck=剧本全卡集（非玩家可操纵卡组），
// 会出现「任意胜局自动解锁满编12张」式误发与「弱卡白给」。判定侧按 ctx.v2 门控，文案补标注。
const V2_ONLY_ACH = new Set([
  "all_common", "no_relic", "no_person", "no_item", "no_legend", "no_rare", "pure_art", "bare_deck",
  "mono_ce", "mono_qi", "mono_shi", "mono_yin", "minimal_deck", "full_deck", "dual_suit",
  "all_qi", "all_ce", "all_shi", "all_yin", "no_resource",
]);
for (const a of ACHIEVEMENTS) {
  if (V2_ONLY_ACH.has(a.id) && !a.cond.includes("v2")) a.cond += "（仅 v2 卡牌剧本）";
}

/** 对局胜利时判定（卡组构成 + 形态；行为类走跨局计数由钩子处理）
 *  F-7：ctx.v2=false（classic 剧本）时卡组构成类判定整体跳过——classic 的 deck 是剧本全卡集而非玩家编组 */
export function checkDuelAchievements(
  ctx: {
    deck: string[];
    rarityOf?: (id: string) => string | undefined;
    suitOf?: (id: string) => string | undefined;
    layerOf?: (id: string) => string | undefined;
    hpPlayer: number;
    hpMax: number;
    round: number;
    retinueCount: number;
    duelId?: string;
    v2?: boolean;
    /** F-4 门禁补漏：裸卡组（编组全部来自本剧初始卡，无任何外带/随从/奖励卡）——verify 断言抓出的第 7 条无钩子成就 */
    bareDeck?: boolean;
  },
  owned: Set<string>,
): string[] {
  const out: string[] = [];
  const win = (id: string) => { if (!owned.has(id)) { out.push(id); owned.add(id); } };
  const cards = ctx.deck;
  if (cards.length) win("first_win");
  if (ctx.hpPlayer >= ctx.hpMax && ctx.hpMax > 0) win("perfect_win");
  if (ctx.hpPlayer === 1) win("last_stand");
  if (ctx.round <= 3) win("speedy_win");
  if (ctx.retinueCount >= 2) win("retinue_duo");
  const v2 = ctx.v2 === true;
  // 禁强（仅 v2：classic 无编组语义）
  if (v2 && cards.length && cards.every((id) => (ctx.rarityOf?.(id) ?? "凡") === "凡")) win("all_common");
  if (v2 && cards.length && cards.every((id) => (ctx.rarityOf?.(id) ?? "凡") !== "孤品")) win("no_relic");
  if (v2 && cards.length && cards.every((id) => (ctx.layerOf?.(id) ?? "成术") !== "人物")) win("no_person");
  if (v2 && cards.length && cards.every((id) => (ctx.layerOf?.(id) ?? "成术") !== "物品")) win("no_item");
  if (v2 && cards.length && cards.every((id) => ["凡", "良"].includes(ctx.rarityOf?.(id) ?? "凡"))) win("no_legend");
  if (v2 && cards.length && cards.every((id) => (ctx.rarityOf?.(id) ?? "凡") !== "传")) win("no_rare");
  if (v2 && cards.length && cards.every((id) => (ctx.layerOf?.(id) ?? "成术") === "成术")) win("pure_art");
  // 形态（仅 v2）
  const suits = v2 ? cards.map((id) => ctx.suitOf?.(id)).filter(Boolean) as string[] : [];
  const layers = v2 ? cards.map((id) => ctx.layerOf?.(id) ?? "成术") : [];
  if (suits.length && new Set(suits).size === 1) {
    const s = suits[0]!;
    win(s === "策" ? "mono_ce" : s === "器" ? "mono_qi" : s === "势" ? "mono_shi" : "mono_yin");
  }
  if (v2 && cards.length > 0 && cards.length <= 6) win("minimal_deck");
  if (v2 && cards.length >= 12) win("full_deck");
  if (suits.length && new Set(suits).size === 2) win("dual_suit");
  if (suits.length && new Set(suits).size === 1) {
    const s = suits[0]!;
    win(s === "策" ? "all_ce" : s === "器" ? "all_qi" : s === "势" ? "all_shi" : "all_yin");
  }
  if (v2 && layers.every((l) => l !== "资源")) win("no_resource");
  if (v2 && ctx.bareDeck) win("bare_deck");
  if (ctx.deck.includes("j_min") && ctx.duelId === "d_defense") win("weak_card");
  // 劫与烬：也先倒戈一击（德胜门 · 最后一战）胜局
  if (ctx.duelId === "d_daoge") win("st_jieyu_daoge");
  // 不尽长江：太子突围（d_tuchu）胜局专属成就
  if (ctx.duelId === "d_tuchu") win("st_changjiang_tuchu_win");
  return out;
}

/** 小游戏胜利时判定（F-4：补 mg_cycle 五艺俱全钩子——五类各胜一次，App 侧按 mg_<type> 计数器汇总传入） */
export function checkMinigameAchievements(
  ctx: { type: string; win: boolean; allRight?: boolean; netGain?: number; fiveArts?: boolean },
  owned: Set<string>,
): string[] {
  const out: string[] = [];
  if (!ctx.win) return out;
  const win = (id: string) => { if (!owned.has(id)) { out.push(id); owned.add(id); } };
  const map: Record<string, string> = {
    duilian: "duilian_master", logic: "logic_master", paijiu: "paijiu_master",
    gobang: "gobang_master", jiuling: "jiuling_master",
  };
  const id = map[ctx.type];
  if (id) win(id);
  if (ctx.allRight) win("quiz_all");
  if (ctx.netGain !== undefined && ctx.netGain >= 30) win("paijiu_high");
  if (ctx.fiveArts) win("mg_cycle");
  return out;
}

/** 结局结算时判定（剧本级弱卡点名 + 收集 + 隐藏彩蛋 + stat 博弈成就）
 *  F-4：补齐此前无判定钩子的六条——album_50/80/100（卡册达成率）、item_5（行囊）、
 *  all_scenarios（13 部全通）；由 App 在结局结算时计算比率/数量后传入 */
export function checkEndingAchievements(
  ctx: {
    scenarioId: string;
    endingName: string;
    usedCards: string[];
    silver: number;
    stats: Record<string, number>;
    caseEndsDone: number;
    storyEndsDone: number;
    albumRatio?: number;
    luggageCount?: number;
    allScenariosDone?: boolean;
  },
  owned: Set<string>,
): string[] {
  const out: string[] = [];
  const win = (id: string) => { if (!owned.has(id)) { out.push(id); owned.add(id); } };
  const uc = new Set(ctx.usedCards ?? []);
  for (const [scId, cardId] of WEAK_CARDS) {
    if (ctx.scenarioId === scId && uc.has(cardId)) win(`weak_${scId}_${cardId}`);
  }
  if (ctx.silver >= 100) win("rich_man");
  if (ctx.silver >= 200) win("tycoon");
  if ((ctx.albumRatio ?? 0) >= 0.5) win("album_50");
  if ((ctx.albumRatio ?? 0) >= 0.8) win("album_80");
  if ((ctx.albumRatio ?? 0) >= 1) win("album_100");
  if ((ctx.luggageCount ?? 0) >= 5) win("item_5");
  if (ctx.allScenariosDone) win("all_scenarios");
  if (ctx.caseEndsDone >= 5) win("all_cases");
  if (ctx.storyEndsDone >= 8) win("story_all");
  if (ctx.scenarioId === "jieyu" && ctx.endingName === "信在人在") win("hero_letter");
  if (ctx.scenarioId === "jieyu" && ctx.endingName === "晚景") win("st_jieyu_wanjing");
  if (ctx.scenarioId === "jieyu" && ctx.endingName === "忠国公") win("st_jieyu_shihou");
  if (ctx.scenarioId === "jieyu" && ctx.endingName === "边关老卒") win("st_jieyu_bingzu");
  // stat 博弈成就：结局结算时按 statAtLeast/statAtMost 校验（朝望/圣眷/时限等闭环）
  const st = ctx.stats ?? {};
  for (const a of ACHIEVEMENTS) {
    if (a.scenario !== ctx.scenarioId) continue;
    if (!a.statAtLeast && !a.statAtMost) continue;
    let ok = true;
    if (a.statAtLeast) for (const [k, v] of Object.entries(a.statAtLeast)) if ((st[k] ?? 0) < v) ok = false;
    if (a.statAtMost) for (const [k, v] of Object.entries(a.statAtMost)) if ((st[k] ?? 0) > v) ok = false;
    if (ok) win(a.id);
  }
  return out;
}
