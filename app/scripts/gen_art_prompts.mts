// 生成《帝成观止》权谋卡牌完整美术提示词（甲+乙 版本）
// 甲·去字化：卡面零汉字四字（威/理/利/情 仅作色相+非字纹章的框规范，由 UI 叠加）
// 乙·双轴门类：卡面主类目从四字改为更丰富的「门类」词汇（见 cardThemes），跨剧本不再只有四个字
// 风格分派：人物/对手立绘 → A 古风厚涂 anime；成术/物品/资源/场景 → C 水墨融合 anime
import { fuma } from "../src/data/fuma.ts";
import { qiuwei } from "../src/data/qiuwei.ts";
import { sichou } from "../src/data/sichou.ts";
import { xie } from "../src/data/xie.ts";
import { qinhuai } from "../src/data/qinhuai.ts";
import { themeOf, THEMES } from "../src/data/cardThemes.ts";

// A：角色/立绘（古风厚涂 anime）
const GLOBAL_A =
  "古风国漫二次元角色立绘画风，工笔与厚涂结合，织金官袍与发丝纹理细腻，冷调宫廷光影与体积光，优雅克制，类似魔道祖师天官赐福官方立绘质感，精致唯美，角色神情与身份呼应";
// C：物品/策略/资源/场景（水墨融合 anime）
const GLOBAL_C =
  "新国风二次元器物场景插画，动漫精致塑造感结合水墨晕染与留白意境，淡彩素雅，明式器物与市井公堂场景的写意再现，清雅不甜腻";
const NEG =
  "写实照片，3D渲染，崩坏，过度曝光，现代服饰与电器，低分辨率模糊，人物畸变，画面文字水印，浮夸光效，血腥恐怖，卡通q版，四花色汉字";

// 甲·花色色相 + 非字纹章（卡面不印汉字，由 UI 叠加纹章）
const SUIT_HUE: Record<string, string> = { 策: "青蓝", 器: "赭金", 势: "朱红" };
const SUIT_EMBLEM: Record<string, string> = { 策: "锦囊", 器: "方孔钱", 势: "官印" };
const RARITY_BORDER: Record<string, string> = {
  凡: "素麻灰极细边线",
  良: "黛青蓝极细边线",
  精: "藤萝紫极细边线",
  传: "赤金极细边线",
  孤品: "朱红描金极细边线",
};

