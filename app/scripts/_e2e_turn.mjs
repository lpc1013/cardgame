// M0-M6 对战玩法重生 · 端到端冒烟：真回合流（出牌 → 交先手 → 对手行动 → 应手 → 第2回合）
// 用法：先起 dev（端口 3000），再 node --experimental-strip-types scripts/_e2e_turn.mjs
// 断言：回合横幅翻转 / 应手提示 / 轻回合自动交先手 / v2 结束回合按钮 / 无页面错误
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Pengcheng_Li/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const results = [];
const pageErrors = [];

async function runCase(browser, name, save) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => pageErrors.push(`[${name}] ${e.message}`));
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  const r = { name, steps: {} };
  try {
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
    await page.evaluate((s) => { localStorage.setItem("dicun_save_v4", JSON.stringify(s)); }, save);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // 继续上次 → 进入存档场景 → 场景 duel 触发对局
    await page.locator("button", { hasText: "继续上次" }).first().click();
    await page.waitForSelector(".duel-root", { timeout: 10000 });
    r.steps.duelEntered = true;

    const bannerText = async () => (await page.locator(".turn-banner").innerText().catch(() => ""));
    r.steps.bannerStart = await bannerText();

    // 出一张成术牌（顶卡直出；否则先点浮升再出）
    const playOne = async () => {
      const top = page.locator(".hand .play-card.hand-top:not(.char-card):not([disabled])");
      if (await top.count()) { await top.first().click(); return; }
      const any = page.locator(".hand .play-card:not(.char-card):not([disabled])");
      await any.first().click();
      await page.waitForTimeout(300);
      await page.locator(".hand .play-card.hand-top:not(.char-card)").first().click();
    };
    await playOne();
    await page.waitForTimeout(400);
    r.steps.afterLead = {
      banner: await bannerText(),
      attackPrompt: (await page.locator(".opp-attack-turn").count()) > 0,
    };

    // 应手（对手主攻等待我方应手；若对手蓄势/无意图则此步跳过）
    if (r.steps.afterLead.attackPrompt) {
      await playOne();
      await page.waitForTimeout(400);
    }
    r.steps.afterRespond = { banner: await bannerText() };

    // v2 局：断言「结束回合（交出先手）」按钮存在并驱动对手回合
    if (save.expectEndTurnBtn) {
      const btn = page.locator(".end-turn-btn", { hasText: "交出先手" });
      r.steps.endTurnBtnExists = (await btn.count()) > 0;
      if (r.steps.endTurnBtnExists) {
        await btn.first().click();
        await page.waitForTimeout(400);
        r.steps.afterEndTurn = {
          banner: await bannerText(),
          attackPrompt: (await page.locator(".opp-attack-turn").count()) > 0,
        };
        if (r.steps.afterEndTurn.attackPrompt) {
          await playOne();
          await page.waitForTimeout(400);
          r.steps.afterRespond2 = { banner: await bannerText() };
        }
      }
    }

    // 战报历史 / 预演元素在场（存在性冒烟，不强断言内容）
    r.steps.previewCount = await page.locator(".pc-preview").count();
    r.steps.historyCount = await page.locator(".duel-history").count();
    await page.screenshot({ path: `E:/CardGame/app/scripts/_e2e_turn_${name}.png`, fullPage: true });
    // 情绪局：所求横幅 + 对手小动作 + 读牌按钮在位；出牌后有结算反馈
    if (save.expectEmotion) {
      const moodOk = (await page.locator(".mood-banner").count()) > 0;
      const actionOk = (await page.locator(".opp-action").count()) > 0;
      const readBtnOk = (await page.locator(".gambit-btn", { hasText: "读牌" }).count()) > 0;
      const readBtnText = (await page.locator(".gambit-btn", { hasText: "读牌" }).first().innerText().catch(() => ""));
      await playOne();
      await page.waitForTimeout(400);
      const logOk = (await page.locator(".duel-log").count()) > 0;
      r.steps.emotion = { moodOk, actionOk, readBtnOk, readBtnText, logOk };
      r.ok = r.steps.duelEntered && moodOk && actionOk && readBtnOk && logOk;
    } else if (save.expectEndTurnBtn) {
      r.ok =
        r.steps.duelEntered &&
        /第 1 回合/.test(r.steps.bannerStart) &&
        /我方行动/.test(r.steps.afterLead.banner) &&
        r.steps.endTurnBtnExists === true &&
        /对手行动/.test(r.steps.afterEndTurn.banner) &&
        r.steps.afterEndTurn.attackPrompt === true &&
        /第 2 回合/.test(r.steps.afterRespond2.banner);
    } else {
      r.ok =
        r.steps.duelEntered &&
        /第 1 回合/.test(r.steps.bannerStart) &&
        /对手行动/.test(r.steps.afterLead.banner) &&
        r.steps.afterLead.attackPrompt === true &&
        /第 2 回合/.test(r.steps.afterRespond.banner);
    }
  } catch (e) {
    r.ok = false;
    r.error = String(e).slice(0, 300);
  } finally {
    r.consoleErrors = consoleErrors.slice(0, 5);
    await page.close();
  }
  results.push(r);
}

