// 给闲置 0 功能卡加功能位（situational/drawOnPlay/sacrifice）——一次性批量，幂等
import { readFileSync, writeFileSync } from "node:fs";

// 每张卡：所在文件 → 功能定义（power 后插入）
const PLAN = {
  "fuma.ts": {
    c_wei_yamen: { situ: ["器", 2], txt: "官威压过器械之利。" },
    c_wei_liang: { situ: ["隐", 2], txt: "铁证如山，隐秘无处遁形。" },
    c_li_qian: { draw: 1, txt: "银子开路，话也就多了（抽 1 张）。" },
    c_li_mian: { situ: ["势", 2], txt: "靠山一出，对面先矮三分。" },
    c_qing_tong: { situ: ["策", 2], txt: "共情入心，话术见缝插针。" },
    c_qing_nv: { situ: ["势", 2], txt: "妻小一提，铁打的汉子也软。" },
    c_li_lun: { draw: 1, txt: "掰开揉碎，理越辩越明（抽 1 张）。" },
    c_li_falv: { draw: 1, txt: "律法讲透，话就多了（抽 1 张）。" },
  },
  "sichou.ts": {
    w_wei_chi: { situ: ["器", 2], txt: "敕令当前，器械之利也要让三分。" },
    w_wei_ning: { sac: 1, txt: "沉默比言语压人——自伤 1，本张 +2。" },
    w_li_guan: { draw: 1, txt: "旧谊递梯子，话就多了（抽 1 张）。" },
    w_li_yi: { situ: ["器", 2], txt: "好处许到点子上，物欲最是直接。" },
    w_qing_tong: { situ: ["策", 2], txt: "一句辛苦，破开话术的壳。" },
    w_qing_jia: { situ: ["势", 2], txt: "家小一问，再硬的人也有软肋。" },
    w_li_gui: { draw: 1, txt: "规矩摆明，话就多了（抽 1 张）。" },
    w_li_fen: { draw: 1, txt: "利害算清，话就多了（抽 1 张）。" },
  },
  "xie.ts": {
    x_wen_kuan: { situ: ["策", 2], txt: "先顺后说，话术的软刀子。" },
    x_wen_bu: { sac: 1, txt: "不动声色，把火气咽回肚里——自伤 1，本张 +2。" },
    x_wei_gong: { situ: ["器", 2], txt: "官身一亮，器物人证都矮半头。" },
    x_wei_yin: { sac: 1, txt: "布衣潜行，风头自己扛——自伤 1，本张 +2。" },
    x_li_an: { draw: 1, txt: "许了安宁，话就多了（抽 1 张）。" },
    x_qing_shi: { situ: ["势", 2], txt: "亡者一提，再势利的人也要低头。" },
  },
  "diaolan.ts": {
    d_bi: { sac: 1, txt: "以身作饵，伤在自己身上——自伤 1，本张 +2。" },
    d_tui: { sac: 2, txt: "断腕求生，壮士也疼——自伤 2，本张 +4。" },
  },
  "changhen.ts": {
    h_chi: { draw: 1, txt: "金牌急令，人手也就到了（抽 1 张）。" },
    h_huan: { situ: ["势", 2], txt: "托孤之语，权势再大也要动容。" },
  },
  "jianfeng.ts": {
    j_duan: { situ: ["器", 2], txt: "先断其四肢，器械再利也舞不起来。" },
  },
  "xingxing.ts": {
    g_wei_ding: { sac: 1, txt: "第一个表态，靶子自己当——自伤 1，本张 +2。" },
    g_ren_shou: { draw: 1, txt: "一笔一划，人越多心越齐（抽 1 张）。" },
  },
};

let total = 0;
for (const [file, map] of Object.entries(PLAN)) {
  const path = `src/data/${file}`;
  let src = readFileSync(path, "utf8");
  let changed = 0;
  for (const [id, def] of Object.entries(map)) {
    // 定位该卡整行（单行定义）
    const lineRe = new RegExp(`(\\n\\s*\\{ id: "${id}",[^\\n]*\\n)`, "g");
    const m = lineRe.exec(src);
    if (!m) { console.error(`!! 未找到 ${file} ${id}`); continue; }
    let line = m[1];
    // 在 power: N, 后插功能字段
    const field = def.situ ? `situational: { suit: "${def.situ[0]}", bonus: ${def.situ[1]} }, ` : def.draw ? `drawOnPlay: ${def.draw}, ` : def.sac ? `sacrifice: ${def.sac}, ` : "";
    if (field) {
      const pRe = /(power: \d+, )/;
      if (pRe.test(line)) line = line.replace(pRe, `$1${field}`);
      else { console.error(`!! ${file} ${id} 无 power 字段`); continue; }
    }
    // text 追加功能句（原 text 末尾追加，保持「原文。功能句。」）
    if (def.txt) {
      const tRe = /(text: "[^"]*)(")(, lore)/;
      if (tRe.test(line)) line = line.replace(tRe, `$1${def.txt}$2$3`);
      else { console.error(`!! ${file} ${id} text 定位失败`); continue; }
    }
    src = src.replace(m[1], line);
    changed++;
  }
  writeFileSync(path, src);
  total += changed;
  console.log(`${file}: ${changed} 张`);
}
console.log(`共 ${total} 张加功能位`);
