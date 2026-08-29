// ============================================================
// 番外系统（批次 C + 扩展）：叙事剩余卡 = 番外钥匙；封面外置按钮 + 条件解锁
// 解锁方式：
//   cards  （默认）携带本剧本番外的 keyCards 中任意 ≥need 张 + 赢下本剧本任意对局 → 对局结算时解锁（幂等，localStorage）
//   ending 达成 unlockEndings 中任一结局（gallery 实时判定，无需写 localStorage）
//   dual   该剧本两个视角各达成任一结局（gallery 实时判定）
// 挂点：剧本封面「番外」按钮（外置面板，锁定态显条件）+ 卡详情番外区块（保留）
// ============================================================

export interface BonusScene {
  id: string;
  scenarioId: string;   // 归属剧本
  title: string;
  desc: string;         // 一句话简介（封面面板/卡详情页展示）
  /** 解锁方式：cards=钥匙卡+赢对局（默认）/ ending=达成结局 / dual=双视角各通关 */
  unlock?: "cards" | "ending" | "dual";
  keyCards?: string[];  // 钥匙卡（cards 型）
  need?: number;        // 解锁所需携带张数（默认 2）
  unlockEndings?: string[]; // ending 型：达成任一结局名解锁
  /** 未解锁时展示的条件文案；缺省按 unlock 类型自动生成 */
  unlockDesc?: string;
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
    id: "bonus_jieyu_toujiu",
    scenarioId: "jieyu",
    title: "偷酒",
    desc: "太原的冬夜，半壶偷来的酒，和一个巡抚的「那我也偷了」。",
    unlock: "ending",
    unlockEndings: ["无名", "差二十里", "信在人在", "忠国公", "边关老卒"],
    unlockDesc: "以传令兵视角（石亨线）通关任一结局后解锁",
    lines: [
      "太原的冬天，城砖冻得能敲出响来。",
      "小兵怀里焐着一壶酒，摸黑溜上城楼。伙房师傅的鼾声隔了两重院墙，他是在那鼾声里偷的酒。",
      "「大人，喝口热的。」",
      "我接过来，问他：哪来的？",
      "他说：偷的。",
      "我喝了一口。酒是土酒，辣，烧喉。我笑了笑：「那我也偷了。」",
      "他蹲在墙垛边，看我喝完，又看我。月光照在他脸上，还是个半大的孩子。",
      "「你叫什么？」",
      "「陈四。」",
      "「陈四，保定——」我说，「记着，打完仗，回家把地赎回来。」",
      "他点点头，没说话。",
      "那壶酒喝完了。后来八年，谁也没再提。",
    ],
  },
  {
    id: "bonus_jieyu_yulai",
    scenarioId: "jieyu",
    title: "狱中来客",
    desc: "诏狱的门开了，进来的人说：朝廷要用你。",
    unlock: "ending",
    unlockEndings: ["与城同烬", "半壁", "午门", "要留清白在人间"],
    unlockDesc: "以于谦视角通关任一结局后解锁",
    lines: [
      "诏狱的墙，比城墙还厚。",
      "石亨靠墙坐着，数墙上的水珠。土木堡那场败仗，他是被捆着押回京师的。狱卒说，明天过堂。",
      "过堂。他心里明白，这种败，是要掉脑袋的。",
      "门响了。进来的不是狱卒。",
      "于谦——兵部左侍郎。那年在大同，他见过这个人，站在城头，身后全是火。",
      "「朝廷要用你。」于谦说，「瓦剌南下，京师缺将。」",
      "石亨愣了很久：「我……是败军之将。」",
      "「败军之将，才知道怎么打胜仗。」于谦转身，「出来吧。京师等你。」",
      "石亨走出诏狱那天，天是亮的。他追上去，跪下去：「于部堂，我石亨这条命，是你的。」",
      "于谦没回头：「你的命是社稷的，不是我的。」",
      "石亨跪在风里。那句「命是你的」，梗在喉咙里，咽了。",
      "后来他封了侯，荐过一个人的儿子，被一句话堵了回来。那句咽下去的话，再没有说出口。",
    ],
  },
  {
    id: "bonus_jieyu_banjiu",
    scenarioId: "jieyu",
    title: "半坛烈酒",
    desc: "德胜门前夜，半坛酒分给一城的兵。说好了，打完请喝整坛。",
    unlock: "ending",
    unlockEndings: ["无名", "差二十里", "信在人在", "忠国公", "边关老卒"],
    unlockDesc: "以传令兵视角（石亨线）通关任一结局后解锁",
    lines: [
      "德胜门前夜，风硬得割脸。",
      "石亨拎着半坛酒，往墙根一蹲，把坛子往地上一墩：「分了吧。」",
      "兵们你看我，我看你。有人咽了口唾沫：「将军，这是……」",
      "「打完这一仗，」石亨说，「老子请你们喝整坛。」",
      "一人一口，轮着来。酒在嘴里转一圈，咽下去，人就暖了半截。",
      "有个新兵喝急了，呛得直咳，咳着咳着笑了。石亨一巴掌拍在他背上：「笑什么笑，省着点咳，明儿还得守城。」",
      "「将军，说好了啊——整坛！」",
      "「说好了。」",
      "天亮时，炮响了。",
      "后来那半坛酒，一直没喝完——不是酒不够，是喝它的人，少了几个。",
    ],
  },
  {
    id: "bonus_jieyu_yecai",
    scenarioId: "jieyu",
    title: "一筐野菜",
    desc: "景泰年间，陛下想晒鱼干——先问于谦。",
    unlock: "ending",
    unlockEndings: ["开花了", "多余的那个", "偏院的尘"],
    unlockDesc: "以景泰帝视角（偏院的孩子线）通关任一结局后解锁",
    lines: [
      "景泰四年的春天，御花园的日头很好。",
      "朱祁钰在池子边站了半晌，忽然说：朕想晒鱼干。",
      "太监们面面相觑。晒鱼干？",
      "「先问于少保。」他说，「问问……行不行。」",
      "于谦的回话隔了一个时辰传回来：陛下但晒无妨。",
      "他真的晒了。鱼是河鲜，一串一串，挂在御花园的日头底下。他站在架子前，看得很仔细，像看一份折子。",
      "有个小太监小声说：陛下，鱼干不是这么翻的。",
      "「那你教朕。」",
      "小太监吓得跪下了。他摆摆手：「起来，教朕翻鱼干。」",
      "那天下午，御花园里飘着鱼腥味。朱祁钰蹲在架子前，把鱼干一条一条翻过去，翻着翻着，笑了一下。",
      "没人见过他那样笑。像偏院墙角的草，忽然见了光。",
      "鱼干晒成了。他留了一条，用油纸包好，遣人送进了于府。",
      "后来那架鱼干，在夺门的夜里，没有人记得收。",
    ],
  },
  {
    id: "bonus_jieyu_jinshi",
    scenarioId: "jieyu",
    title: "进士夜",
    desc: "永乐十九年放榜那晚，他抚着那身青袍，想起十七岁的诗。",
    unlock: "ending",
    unlockEndings: ["与城同烬", "半壁", "午门", "要留清白在人间", "晚景"],
    unlockDesc: "以于谦视角通关任一结局后解锁",
    lines: [
      "永乐十九年，放榜。",
      "二十三岁的于谦，站在皇榜前，从头看到尾——第三甲，第九十二名。",
      "有人替他鸣不平：你的卷子，本可进一甲。听说主考官嫌你措辞太硬，批了句「策语伤时」，压了下来。",
      "他笑了笑：策语伤时——伤的是时，不是策。",
      "放榜那晚，他回到赁的小屋，把那身新制的青袍展开，抚平。",
      "进士公服，是青的。",
      "他在灯下坐了很久。十七岁那年，他在三茅观写过一首诗：千锤万凿出深山，烈火焚烧若等闲。粉骨碎身浑不怕，要留清白在人间。",
      "他铺开纸，把这首诗，又誊了一遍。",
      "誊到「粉骨碎身」四个字时，笔尖停了停。",
      "窗外有更鼓声。他放下笔，把那身青袍叠好，压在枕边。",
      "从今往后，就穿这身青的。不换红的。",
      "红的，是血染的。",
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
    id: "bonus_changjiang_jiayuan",
    scenarioId: "changjiang",
    title: "家教",
    desc: "柴家书房四面是书。父亲从不打他——父亲只让他抄书，抄完了，讲讲书里那个人，错在哪。",
    unlock: "ending",
    unlockEndings: ["孤臣", "鹰隼", "奔丧", "碎甲"],
    unlockDesc: "以柴将军视角通关任一结局后解锁",
    lines: [
      "柴家的书房，四面都是书。父亲说：读书不是让你记住字，是让你记住字背后的人。",
      "五岁那年，他背《论语》背到「君君臣臣」，问父亲：君做错了事，臣能说吗？",
      "父亲没有答。父亲给他换了一本《春秋》，指着某页说：读。读完了，讲讲这个人，错在哪。",
      "他读完了，讲了。父亲听完，只说了一句：说得对。可对的道理，不是对的人说，就不作数。",
      "他似懂非懂。但他记住了：父亲从不打他——父亲只让他抄书。抄完了，还要讲讲书里那个人，错在哪。",
      "多年后他在战场上，把这句话用在了刀刃上：先弄清对错，再决定进退。",
      "那间书房，后来成了北疆军营里，他教小校们识字的地方。",
    ],
  },
  {
    id: "bonus_changjiang_xuanjia",
    scenarioId: "changjiang",
    title: "玄甲",
    desc: "玄甲是黑的。夜里有月亮的时候，黑的甲看不见；白天，敌人先怕，然后才想到挡。",
    unlock: "ending",
    unlockEndings: ["孤臣", "鹰隼", "奔丧", "碎甲"],
    unlockDesc: "以柴将军视角通关任一结局后解锁",
    lines: [
      "打扫战场时，有个新兵蹲在地上，拿袖子擦自己的甲。",
      "他擦得很认真——把那片黑漆的铁甲，擦得能照出人影。擦完了，他抬头问：将军，这甲，为什么是黑的？",
      "我说：夜里有月亮的时候，黑的甲，看不见。",
      "他想了想，又问：那白天呢？",
      "白天。白天，敌人看见一片黑压压的玄甲冲过来——他们先怕，然后才想到挡。",
      "我忽然想起那年冬天，我挑这批甲的时候。",
      "铁匠蹲在那堆甲片中间，把全甲和马铠的图样，一张一张摊开：将军，全甲能挡箭，可马驮不动；皮甲马跑得快，可挡不住箭。",
      "我说：那就各取一半。",
      "人，护胸、护肩、护臂——箭来了，射不穿要害；马，只留面帘和当胸——腿和肚子，用速度和先手去护。",
      "铁匠算了三天账，最后说：甲减一半，速保八成，命保七成。",
      "剩下那三成命，我说，用阵法补。",
      "新兵擦完了甲，站起来。阳光落在玄甲上，泛着乌沉沉的光。他咧嘴笑：将军，这甲，穿上像多了一条命。",
      "我没有告诉他——这话，二十年前，有个老兵也这么说过。",
      "那个老兵，后来把这条命，留在了北疆。",
    ],
  },
  {
    id: "bonus_changjiang_zhenglun",
    scenarioId: "changjiang",
    title: "争论",
    desc: "那年他十五岁。有些话，说出来，就收不回去了。",
    unlock: "dual",
    unlockDesc: "帝王与柴将军双视角各通关任一结局后解锁",
    lines: [
      "那年他十五岁，随父亲入宫。",
      "御花园的棋枰边，太子正为一道奏疏发火——有臣子顶撞了老皇帝，被罚廷杖。",
      "太子问他：你说，臣子顶撞君父，该不该罚？",
      "他说：该罚的，不是顶撞——是做错了事，还不许人说。",
      "太子怔住了。半晌，太子说：你这话，搁在朝堂上，是要杀头的。",
      "他说：臣知道。臣只是觉得，天下人都有做错事的时候——天子也是。",
      "太子没有再说话。那年他们都还小，有些话，说出来就收不回去了。",
      "很多年后，新帝在偏殿问他：柴卿，你还记得那年你说过的话吗？",
      "他答：臣，记不清了。",
      "两个人都知道，彼此都记得。",
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
  return BONUS_SCENES.find((b) => b.keyCards?.includes(cardId));
}

/** 剧本 → 番外列表（一个剧本可有多个番外） */
export function bonusListOfScenario(scenarioId: string): BonusScene[] {
  return BONUS_SCENES.filter((b) => b.scenarioId === scenarioId);
}

/** 兼容旧调用：剧本 → 首个番外（无则 undefined） */
export function bonusOfScenario(scenarioId: string): BonusScene | undefined {
  return BONUS_SCENES.find((b) => b.scenarioId === scenarioId);
}

/** 番外是否已解锁（实时判定）：
 *  cards  → localStorage 已记录（对局结算时写入）
 *  ending → 该剧本 gallery 含 unlockEndings 任一结局名
 *  dual   → 该剧本两个视角各至少一个结局在 gallery
 *  gallery 为结局图鉴条目数组（{scenarioId, endingName}[]）；vpEndings 为视角→结局名表
 */
export function isBonusUnlocked(
  b: BonusScene,
  gallery: { scenarioId: string; endingName: string }[],
  vpEndings: Record<string, string[]>,
  unlockedIds: string[]
): boolean {
  if (b.unlock === "cards") return unlockedIds.includes(b.id);
  if (b.unlock === "ending") {
    return (b.unlockEndings ?? []).some((en) => gallery.some((g) => g.scenarioId === b.scenarioId && g.endingName === en));
  }
  if (b.unlock === "dual") {
    const vpNames = Object.values(vpEndings);
    if (vpNames.length < 2) return false;
    const owned = new Set(gallery.filter((g) => g.scenarioId === b.scenarioId).map((g) => g.endingName));
    return vpNames.every((names) => names.some((n) => owned.has(n)));
  }
  return unlockedIds.includes(b.id);
}

/** 未解锁时的条件文案（自动生成兜底） */
export function bonusUnlockDesc(b: BonusScene): string {
  if (b.unlockDesc) return b.unlockDesc;
  if (b.unlock === "ending") return `达成结局「${(b.unlockEndings ?? []).join("」或「")}」后解锁`;
  if (b.unlock === "dual") return "双视角各通关任一结局后解锁";
  return `携带钥匙卡（${(b.keyCards ?? []).length} 选 ${b.need ?? 2}）赢下一局后解锁`;
}