const jieyuSave = {
  version: 4,
  scenarioId: "jieyu",
  state: {
    scenarioId: "jieyu", sceneId: "p1_intro", viewpoint: "vp_yuqian", lineIndex: 0,
    flags: [], clues: [], stats: {},
    bag: ["j_hou", "j_tu", "j_yuan", "j_min", "j_shi", "j_ling", "j_lei", "j_gucheng", "j_haojiao", "j_xuncheng", "j_liangdao", "j_wengcheng"],
    deck: ["j_hou", "j_tu", "j_yuan", "j_min", "j_shi", "j_ling", "j_lei", "j_gucheng", "j_haojiao", "j_xuncheng", "j_liangdao", "j_wengcheng"],
    silver: 30, boosts: [], retinue: [], usedCards: [], visited: [], wagers: 0,
  },
  duel: undefined,
  savedAt: Date.now(),
};

const fumaSave = {
  version: 4,
  scenarioId: "fuma",
  state: {
    scenarioId: "fuma", sceneId: "b_start", lineIndex: 0,
    flags: [], clues: [], stats: {},
    bag: ["c_li_lun", "c_wei_liang", "c_wei_yamen", "c_qing_nv", "c_qing_tong"],
    deck: ["c_li_lun", "c_wei_liang", "c_wei_yamen", "c_qing_nv", "c_qing_tong"],
    silver: 30, boosts: [], retinue: [], usedCards: [], visited: [], wagers: 0,
  },
  duel: undefined,
  savedAt: Date.now(),
};
fumaSave.expectEndTurnBtn = true;

const changhenSave = {
  version: 4,
  scenarioId: "changhen",
  state: {
    scenarioId: "changhen", sceneId: "duel_intro", lineIndex: 0,
    flags: [], clues: [],
    stats: { shouming: 30, junchen: 50 },
    bag: ["h_rang", "h_shi", "h_yong", "h_fang", "h_zaici", "h_lingjun", "h_qiuzhuang"],
    deck: ["h_rang", "h_shi", "h_yong", "h_fang", "h_zaici", "h_lingjun", "h_qiuzhuang"],
    silver: 0, boosts: [], retinue: [], usedCards: [], visited: [], wagers: 0,
  },
  duel: undefined,
  savedAt: Date.now(),
};
changhenSave.expectEmotion = true;

const browser = await chromium.launch();
await runCase(browser, "light_jieyu", jieyuSave);
await runCase(browser, "v2_fuma", fumaSave);
await runCase(browser, "emotion_changhen", changhenSave);
await browser.close();
console.log(JSON.stringify({ results, pageErrors }, null, 2));