// 每张卡的独立视觉概念（核心：把提示词补充完整）
const ART: Record<string, string> = {
  // ===== 驸马醉酒杀人案 =====
  c_wei_yamen: "朱漆大理寺府门紧闭，门钉森然，暮色里石狮沉默，威压自门槛渗出",
  c_wei_liang: "公案上摊开的卷宗与物证，一纸铁证拍在朱印旁，烛光自侧方打下",
  c_li_qian: "顺天府差役袖中悄悄滑出几枚铜钱，油灯下银光微闪，交易无声",
  c_li_mian: "市井暗巷，某人低声点出背后权贵的名号，拉长的影子里藏着倚仗",
  c_qing_tong: "酒家后堂的算盘与铜钱，三十年积下的油烟气与一盏暖灯",
  c_qing_nv: "瞎眼老母以枯手摩挲衣角，灯下亲情萧索，桌上半碗凉粥",
  c_li_lun: "案几上条理分明的纸笺，逻辑如线缕缕分明，墨痕清瘦",
  c_li_falv: "《大明律》书页特写，律文端凝，朱笔批着「减一等」三字",
  i_xin: "黄锦封皮密信静置案上，六个字力透纸背，周遭空气凝着沉沉威压",
  i_yu: "御赐龙凤玉珏特写，温润玉光流转，曾贴在某人衣襟夹层",
  i_dao: "短匕静卧案上，柄上无半枚掌纹，刃尖一点将凝未凝的暗红",
  i_zhu: "半截残烛斜倒，蜡泪凝痕交错，新旧灼痕叠在一处",
  i_shu: "「无欲则刚」拓本四字苍劲，宣纸肌理分明，似见父辈风骨",
  i_yinpiao: "一纸银票面值惊人，金线暗纹细密，可烧可藏，重若千钧",
  r_li_sanj: "老实仆役抱膝缩坐草席，眼神恳切，粗布衣裳打着补丁",
  r_zhang: "年轻书生眉间惊悸未散，似仍听见那声巨响，衣衫规整",
  r_zhou: "送酒行商神色仓皇欲言又止，肩头空担微晃",
  r_shen: "年少官员挺拔刚正，官袍整洁无尘，目光如炬不通权术",
  r_wang: "市井酒家店主圆滑精明，笑里藏着审视，算盘在手里拨得轻响",
  s_yin10: "几枚纹银散落案上，白花花朴拙，光自侧来",
  s_yin30: "官铸银锭规整沉重，带着官家火印，冷光内敛",
  // ===== 江南秋闱舞弊案 =====
  w_wei_chi: "贡院朱批敕令悬于梁下，圣旨在风中轻飘如纸，威而不厉",
  w_wei_ning: "笑面守卫身后，一道更沉静冷眼的影子，耐心地笑着",
  w_li_guan: "江南官场宴饮一角，杯盏交际间人情暗通，灯影暧昧",
  w_li_yi: "底层差役攥紧考绩簿，一生押注其上，指节发白",
  w_qing_tong: "秋雨里守卫立了一天，蓑衣湿透无人问，檐水滴落",
  w_qing_jia: "贡院守卫家中，八斗米与妻小围灯，清贫而有暖意",
  w_li_gui: "书吏指尖划过厚厚贡院规矩册，逐条烂熟于胸",
  w_li_fen: "「恪守公务」四字如无形之枷，既护人亦吊人",
  i_moji: "考卷一角墨点暗记特写，暗号标着一整张被明码标价的榜单",
  i_siyin: "来路不明的银票藏于床底板缝，寻常商贾终生难见一眼",
  i_siyesh: "巡考册被撕去三页，残边参差，撕不掉三页的厚度",
  i_wenji: "落第士子手稿，字里憋着十年不平之气",
  i_suoyi: "金陵秋雨中一件蓑衣，肩头淋湿，查案人也是肉做的",
  r_suyan: "落第才子清瘦孤傲，眼中看透棋局，布衣而立",
  r_xuan: "胆小书吏被一句「本官保你」唤醒，肩背微微挺直",
  r_wenzy: "圆滑辅官洞悉科场取舍系于朝局，笑意官气十足",
  r_chensan: "粗使杂役直觉今年处处诡异，眉头拧着说不清的不安",
  s_yin10e: "差旅碎银将尽，袋口微敞，灯下清贫",
  s_yin30d: "驿马草料省出的银两，规整小锭，带着驿印",
  // ===== 丝绸通倭案 =====
  i_yinpiao2: "无落款银票特写，票面干净，钱只认主人",
  i_midce: "军饷簿册边角特写，留着内廷太监的私印暗记",
  i_mixin: "七封无落款密信散开，却夹着一角皇家桑皮纸",
  i_guanyin: "一枚空白官印静置，印钮古朴，曾为走私漕船放行三年",
  i_sangpizhi: "无字无印的桑皮纸残页，纸纹里认得它的另一半",
  i_anyun: "暗纹云锦特写，锦里织进的不是纹样，是一条暗线",
  r_jiashan: "市井牙人精明势利，袖里乾坤，只收现银",
  r_atao: "织坊少女指尖染着丝色，认得堤下黑土",
  r_lvsiyuan: "账房先生伏案，沉默的那笔账是拿命换的",
  r_chenhu: "亲兵壮汉言语属实，唯独不敢说的那些压在喉头",
  r_liuxiaosan: "内廷太监无朝堂靠山故无所惧，神情淡漠",
  s_yin10b: "碎银几枚，贾三价目表上买三条人命的消息",
  s_yin50: "怀瑾坊打赏不过五十两，多了扎眼",
  s_yin100: "布政司封存赈灾银百两，从未到过灾民手里",
  // ===== 谢秀才自燃案 =====
  x_wen_kuan: "市井老者先四下看再开口，温言安抚惊魂",
  x_wen_bu: "织妇数十年守着一条街，沉静不动声色",
  x_wei_gong: "官身令牌亮出，牌子一样人心两样",
  x_wei_yin: "褪去官袍隐入夜色的人影，只剩轮廓",
  x_li_an: "老朽「不敢」二字出口，以安宁换一句真话",
  x_qing_shi: "凭吊蒙冤亡父的旧事，酒摊人都听见过",
  i_jing: "孩童上缴的凸面镜片，正午聚光可点燃一整桩冤案",
  i_la: "宫廷白磷残粉特写，曾在市井窗沿烧过一回",
  i_suo: "磨得发亮的木梭，织布数十年无一是给自己",
  i_shigao: "诗稿字句之间藏着旧姓与旧案，墨迹犹温",
  i_wenjiu: "温酒一盏，只食干点不进汤水的习惯救过命",
  r_zhifu: "檐下避热织布的素衣老妇，恍惚望见高墙之上立着一道人影",
  r_tingfeng: "吓瘫的酒摊主，看清火是从衣摆烧起来的",
  r_ande: "外商客商翻着账，记得每一单镜片的出货",
  r_leiru: "都头连证物都敢卖，卖几句真话不亏",
  s_yin10c: "吉水小钱一串，买不起正义买得起一碗酒",
  s_yin30b: "驿站查案银三十两，花超了要自己补",
  // ===== 秦淮河堤秘亡案 =====
  h_wei_zhang: "大理寺堂木拍下，惊堂木痕犹在，威仪凝于一击",
  h_li_yin: "重金买来的嘴，以性命为饵撬开，暗室烛影",
  h_li_zhang: "从犯减一等的生死账，算盘珠上分晓",
  h_qing_mu: "周老丈宫门外磕了一头，额血染红状纸",
  h_qing_nv: "画舫之上闺阁私语，什么都说什么不过说",
  h_li_tui: "画舫主人不识字却识得所有人脸色，条理分明",
  h_wei_chen: "内舱密语半时辰，正色诘问，屏风后影动",
  h_li_lun: "律法如刀，会用的人拿它护人，不会用的护己",
  i_xiang: "异香囊特写，痕迹可擦香味擦不掉",
  i_shui: "小舟当夜两次靠岸的水痕拓片，涟漪叠影",
  i_zhang: "无明细无落款的账簿残页，雇凶的银子走他的账",
  i_gongxiang: "在册香囊失踪，不在册的人也失踪，空荡的格架",
  i_yinzan: "荒沟重伤者托狱卒转赠的素银簪，朴素微光",
  r_shishang: "画舫之主端庄滴水不漏，承官宦宴饮，华服而立",
  r_liuzhou: "老艄公不敢多问却什么都记得，桨边水痕",
  r_pei: "监察官守住公文没守住自家院墙，神情复杂",
  r_zhoumang: "游民之首重伤初愈，眼里全是怕，衣衫褴褛",
  s_yin10d: "秦淮夜碎银缠袋，买醉或买命",
  s_yin30c: "漕运银三十两，来得快去得更快",
};

