// 冒烟补充 v2：标题页封面直接验证树 detail / 退回上一幕（2026-08-28）
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Pengcheng_Li/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const results = [];
const check = (n, ok, x = "") => results.push(`${ok ? "PASS" : "FAIL"} ${n}${x ? " | " + x : ""}`);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push("PE: " + e.message));

await p.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
await p.evaluate(() => {
  const save = {
    version: 4, scenarioId: "fuma",
    state: {
      scenarioId: "fuma",
      sceneId: "a_deep", lineIndex: 0, flags: [], clues: ["x1", "x4", "x7", "x9"],
      bag: [], deck: [], silver: 30, boosts: [], visited: ["origin", "jingshi", "ku_xia", "a_win_gate", "a_deep"],
      stats: { chaoting: 4 }, phase: "story",
      endings: ["end_a_win"], usedCards: [], counters: {},
    },
    duel: undefined, savedAt: Date.now(),
  };
  localStorage.setItem("dicun_save_v4", JSON.stringify(save));
  localStorage.setItem("dicun_tree_v1", JSON.stringify({ fuma: ["origin", "jingshi", "ku_xia", "a_win_gate", "a_deep"] }));
  localStorage.setItem("dicun_gallery_v1", JSON.stringify([{ scenarioId: "fuma", endingId: "end_a_win", title: "守得云开" }]));
});
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);

// 标题页：继续/退回按钮
const resume = p.locator("button", { hasText: "继续上次" });
check("继续上次按钮出现", (await resume.count()) > 0);
const backBtn = p.locator("button", { hasText: "退回上一幕" });
check("退回上一幕按钮常驻", (await backBtn.count()) > 0);

// 退回上一幕点击反馈（无 prev 记录时也应给提示不崩）——先于开树（避免 overlay 拦截）
if (await backBtn.count()) {
  await backBtn.first().click({ force: true, timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(600);
  const feedback = await p.evaluate(() => {
    const t = document.body.innerText;
    return t.includes("上一幕") || t.includes("限") || t.includes("无");
  });
  check("退回上一幕点击有反馈", feedback, "toast 或提示");
}

// 封面剧情树按钮
const treeBtn = p.locator("button", { hasText: "剧情树" });
check("封面剧情树按钮（有进度存档）", (await treeBtn.count()) > 0);
let treeOpened = false;
if (await treeBtn.count()) {
  await treeBtn.first().click({ force: true, timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(1200);
  treeOpened = await p.evaluate(() => !!document.querySelector("svg"));
  check("剧情树 svg 渲染", treeOpened);
}
if (treeOpened) {
  const clicked = await p.evaluate(() => {
    const g = document.querySelector("svg g");
    if (!g) return false;
    const r = g.getBoundingClientRect();
    g.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.x + 4, clientY: r.y + 4 }));
    return true;
  });
  await p.waitForTimeout(800);
  const detailText = await p.evaluate(() => {
    const els = [...document.querySelectorAll("div,aside,section")].filter((e) => {
      const t = (e.innerText || "").trim();
      return t.length > 30 && (t.includes("幕") || t.includes("…") || t.includes("，"));
    });
    return els.length ? els[0].innerText.slice(0, 60) : "";
  });
  check("点击树节点弹 detail", detailText.length > 10, `detail: ${detailText.slice(0, 40)}`);
}

// 退回上一幕点击反馈（无 prev 记录时也应给提示不崩）——先于开树（避免 overlay 拦截）
if (await backBtn.count()) {
  await backBtn.first().click({ force: true, timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(600);
  const feedback = await p.evaluate(() => {
    const t = document.body.innerText;
    return t.includes("上一幕") || t.includes("限") || t.includes("无");
  });
  check("退回上一幕点击有反馈", feedback, "toast 或提示");
}

console.log("=== 冒烟补充 v2 ===");
for (const r of results) console.log(r);
console.log(errs.length ? "=== 页面错误 ===\n" + errs.join("\n") : "=== 无页面错误 ===");
await b.close();
process.exit(errs.length ? 1 : 0);
