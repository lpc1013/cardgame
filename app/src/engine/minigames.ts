// ============================================================
// 场景化小游戏引擎：骰宝 / 棋局残局 / 宴会行令
// 纯状态机，UI 只负责渲染与回调。
// ============================================================

/** 骰宝：押注 大(11-17)/小(4-10)/豹子(三同，大小通吃)，三骰定胜负 */
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
export function sicboRoll(st: SicboState, side: "大" | "小" | "豹", cheat: boolean, cheatSeq = 0): void {
  st.side = side;
  st.cheat = cheat;
  const r = () => 1 + Math.floor(Math.random() * 6);
  let dice: [number, number, number];
  if (cheat && Math.random() < 0.75) {
    // 出千：七成概率控骰到押注侧（拒绝采样保证三骰均为合法骰面且符合押注）
    if (side === "豹") {
      const d = r();
      dice = [d, d, d];
    } else {
      const total = side === "大" ? 13 + Math.floor(Math.random() * 5) : 5 + Math.floor(Math.random() * 4);
      let a = r(), b = r(), c = total - a - b;
      for (let i = 0; i < 64 && !(c >= 1 && c <= 6 && !(a === b && b === c)); i++) {
        a = r(); b = r(); c = total - a - b;
      }
      dice = [a, b, c];
    }
  } else {
    dice = [r(), r(), r()];
  }
  st.dice = dice;
  const sum = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  // W-1（2026-08-27 审计）：查获率随本次进店出千次数递增——第 n 次为 0.2+n×0.05，封顶 1；堵死"无限提款机"
  st.caught = cheat && Math.random() < Math.min(1, 0.2 + cheatSeq * 0.05);
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
  if (st.result === "win") return st.side === "豹" ? st.bet * 5 : st.bet;
  if (st.result === "lose") return st.caught ? -st.bet * 2 : -st.bet;
  return 0;
}

