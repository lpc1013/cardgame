// 130 张新卡批量落库：按 PROMPTS.md §五(5 案件 50 张)/§六(8 叙事 80 张) 设计，
// 补 power/text/lore/price，插入各剧本 src/data/*.ts 的 cards 数组末尾。
// 用法：node scripts/add_130_cards.mjs
import { readFileSync, writeFileSync } from "node:fs";

const C = (o) => `    { ${Object.entries(o)
  .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
  .join(", ")} },`;

const ADD = {
  fuma: [
    { id: "f_diantang", name: "金殿玉墀", suit: "策", rarity: "传", power: 4, price: 30, text: "玉墀之上，一字千斤——借天威压势。", lore: "绯袍拾级而上，宫门如渊。" },
    { id: "f_tangji", name: "堂审机锋", suit: "策", rarity: "凡", power: 2, price: 10, text: "惊堂木落，言辞转锋。", lore: "明镜高悬，案下有人发抖。" },
    { id: "f_yeyan", name: "夜宴眼色", suit: "隐", rarity: "凡", power: 1, price: 10, text: "杯盏之间，一个眼色递过。", lore: "满堂灯火，只有一角是暗的。" },
    { id: "f_gongnei", name: "宫墙内线", suit: "隐", rarity: "良", power: 3, price: 18, text: "宫墙夹道，字条易手。", lore: "提灯的手，半明半暗。" },
    { id: "f_anxiang", name: "暗香袖底", suit: "隐", rarity: "凡", power: 2, price: 10, text: "袖底暗香，来处不明。", lore: "香炉青烟，绕不出这座宅子。" },
    { id: "f_yandu", name: "以言为钩", suit: "策", rarity: "良", power: 3, price: 18, text: "一言为饵，钓其破绽。", lore: "茶烟横隔，话里有钩子。" },
    { id: "i_jinzan", name: "鎏金酒筹", layer: "物品", suit: "器", rarity: "良", itemEffect: "强牌", price: 24, text: "对局中使用：鎏金筹出，成术+3。", lore: "刻痕清晰，烛光下泛金。" },
    { id: "i_guici", name: "碎瓷玉片", layer: "物品", suit: "器", rarity: "凡", itemEffect: "强牌", price: 15, text: "对局中使用：瓷片断口，成术+3。", lore: "断口锋利，边缘一抹胭脂。" },
    { id: "r_cuiping", name: "宫人翠屏", layer: "人物", suit: "势", rarity: "良", passive: { bonusSuit: "隐", bonusPower: 1 }, price: 30, text: "携带：隐牌+1。洒扫宫人，见过宫墙内的事。", lore: "拂尘垂着，裙角微湿。" },
    { id: "s_huangcai", name: "宫造银锭", layer: "资源", suit: "器", rarity: "凡", resource: 10, price: 10, text: "资源卡：翻到即入钱袋。", lore: "官铸火印，灰暗库房光线。" },
  ],
  qiuwei: [
    { id: "q_changshi", name: "题纸封条", suit: "策", rarity: "传", power: 4, price: 30, text: "封条未启，墨迹已泄天机。", lore: "一纸封条，隔开十年寒窗。" },
    { id: "q_bishi", name: "笔势识人", suit: "策", rarity: "凡", power: 2, price: 10, text: "观笔势，识人心。", lore: "笔锋未落，字已有骨。" },
    { id: "q_xiaosheng", name: "号舍风声", suit: "隐", rarity: "凡", power: 1, price: 10, text: "号舍灯下，风声过耳。", lore: "油灯如豆，巡夜人影擦过门帘。" },
    { id: "q_zhuangao", name: "誊录易卷", suit: "隐", rarity: "良", power: 3, price: 18, text: "誊录之际，卷已易主。", lore: "烛火一斜，两只手换了卷子。" },
    { id: "q_yinbao", name: "引保结状", suit: "策", rarity: "凡", power: 2, price: 10, text: "结状在手，保人无处遁形。", lore: "朱红手印，按得比命还重。" },
    { id: "q_guanting", name: "关节暗号", suit: "策", rarity: "良", power: 3, price: 18, text: "卷角暗记，关节所在。", lore: "圆圈极小，躲进墨迹里。" },
    { id: "i_yanmo", name: "徽墨残端", layer: "物品", suit: "器", rarity: "良", itemEffect: "强牌", price: 24, text: "对局中使用：断墨蘸水，成术+3。", lore: "断口崭新，像刚掰的。" },
    { id: "i_zhentie", name: "夹带密条", layer: "物品", suit: "器", rarity: "凡", itemEffect: "强牌", price: 15, text: "对局中使用：蝇头小字，成术+3。", lore: "缝进鞋底的，都是要命的东西。" },
    { id: "r_zhangtou", name: "号军老张", layer: "人物", suit: "势", rarity: "凡", passive: { bonusSuit: "器", bonusPower: 1 }, price: 20, text: "携带：器牌+1。巡夜的号军，耳朵比狗灵。", lore: "钥匙串一响，号舍的灯就全灭了。" },
    { id: "s_wenjufei", name: "文牍银", layer: "资源", suit: "器", rarity: "凡", resource: 10, price: 10, text: "资源卡：翻到即入钱袋。", lore: "笔墨之资，纸包红绳，沉甸甸。" },
  ],
  sichou: [
    { id: "s_yingsi", name: "暗织锦机", suit: "隐", rarity: "传", power: 4, price: 30, text: "空机自响，丝线缠人。", lore: "机杼声里，织的是来路不明的绸。" },
    { id: "s_huodizhang", name: "货底暗账", suit: "隐", rarity: "良", power: 3, price: 18, text: "账本夹页，藏着另一本账。", lore: "烛台阴影下，算盘珠子没停过。" },
    { id: "s_yanchuan", name: "验船水印", suit: "策", rarity: "凡", power: 2, price: 10, text: "吃水线火印，船底有鬼。", lore: "水光一荡，印记就活了。" },
    { id: "s_qiaocheng", name: "桥城对牌", suit: "策", rarity: "良", power: 3, price: 18, text: "对牌拼合，门路自通。", lore: "两半铜牌，各握一手。" },
    { id: "s_banhuo", name: "暗柜验货", suit: "隐", rarity: "凡", power: 1, price: 10, text: "柜缝漏光，货不上秤。", lore: "绸缎一角，比谁的命都滑。" },
    { id: "s_yaoshi", name: "牙行口风", suit: "策", rarity: "凡", power: 2, price: 10, text: "算盘一拨，话里有价。", lore: "牙人半张嘴，全凭眼睛说。" },
    { id: "i_sangzhi", name: "桑皮密信", layer: "物品", suit: "器", rarity: "孤品", itemEffect: "强牌", price: 40, text: "对局中使用：桑皮洇墨，成术+3。", lore: "字洇开了，纸的来路没洇开。" },
    { id: "i_yinpiao", name: "旧日银票", layer: "物品", suit: "器", rarity: "良", itemEffect: "强牌", price: 24, text: "对局中使用：泛黄票号，成术+3。", lore: "朱印褪色，边角毛了。" },
    { id: "r_zhuan", name: "船头老鬼", layer: "人物", suit: "势", rarity: "良", passive: { bonusSuit: "策", bonusPower: 1 }, price: 30, text: "携带：策牌+1。二十年的水路，眼睛就是海图。", lore: "烟锅明灭，江上什么事他不知道。" },
    { id: "s_chaosi", name: "漕银", layer: "资源", suit: "器", rarity: "凡", resource: 10, price: 10, text: "资源卡：翻到即入钱袋。", lore: "银箱半开，麻绳捆着规矩。" },
  ],
  xie: [
    { id: "x_dengyou", name: "灯油辨迹", suit: "器", rarity: "传", power: 4, price: 30, text: "灯油一线，火从何处起。", lore: "油沿桌走，火跟着油。" },
    { id: "x_jumen", name: "门闩勘痕", suit: "器", rarity: "凡", power: 2, price: 10, text: "闩上划痕，进出自有先后。", lore: "旧木门闩，记得每一只手。" },
    { id: "x_zhiying", name: "纸灰留形", suit: "隐", rarity: "凡", power: 1, price: 10, text: "纸灰成形，烧的什么一目了然。", lore: "风一吹，灰散了一半。" },
    { id: "x_huoyan", name: "火道追踪", suit: "策", rarity: "良", power: 3, price: 18, text: "烟熏火道，逆着查回去。", lore: "火走的路，墙上留了疤。" },
    { id: "x_chuangzhi", name: "窗纸破口", suit: "器", rarity: "凡", power: 2, price: 10, text: "破口焦黑，是从里还是外。", lore: "窗纸一破，天光就漏了进来。" },
    { id: "x_tieqi", name: "铁器余温", suit: "器", rarity: "良", power: 3, price: 18, text: "铁器未冷，凶器不远。", lore: "暗红的一把，热气还在扭。" },
    { id: "i_huotong", name: "焦木残段", layer: "物品", suit: "器", rarity: "凡", itemEffect: "强牌", price: 15, text: "对局中使用：焦木入怀，成术+3。", lore: "年轮烧到一半，停住了。" },
    { id: "i_denggai", name: "灯盏铜盖", layer: "物品", suit: "器", rarity: "良", itemEffect: "强牌", price: 24, text: "对局中使用：铜盖灼痕，成术+3。", lore: "盖沿的灼痕，是手留下的。" },
    { id: "r_zhiweng", name: "织妇改嫁", layer: "人物", suit: "势", rarity: "良", passive: { bonusSuit: "隐", bonusPower: 1 }, price: 30, text: "携带：隐牌+1。梭子停在半空，话也停在半空。", lore: "檐下织机，断了一根线。" },
    { id: "s_zhibi", name: "纸锭", layer: "资源", suit: "器", rarity: "凡", resource: 10, price: 10, text: "资源卡：翻到即入钱袋。", lore: "香案旁的纸钱，扎得整整齐齐。" },
  ],
  qinhuai: [
    { id: "q_hua", name: "画舫灯影", suit: "隐", rarity: "传", power: 4, price: 30, text: "灯影摇碎，舫上有人知道太多。", lore: "桨声灯影里，什么都能藏。" },
    { id: "q_yanzhi", name: "胭脂留痕", suit: "隐", rarity: "凡", power: 1, price: 10, text: "帕角胭脂，半干半湿。", lore: "锦帕落地，像谁没接住。" },
    { id: "q_shuixian", name: "水线痕迹", suit: "器", rarity: "良", power: 3, price: 18, text: "石缝水线，河涨过多少回。", lore: "青苔的分界，是水的记性。" },
    { id: "q_tingzhou", name: "停舟问渡", suit: "策", rarity: "凡", power: 2, price: 10, text: "孤舟问渡，话探虚实。", lore: "船夫蹲着，烟锅里烧着码头的事。" },
    { id: "q_jinshui", name: "金水验砂", suit: "策", rarity: "良", power: 3, price: 18, text: "捻砂验金，水底有文章。", lore: "金屑混在沙里，淘过才见。" },
    { id: "q_yelu", name: "夜来暗语", suit: "隐", rarity: "凡", power: 2, price: 10, text: "巷口两影，一递一收。", lore: "灯笼压得很低，只照见鞋。" },
    { id: "i_shuizhu", name: "水渍令牌", layer: "物品", suit: "器", rarity: "良", itemEffect: "强牌", price: 24, text: "对局中使用：泡胀木牌，成术+3。", lore: "水渍没干，字已经泡没了。" },
    { id: "i_zhusha", name: "朱砂封信", layer: "物品", suit: "器", rarity: "凡", itemEffect: "强牌", price: 15, text: "对局中使用：朱砂封口，成术+3。", lore: "封蜡鲜红，像还没干透的血。" },
    { id: "r_chuanpo", name: "艄婆阿莲", layer: "人物", suit: "势", rarity: "良", passive: { bonusSuit: "器", bonusPower: 1 }, price: 30, text: "携带：器牌+1。摇橹的婆子，码头上没她不认识的人。", lore: "斗笠压眉，橹声不停。" },
    { id: "s_heyi", name: "河工银", layer: "资源", suit: "器", rarity: "凡", resource: 10, price: 10, text: "资源卡：翻到即入钱袋。", lore: "木板上的碎银，和草帽搁在一起。" },
  ],
  jieyu: [
    { id: "j_gucheng", name: "孤城凭吊", suit: "势", power: 3, text: "凭吊孤城，士气为之一振。", lore: "城外白骨，城内孤城。" },
    { id: "j_xuncheng", name: "巡城甲胄", suit: "势", power: 2, text: "甲胄巡城，一夜未眠。", lore: "巡城的脚步，比更鼓还准。" },
    { id: "j_liangdao", name: "粮道告急", suit: "策", power: 3, text: "粮道被断，先算后方。", lore: "运粮的队，比攻城的长。" },
    { id: "j_huobing", name: "火牌传令", suit: "隐", power: 3, text: "火牌加急，令出即达。", lore: "火光照路，马蹄不歇。" },
    { id: "j_wengcheng", name: "瓮城巷战", suit: "器", power: 3, text: "瓮中捉鳖，关门打狗。", lore: "城门一关，城里就是瓮。" },
    { id: "j_haojiao", name: "号角催征", suit: "势", power: 4, text: "号角连天，三军赴死。", lore: "角声一起，没人回头。" },
    { id: "j_junzhang", name: "军帐灯火", suit: "势", power: 2, text: "军帐灯火，彻夜不熄。", lore: "灯下的舆图，画满了退路。" },
    { id: "j_xiema", name: "下马碑文", suit: "隐", power: 2, text: "碑文斑驳，此地曾立誓。", lore: "下马碑前，文官也下马。" },
    { id: "j_shuimian", name: "水门暗渡", suit: "隐", power: 3, text: "水门半开，船趁夜过。", lore: "水声掩橹，城门也打盹。" },
    { id: "j_jiyu", name: "急雨守垛", suit: "器", power: 2, text: "急雨浇垛，弓弦受潮。", lore: "雨里守城，火铳也哑了。" },
  ],
  shumian: [
    { id: "s_jinggu", name: "陉谷烽烟", suit: "势", power: 3, text: "陉谷举烽，敌踪已现。", lore: "烽烟一起，谷里全是眼睛。" },
    { id: "s_hanxin", name: "背水列阵", suit: "势", power: 4, text: "背水列阵，置之死地。", lore: "身后是水，前面是命。" },
    { id: "s_chutian", name: "楚歌四起", suit: "隐", power: 3, text: "四面楚歌，军心先散。", lore: "歌声过营，刀都拿不稳。" },
    { id: "s_gaixia", name: "垓下孤军", suit: "势", power: 4, text: "垓下重围，孤军犹战。", lore: "十万围一，一犹不降。" },
    { id: "s_wujiang", name: "乌江残舟", suit: "器", power: 2, text: "乌江残舟，渡与不渡。", lore: "舟在岸，人在江。" },
    { id: "s_yuxin", name: "虞姬剑影", suit: "策", power: 2, text: "剑影一横，绝了后顾。", lore: "帐中剑光，是最后一曲。" },
    { id: "s_zhangchi", name: "张弛有度", suit: "策", power: 3, text: "一张一弛，进退有度。", lore: "弓拉满会断，人也是。" },
    { id: "s_qibing", name: "骑兵踏阵", suit: "器", power: 3, text: "铁骑踏阵，一冲即破。", lore: "马蹄落处，阵型成泥。" },
    { id: "s_huoshou", name: "火攻连营", suit: "隐", power: 3, text: "火借风势，连营成灰。", lore: "风往哪吹，火往哪走。" },
    { id: "s_liangcai", name: "粮草断道", suit: "策", power: 2, text: "断其粮道，不战自乱。", lore: "锅里没米，营里没胆。" },
  ],
  changjiang: [
    { id: "c_jiangjiao", name: "江流碑碣", suit: "势", power: 3, text: "江流碑碣，民心可溯。", lore: "碑在江边，字朝上游。" },
    { id: "c_chenchen", name: "君臣对弈", suit: "势", power: 4, text: "君臣对弈，一子千钧。", lore: "棋枰两头，坐的是天下。" },
    { id: "c_zhoudu", name: "舟渡夜谈", suit: "隐", power: 3, text: "夜舟渡江，话只说半句。", lore: "江心水急，话也急。" },
    { id: "c_shuizhen", name: "水阵连营", suit: "器", power: 3, text: "水阵连营，船作城墙。", lore: "水上是营，水下是胆。" },
    { id: "c_chaoji", name: "潮迹水痕", suit: "隐", power: 2, text: "潮来潮去，痕迹自现。", lore: "水退之后，沙上留字。" },
    { id: "c_shaijun", name: "帅旗独擎", suit: "势", power: 3, text: "帅旗独擎，三军所向。", lore: "旗在，军就在。" },
    { id: "c_jingyi", name: "惊涛拍岸", suit: "器", power: 2, text: "惊涛拍岸，声势夺人。", lore: "浪头有墙高，胆小的先矮。" },
    { id: "c_mouli", name: "谋定后动", suit: "策", power: 3, text: "谋定而后动，一击即中。", lore: "落子之前，先在心头走十步。" },
    { id: "c_guoshi", name: "国士无双", suit: "策", power: 2, text: "国士无双，一人抵万。", lore: "这样的人，一国只有一两个。" },
    { id: "c_yulao", name: "渔老闲谈", suit: "势", power: 2, text: "渔老闲谈，句句有江。", lore: "江上讨生活的人，最知水。" },
  ],
  diaolan: [
    { id: "d_taihou", name: "太后垂帘", suit: "势", power: 4, text: "垂帘听政，一言定鼎。", lore: "帘后一声，比殿上十声都响。" },
    { id: "d_waioi", name: "外戚执印", suit: "势", power: 3, text: "外戚执印，朝野侧目。", lore: "印在他手，国在他手。" },
    { id: "d_huanzhe", name: "宦者传旨", suit: "隐", power: 3, text: "宦者传旨，真假难辨。", lore: "一道旨出宫，十道话回宫。" },
    { id: "d_gongbian", name: "宫变之夜", suit: "器", power: 3, text: "宫变之夜，刀先于诏。", lore: "灯笼换了颜色，宫门换了主人。" },
    { id: "d_jiaosuo", name: "金锁玉链", suit: "器", power: 2, text: "金锁玉链，锁得住人。", lore: "链是玉的，牢是金的。" },
    { id: "d_guiren", name: "贵人相召", suit: "势", power: 2, text: "贵人相召，来者不善。", lore: "传话的脚步声，比话急。" },
    { id: "d_duanbi", name: "断碑残字", suit: "隐", power: 2, text: "断碑残字，旧事半埋。", lore: "字断处，故事也断了。" },
    { id: "d_cefan", name: "策反旧部", suit: "策", power: 3, text: "策反旧部，里应外合。", lore: "一碗酒递过去，旧主就忘了。" },
    { id: "d_manshu", name: "蛮书密札", suit: "策", power: 2, text: "蛮书密札，字里藏机。", lore: "译得出的字，译不出的意。" },
    { id: "d_zhuchen", name: "诛臣诏书", suit: "势", power: 3, text: "诏书既下，人头落地。", lore: "纸上一个字，城下一颗头。" },
  ],
  changhen: [
    { id: "h_jiange", name: "建章宫阙", suit: "势", power: 3, text: "宫阙巍峨，压得住人心。", lore: "雪落重檐，帝王的肩也沉。" },
    { id: "h_taiwei", name: "太尉兵符", suit: "器", power: 3, text: "兵符合一，虎符在手。", lore: "两半铜虎，分则不安。" },
    { id: "h_tongji", name: "铜雀台阁", suit: "器", power: 2, text: "铜雀台高，风起檐铃。", lore: "台高百尺，望不见的东西更多。" },
    { id: "h_jiangzuo", name: "江左羽檄", suit: "策", power: 3, text: "羽檄星驰，军情如火。", lore: "三根鸡毛，一根比一根急。" },
    { id: "h_qiuzhuang", name: "秋装试冠", suit: "势", power: 2, text: "秋试冠冕，旧梦重温。", lore: "冠是新的，人是旧的。" },
    { id: "h_lingjun", name: "陵寝松柏", suit: "器", power: 2, text: "陵寝松柏，岁岁常青。", lore: "碑前松柏，比碑记得久。" },
    { id: "h_wuji", name: "空榻帷幔", suit: "隐", power: 3, text: "空榻帷幔，人已先冷。", lore: "被褥折痕还在，人没了。" },
    { id: "h_zaici", name: "御赐棋枰", suit: "策", power: 2, text: "御赐棋枰，残局未收。", lore: "枰上的棋，走到一半没人下了。" },
    { id: "h_miling", name: "密令夜出", suit: "隐", power: 2, text: "密令夜出，信鸽振翅。", lore: "蜡封的筒子，比刀快。" },
    { id: "h_guanshi", name: "观史残卷", suit: "势", power: 2, text: "观史残卷，朱批如血。", lore: "史书翻到某一页，总要停一停。" },
  ],
  jianfeng: [
    { id: "jf_tianxia", name: "天下棋局", suit: "势", power: 3, text: "天下棋局，落子即江山。", lore: "舆图铺案，山河是棋。" },
    { id: "jf_huangquan", name: "皇权剑锋", suit: "器", power: 3, text: "剑出鞘半，权柄在握。", lore: "剑光里，照见玉玺。" },
    { id: "jf_shuishi", name: "水师点兵", suit: "势", power: 4, text: "水师点兵，江面如镜。", lore: "战船列阵，旗压江风。" },
    { id: "jf_junzhou", name: "军舟如梭", suit: "器", power: 2, text: "军舟如梭，往来如织。", lore: "桨影交叠，水花不歇。" },
    { id: "jf_anshi", name: "暗室议事", suit: "隐", power: 3, text: "暗室议事，灯下无影。", lore: "窗纸透一线光，照不全几张脸。" },
    { id: "jf_chengzhou", name: "城舟之盟", suit: "策", power: 2, text: "城舟之盟，两指为凭。", lore: "盟书上的指印，比墨重。" },
    { id: "jf_guyu", name: "孤屿危城", suit: "隐", power: 2, text: "孤屿危城，浪打墙根。", lore: "城在水中，水在城外。" },
    { id: "jf_mingdao", name: "明刀暗箭", suit: "策", power: 3, text: "明刀暗箭，双管齐下。", lore: "刀在明处，箭在暗处。" },
    { id: "jf_dongwu", name: "东吴使节", suit: "势", power: 2, text: "使节过江，礼匣藏锋。", lore: "节杖上的旌旄，垂着没风。" },
    { id: "jf_jiangxin", name: "江心砥柱", suit: "势", power: 2, text: "江心砥柱，中流不动。", lore: "水绕石走，石不挪窝。" },
  ],
  xingxing: [
    { id: "x_shenghuo", name: "星火初燃", suit: "势", power: 3, text: "星火初燃，一盏灯就是一粒种。", lore: "油灯如豆，照着一屋子人。" },
    { id: "x_geshi", name: "隔板密谈", suit: "隐", power: 3, text: "隔板密谈，声音压到墙根。", lore: "板缝漏光，话不漏。" },
    { id: "x_duizhang", name: "识字夜校", suit: "势", power: 4, text: "夜校识字，一字一火种。", lore: "黑板上的字，比刀有劲。" },
    { id: "x_citang", name: "祠堂宣誓", suit: "势", power: 3, text: "祠堂宣誓，举拳如林。", lore: "牌位面前，拳头举过头顶。" },
    { id: "x_tiankan", name: "田埂传单", suit: "隐", power: 2, text: "田埂传单，塞进草垛。", lore: "纸角露出，像地里冒出的芽。" },
    { id: "x_jiutui", name: "旧票据", suit: "器", power: 2, text: "旧票据，叠着旧账。", lore: "纸黄了，账没黄。" },
    { id: "x_maozi", name: "草帽斗笠", suit: "器", power: 2, text: "草帽斗笠，檐下藏着脸。", lore: "帽檐压得低，眼抬得高。" },
    { id: "x_gesheng", name: "歌声越墙", suit: "策", power: 2, text: "歌声越墙，一句传一句。", lore: "墙外的歌，墙里的人会了。" },
    { id: "x_huodu", name: "火种藏匣", suit: "隐", power: 2, text: "火种藏匣，等着风来。", lore: "匣里的火柴，一根顶十根。" },
    { id: "x_litu", name: "犁头新磨", suit: "势", power: 2, text: "犁头新磨，地要翻身。", lore: "犁刃雪亮，土知道要开春。" },
  ],
  touming: [
    { id: "t_yuye", name: "雨夜请缨", suit: "势", power: 3, text: "雨夜请缨，叩门三响。", lore: "雨水沿檐成线，门里灯一晃。" },
    { id: "t_liangjia", name: "梁家铺子", suit: "器", power: 3, text: "梁家铺子，灯笼挂到三更。", lore: "门板半卸，柜上货没名。" },
    { id: "t_shaoming", name: "投名血状", suit: "隐", power: 3, text: "投名血状，按手为誓。", lore: "血印盖在名字上，名字就改了。" },
    { id: "t_haohan", name: "好汉聚义", suit: "势", power: 4, text: "好汉聚义，酒碗齐举。", lore: "火把照着一张张脸，都年轻。" },
    { id: "t_baodao", name: "宝刀出鞘", suit: "器", power: 2, text: "宝刀出鞘三分，寒气先到。", lore: "刀是旧的，人是新的。" },
    { id: "t_zhenwei", name: "阵前威喝", suit: "势", power: 2, text: "阵前一声，刀都抖了三抖。", lore: "喝声落地，尘土跟着停。" },
    { id: "t_mishu", name: "密书在怀", suit: "隐", power: 2, text: "密书在怀，胸口烫着。", lore: "蜡封的信，比命重。" },
    { id: "t_yinji", name: "引路灯笼", suit: "策", power: 2, text: "引路灯笼，雨里挑着。", lore: "灯纸透光，雨丝斜织。" },
    { id: "t_duanhe", name: "断河阻渡", suit: "器", power: 2, text: "断河阻渡，船翻缆断。", lore: "缆绳一截一截，断口整齐。" },
    { id: "t_ciji", name: "辞疾请辞", suit: "策", power: 3, text: "辞疾请辞，官印退回。", lore: "折子摊开，笔搁砚上，墨还没干。" },
  ],
};

let total = 0;
for (const [file, cards] of Object.entries(ADD)) {
  const fp = `src/data/${file}.ts`;
  let src = readFileSync(fp, "utf8");
  const start = src.indexOf("  cards: [");
  if (start < 0) { console.error(`!! ${file} 找不到 cards: [`); continue; }
  // 从 cards: [ 后找配对闭合
  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) { console.error(`!! ${file} cards 数组未闭合`); continue; }
  const block = cards.map(C).join("\n");
  src = src.slice(0, end) + block + "\n" + src.slice(end);
  writeFileSync(fp, src);
  total += cards.length;
  console.log(`✓ ${file}: +${cards.length} 张`);
}
console.log(`共写入 ${total} 张`);
