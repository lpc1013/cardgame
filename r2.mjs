import { readFileSync, writeFileSync } from "node:fs";
let a = readFileSync("src/App.tsx", "utf8");
// 1) 结局页:本局战报
a = a.replace(`          <div className="stat-report">
            {Object.entries(st.stats).map(([k, v]) => (
              <span key={k}>{sc.stats?.find((s) => s.key === k)?.name ?? k}：{v}</span>
            ))}
            {sc.cardSystem && <span>余银：{st.silver} 两</span>}
          </div>`,
`          <div className="run-report">
            <div className="run-report-title">── 本局战报 ──</div>
            <div className="stat-report">
              {Object.entries(st.stats).map(([k, v]) => (
                <span key={k}>{sc.stats?.find((s) => s.key === k)?.name ?? k}：{v}</span>
              ))}
            </div>
            <div className="stat-report">
              <span>探索 {st.visited.length + 1} 幕</span>
              {st.clues.length > 0 && <span>线索 {st.clues.length} 条</span>}
              {sc.cardSystem && <span>藏卡 {st.bag.length} 张 · 余银 {st.silver} 两</span>}
            </div>
          </div>`);
// 2) 标题页:玩法速览
a = a.replace(`  const [cardsOf, setCardsOf] = useState<Scenario | null>(null);`,
`  const [cardsOf, setCardsOf] = useState<Scenario | null>(null);
  const [showGuide, setShowGuide] = useState(false);`);
a = a.replace(`<p className="foot-tip">点击画面推进文本 · 进度自动保存 · ✦ = 含卡牌系统 v2</p>`,
`<div className="guide-entry">
          <button className="link-btn" onClick={() => setShowGuide(true)}>玩法速览（30 秒上手）</button>
        </div>
        <p className="foot-tip">点击画面推进文本 · 空格推进/数字选支 · 进度自动保存 · ✦ = 含卡牌系统 v2</p>
        {showGuide && (
          <div className="clue-overlay" onClick={() => setShowGuide(false)}>
            <div className="clue-overlay-panel" onClick={(e) => e.stopPropagation()}>
              <h3>玩法速览</h3>
              <div className="guide-sec"><b>基础</b>：点击画面推进文字；选项决定走向；空格=推进，数字键=选支。进度自动保存。</div>
              <div className="guide-sec"><b>案件模式</b>：调查取证 → 结案陈词拣选线索（真/伪/核心）→ 定谳。核心线索+足够实据 = 完整结局。</div>
              <div className="guide-sec"><b>对局·情绪匹配制</b>：对手亮出情绪（威/理/利/情）。同色接话=共鸣；对色（威↔理、利↔情）=破防；错色=失言。共鸣满则胜。</div>
              <div className="guide-sec"><b>对局·气力压制制</b>：出牌比点，点差即伤害；威牌×2但反噬1；连出同一张「招式用老」-2。打空对方气力即胜。</div>
              <div className="guide-sec"><b>✦ 卡牌系统 v2</b>：四层卡——成术（对局四色牌）/ 物品（对局道具，用后消耗，也是剧情钥匙）/ 人物（携带被动）/ 资源（即银两）。市集买卡卖卡开卡包；翻牌三选一；顶栏「卡组」随时编组（上限 12，资源不占槽）。对局中出牌耗行动力，可「换气」回力补牌。</div>
              <div className="guide-sec"><b>收集</b>：结局图鉴 · 剧情树（未探明的"？？？"就是多周目的方向）· 卡牌图鉴（孤品现世计数）。</div>
              <button className="btn-main" onClick={() => setShowGuide(false)}>开始查案</button>
            </div>
          </div>
        )}`);
writeFileSync("src/App.tsx", a);
console.log("ok");