// 纯对手角色立绘（非人物卡）
const OPP: Record<string, { visual: string; layer: string }> = {
  "qiuwei|d_xiaomianhu": { visual: "面皮白净、笑意温润的底层贡院守卫，规矩本身，立在号舍暗影里", layer: "笑面虎守卫" },
  "sichou|d_zhou": { visual: "寒门主簿平静认罪如赴约，白衣素净，不像活人", layer: "周书年" },
  "sichou|d_yamamoto": { visual: "东海浪人首领桀骜，嘴角挂着冷笑，和服持械，海风掠发", layer: "山本一郎" },
};

const CASES: [string, any, string][] = [
  ["fuma", fuma, "驸马醉酒杀人案"],
  ["qiuwei", qiuwei, "江南秋闱舞弊案"],
  ["sichou", sichou, "丝绸通倭案"],
  ["xie", xie, "谢秀才自燃案"],
  ["qinhuai", qinhuai, "秦淮河堤秘亡案"],
];

function isChar(c: any): boolean {
  return c.layer === "人物";
}

function cardPrompt(c: any): { p: string; theme: string } {
  const layer = c.layer ?? "成术";
  const rarity = c.rarity ?? "凡";
  const suit = c.suit;
  const theme = themeOf(c.id, suit);
  const visual = ART[c.id] ?? `${c.name}之境：${(c.lore ?? "").slice(0, 24)}`;
  const border = RARITY_BORDER[rarity] ?? RARITY_BORDER["凡"];
  const emblem = suit ? `花色纹章(${SUIT_EMBLEM[suit] ?? "印"})·色相${SUIT_HUE[suit] ?? "朱"}` : "无花色";
  if (isChar(c)) {
    // A：角色立绘（古风厚涂 anime）
    return {
      theme,
      p: `${GLOBAL_A}，角色立绘半身像：${visual}。竖版3:4，背景虚化留白，${border}区分稀有度；卡面纯净无文字无标题，四角留少量净空供叠加${emblem}与门类标签(${theme})。负向：${NEG}`,
    };
  }
  // C：成术/物品/资源（水墨融合 anime）
  return {
    theme,
    p: `${GLOBAL_C}，卡牌主插图：${visual}（门类·${theme}）。竖版3:4构图，主体为独立器物或场景微距特写，四角大面积留白；卡面纯净无文字无标题，留少量净空供叠加${emblem}与门类标签(${theme})；稀有度仅以${border}区分。负向：${NEG}`,
  };
}

