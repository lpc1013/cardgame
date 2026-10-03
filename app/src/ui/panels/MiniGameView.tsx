// 2026-10-02 从 App.tsx 抽出（App 单体拆分 · 波4）
import type { Scenario } from "../../engine/types";
import type { RunState } from "../../engine/runtime";
import { useState } from "react";
import { initPuzzle, puzzlePlay, initJiuling, jiulingDraw, jiulingPlay, initQuiz, quizAnswer, initPaijiu, paijiuBet, paijiuFold, type PuzzleState, type JiulingState, type QuizState, type PaijiuState } from "../../engine/minigames";
import { findScene } from "../../engine/runtime";
import { sfx } from "../../engine/sfx";

export function MiniGameView({ sc, sceneId, onFinish }: {
  sc: Scenario; sceneId: string; onFinish: (win: boolean, mutated?: RunState, info?: { allRight?: boolean; netGain?: number }) => void;
}) {
  const scene = findScene(sc, sceneId);
  const mg = scene.minigame!;
  const [puzzle, setPuzzle] = useState<PuzzleState | null>(null);
  const [jiuling, setJiuling] = useState<JiulingState | null>(null);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [paijiu, setPaijiu] = useState<PaijiuState | null>(null);
  const [done, setDone] = useState(false);

  if (mg.type === "gobang" && !puzzle) setPuzzle(initPuzzle(mg.gobang!));
  if (mg.type === "jiuling" && !jiuling) setJiuling(initJiuling(mg.jiuling!));
  if ((mg.type === "duilian" || mg.type === "logic") && !quiz) setQuiz(initQuiz(mg.quiz!));
  if (mg.type === "paijiu" && !paijiu) setPaijiu(initPaijiu(mg.paijiu!));

  const title = mg.type === "gobang" ? (mg.gobang?.title ?? "手谈")
    : mg.type === "jiuling" ? (mg.jiuling?.title ?? "行令")
    : mg.type === "duilian" || mg.type === "logic" ? (mg.quiz?.title ?? "文会")
    : (mg.paijiu?.title ?? "推牌九");

  // 行令手牌高亮：相对当前令签标注 +2/+1/-1
  const jlPair: Record<string, string> = { 策: "势", 势: "器", 器: "隐", 隐: "策" };
  const jlHint = (s: string, drawn: string | null): number => {
    if (!drawn) return 0;
    if (s === drawn) return 2;
    if (jlPair[s] === drawn) return 1;
    return -1;
  };

  return (
    <div className="shop-root">
      <div className="shop-header">
        <h2>{title}</h2>
      </div>

      {mg.type === "gobang" && puzzle && (
        <div className="story-panel">
          {puzzle.status === "playing" && puzzle.puzzle.board && (
            <div className="gobang-wrap">
              <div className="gobang-board" aria-label="残局图">
                {(puzzle.puzzle.boards?.[puzzle.boardIdx] ?? puzzle.puzzle.board).map((row, r) => (
                  <div key={r} className="gobang-row">
                    {[...row].map((ch, ci) => (
                      <span key={ci} className={`gobang-cell ${ch === "B" ? "b" : ch === "W" ? "w" : ""}`} />
                    ))}
                  </div>
                ))}
              </div>
              {puzzle.puzzle.boardHint && <p className="muted gobang-hint">{puzzle.puzzle.boardHint}</p>}
              {puzzle.puzzle.boards && <p className="muted gobang-hint">第 {puzzle.boardIdx}/{puzzle.puzzle.boards.length - 1} 手局面</p>}
            </div>
          )}
          <p className="story-line show">{puzzle.log}</p>
          {puzzle.status === "playing" && (
            <div className="choices">
              {puzzle.puzzle.steps[puzzle.step]?.options.map((o, i) => (
                <button key={i} className="choice" onClick={() => {
                  sfx.card();
                  const p = structuredClone(puzzle);
                  puzzlePlay(p, i);
                  if (p.status === "win") sfx.win(); else if (p.status === "lose") sfx.lose(); else sfx.match();
                  setPuzzle(p);
                }}>{o}</button>
              ))}
            </div>
          )}
          {puzzle.status !== "playing" && !done && (
            <button className="btn-main" onClick={() => { setDone(true); onFinish(puzzle.status === "win"); }}>{puzzle.status === "win" ? "收下彩头" : "拱手告退"}</button>
          )}
        </div>
      )}

      {mg.type === "jiuling" && jiuling && (
        <div className="story-panel">
          <div className="jiuling-hand" title="你手上的酒牌">
            {jiuling.hand.map((s, i) => (
              <span key={i} className={`wine-chip suit-${s}${jiuling.drawn ? ` jl-hint-${jlHint(s, jiuling.drawn) > 0 ? "good" : jlHint(s, jiuling.drawn) < 0 ? "bad" : "mid"}` : ""}`}
                title={jiuling.drawn ? (jlHint(s, jiuling.drawn) === 2 ? "同令 +2" : jlHint(s, jiuling.drawn) === 1 ? "对令 +1" : "岔令 -1") : undefined}>
                {s}{jiuling.drawn && (jlHint(s, jiuling.drawn) > 0 ? ` +${jlHint(s, jiuling.drawn)}` : jlHint(s, jiuling.drawn) < 0 ? " -1" : "")}
              </span>
            ))}
          </div>
          <p className="story-line show">{jiuling.log}</p>
          <p className="muted">第 {Math.min(jiuling.round + 1, jiuling.cfg.rounds)} / {jiuling.cfg.rounds} 轮 · 得彩 {jiuling.score}（巡罢余牌每张 +1）</p>
          {jiuling.status === "playing" && !jiuling.drawn && (
            <button className="btn-main" onClick={() => { sfx.card(); const j = structuredClone(jiuling); jiulingDraw(j); setJiuling(j); }}>翻令签</button>
          )}
          {jiuling.status === "playing" && jiuling.drawn && (
            <div className="choices">
              {[...new Set(jiuling.hand)].map((s) => (
                <button key={s} className="choice" onClick={() => {
                  const j = structuredClone(jiuling);
                  jiulingPlay(j, s);
                  if (j.status === "win") sfx.win(); else if (j.status === "lose") sfx.lose(); else sfx.match();
                  setJiuling(j);
                }}>应令 · 出「{s}」牌{jlHint(s, jiuling.drawn) > 0 ? `（+${jlHint(s, jiuling.drawn)}）` : jlHint(s, jiuling.drawn) < 0 ? "（-1）" : ""}</button>
              ))}
            </div>
          )}
          {jiuling.status !== "playing" && !done && (
            <button className="btn-main" onClick={() => { setDone(true); onFinish(jiuling.status === "win"); }}>{jiuling.status === "win" ? "领赏" : "落座"}</button>
          )}
        </div>
      )}

      {(mg.type === "duilian" || mg.type === "logic") && quiz && (
        <div className="story-panel">
          <p className="story-line show">{quiz.log}</p>
          {quiz.cfg.ruleHint && quiz.status === "playing" && (
            <details className="quiz-rule"><summary>规则</summary><p className="muted">{quiz.cfg.ruleHint}</p></details>
          )}
          {quiz.status === "playing" && (
            <div className="quiz-box">
              <div className="quiz-prompt">{quiz.cfg.items[quiz.step]?.prompt}</div>
              <div className="choices">
                {quiz.cfg.items[quiz.step]?.options.map((o, i) => (
                  <button key={i} className="choice" onClick={() => {
                    sfx.card();
                    const q = structuredClone(quiz);
                    quizAnswer(q, i);
                    if (q.status === "win") sfx.win(); else if (q.status === "lose") sfx.lose(); else sfx.match();
                    setQuiz(q);
                  }}>{o}</button>
                ))}
              </div>
              <p className="muted">第 {Math.min(quiz.step + 1, quiz.cfg.items.length)} / {quiz.cfg.items.length} 题 · 答对 {quiz.correct}</p>
            </div>
          )}
          {quiz.status !== "playing" && !done && (
            <button className="btn-main" onClick={() => { setDone(true); onFinish(quiz.status === "win", undefined, quiz.status === "win" ? { allRight: quiz.correct === quiz.cfg.items.length } : undefined); }}>{quiz.status === "win" ? "领彩" : "告辞"}</button>
          )}
        </div>
      )}

      {mg.type === "paijiu" && paijiu && (
        <div className="story-panel">
          <p className="story-line show">{paijiu.log}</p>
          {paijiu.status === "playing" && (
            <div className="paijiu-box">
              <p className="muted">第 {paijiu.round + 1} / {paijiu.rounds.length} 局 · 净收益 {paijiu.net} 两（弃牌 {paijiu.folded}/{paijiu.cfg.foldLimit ?? 2} 次）</p>
              {paijiu.result === null && (
                <>
                  <div className="paijiu-hand">
                    <span className="st-label">你的牌：</span>
                    {paijiu.rounds[paijiu.round]!.player.map((n, i) => <span key={i} className="paijiu-tile">{n}</span>)}
                  </div>
                  <div className="choices">
                    {(paijiu.cfg.bets ?? [10, 20, 40]).map((b) => (
                      <button key={b} className="choice" onClick={() => { sfx.card(); const p = structuredClone(paijiu); paijiuBet(p, b); if (p.status === "win") sfx.win(); else if (p.status === "lose") sfx.lose(); else sfx.match(); setPaijiu(p); }}>押 {b} 两</button>
                    ))}
                    <button className="choice" disabled={paijiu.folded >= (paijiu.cfg.foldLimit ?? 2)} onClick={() => { sfx.choice(); const p = structuredClone(paijiu); paijiuFold(p); setPaijiu(p); }}>弃牌（罚 {paijiu.cfg.foldPenalty ?? 8}）</button>
                  </div>
                </>
              )}
            </div>
          )}
          {paijiu.status !== "playing" && !done && (
            <button className="btn-main" onClick={() => { setDone(true); onFinish(paijiu.status === "win", undefined, paijiu.status === "win" ? { netGain: paijiu.net } : undefined); }}>{paijiu.status === "win" ? "收下彩头" : "起身离席"}</button>
          )}
        </div>
      )}

      {done && <p className="muted">（继续……）</p>}
    </div>
  );
}

