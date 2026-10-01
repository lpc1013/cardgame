import type { Effect } from "../engine/types";

// ============================================================
// 现场勘查层（热点找证物）
//   案件原本只有「读文字 → 选选项 → 打对局 → 拣线索」，现场里那些具体的东西
//   ——罐子怎么碎的、堤口什么切口、衣襟里藏着什么——全写在正文里，玩家只是"听说"。
//   这里把它们埋回那张场景图上：点中才看得见，且点数有限，必须取舍。
//
//   坐标是照着 assets/scenes/<剧本>__<地点>.jpg 量的百分数（同舆图 MAP_POS 的做法），
//   所以改底图必须同时改坐标；两者对不上时热点会飘到别的东西上。
//
//   刻意不新建单源线索：spots.effects 里的 unlockClue 一定也能从本案的选项里拿到。
//   勘查预算有限，若某条线索只有热点能给，就会出现「选错热点 → 结案凑不满 → 硬死锁」，
//   正是剧本不变量要防的那一类（见 memory「剧本数据不变量」）。
//   verify.mts 里有对应断言。
// ============================================================

export interface SurveySpot {
  /** 记账用 id，同一幕内唯一 */
  id: string;
  /** 底图百分坐标 */
  x: number;
  y: number;
  /** 点中才浮出的一句现场观察 */
  note: string;
  /** 入卷/入账效果，沿用选项那套 Effect 词汇 */
  effects?: Effect[];
  /** 这一处要占几格勘查。缺省见 spotCost */
  cost?: number;
}

/** 能入卷的算 1 格，纯看的不要格——若"看一眼风景"也要花钱，玩家就永远不看风景，取舍也就成了假的 */
export function spotCost(s: SurveySpot): number {
  return s.cost ?? (s.effects?.length ? 1 : 0);
}

export interface Survey {
  title: string;
  /** 勘查格数上限：小于全部证物所需，玩家必须挑要紧的看 */
  budget: number;
  /** 底图缺省用这一幕自己的场景背景，只有画的是另一处时才覆写 */
  art?: string;
  spots: SurveySpot[];
}

