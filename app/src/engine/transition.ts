import type { Scenario, Scene, DuelConfig } from "./types";
// 值导入带 .ts 后缀：scripts/*.mts 用 node --experimental-strip-types 直跑（verify/hublock 的可达性证明
// 与 UI 必须是同一份实现），Node 的 ESM 解析不做扩展名补全；type 导入被 verbatimModuleSyntax 擦除，无需后缀。
import { applyEffects, checkCond, cloneRunState, resolveSceneLines, visibleChoices, type RunState } from "./runtime.ts";

// ============================================================
// 领域转移层：一次游戏行为只有一个权威结果
//   审计（2026-10-13）A01/A03/A06/目标架构——相位解析、选项结算、
//   动作可用性过去分别长在 App.tsx 的首次进入 / 读档 / 回退 / 渲染 / advance() 五处，
//   各处逻辑相似但不一致（回退恒进 story、提示按可见选项而推进按原始选项数）。
//   这里收成一个纯模块：UI、存档恢复、回退与验证脚本调的是同一份判定。
// ============================================================

/** 界面相位（与 App.tsx 的分支渲染同用一个类型，防两处各写一份字面量联合） */
export type Phase = "title" | "story" | "duel" | "ending" | "verdict" | "shop" | "pick" | "minigame";

/** 主声望类 stat 键（W-4 和议之书「威望有损」扣减目标）：剧本 stats 定义命中其一即扣 3（范围 2~5） */
export const PRESTIGE_STAT_KEYS = ["chaoting", "shengjuan", "shengyuan", "shenwang", "weiwang", "junwei", "junGong", "diye", "junji", "junxin", "quanli", "junchen"];

/** 和议之书的适用面：仅 pressure + war + 非设计性死局；劫与烬（大明不和亲）除外 */
export function peaceApplies(sc: Scenario, st: RunState, cfg: DuelConfig | undefined): boolean {
  return !!cfg && cfg.mode === "pressure" && cfg.war === true && cfg.unwinnable !== true
    && sc.id !== "jieyu" && st.boosts.includes("b_peace");
}
/** 和议之书买了仗却躲不过（剧情杀）：照样消耗，只是不免战 */
export function peaceConsumedButDoomed(sc: Scenario, st: RunState, cfg: DuelConfig | undefined): boolean {
  return !!cfg && cfg.mode === "pressure" && cfg.war === true && cfg.unwinnable === true
    && sc.id !== "jieyu" && st.boosts.includes("b_peace");
}

/** 和议生效后的状态：免战消耗 boost、主声望 -3、打 b_peace_skip 旗标（结局侧奖励归零） */
export function peaceSkipState(sc: Scenario, st: RunState): RunState {
  const out = cloneRunState(st);
  out.boosts = out.boosts.filter((b) => b !== "b_peace");
  const pStat = sc.stats?.find((s) => PRESTIGE_STAT_KEYS.includes(s.key));
  if (pStat) out.stats[pStat.key] = (out.stats[pStat.key] ?? 0) - 3;
  out.flags.add("b_peace_skip");
  return out;
}
/** 只消耗 boost、不免战（剧情杀） */
export function peaceConsumeOnly(st: RunState): RunState {
  const out = cloneRunState(st);
  out.boosts = out.boosts.filter((b) => b !== "b_peace");
  return out;
}

/** 场景 → 相位（唯一权威）。首次进入、读档、回退三条路径共用（审计 A01）。
 *  duel 幕但对局配置查不到时按剧情幕处理，与旧 enterSceneOf 的 fallthrough 同口径。 */
export function resolveScenePhase(sc: Scenario, scene: Scene): Phase {
  if (scene.duel && sc.duels.some((d) => d.id === scene.duel)) return "duel";
  if (scene.cardPick) return "pick";
  if (scene.shop) return "shop";
  if (scene.minigame) return "minigame";
  if (sc.verdict && scene.id === sc.verdict.scene) return "verdict";
  if (scene.ending) return "ending";
  return "story";
}

