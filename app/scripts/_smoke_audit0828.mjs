// 冒烟：审计修复批次 UI 层验证（2026-08-28）
// 覆盖：页面加载 / 剧情树 detail 点击 / 书斋入口 / 番外卡册入口 / 移动端断点
import { chromium } from "file:///C:/Users/Pengcheng_Li/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs";

const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " | " + extra : ""}`);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push("PE: " + e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push("CE: " + m.text().slice(0, 150)); });

await p.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);

// 1. 标题页核心元素
const hasTreeBtn = await p.evaluate(() => !!document.querySelector(".tree-btn, [class*=tree]") || document.body.innerText.includes("剧情树"));
check("标题页含剧情树入口", hasTreeBtn);
const hasBook = await p.evaluate(() => !!document.querySelector(".nav-book") || document.body.innerText.includes("书斋"));
check("书斋入口（nav-book）", hasBook);
const bodyText = await p.evaluate(() => document.body.innerText);
check("标题页文本加载", bodyText.length > 100, `文本 ${bodyText.length} 字`);
check("无退回上一幕按钮（无记录时隐藏）", !bodyText.includes("退回上一幕"), "符合预期（无上一幕记录不显示）");

// 2. 打开剧情树并点击节点验证 detail
const treeOpened = await p.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((x) => x.innerText.includes("剧情树"));
  if (btn) { btn.click(); return true; }
  return false;
});
check("点击打开剧情树", treeOpened);
await p.waitForTimeout(1500);
const hasTreeSvg = await p.evaluate(() => !!document.querySelector("svg") || document.body.innerText.includes("剧情"));
if (treeOpened) {
  // 点击 SVG 内一个场景节点（g 元素）
  const clicked = await p.evaluate(() => {
    const g = document.querySelector("svg g[data-id], svg g circle, svg g text");
    if (g) { const r = g.getBoundingClientRect(); const ev = new MouseEvent("click", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }); g.dispatchEvent(ev); return true; }
    return false;
  });
  await p.waitForTimeout(1000);
  const detailShown = await p.evaluate(() => {
    const t = document.body.innerText;
    return t.includes("场景") || t.includes("详情") || t.includes("幕");
  });
  check("树节点点击弹 detail", clicked && detailShown, `clicked=${clicked}`);
  // 关闭树
  await p.evaluate(() => { const c = [...document.querySelectorAll("button")].find((x) => x.innerText.includes("关闭") || x.innerText.includes("返回") || x.innerText.includes("×")); if (c) c.click(); });
  await p.waitForTimeout(500);
}

// 3. 移动端断点：书斋按钮存在 + 顶栏收敛
const pm = await b.newPage({ viewport: { width: 390, height: 844 } });
await pm.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await pm.waitForTimeout(1000);
const mobileBook = await pm.evaluate(() => !!document.querySelector(".nav-book") || document.body.innerText.includes("书斋"));
check("移动端 390px 书斋入口", mobileBook);
const mobileText = await pm.evaluate(() => document.body.innerText);
check("移动端无 7 连横排（书斋已聚合）", !(mobileText.split("\n").filter((l) => ["商市", "行囊", "图鉴", "卡册", "成就"].every((x) => l.includes(x))).length > 0), "顶栏已收敛");
await pm.close();

// 4. 番外数据可达性（UI 层抽查：卡册/详情文案含番外）
const pf = await b.newPage({ viewport: { width: 1280, height: 900 } });
await pf.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await pf.waitForTimeout(800);
const bonusText = await pf.evaluate(() => document.body.innerText.includes("番外"));
check("页面含番外文案入口", bonusText);
await pf.close();

console.log("=== 冒烟结果 ===");
for (const r of results) console.log(r);
console.log(errs.length ? "=== 页面错误 ===\n" + errs.join("\n") : "=== 无页面错误 ===");
await b.close();
process.exit(errs.length ? 1 : 0);