function oppCardPrompt(c: any): { p: string; theme: string } {
  const suit = c.suit;
  const theme = themeOf(c.id, suit);
  const emblem = suit ? `花色纹章(${SUIT_EMBLEM[suit] ?? "印"})·色相${SUIT_HUE[suit] ?? "朱"}` : "无花色";
  return {
    theme,
    p: `${GLOBAL_C}，对局专属牌插图：「${c.name}」的质问意象（门类·${theme}），压迫感十足的单一器物或神态剪影，四角留白，画面纯净无文字；留净空供叠加${emblem}。负向：${NEG}`,
  };
}

// ===== 组装文档 =====
let md = "";
const json: any = { global_char: GLOBAL_A, global_obj: GLOBAL_C, negative: NEG, themes: THEMES, suits: SUIT_HUE, suitEmblems: SUIT_EMBLEM, rarities: RARITY_BORDER, cards: {}, characters: {}, scenes: {} };

md += `# 帝成观止 · 权谋卡牌美术提示词（甲+乙 完整版）\n\n`;
md += `> 生成日期：2026-08-23 ｜ 风格：**角色/立绘=A 古风厚涂 anime；成术/物品/资源/场景=C 水墨融合 anime**（你定的二次元人物画风）\n`;
md += `> **甲·去字化**：卡面主体=每张独立插画；**策/器/势 三类不印汉字**，仅作「色相 + 非字纹章」由 UI 叠加（详见第 3 节）。根治跨剧本"满屏同一词"的频率感。\n`;
md += `> **乙·双轴门类**：卡面主类目从四字改为更丰富的「门类」词汇（刑名/盐铁/漕运/科举/闺阁/宫闱/江湖/商贾/药石/琴棋/工造…），跨剧本读到十几种不同词，单一词出现率再降一个数量级（映射见 cardThemes.ts）。\n`;
md += `> 用途：你用外部生图工具出图，图片按「落位规范」命名后接入引擎（见末尾「引擎接入」）。\n\n`;

