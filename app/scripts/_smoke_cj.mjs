import { chromium } from "file:///C:/Users/Pengcheng_Li/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push("PE: " + e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push("CE: " + m.text().slice(0, 120)); });
await p.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
// 点书斋（nav-book）
await p.evaluate(() => document.querySelector(".nav-book")?.click());
await p.waitForTimeout(800);
const body = await p.evaluate(() => document.body.innerText.slice(0, 800));
console.log("=== 书斋后 body ===");
console.log(body);
await b.close();
