// ============================================================
// 十三部剧本注册表（5 案 8 卷）：唯一权威清单，App 与各面板同源引用
// 2026-10-02 从 App.tsx 抽出；引擎注册（registerScenarios/setTotalEnds）仍在 App 挂载时执行
// ============================================================
import type { Scenario } from "../engine/types";
import { fuma } from "./fuma";
import { qiuwei } from "./qiuwei";
import { sichou } from "./sichou";
import { xie } from "./xie";
import { qinhuai } from "./qinhuai";
import { jieyu } from "./jieyu";
import { shumian } from "./shumian";
import { changjiang } from "./changjiang";
import { diaolan } from "./diaolan";
import { changhen } from "./changhen";
import { jianfeng } from "./jianfeng";
import { touming } from "./touming";
import { xingxing } from "./xingxing";

export const SCENARIOS: Scenario[] = [
  fuma, qiuwei, sichou, xie, qinhuai,
  jieyu, shumian, changjiang,
  diaolan, changhen, jianfeng, touming, xingxing,
];

/** 按 id 查剧本 */
export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.id === id);
