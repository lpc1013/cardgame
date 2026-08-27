// 31 张结局奖励卡落库：卡定义入各剧本 cards 数组（endingReward: true）+ 场景 ending.reward 挂接
// 用法：node scripts/add_reward_cards.mjs
import { readFileSync, writeFileSync } from "node:fs";

const C = (o) => `    { ${Object.entries(o)
  .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
  .join(", ")} },`;

// id: [剧本, name, suit, rarity, power, text, lore]
const REWARD = {
  fuma: [
    { id: "f_renxin", name: "人心沟壑", suit: "隐", rarity: "传", power: 4, endingReward: true, text: "案上的字断了案。案下的人心，断了案卷。", lore: "人心沟壑，填不平。" },
  ],
  qiuwei: [
    { id: "q_jinglei", name: "惊雷", suit: "策", rarity: "传", power: 4, endingReward: true, text: "惊堂木落，十年寒窗有了回响。", lore: "一纸荐书，压过十年寒窗。" },
    { id: "q_bailing", name: "白绫", suit: "器", rarity: "精", power: 3, endingReward: true, text: "白绫三尺，悬在公道之上。", lore: "为死者——活着的人欠的，死着的人记着。" },
  ],
  sichou: [
    { id: "s_jinxiu", name: "锦绣藏骨", suit: "隐", rarity: "传", power: 4, endingReward: true, text: "绸缎堆里，翻开是白骨。", lore: "锦绣盖得住血腥，盖不住眼睛。" },
    { id: "s_fanqi", name: "翻棋", suit: "策", rarity: "精", power: 3, endingReward: true, text: "满盘皆输的局，你翻了一子。", lore: "救人一线，翻棋一盘。" },
  ],
  xie: [
    { id: "x_shibi", name: "史笔", suit: "势", rarity: "传", power: 4, endingReward: true, text: "真相没能翻案——史册留下了名姓。", lore: "笔是直的，墨是冷的。" },
    { id: "x_fangliang", name: "房梁", suit: "隐", rarity: "精", power: 3, endingReward: true, text: "真相没有沉没——它藏进了房梁，等一个时代。", lore: "藏之名山，传之后世。" },
  ],
  qinhuai: [
    { id: "q_yuanshu", name: "爰书", suit: "器", rarity: "传", power: 4, endingReward: true, text: "爰书上的名字是真的。可你知道了——它不是全部的真。", lore: "一个名字，一座秦淮。" },
    { id: "q_qingyi", name: "青衣人", suit: "隐", rarity: "精", power: 3, endingReward: true, text: "你把爰书写给了皇城。没等到画押，等到了堤。", lore: "内廷深水，青衣一闪。" },
  ],
  jieyu: [
    { id: "j_xinren", name: "信在人心", suit: "势", rarity: "传", power: 4, endingReward: true, text: "信送到了。城头有人举着火把，喊你的名字。", lore: "蜡封的密信，比命重；送信的人，比信轻。" },
    { id: "j_kaihua", name: "开花了", suit: "势", rarity: "传", power: 4, endingReward: true, text: "偏院那棵桃树，今年开了。", lore: "八年天子，一棵树记得。" },
  ],
  shumian: [
    { id: "s_shidai", name: "属于我的时代", suit: "策", rarity: "传", power: 4, endingReward: true, text: "十面埋伏，围的是霸王；最后的伏兵，埋在史书里。", lore: "属于我的时代——也是史书翻页的时代。" },
    { id: "s_jogou", name: "狡兔死", suit: "隐", rarity: "传", power: 4, endingReward: true, text: "递出去的刀，终究有人替你收鞘。", lore: "狡兔死，走狗烹；钟室灯，照功臣。" },
    { id: "s_xinren", name: "信人不疑", suit: "势", rarity: "传", power: 4, endingReward: true, text: "孤城那夜你失信了一刻——这一生，你把它还给了他。", lore: "疑人不用，信人不疑。" },
    { id: "s_lianggong", name: "良弓未藏", suit: "器", rarity: "精", power: 3, endingReward: true, text: "弓藏进匣子，酒递到坟前。", lore: "那壶没喝到的酒，年年补上。" },
    { id: "s_qi", name: "旗", suit: "势", rarity: "精", power: 3, endingReward: true, text: "旗立在哪里，刀就砍向哪里。", lore: "为旗不为刃——最好的仗，都在帐中打。" },
  ],
  changjiang: [
    { id: "c_xuezi", name: "血色棋子", suit: "隐", rarity: "传", power: 4, endingReward: true, text: "困局成矣，君臣皆在枰内。", lore: "血色棋子，落在棋盘上，染红一页史书。" },
    { id: "c_bensang", name: "君臣一场", suit: "势", rarity: "传", power: 4, endingReward: true, text: "每年六月初一，你只落一子——落在让他的那一步。", lore: "棋子留在灵前。君臣一场，棋局未终。" },
    { id: "c_zhongju", name: "终局之局", suit: "策", rarity: "精", power: 3, endingReward: true, text: "棋盘外的胜负，被棋盘内的那句话，救了回来。", lore: "棋友——看得见棋子背后的人。" },
    { id: "c_qinwang", name: "亲往", suit: "势", rarity: "精", power: 3, endingReward: true, text: "君王的棋，下到了臣子的营帐里——那一局，和棋。", lore: "御驾出关，北疆成枰。" },
    { id: "c_yingsun", name: "鹰隼", suit: "势", rarity: "精", power: 3, endingReward: true, text: "你留在了北疆。宫里的人催了一辈子，你没有回头一次。", lore: "永镇边关，鹰隼不归。" },
  ],
  diaolan: [
    { id: "d_zhuyan", name: "朱颜再", suit: "势", rarity: "传", power: 4, endingReward: true, text: "政变功成。镜里的人，还是当年的样子。", lore: "朱颜未改，江山已换。" },
  ],
  changhen: [
    { id: "h_changdong", name: "长东", suit: "势", rarity: "传", power: 4, endingReward: true, text: "你熬赢了所有对手，独独输给了身后事。", lore: "人生长恨水长东。" },
    { id: "h_beiwang", name: "北望", suit: "策", rarity: "精", power: 3, endingReward: true, text: "你熬死了诸葛亮，也锁死了司马懿——代价是天下又乱了二十年。", lore: "北望改命，命也是代价。" },
  ],
  jianfeng: [
    { id: "jf_jianfeng", name: "剑锋之上", suit: "器", rarity: "传", power: 4, endingReward: true, text: "你赢得了整个天下——和一场一辈子醒不来的梦。", lore: "剑锋之上，王座之下。" },
    { id: "jf_wuzi", name: "无字之碑", suit: "隐", rarity: "精", power: 3, endingReward: true, text: "慈不掌兵——掌了兵的那颗心，还留着一块柔软的地方。", lore: "无字之碑，有人记得。" },
  ],
  xingxing: [
    { id: "x_liaoyuan", name: "可以燎原", suit: "势", rarity: "传", power: 4, endingReward: true, text: "星星之火，可以燎原——火种藏匣，等到了风。", lore: "自家的田，自家的灯。" },
    { id: "x_xiansheng", name: "先生", suit: "势", rarity: "精", power: 3, endingReward: true, text: "这两课，是你教过最好的课。", lore: "等他们认了字，自己说话。" },
    { id: "x_yaohuilai", name: "要回来的", suit: "势", rarity: "精", power: 3, endingReward: true, text: "队伍不是过路的兵——是自家的田，自家的灯。", lore: "灯还亮着，只是换了个不让人看见的地方。" },
  ],
  touming: [
    { id: "t_yujian", name: "羽箭轻语", suit: "器", rarity: "传", power: 4, endingReward: true, text: "箭是直的。路是弯的。最后的轻语，箭先于话。", lore: "江上借粮，梁家铺子，走马灯尽头的一场雨。" },
    { id: "t_xuelu", name: "血路", suit: "隐", rarity: "精", power: 3, endingReward: true, text: "血路生还——柴字营的旗，从水里捞起来，晾干了又立起来。", lore: "庄稼好得不像荒年——那是特意种的。" },
  ],
};