md += `## 1. 全局风格前缀（所有图通用）\n\n`;
md += `- **角色/立绘（A 古风厚涂）**：\n\`\`\`\n${GLOBAL_A}\n\`\`\`\n`;
md += `- **物品/策略/资源/场景（C 水墨融合）**：\n\`\`\`\n${GLOBAL_C}\n\`\`\`\n\n`;
md += `## 2. 负向提示词（所有图通用）\n\n\`\`\`\n${NEG}\n\`\`\`\n\n`;
md += `## 3. 甲·三类色相 + 非字纹章（卡面零汉字三类）\n\n`;
md += `| 父分类 | 色相 | 纹章（符号，非汉字） | 释义 |\n|---|---|---|---|\n| 策 | ${SUIT_HUE["策"]} | ${SUIT_EMBLEM["策"]} | 谋略·招式·话术 |\n| 器 | ${SUIT_HUE["器"]} | ${SUIT_EMBLEM["器"]} | 实物·器物·钱粮 |\n| 势 | ${SUIT_HUE["势"]} | ${SUIT_EMBLEM["势"]} | 势力·人脉·视角 |\n\n`;
md += `> 情绪制相克环：策克势·势克器·器克策（三才循环）。卡面**不生成**任何策/器/势 汉字；纹章与色相由 UI 在卡框上叠加（接入阶段用 SVG/描边实现，非生图内容）。\n\n`;
md += `## 4. 乙·门类词汇表（卡面主类目）\n\n| 门类 | 释义 |\n|---|---|\n| 刑名 | 司法·案件·律法·刑讯 |\n| 盐铁 | 织造·丝绸·矿冶·垄断货物 |\n| 漕运 | 水运·舟船·河工 |\n| 科举 | 考场·士子·功名·文牍 |\n| 闺阁 | 家眷·亲情·女性·私语 |\n| 宫闱 | 朝堂·内廷·官印·密信·太监 |\n| 江湖 | 市井·侠隐·暗流·底层 |\n| 僧道 | 方外·寺观（预留） |\n| 边军 | 军伍·亲兵·武备 |\n| 商贾 | 银钱·买卖·市集·账目 |\n| 药石 | 毒药·医理·丹膏·化学 |\n| 琴棋 | 诗书画·雅器·文心 |\n| 工造 | 器物·百工·杂件 |\n\n`;
md += `> 卡面主类目标签显示「门类」而非三类词；映射见 \`src/data/cardThemes.ts\`（104 张全覆盖）。\n\n`;
md += `## 5. 三档稀有度边框\n\n| 稀有度 | 边框处理 |\n|---|---|\n| 凡 | ${RARITY_BORDER["凡"]} |\n| 良 | ${RARITY_BORDER["良"]} |\n| 孤品 | ${RARITY_BORDER["孤品"]} |\n\n`;
md += `## 6. 卡背\n\n\`\`\`\n${GLOBAL_C}，卡牌背面：靛青底暗云纹，中央一方朱印式「證」字暗纹，四角留白，哑光质感，无文字标题。负向：${NEG}\n\`\`\`\n\n`;

md += `## 7. 卡牌主插图（按案件分组，A/C 按卡类型分派）\n\n`;
for (const [key, sc, title] of CASES) {
  md += `### ${title}（${key}）\n\n`;
  for (const c of sc.cards) {
    const { p, theme } = cardPrompt(c);
    json.cards[c.id] = { name: c.name, layer: c.layer ?? "成术", rarity: c.rarity ?? "凡", suit: c.suit ?? null, theme, prompt: p };
    md += `**${c.id}** ｜ ${c.name} ｜ ${c.layer ?? "成术"} ｜ ${c.rarity ?? "凡"}${c.suit ? " ｜ " + c.suit : ""} ｜ 门类·${theme}\n\`\`\`\n${p}\n\`\`\`\n`;
  }
  for (const d of sc.duels ?? []) {
    if (d.oppCards) for (const c of d.oppCards) {
      const { p, theme } = oppCardPrompt(c);
      json.cards[c.id] = { name: c.name, layer: "对手专属牌", rarity: "凡", suit: c.suit, theme, prompt: p };
      md += `**${c.id}** ｜ ${c.name} ｜ 对手专属牌 ｜ ${c.suit} ｜ 门类·${theme}\n\`\`\`\n${p}\n\`\`\`\n`;
    }
  }
}

md += `\n## 8. 角色立绘（人物卡 + 纯对手，立绘与人物卡共用一张图，均走 A 古风厚涂）\n\n`;
const charSeen = new Set<string>();
for (const [key, sc] of CASES) {
  for (const c of sc.cards) {
    if (c.layer !== "人物") continue;
    if (charSeen.has(c.name)) continue;
    charSeen.add(c.name);
    const { p, theme } = cardPrompt(c);
    json.characters[c.id] = { name: c.name, theme, prompt: p };
    md += `**${c.id}** ｜ ${c.name} ｜ 门类·${theme}\n\`\`\`\n${p}\n\`\`\`\n`;
  }
}
for (const [k, sc] of CASES) {
  for (const d of sc.duels ?? []) {
    const okey = `${k}|${d.id}`;
    if (OPP[okey] && !charSeen.has(OPP[okey].layer)) {
      charSeen.add(OPP[okey].layer);
      const p = `${GLOBAL_A}，角色立绘半身像：${OPP[okey].visual}。竖版3:4，背景虚化留白，画面纯净无文字无标题。负向：${NEG}`;
      json.characters[`opp_${d.id}`] = { name: OPP[okey].layer, theme: "宫闱", prompt: p };
      md += `**opp_${d.id}** ｜ ${OPP[okey].layer}\n\`\`\`\n${p}\n\`\`\`\n`;
    }
  }
}

