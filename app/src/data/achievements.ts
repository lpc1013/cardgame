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

export const ACHIEVEMENTS: AchievementDef[] = [
  // ============ 卡组 · 弱卡点名（39，剧本级） ============
  ...WEAK_CARDS.map(([sc, cardId]) => ({
    id: `weak_${sc}_${cardId}`,
    name: `废卡翻身 · ${cardId}`,
    cond: `携带「${cardId}」通关剧本 ${sc}（它不弱，是没人用）`,
    category: "deck" as const,
    reward: "墨铤 +3",
    scenario: sc,
  })),

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
  { id: "charge_master", name: "蓄势待发", cond: "叠满 2 层蓄势后出牌获胜", category: "duel", reward: "墨铤 +5" },
  { id: "trap_kill", name: "陷阱大师", cond: "隐色陷阱触发反杀获胜", category: "duel", hidden: true, reward: "墨铤 +6" },
  { id: "scout_win", name: "斥候建功", cond: "用刺探看破后获胜", category: "duel", reward: "墨铤 +4" },
  { id: "insider_win", name: "内应得手", cond: "用收买策反后获胜", category: "duel", reward: "墨铤 +4" },
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
  { id: "hero_letter", name: "信在人在", cond: "传令兵线达成「信在人在」结局", category: "hidden", hidden: true, reward: "墨铤 +8" },
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
  { id: "st_shumian_junji60", name: "令行禁止", cond: "十面埋伏：军纪≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "shumian", statAtLeast: { junji: 60 } },
  { id: "st_shumian_diye60", name: "三分天下", cond: "十面埋伏（主公）：帝业≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "shumian", statAtLeast: { diye: 60 } },
  { id: "st_changjiang_jungong60", name: "功高震主", cond: "不尽长江：军功≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "changjiang", statAtLeast: { junGong: 60 } },
  { id: "st_changjiang_dixin35", name: "帝心难测", cond: "不尽长江：帝心≤35 通关", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "changjiang", statAtMost: { dixin: 35 } },
  { id: "st_diaolan_quanli60", name: "权倾朝野", cond: "雕栏玉彻：权柄≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "diaolan", statAtLeast: { quanli: 60 } },
  { id: "st_diaolan_renmai35", name: "众叛亲离", cond: "雕栏玉彻：人心≤35 通关", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "diaolan", statAtMost: { renmai: 35 } },
  { id: "st_changhen_junchen60", name: "君臣相得", cond: "长恨：君臣之分≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "changhen", statAtLeast: { junchen: 60 } },
  { id: "st_jianfeng_weiwang60", name: "威震四方", cond: "剑锋之上：王威≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "jianfeng", statAtLeast: { weiwang: 60 } },
  { id: "st_xingxing_junxin60", name: "三军用命", cond: "星火：军心≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "xingxing", statAtLeast: { junxin: 60 } },
  { id: "st_touming_junxin60", name: "军心可用", cond: "投名状：军心≥60 通关", category: "collect", reward: "墨铤 +8", scenario: "touming", statAtLeast: { junxin: 60 } },
  { id: "st_touming_xinyong35", name: "信用破产", cond: "投名状：信用≤35 通关", category: "hidden", hidden: true, reward: "墨铤 +10", scenario: "touming", statAtMost: { xinyong: 35 } },
];

/** 对局胜利时判定（卡组构成 + 形态；行为类走跨局计数由钩子处理） */
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
  // 禁强
  if (cards.length && cards.every((id) => (ctx.rarityOf?.(id) ?? "凡") === "凡")) win("all_common");
  if (cards.length && cards.every((id) => (ctx.rarityOf?.(id) ?? "凡") !== "孤品")) win("no_relic");
  if (cards.length && cards.every((id) => (ctx.layerOf?.(id) ?? "成术") !== "人物")) win("no_person");
  if (cards.length && cards.every((id) => (ctx.layerOf?.(id) ?? "成术") !== "物品")) win("no_item");
  if (cards.length && cards.every((id) => ["凡", "良"].includes(ctx.rarityOf?.(id) ?? "凡"))) win("no_legend");
  if (cards.length && cards.every((id) => (ctx.rarityOf?.(id) ?? "凡") !== "传")) win("no_rare");
  if (cards.length && cards.every((id) => (ctx.layerOf?.(id) ?? "成术") === "成术")) win("pure_art");
  // 形态
  const suits = cards.map((id) => ctx.suitOf?.(id)).filter(Boolean) as string[];
  const layers = cards.map((id) => ctx.layerOf?.(id) ?? "成术");
  if (suits.length && new Set(suits).size === 1) {
    const s = suits[0]!;
    win(s === "策" ? "mono_ce" : s === "器" ? "mono_qi" : s === "势" ? "mono_shi" : "mono_yin");
  }
  if (cards.length > 0 && cards.length <= 6) win("minimal_deck");
  if (cards.length >= 12) win("full_deck");
  if (suits.length && new Set(suits).size === 2) win("dual_suit");
  if (suits.length && new Set(suits).size === 1) {
    const s = suits[0]!;
    win(s === "策" ? "all_ce" : s === "器" ? "all_qi" : s === "势" ? "all_shi" : "all_yin");
  }
  if (layers.every((l) => l !== "资源")) win("no_resource");
  if (ctx.deck.includes("j_min") && ctx.duelId === "d_defense") win("weak_card");
  return out;
}

/** 小游戏胜利时判定 */
export function checkMinigameAchievements(
  ctx: { type: string; win: boolean; allRight?: boolean; netGain?: number },
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
  return out;
}

/** 结局结算时判定（剧本级弱卡点名 + 收集 + 隐藏彩蛋 + stat 博弈成就） */
export function checkEndingAchievements(
  ctx: {
    scenarioId: string;
    endingName: string;
    usedCards: string[];
    silver: number;
    stats: Record<string, number>;
    caseEndsDone: number;
    storyEndsDone: number;
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
  if (ctx.caseEndsDone >= 5) win("all_cases");
  if (ctx.storyEndsDone >= 8) win("story_all");
  if (ctx.scenarioId === "jieyu" && ctx.endingName === "信在人在") win("hero_letter");
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
