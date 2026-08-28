/* C-6 端到端实测：注入 version:999 存档 → 点「继续上次」→ 断言 toast「此存档来自更新版本」且存档未被清除 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Pengcheng_Li/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));

  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  // 注入高版本存档（含完整 RunState 形状）
  await page.evaluate(() => {
    const save = {
      version: 999,
      scenarioId: "fuma",
      state: {
        sceneId: "origin", lineIndex: 0, flags: [], clues: [],
        bag: [], deck: [], silver: 20, boosts: [], visited: [],
        stats: {}, phase: "story",
      },
      duel: undefined,
      savedAt: Date.now(),
    };
    localStorage.setItem("dicun_save_v4", JSON.stringify(save));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  // 找「继续上次」按钮并点击
  const resumeBtn = page.locator("button", { hasText: "继续上次" });
  const hasResume = (await resumeBtn.count()) > 0;
  let toastText = null;
  let saveAfter = null;
  let bodyHasToast = false;
  if (hasResume) {
    await resumeBtn.first().click();
    // 尽早抓 toast（toast 2.2s 自动消隐）
    await page.waitForTimeout(120);
    const body = await page.locator("body").innerText().catch(() => "");
    const toasts = await page.locator(".toast").allTextContents().catch(() => []);
    toastText = toasts.join(" | ") || body.split("\n").filter((l) => l.includes("更新版本")).join(" | ");
    saveAfter = await page.evaluate(() => localStorage.getItem("dicun_save_v4") !== null);
    bodyHasToast = body.includes("更新版本");
    await page.screenshot({ path: "E:/CardGame/app/scripts/_e2e_c6_shot.png", fullPage: true });
  }
  await browser.close();
  console.log(JSON.stringify({ hasResume, toastText, saveKept: saveAfter, bodyHasToast }, null, 2));
})();