// sceneId -> reward cardId
const REWARD_MAP = {
  fuma: { end_a_deep: "f_renxin" },
  qiuwei: { end_win: "q_jinglei", end_bailin: "q_bailing" },
  sichou: { end_deep: "s_jinxiu", end_flip: "s_fanqi" },
  xie: { end_historian: "x_shibi", end_beam: "x_fangliang" },
  qinhuai: { end_lou: "q_yuanshu", end_qingyi: "q_qingyi" },
  jieyu: { p2_win_hero: "j_xinren", end_kaihua: "j_kaihua" },
  shumian: { a3_final: "s_shidai", end_jogou: "s_jogou", end_xinren: "s_xinren", end_lianggong: "s_lianggong", end_flag: "s_qi" },
  changjiang: { end_beiju: "c_xuezi", end_bensang: "c_bensang", end_qiyou: "c_zhongju", end_qinwang: "c_qinwang", end_yingxun: "c_yingsun" },
  diaolan: { end_sword: "d_zhuyan" },
  changhen: { end_trust: "h_changdong", end_cut: "h_beiwang" },
  jianfeng: { end_iron: "jf_jianfeng", end_stone: "jf_wuzi" },
  xingxing: { junzhuang: "x_liaoyuan", end_xiansheng: "x_xiansheng", end_yaohuilai: "x_yaohuilai" },
  touming: { ch3_canon_final: "t_yujian", ch3_breakout: "t_xuelu" },
};

