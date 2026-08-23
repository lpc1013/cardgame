// ============================================================
// 场景化小游戏引擎：骰宝 / 棋局残局 / 宴会行令
// 纯状态机，UI 只负责渲染与回调。
// ============================================================

/** 骰宝：押注 大(4-10)/小(11-17)/豹子(三同)，三骰定胜负 */
export interface SicboState {
  bet: number;          // 押注额
  side: "大" | "小" | "豹" | null;
  dice: [number, number, number] | null;
  result: "win" | "lose" | "push" | null;
  cheat: boolean;       // 是否出千（赢面大增，被抓输双倍）
  caught: boolean;
  log: string;
}
export function initSicbo(): SicboState {
  return { bet: 10, side: null, dice: null, result: null, cheat: false, caught: false, log: "" };
}
export function sicboSetBet(st: SicboState, bet: number, max: number): void {
  st.bet = Math.max(0, Math.min(max, bet));
}
export function sicboRoll(st: SicboState, side: "大" | "小" | "豹", cheat: boolean): void {
  st.side = side;
  st.cheat = cheat;
  const r = () => 1 + Math.floor(Math.random() * 6);
  let dice: [number, number, number];
  if (cheat && Math.random() < 0.75) {
    // 出千：七成概率控骰到押注侧
    const total = side === "大" ? 13 + Math.floor(Math.random() * 5) : 5 + Math.floor(Math.random() * 4);
    const a = 1 + Math.floor(Math.random() * 6);
    const b = Math.max(1, Math.min(6, total - a - 1));
    dice = [a, b, total - a - b];
  } else {
    dice = [r(), r(), r()];
  }
  st.dice = dice;
  const sum = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  st.caught = cheat && Math.random() < 0.2;
  const hit = side === "豹" ? triple : (triple ? false : (side === "大" ? sum >= 11 : sum <= 10));
  if (st.caught) {
    st.result = "lose";
    st.log = `三骰「${dice.join("·")}」，共 ${sum} 点。庄家盯着你的袖口——手快，被抓了。押金双倍充公。`;
  } else if (side === "豹" && hit) {
    st.result = "win";
    st.log = `三骰「${dice.join("·")}」——豹子！通杀！赔五倍。满堂哗然。`;
  } else if (hit) {
    st.result = "win";
    st.log = `三骰「${dice.join("·")}」，共 ${sum} 点——开${side}！押中，一赔一。`;
  } else {
    st.result = "lose";
    st.log = `三骰「${dice.join("·")}」，共 ${sum} 点——开${triple ? "豹" : sum >= 11 ? "大" : "小"}。你的银子归了庄家。`;
  }
}
export function sicboPayout(st: SicboState): number {
  if (st.result === "win") {
    if (st.caught) return -st.bet * 2;
    return st.side === "豹" ? st.bet * 5 : st.bet;
  }
  if (st.result === "lose") return st.caught ? -st.bet * 2 : -st.bet;
  return 0;
}

/** 棋局残局：按正确顺序走出 N 手（每手从给定候选中选），错一手即败 */
export interface GobangPuzzle {
  title: string;
  desc: string;
  /** 每一手的候选与正解 */
  steps: { prompt: string; options: string[]; answer: number }[];
  winText: string;
  loseText: string;
}
export interface PuzzleState {
  puzzle: GobangPuzzle;
  step: number;
  status: "playing" | "win" | "lose";
  log: string;
}
export function initPuzzle(p: GobangPuzzle): PuzzleState {
  return { puzzle: p, step: 0, status: "playing", log: p.desc };
}
export function puzzlePlay(st: PuzzleState, optionIdx: number): void {
  const s = st.puzzle.steps[st.step];
  if (!s || st.status !== "playing") return;
  if (optionIdx === s.answer) {
    st.step += 1;
    st.log = `「${s.options[optionIdx]}」——正应。老者的指节在案上轻轻一叩。`;
    if (st.step >= st.puzzle.steps.length) {
      st.status = "win";
      st.log = st.puzzle.winText;
    }
  } else {
    st.status = "lose";
    st.log = `「${s.options[optionIdx]}？」老者摇头，「这一手，满盘皆输。」${st.puzzle.loseText}`;
  }
}

/** 宴会行令：轮流行令。桌面翻出一张「令签」（花色），你要出一张与令签同色或成对的酒牌； */
export interface JiulingConfig {
  title: string;
  desc: string;
  /** 轮数 */
  rounds: number;
  /** 你手中的酒牌（花色） */
  hand: string[];
}
export interface JiulingState {
  cfg: JiulingConfig;
  round: number;
  drawn: string | null;
  hand: string[];
  score: number;
  status: "playing" | "win" | "lose";
  log: string;
}
export function initJiuling(cfg: JiulingConfig): JiulingState {
  return { cfg, round: 0, drawn: null, hand: [...cfg.hand], score: 0, status: "playing", log: cfg.desc };
}
export function jiulingDraw(st: JiulingState): void {
  const suits = ["策", "器", "势"];
  st.drawn = suits[Math.floor(Math.random() * suits.length)]!;
  st.log = `第 ${st.round + 1} 轮令签翻出——「${st.drawn}」。满座目光落在你身上。`;
}
export function jiulingPlay(st: JiulingState, cardSuit: string): void {
  if (!st.drawn || st.status !== "playing") return;
  const same = cardSuit === st.drawn;
  const pair: Record<string, string> = { 策: "势", 势: "器", 器: "策" };
  const isPair = pair[cardSuit] === st.drawn;
  if (same) { st.score += 2; st.log = `同令而应，满座喝彩！（+2）`; }
  else if (isPair) { st.score += 1; st.log = `对令相和，也博了几声彩。（+1）`; }
  else { st.score -= 1; st.log = `岔了令。有人嗤笑出声。（-1）`; }
  st.hand = st.hand.filter((c) => c !== cardSuit || st.hand.filter((x) => x === cardSuit).length > 1).slice(0, Math.max(0, st.hand.length - 1));
  st.round += 1;
  st.drawn = null;
  if (st.round >= st.cfg.rounds) {
    st.status = st.score >= st.cfg.rounds ? "win" : "lose";
    st.log += st.status === "win"
      ? " 令官击箸：「好才思！这位大人，赏！」"
      : " 令官摇头：「罚酒三杯。」你在满堂笑声里坐下——什么也没套出来。";
  }
}