export const SURVEYS: Record<string, Record<string, Survey>> = {
  // ---------- 驸马醉酒杀人案 · 如意酒家雅间（fuma__tavern） ----------
  fuma: {
    search: {
      title: "复勘 · 如意酒家雅间",
      budget: 5,
      spots: [
        {
          id: "jar", x: 43, y: 56,
          note: "桌角半只碎罐，残液沿桌缝淌出去一线，却在半路停住——罐子是被人扶正了再摔的，不是脱手砸的。",
          effects: [{ unlockClue: "x1" }],
        },
        {
          id: "shutter", x: 12, y: 44,
          note: "门闩从内扣死，木销上没有新蹭痕；窗棂插销完好，未见撬动攀爬。这一间是从里头闭死的。",
          effects: [{ unlockClue: "x2" }],
        },
        {
          id: "lapel", x: 58, y: 78, cost: 2,
          note: "衣襟夹层里缝着东西：一枚驸马专属的龙凤玉珏，一小袋碎银。贴身藏着的物件，不会是自己塞进去的。",
          effects: [{ unlockClue: "x3" }],
        },
        {
          id: "scorch", x: 72, y: 44,
          note: "窗边一道焦痕，边缘发白、里子发黑——新痕压着旧痕。有人早就拿这扇窗试过火。",
          effects: [{ unlockClue: "x5" }],
        },
        {
          id: "body", x: 64, y: 85,
          note: "按倒伏位置复原：周身无一处搏斗淤痕，指甲缝里也干净。他没能抬手挡一下。",
          effects: [{ unlockClue: "x6" }],
        },
        {
          id: "cuff", x: 71, y: 80,
          note: "袖口有一点浅淡酒渍，衣身却是干的。酒是泼在袖子上，不是泼在人身上。",
          effects: [{ unlockClue: "x8" }],
        },
        { id: "flag", x: 58, y: 24, note: "酒旗是新换的，浆气未退。旗上补的那块布，针脚与旗面不是一家绣坊的——这家店这半个月里换过主人。" },
        { id: "lantern", x: 29, y: 33, note: "灯笼两只，一只亮一只灭。灭的那只里还剩小半盏油：有人昨夜在这里坐过，坐到了灯尽，却一夜没敲过门。" },
      ],
    },
  },

  // ---------- 谢秀才自燃案 · 巷中封现场（xie__street） ----------
  xie: {
    search: {
      title: "复勘 · 自燃巷口",
      budget: 4,
      spots: [
        {
          id: "residue", x: 46, y: 78,
          note: "桌面碎裂的酒罐：残液沿桌缝走了一线，在一道焦痕前停住，结成干壳。酒不是泼的，是被人倒出来、按着烧的。",
          effects: [{ unlockClue: "v1" }],
        },
        {
          id: "burn", x: 28, y: 62,
          note: "灼口朝内、外缘完好。火不是从屋里醒的，是从外头照着里面烧进来的。",
          effects: [{ unlockClue: "v2" }],
        },
        {
          id: "sunspot", x: 72, y: 40,
          note: "窗边一块平地，正午日光垂直而落，没有一丝遮挡。有人在这里站过很久，等的就是这一刻的日头。",
          effects: [{ unlockClue: "v3" }],
        },
        {
          id: "lens", x: 58, y: 74,
          note: "街角孩童上缴的西洋凸面镜片，边缘粘着墙面褐土。正午的太阳穿过它，能在纸上烧出一个洞。",
          effects: [{ unlockClue: "v4" }],
        },
        {
          id: "print", x: 80, y: 76,
          note: "高墙外侧半枚小脚印，鞋纹细密，不是官靴。有人站在天上看这场火烧起来。",
          effects: [{ unlockClue: "v5" }],
        },
        {
          id: "corpse", x: 44, y: 86,
          note: "尸身无一处搏斗伤，指甲缝里干净。他自己走不进火里——也躲不开。",
          effects: [{ unlockClue: "v6" }],
        },
        { id: "eaves", x: 66, y: 26, note: "墙头勾着一缕素白衣袂。孩童说墙头上有个人，白衣的——丝缕的断口朝外，是被风扯的，不是被人蹭的。" },
        { id: "gate", x: 50, y: 48, note: "巷口的封条是刑部的人来贴的，比大理寺还早半日。一场市井命案，何须刑部盯防——他们比你想让这案子结掉。" },
      ],
    },
  },

  // ---------- 丝绸案 · 河堤（sichou__river） ----------
  sichou: {
    dike: {
      title: "勘堤 · 十里残口",
      budget: 3,
      spots: [
        {
          id: "cut", x: 30, y: 78,
          note: "九处堤口，切口平整笔直、边缘锋利规整——雨水不这样切东西。这是铁凿开的。",
          effects: [{ unlockClue: "t1" }],
        },
        {
          id: "blacksoil", x: 18, y: 88,
          note: "上半截夯土坚硬，下半截发黑疏松、一捏就碎。基底早被人换过——堤是站在水上的空壳。",
          effects: [{ unlockClue: "t2" }],
        },
        {
          id: "stone", x: 42, y: 70,
          note: "石料上有官窑的号，账上却查不到收讫。采买的银子付了，石头没上堤。",
          effects: [{ unlockClue: "t3" }],
        },
        {
          id: "sky", x: 62, y: 22,
          note: "端午前夜是晴的。所谓「阴雨冲垮九处」，是把两处人为的伤，说成一场天灾。",
          effects: [{ unlockClue: "t9" }],
        },
        { id: "reed", x: 8, y: 60, note: "苇丛里有一条踩出来的小路，直通堤根。夜里来量过水位的人，不止你一个。" },
        { id: "boat", x: 57, y: 48, note: "河心那条船吃水很浅，是空船回程。装满石料的船，不该在这个水位上走。" },
        { id: "village", x: 86, y: 34, note: "堤下村口的阿桃还站在那里。她说「堤下的黑土我们认得出」——没人肯听她说。" },
      ],
    },
  },

  // ---------- 秦淮案 · 河堤（qinhuai__river） ----------
  qinhuai: {
    dike: {
      title: "勘堤 · 三里烂段",
      budget: 2,
      spots: [
        {
          id: "grade", x: 48, y: 68,
          note: "南端石缝密实、夯层规整；走到中段指尖一剥就簌簌而落。这不是偷懒的形状，是算计的形状。",
          effects: [{ unlockClue: "m1" }],
        },
        {
          id: "ledger", x: 72, y: 74,
          note: "废砖缝里嵌着一角纸，墨迹浸水只余一个「银」字。工时名册上多处人名空缺，墨色一新一旧——补笔的人不知道前一笔是谁写的。",
          effects: [{ unlockClue: "m2" }],
        },
        {
          id: "rain", x: 30, y: 18,
          note: "阴雨赶工解释不了「刻意两头精工」。雨不挑地方下，它只把该烂的烂给你看。",
          effects: [{ unlockClue: "m9" }],
        },
        { id: "stone", x: 14, y: 84, note: "堤脚该埋镇水石，今年一块都没埋。老河匠说这句话的时候，没有看你，看的是河面。" },
        { id: "kiln", x: 78, y: 56, note: "荒滩上的废砖不是工部的料——是北边窑口烧的，那种窑，烧的是军用的料。" },
        { id: "bridge", x: 62, y: 34, note: "远处那桥十七个洞，验收的官只走两端。三里烂堤压在账册上，是一笔一笔的好料。" },
        { id: "boat", x: 50, y: 46, note: "河上那条船挂着货行的幌子，吃水却像空载。装过东西的船，不敢在这个水位上走。" },
      ],
    },
  },

  // ---------- 秋闱案 · 贡院外长街（qiuwei__street_night） ----------
  qiuwei: {
    market_gate: {
      title: "夜行 · 贡院外墙根",
      budget: 3,
      spots: [
        {
          id: "torn", x: 22, y: 55,
          note: "墙根一截纸边，撕口是新的、齐的——不是受潮烂的。有人急着让它不在了。",
          effects: [{ unlockClue: "q5" }],
        },
        {
          id: "note", x: 76, y: 62,
          note: "摊角压着半张银票，骑缝章是江西票号的。一个七品书吏的俸，走不到江西。",
          effects: [{ unlockClue: "q7" }],
        },
        {
          id: "stall", x: 34, y: 70,
          note: "书摊上的文集是粗纸印的，纸页泛潮，字里行间全是火气。骂得最狠的几册，署名彼此对着骂——落第的人自己先咬成两派。",
          effects: [{ unlockClue: "q4" }],
        },
        {
          id: "gate", x: 50, y: 44,
          note: "贡院的门明日一早才开。门缝里透出来的灯，比门外的多——里头有人一夜没睡。檐下堆着往年待毁的旧卷，纸角发脆，是水渍干过又潮的样子。",
          effects: [{ unlockClue: "q2" }],
        },
        { id: "lantern", x: 28, y: 42, note: "一灯如豆。灯下卖文的、算卦的、卖馄饨的，都在等同一种人：肯把话说完的官。" },
        { id: "fortune", x: 86, y: 38, note: "卦签上写着「文运」。十个人摇，九个人摇头——剩下那个不摇，只是把签推回去，说不用了。" },
        { id: "figure", x: 64, y: 50, note: "灯影里有人远远望了你一眼，看见官袍又缩了回去。缩回去的那一步，踩掉了一角纸。" },
      ],
    },
  },
};

export function surveyOf(scenarioId: string, sceneId: string): Survey | undefined {
  return SURVEYS[scenarioId]?.[sceneId];
}

/** 这一幕已入卷的热点 id */
export function foundSpots(survey: Record<string, string[]> | undefined, sceneId: string): string[] {
  return survey?.[sceneId] ?? [];
}

export function surveyLeft(sv: Survey, found: string[]): number {
  const used = sv.spots.reduce((s, p) => (found.includes(p.id) ? s + spotCost(p) : s), 0);
  return Math.max(0, sv.budget - used);
}