/** 幕尾的空行不算「还有内容没读」：末尾挂着 "" 时推进记号不该亮着、点一下也不该空一拍 */
export function lastRealLine(lines: string[]): number {
  if (lines.length === 0) return 0;
  let i = lines.length - 1;
  while (i > 0 && lines[i] === "") i--;
  return i;
}

/** 下一次推进落到的段落下标：长卷档一次揭满一段（停在排版空行前），对白档一次一句（跳过空行）。
 *  两种档位都以「最后一行有效内容」封顶，不再让点击落在幕尾空行上。 */
export function nextLineIndex(lines: string[], from: number, oneAtATime: boolean): number {
  const last = lastRealLine(lines);
  if (from >= last) return from;
  let j = from + 1;
  if (oneAtATime) {
    while (j < last && lines[j] === "") j++;
  } else {
    while (j < last && lines[j] !== "") j++;
  }
  return Math.min(j, last);
}

/** 这一幕眼下玩家真能做的动作（审计 A06：界面提示与实际推进必须是同一份判定） */
export type StoryAction =
  | { kind: "lines"; to: number }      // 还有正文没读完：推进到 to
  | { kind: "choices" }                // 幕末且有可见选项：只能选
  | { kind: "next"; sceneId: string }  // 幕末、零可见选项、配了 next：点击/空格续幕
  | { kind: "phase" }                  // 非剧情幕：出口在对局/市集/翻牌/小游戏/结局/复盘相位里
  | { kind: "none" };                  // 读到头却无任何出口——真死锁，门禁要红

export function availableActions(sc: Scenario, scene: Scene, st: RunState, oneAtATime = false): StoryAction {
  // 非剧情幕的出口在各自相位里（对局胜/败、市集离开、翻牌选卡、小游戏胜负、结案呈上、结局收束）——
  // 结案幕最容易被误判成死屏：它按数据就是「无选项、无 next」，出路全在 verdict 面板上。
  if (scene.duel || scene.cardPick || scene.shop || scene.minigame || scene.ending) return { kind: "phase" };
  if (sc.verdict && scene.id === sc.verdict.scene) return { kind: "phase" };
  const lines = resolveSceneLines(scene, st);
  const last = lastRealLine(lines);
  if (st.lineIndex < last) return { kind: "lines", to: nextLineIndex(lines, st.lineIndex, oneAtATime) };
  if (visibleChoices(scene, st).length > 0) return { kind: "choices" };
  if (scene.next) return { kind: "next", sceneId: scene.next };
  return { kind: "none" };
}

/** 选项结算（审计 A03）：分支按「做选择之前」的状态判定，效果在判定之后才落。
 *  旧实现先 applyEffects 再 checkCond，而同一次调用因浅拷共享引用改写了 st 本身——
 *  门槛不够的选项可以靠自己的扣费/加属性把自己变成满足。 */
export function takeChoice(st: RunState, scene: Scene, index: number): { next: RunState; targetSceneId: string } | null {
  const c = visibleChoices(scene, st)[index];
  if (!c) return null;
  const target = checkCond(c.cond, st) ? c.next : (c.altNext ?? c.next);
  return { next: applyEffects(c.effects, st), targetSceneId: target };
}

/** 换幕的状态转移（纯）：产出与 base 完全断开的新 RunState，并结算进幕效果 */
export function enterScene(base: RunState, scene: Scene, opts?: { autoRead?: boolean; lines?: string[] }): RunState {
  const shell: RunState = { ...cloneRunState(base), sceneId: scene.id, lineIndex: 0, visited: [...base.visited, base.sceneId] };
  const next = applyEffects(scene.effects, shell);
  if (opts?.autoRead) {
    const lines = opts.lines ?? resolveSceneLines(scene, next);
    next.lineIndex = Math.max(0, lastRealLine(lines));
  }
  return next;
}
