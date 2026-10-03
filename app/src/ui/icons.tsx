// ============================================================
// 印记与纹章（皮）：非汉字形状语言 + 银锭/气条等小组件
// 2026-10-02 从 App.tsx 抽出，纯展示、无业务状态；文字由 CSS 上色，
// 换图会破坏七套皮肤的 currentColor 体系——这里刻意保持 SVG。
// ============================================================
import type { ReactNode } from "react";
import type { CardDef } from "../engine/types";
import { themeOf } from "../data/cardThemes";
import { themeSwatch } from "./art";

/** F-13：成就图标缺失时的 SVG 纹章兜底——已达成=金星章，未达成=虚线锁章（U-7 去字化语言，不再回落 emoji） */
export function AchSeal({ on, hidden }: { on: boolean; hidden?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="ach-seal-svg" style={{ color: on ? "var(--gold)" : "var(--ink-dim)" }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray={on ? undefined : "2.5 2.5"} />
      {on ? (
        <>
          <path d="M12 6.5 L13.9 10.4 L18.2 11 L15.1 14 L15.8 18.3 L12 16.3 L8.2 18.3 L8.9 14 L5.8 11 L10.1 10.4 Z" fill="currentColor" opacity="0.9" />
          {hidden && <circle cx="18.4" cy="5.6" r="2.2" fill="currentColor" />}
        </>
      ) : (
        <>
          <path d="M8.5 11 V9 a3.5 3.5 0 0 1 7 0 v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <rect x="7.5" y="11" width="9" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </>
      )}
    </svg>
  );
}

// 四类非汉字纹章（策=锦囊 / 器=方孔钱 / 势=官印 / 隐=蒙眼密纹），currentColor 由 .s-* 上色
export const SUIT_GLYPH: Record<string, ReactNode> = {
  策: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><path d="M7 10 Q12 6 17 10 L16 16 Q12 19 8 16 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M10 8 Q12 5.5 14 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>),
  器: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><rect x="9.5" y="9.5" width="5" height="5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>),
  势: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><rect x="6" y="9" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><rect x="10" y="5" width="4" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" /><line x1="9" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.3" /><line x1="9" y1="16" x2="15" y2="16" stroke="currentColor" strokeWidth="1.3" /></svg>),
  隐: (<svg viewBox="0 0 24 24" className="seal-svg" aria-hidden="true"><path d="M4.5 12 Q12 5.5 19.5 12 Q12 18.5 4.5 12 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth="1.3" /></svg>),
};

/** 层徽（C-5）：非汉字形状语言——物品=方孔钱轮廓 / 人物=人形剪影 / 资源=银锭。currentColor 由 CSS 层上色 */
export const LAYER_MARK: Record<string, ReactNode> = {
  物品: (<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="9.4" y="9.4" width="5.2" height="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>),
  人物: (<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.4" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M5.5 19 Q12 12.8 18.5 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>),
  资源: (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9 L17 9 L20 16.5 Q13 19 4 16.5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9.5 12.2 Q12 10.6 14.5 12.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>),
};


export function SuitSeal({ suit }: { suit?: string }) {
  if (!suit || !(suit in SUIT_GLYPH)) return null;
  return <span className={`pc-suit s-${suit}`}>{SUIT_GLYPH[suit]}</span>;
}


/** 墨铤小图标（元宝/墨锭形） */
export function IngotIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="ingot-icon">
      <path d="M4 10 Q12 4.5 20 10 L17.5 17.5 Q12 20.5 6.5 17.5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 10.5 Q12 8.5 15 10.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** 银两小图标（银锭形：两头翘、中间凹的船锭）。与墨铤那枚刻意不同形，
 *  顶栏两个字牌并排时靠轮廓分家，不靠"银/墨"那一个字 */
export function SyceeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" className="ingot-icon">
      <path d="M3.5 13 Q6 9 8.5 12 L15.5 12 Q18 9 20.5 13 Q18 18 12 18 Q6 18 3.5 13 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.5 12 Q12 14.5 15.5 12" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}


export function QiBar({ cur, max, foe }: { cur: number; max: number; foe?: boolean }) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return (
    <span className={`qi-bar ${foe ? "foe" : ""} ${pct <= 30 ? "low" : ""}`}>
      <i style={{ width: `${pct}%` }} />
      <span className="qi-num" style={{ position: "relative" }}>{Math.max(0, cur)}/{max}</span>
    </span>
  );
}

export function ThemeTag({ id, suit }: { id: string; suit?: string }) {
  return <span className="theme-tag">{themeOf(id, suit)}</span>;
}

/** 花色汉字圈标：圈内直书花色汉字（策/器/势/隐），按花色色相上色 */
export function BandSeal({ suit }: { suit?: string }) {
  if (!suit) return null;
  return <span className={`band-seal s-${suit}`}>{suit}</span>;
}

/** 花色楷体字（左上角圆形徽章内）：圈与字颜色由 CSS 按品级接管，系统楷体栈，缺字环境回退衬线 */
export function SuitGlyph({ suit }: { suit: string }) {
  return <span className={`suit-glyph s-${suit}`}>{suit}</span>;
}

/** 花纹槽：压在卡图上缘的头部横带 —— 左花色圈标、中卡名、右小分类 */
export function CardBand({ c, extra }: { c: CardDef; extra?: ReactNode }) {
  // C-5 层徽：非成术卡在手牌/行囊横带上挂小层徽（物品方孔钱 / 人物剪影 / 资源银锭），与图鉴角标同语言
  const layer = c.layer ?? "成术";
  return (
    <div className="card-band">
      <BandSeal suit={c.suit} />
      <span className="band-name">{c.name}</span>
      {layer !== "成术" && LAYER_MARK[layer] && (
        <span className={`fix-layer-seal fix-layer-seal-band l-${layer}`} title={`${layer}卡`}>{LAYER_MARK[layer]}</span>
      )}
      {extra}
      <ThemeTag id={c.id} suit={c.suit} />
    </div>
  );
}


export function ThemeSwatch({ id }: { id: string }) {
  const art = themeSwatch(id);
  if (!art) return null;
  return <span className="theme-swatch" style={{ backgroundImage: `url("${art}")` }} aria-hidden="true" />;
}