let total = 0;
for (const [file, cards] of Object.entries(REWARD)) {
  const fp = `src/data/${file}.ts`;
  let src = readFileSync(fp, "utf8");

  // 1) 插卡入 cards 数组末尾
  const start = src.indexOf("  cards: [");
  if (start < 0) { console.error(`!! ${file} 找不到 cards: [`); continue; }
  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) { console.error(`!! ${file} cards 数组未闭合`); continue; }
  const block = cards.map(C).join("\n");
  src = src.slice(0, end) + block + "\n" + src.slice(end);

  // 2) 挂 ending.reward
  const map = REWARD_MAP[file];
  for (const [scnId, cardId] of Object.entries(map)) {
    // 找场景块：id: "<scnId>", 到最近的 "    }," 结束
    const marker = `id: "${scnId}",`;
    const si = src.indexOf(marker);
    if (si < 0) { console.error(`!! ${file} 场景 ${scnId} 未找到`); continue; }
    const blockEnd = src.indexOf("    },", si);
    if (blockEnd < 0) { console.error(`!! ${file} 场景 ${scnId} 块未闭合`); continue; }
    const scene = src.slice(si, blockEnd);
    // 场景块内应有 ending: {
    const ei = scene.indexOf("ending: {");
    if (ei < 0) { console.error(`!! ${file} 场景 ${scnId} 无 ending`); continue; }
    const relEnd = scene.indexOf("}", ei);
    if (relEnd < 0) { console.error(`!! ${file} 场景 ${scnId} ending 未闭合`); continue; }
    const absEnd = si + relEnd;
    const before = src.slice(si + ei, absEnd);
    if (/reward:/.test(before)) { console.log(`  ~ ${file} ${scnId} 已有 reward，跳过`); continue; }
    const newEnding = `${before.slice(0, before.length - 1)}, reward: "${cardId}" }`;
    src = src.slice(0, si + ei) + newEnding + src.slice(absEnd);
    console.log(`  ✓ ${file} ${scnId} -> reward ${cardId}`);
  }

  writeFileSync(fp, src);
  total += cards.length;
  console.log(`✓ ${file}: +${cards.length} 张奖励卡`);
}
console.log(`共写入 ${total} 张奖励卡`);
