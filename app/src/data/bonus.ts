// ============================================================
// 番外系统（批次 C）：叙事 63 张剩余卡 = 番外钥匙
// 解锁规则：携带该剧本番外的 keyCards 中任意 ≥need 张，
//            赢下本剧本任意对局 → 解锁该番外（幂等，localStorage）
// 挂点：卡详情（CardZoomView）番外区块——已解锁可读，未解锁显示条件
// ============================================================

export interface BonusScene {
  id: string;
  scenarioId: string;   // 归属剧本
  title: string;
  desc: string;         // 一句话简介（卡详情页展示）
  keyCards: string[];   // 钥匙卡（该剧本无可用池的剩余成术）
  need: number;         // 解锁所需携带张数（默认 2）
  lines: string[];      // 番外正文
}

export const BONUS_SCENES: BonusScene[] = [
  {
    id: "bonus_jieyu",
    scenarioId: "jieyu",
    title: "军帐灯下",
    desc: "德胜门前夜，军帐里的一盏灯，和一个不肯睡的小兵。",
    keyCards: ["j_liangdao", "j_huobing", "j_wengcheng", "j_junzhang", "j_xiema", "j_shuimian", "j_jiyu"],
    need: 2,
    lines: [
      "军帐的灯芯结了花。帐外雨声密，城头换更的号子隔两重墙传来。",
      "小兵抱着火牌不肯睡，说怕误了传令的时辰。你把灯芯挑亮了些。",
      "「睡吧。」你说，「城在，令就在。」",
      "他头一点一点，终于栽倒在火牌上。你替他掖了掖甲胄的边。",
      "天亮时，号角响了。他跳起来就跑，火牌在怀里捂得滚烫。",
    ],
  },
  {
    id: "bonus_shumian",
    scenarioId: "shumian",
    title: "乌江夜",
    desc: "虞姬剑影落尽的夜，江边只剩一舟、一马、一个人。",
    keyCards: ["s_chutian", "s_huoshou", "s_liangcai", "s_qibing", "s_wujiang", "s_yuxin", "s_zhangchi"],
    need: 2,
    lines: [
      "江水是黑的。船系在桩上，桩是湿的。",
      "他把剑插回鞘里。鞘上还挂着一截断了的红缨——虞姬的。",
      "马不肯上船。它在岸边刨地，一声一声，像是催他。",
      "他伸手摸了摸马鬃，然后解开缰绳，把马往岸上推。",
      "船离岸时，马还站在那儿，望着江。天快亮了，四面楚歌也歇了。",
    ],
  },
  {
    id: "bonus_changjiang",
    scenarioId: "changjiang",
    title: "渔老夜话",
    desc: "江上雾起的时辰，老渔翁的船头挂着一盏不肯熄的灯。",
    keyCards: ["c_zhoudu", "c_chaoji", "c_mouli", "c_guoshi", "c_yulao", "c_shuizhen", "c_jingyi"],
    need: 2,
    lines: [
      "雾起的时候，渔老把船头那盏灯拨亮了些。",
      "「坐。」他说，「江上几十年，什么风浪没见过——你且说，你想争什么。」",
      "你说了。他没有应，只把钓竿收起来，指着远处：「看见那道光没有？」",
      "江心有一星灯火，摇摇晃晃，却总也不灭。",
      "「那是打更人的船。江山的事，急不得——浪头大的夜里，灯火先要立住。」",
    ],
  },
  {
    id: "bonus_diaolan",
    scenarioId: "diaolan",
    title: "宫变前夜",
    desc: "金锁玉链锁着的那道门，门里门外，都有人一夜未眠。",
    keyCards: ["d_cefan", "d_duanbi", "d_gongbian", "d_guiren", "d_jiaosuo", "d_manshu", "d_tui", "d_waioi", "d_zhuchen"],
    need: 2,
    lines: [
      "金锁扣上宫门的时候，声音比平时响。守门的太监多看了你一眼。",
      "你在门里，他们在门外。一道门，隔出两个天。",
      "掌心的诏书还带着蜡封。蜡是新烫的，烫蜡的人手在抖。",
      "你把它压进怀里。宫灯一颤，远处传来更鼓——三更了。",
      "天亮前，这道门总有一边要开。你摸了摸怀里的诏书，没有动。",
    ],
  },
  {
    id: "bonus_changhen",
    scenarioId: "changhen",
    title: "棋枰私话",
    desc: "一局棋，一盘散，几句君臣之间不能写进起居注的话。",
    keyCards: ["h_huan", "h_jiange", "h_jiangzuo", "h_lingjun", "h_miling", "h_qiuzhuang", "h_wuji", "h_zaici", "h_guanshi"],
    need: 2,
    lines: [
      "御赐的棋枰摆在案上，黑白各归其位。他没急着落子，先替你倒了盏茶。",
      "「朕知道，你夜里来过。陵寝的风大，袍子要系好。」",
      "你执黑，他执白。那手本该赢的棋，他慢慢收着，一颗一颗，替你摆回盒里。",
      "「棋可以重下。人，朕只留得住这一次。」",
      "宫灯熄了。你走出建章宫时，天边已经发白。",
    ],
  },
  {
    id: "bonus_jianfeng",
    scenarioId: "jianfeng",
    title: "暗室密议",
    desc: "军舟如梭的夜里，一间暗室，两个都不肯先说真话的人。",
    keyCards: ["jf_anshi", "jf_chengzhou", "jf_dongwu", "jf_guyu", "jf_jiangxin", "jf_junzhou", "jf_mingdao", "jf_tianxia"],
    need: 2,
    lines: [
      "烛火压得极低，照不全半张舆图。他伸指，点在江心的一个黑点上。",
      "「这里。」他说，「进可锁江，退可藏舟。你要的答案，在这。」",
      "你没接话。他也没有催——暗室里只有烛芯的哔剥声。",
      "半晌，他把舆图卷起来，从袖中摸出一枚旧棋子，搁在你面前。",
      "「天下是一局棋。棋子和棋手，总要有人先落。」",
    ],
  },
  {
    id: "bonus_xingxing",
    scenarioId: "xingxing",
    title: "夜校一灯",
    desc: "识字夜校散课后的半盏灯油，和一个不肯走的学生。",
    keyCards: ["g_wei_ding", "x_duizhang", "x_gesheng", "x_geshi", "x_huodu", "x_jiutui", "x_litu", "x_maozi", "x_tiankan"],
    need: 2,
    lines: [
      "夜校散了。油灯还剩半寸芯，火苗在风里晃。",
      "他不肯走，指着墙上的字：「这个字，是不是就是俺们村？」",
      "你念给他听。他跟着念，念了三遍，忽然笑了：「俺们村的名字，也能写成字。」",
      "灯花爆了一下。他拿草帽小心地护住火，怕它灭了。",
      "那晚之后，田埂上多了一行歪歪扭扭的字，用石头划的。",
    ],
  },
  {
    id: "bonus_touming",
    scenarioId: "touming",
    title: "梁家铺子",
    desc: "雨夜投名状落笔之前，铺子后堂那盏灯照见的犹豫。",
    keyCards: ["t_baodao", "t_ciji", "t_duanhe", "t_liangjia", "t_mishu", "t_shaoming", "t_yinji"],
    need: 2,
    lines: [
      "雨下到后半夜。梁家铺子的门板缝里，漏出一线灯火。",
      "掌柜的没睡。他在灯下研墨，研得很慢，像是要把什么研进墨里。",
      "「壮士要落笔，纸在这儿；要留命，门在那儿。」他把笔搁在案上，退后半步。",
      "你望着那张空白的状纸。雨声填满了整间铺子。",
      "天亮时，门板上多了一道刀痕。状纸还空着——有些名字，落笔就再也擦不掉了。",
    ],
  },
];

/** 卡 → 归属番外（同一张卡只属于一部剧本的一个番外） */
export function bonusOfCard(cardId: string): BonusScene | undefined {
  return BONUS_SCENES.find((b) => b.keyCards.includes(cardId));
}

/** 剧本 → 番外 */
export function bonusOfScenario(scenarioId: string): BonusScene | undefined {
  return BONUS_SCENES.find((b) => b.scenarioId === scenarioId);
}