/** 棋局残局：按正确顺序走出 N 手（每手从给定候选中选），错一手即败 */
export interface GobangPuzzle {
  title: string;
  desc: string;
  /** 残局图（ASCII：B=黑子，W=白子，.=空），开打前展示给玩家看清局面 */
  board?: string[];
  /** 每步落子后的局面快照（boards[0]=初始局面；boards[i]=第 i 手走完后的局面）；有则棋盘随步推进变化 */
  boards?: string[][];
  /** 残局图例说明（如：黑＝你 · 白＝老者） */
  boardHint?: string;
  /** 每一手的候选与正解 */
  steps: { prompt: string; options: string[]; answer: number }[];
  winText: string;
  loseText: string;
}
export interface PuzzleState {
  puzzle: GobangPuzzle;
  step: number;
  /** 当前显示的棋盘快照下标（有 boards 时 = step） */
  boardIdx: number;
  status: "playing" | "win" | "lose";
  log: string;
}
export function initPuzzle(p: GobangPuzzle): PuzzleState {
  return { puzzle: p, step: 0, boardIdx: 0, status: "playing", log: p.desc };
}
export function puzzlePlay(st: PuzzleState, optionIdx: number): void {
  const s = st.puzzle.steps[st.step];
  if (!s || st.status !== "playing") return;
  if (optionIdx === s.answer) {
    st.step += 1;
    st.boardIdx = st.puzzle.boards ? Math.min(st.step, st.puzzle.boards.length - 1) : st.boardIdx;
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
  const suits = ["策", "器", "势", "隐"];
  st.drawn = suits[Math.floor(Math.random() * suits.length)]!;
  st.log = `第 ${st.round + 1} 轮令签翻出——「${st.drawn}」。满座目光落在你身上。`;
}
export function jiulingPlay(st: JiulingState, cardSuit: string): void {
  if (!st.drawn || st.status !== "playing") return;
  const same = cardSuit === st.drawn;
  // 四色相克环：策克势 · 势克器 · 器克隐 · 隐克策；对令=你所出之色克令签之色
  const pair: Record<string, string> = { 策: "势", 势: "器", 器: "隐", 隐: "策" };
  const isPair = pair[cardSuit] === st.drawn;
  if (same) { st.score += 2; st.log = `同令而应，满座喝彩！（+2）`; }
  else if (isPair) { st.score += 1; st.log = `对令相和，也博了几声彩。（+1）`; }
  else { st.score -= 1; st.log = `岔了令。有人嗤笑出声。（-1）`; }
  // 按索引删除打出的第一张所出花色（旧实现遇重复花色会误截数组末位的另一花色）
  const idx = st.hand.indexOf(cardSuit);
  if (idx >= 0) st.hand = [...st.hand.slice(0, idx), ...st.hand.slice(idx + 1)];
  st.round += 1;
  st.drawn = null;
  if (st.round >= st.cfg.rounds) {
    // 方案B · 牌序管理：未出完的牌每张 +1 折算入总分（出牌=消费未来）
    const keep = st.hand.length;
    st.score += keep;
    st.log += ` 巡罢，手中余 ${keep} 张未出，各折彩一分（+${keep}）。`;
    st.status = st.score >= st.cfg.rounds ? "win" : "lose";
    st.log += st.status === "win"
      ? " 令官击箸：「好才思！这位大人，赏！」"
      : " 令官摇头：「罚酒三杯。」你在满堂笑声里坐下——什么也没套出来。";
  }
}

// ============================================================
// 通用答题小游戏（quiz 壳）：吟诗作对 duilian / 证词真假 logic
// 题干 + 候选选项（3-4 个），答对即时反馈，3 题 ≥2 对为胜。
// ============================================================
export interface QuizItem {
  prompt: string;
  options: string[];
  answer: number;
  win?: string;
  lose?: string;
}
export interface QuizConfig {
  type: "duilian" | "logic";
  title: string;
  desc: string;
  ruleHint?: string;
  items: QuizItem[];
  winText: string;
  loseText: string;
}
export interface QuizState {
  cfg: QuizConfig;
  step: number;
  correct: number;
  status: "playing" | "win" | "lose";
  log: string;
  lastCorrect: boolean | null;
}
export function initQuiz(cfg: QuizConfig): QuizState {
  return { cfg, step: 0, correct: 0, status: "playing", log: cfg.desc, lastCorrect: null };
}
export function quizAnswer(st: QuizState, optionIdx: number): void {
  const item = st.cfg.items[st.step];
  if (!item || st.status !== "playing") return;
  const ok = optionIdx === item.answer;
  if (ok) {
    st.correct += 1;
    st.log = item.win ?? `「${item.options[optionIdx]}」——正对。`;
  } else {
    st.log = item.lose ?? `「${item.options[optionIdx]}」——差了。`;
  }
  st.lastCorrect = ok;
  st.step += 1;
  if (st.step >= st.cfg.items.length) {
    st.status = st.correct >= 2 ? "win" : "lose";
    st.log += st.status === "win"
      ? " 三题毕。" + st.cfg.winText
      : " 三题毕。" + st.cfg.loseText;
  }
}

// ============================================================
// 推牌九（paijiu）：与庄家各摸 2 张骨牌（1-6 点），先看自己的牌再押注。
// 牌型：对子 > 天杠(双六) > 地杠(双幺) > 点数；同点庄赢。
// 押注 10/20/40 三档，弃牌罚 8；5 局制、弃牌限 2 次、净收益 ≥10 为胜。
// ============================================================
export interface PaijiuConfig {
  title: string;
  desc: string;
  rounds?: number;
  foldLimit?: number;
  target?: number;
  bets?: number[];
  foldPenalty?: number;
  winText: string;
  loseText: string;
}
export interface PaijiuRound {
  player: [number, number];
  dealer: [number, number];
}
export interface PaijiuState {
  cfg: PaijiuConfig;
  rounds: PaijiuRound[];
  round: number;
  folded: number;
  net: number;
  result: "win" | "lose" | "fold" | null;
  status: "playing" | "win" | "lose";
  log: string;
}
const dice6 = () => 1 + Math.floor(Math.random() * 6);
export function paijiuRank(p: [number, number]): { name: string; value: number } {
  const [a, b] = p;
  const sum = a + b;
  if (a === b) return { name: "对子", value: 100 + sum };
  // B-4（2026-08-27 审计）：双骰和域 [2,12]，旧「天杠(17)/地杠(15)」永假——
  // 改为可达的顶点牌：天杠=双六(12)、地杠=双幺(2)，次序 对子>天杠>地杠>点数 不变。
  if (sum === 12) return { name: "天杠", value: 90 };
  if (sum === 2) return { name: "地杠", value: 80 };
  return { name: "点数", value: sum };
}
export function initPaijiu(cfg: PaijiuConfig): PaijiuState {
  const n = cfg.rounds ?? 5;
  const list: PaijiuRound[] = [];
  for (let i = 0; i < n; i++) list.push({ player: [dice6(), dice6()], dealer: [dice6(), dice6()] });
  return { cfg, rounds: list, round: 0, folded: 0, net: 0, result: null, status: "playing", log: cfg.desc };
}
function paijiuAdvance(st: PaijiuState): void {
  if (st.round >= st.rounds.length) {
    const target = st.cfg.target ?? 10;
    st.status = st.net >= target ? "win" : "lose";
    st.log += st.status === "win"
      ? ` 五局毕，净 ${st.net} 两。` + st.cfg.winText
      : ` 五局毕，净 ${st.net} 两。` + st.cfg.loseText;
  }
}
/** 押注并结算本局：返回银两净变化 */
export function paijiuBet(st: PaijiuState, amount: number): number {
  if (st.status !== "playing") return 0;
  const r = st.rounds[st.round]!;
  const pr = paijiuRank(r.player);
  const dr = paijiuRank(r.dealer);
  let delta: number;
  if (pr.value > dr.value) {
    delta = amount; st.net += amount; st.result = "win";
    st.log = `第 ${st.round + 1} 局，押 ${amount} 两。开牌：你「${pr.name}·${pr.value}」对庄「${dr.name}·${dr.value}」——赢了。`;
  } else {
    delta = -amount; st.net -= amount; st.result = "lose";
    st.log = `第 ${st.round + 1} 局，押 ${amount} 两。开牌：你「${pr.name}·${pr.value}」对庄「${dr.name}·${dr.value}」——输了（同点庄赢）。`;
  }
  st.round += 1;
  paijiuAdvance(st);
  return delta;
}
/** 弃牌：罚金并推进 */
export function paijiuFold(st: PaijiuState): number {
  if (st.status !== "playing") return 0;
  const penalty = st.cfg.foldPenalty ?? 8;
  st.net -= penalty; st.folded += 1; st.result = "fold";
  st.log = `第 ${st.round + 1} 局，你弃牌，赔庄家抽头 ${penalty} 两。`;
  st.round += 1;
  paijiuAdvance(st);
  return -penalty;
}
