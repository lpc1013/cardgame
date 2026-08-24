// ============================================================
// 程序化音效（WebAudio 合成，零素材依赖）
// 传统器乐意象：翻卷=纸张沙沙(噪声)、落子/出牌=木鱼式短音、
// 共鸣=古琴式泛音、胜=上行宫调、败=下行沉音。
// ============================================================

let ctx: AudioContext | null = null;
let enabled = true;
try {
  enabled = localStorage.getItem("dicun_sfx") !== "off";
} catch { /* ignore */ }

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function sfxEnabled(): boolean { return enabled; }
export function toggleSfx(): boolean {
  enabled = !enabled;
  try { localStorage.setItem("dicun_sfx", enabled ? "on" : "off"); } catch { /* ignore */ }
  return enabled;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.12, delay = 0, slideTo?: number) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, gain = 0.05, delay = 0, hp = 1200) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  /** 推进文本：翻页沙沙 */
  page() { noise(0.18, 0.04, 0, 1600); },
  /** 出选项：轻击 */
  choice() { tone(660, 0.1, "triangle", 0.08); },
  /** 出牌：木鱼落案 */
  card() { tone(320, 0.12, "triangle", 0.14); noise(0.06, 0.03, 0, 2400); },
  /** 接住（共鸣）：古琴泛音 */
  match() { tone(523, 0.5, "sine", 0.1); tone(1046, 0.6, "sine", 0.05, 0.02); },
  /** 压制/得分：上行短音 */
  press() { tone(392, 0.15, "triangle", 0.12); tone(523, 0.18, "triangle", 0.1, 0.1); },
  /** 失误：哑音 */
  miss() { tone(180, 0.3, "sawtooth", 0.06, 0, 120); },
  /** 对局胜：宫调上行 */
  win() { [523, 659, 784].forEach((f, i) => tone(f, 0.4, "sine", 0.1, i * 0.14)); },
  /** 对局败：沉音下行 */
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.5, "sine", 0.09, i * 0.18)); },
  /** 解锁线索：清脆双音 */
  clue() { tone(880, 0.15, "sine", 0.08); tone(1174, 0.25, "sine", 0.06, 0.1); },
  /** 银钱：碰镒声 */
  coin() { tone(1318, 0.1, "sine", 0.1); tone(1568, 0.16, "sine", 0.07, 0.06); },
  /** 结局：钟声 */
  ending() { tone(196, 1.6, "sine", 0.14); tone(392, 1.4, "sine", 0.06, 0.02); tone(587, 1.2, "sine", 0.03, 0.04); },
};