md += `\n## 9. 场景氛围插画（均走 C 水墨融合）\n\n`;
const SCENES: [string, string][] = [
  ["scn_gongtang", "大理寺公堂，匾额「明刑弼教」高悬，朱漆公案与堂木，烛火煌煌，百官侧立，威仪沉肃"],
  ["scn_market", "金陵三山街夜市，灯连成线，书坊与货郎摊，暖黄灯火与暗蓝天色对峙"],
  ["scn_jiuye", "如意酒家二楼密闭雅间，碎酒罐与翻倒烛台，烛光映血迹发黑，密室压抑"],
  ["scn_gongyuan", "江南贡院号舍连绵，秋雨淅沥，纸窗昏灯，肃杀考棚"],
  ["scn_zhifang", "丝绸织坊，织机排列，桑田连片，暗纹云锦在架上垂落，金线微光"],
  ["scn_huafang", "秦淮画舫夜灯，双层小舟水痕，雨中贡院远影，纸醉金迷与暗流"],
  ["scn_heti", "秦淮河堤黑土，夜雨荒沟，重伤者托簪，泥泞与沉默"],
  ["scn_ran", "谢秀才临窗，白衣书生剪影，凸面镜片聚光，檐下织妇遥望高墙人影"],
  ["scn_zhaoyu", "诏狱牢房，烛火摇曳，厚重石墙凝水珠，寂灭压抑"],
  ["scn_canju", "文萃堂残局，黑白棋枰一盏茶，老者不抬头，清寂对弈"],
  ["scn_jieting", "御书房烛火煌煌，文武侧立，圣上问案，卷宗如山"],
];
for (const [id, desc] of SCENES) {
  const p = `${GLOBAL_C}，场景氛围插画：${desc}。横版16:9，电影级构图与体积光，四角留白，画面纯净无文字无标题。负向：${NEG}`;
  json.scenes[id] = { prompt: p };
  md += `**${id}**\n\`\`\`\n${p}\n\`\`\`\n`;
}

md += `\n## 10. 引擎接入说明（提示词之外，需补的代码）\n\n`;
md += `- \`src/engine/types.ts\` 的 \`CardDef\` 增加 \`image?: string\`（卡面图路径）与 \`theme?: string\`（门类，亦可运行时查 \`cardThemes\`）。\n`;
md += `- \`App.tsx\` 卡牌渲染：\`.play-card\` 内 \`<img class="card-art">\` 占满卡面主体；叠加三层框：① \`.suit-seal\`（按三类色相 + 非字纹章 SVG，\**绝不显示策/器/势 汉字\**）；② \`.theme-tag\`（门类文字标签，来自 \`cardThemes[id]\`）；③ \`.rarity-border\` 极细边框。\n`;
md += `- 立绘（A 古风厚涂）用于对局对手头像与图鉴；物品/场景（C 水墨融合）用于卡面与背景。\n`;
md += `- 图片落位：\`src/assets/cards/<cardId>.jpg\`、\`src/assets/portraits/<id>.jpg\`、\`src/assets/scenes/<id>.jpg\`（jpg 优先，png 亦兼容）。\n`;
md += `- 建议先用「孤品 + 良」共约 30 张跑通接入与视觉，再铺满 凡。\n`;

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __d = dirname(fileURLToPath(import.meta.url));
const outMd = join(__d, "..", "..", "art", "权谋卡牌美术提示词.md");
const outJson = join(__d, "..", "..", "art", "art_prompts.json");
writeFileSync(outMd, md, "utf8");
writeFileSync(outJson, JSON.stringify(json, null, 2), "utf8");
console.log("written:", outMd);
console.log("cards:", Object.keys(json.cards).length, "characters:", Object.keys(json.characters).length, "scenes:", Object.keys(json.scenes).length);
