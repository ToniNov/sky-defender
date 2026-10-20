/**
 * Звуковые эффекты, синтезируемые на лету через Web Audio API:
 * файлов нет, ничего не грузится. Безопасно вызывать до разблокировки звука —
 * тогда вызовы просто ничего не делают.
 */

const MASTER_VOLUME = 0.6;
/** Минимальный интервал между одинаковыми звуками (сек), чтобы взрывы не сливались в шум. */
const MIN_GAP = 0.04;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const lastPlayed = new Map<string, number>();

/** Вызывать из обработчика жеста пользователя (тап по кнопке) — браузеры не разрешают звук раньше. */
export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // звук недоступен — играем молча
  }
}

/** Контекст, если звук разблокирован и звук с таким именем не играл только что. */
function ready(name: string): { ac: AudioContext; out: GainNode } | null {
  if (!ctx || !master || ctx.state !== 'running') return null;
  const now = ctx.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < MIN_GAP) return null;
  lastPlayed.set(name, now);
  return { ac: ctx, out: master };
}

/** Тон с плавным изменением частоты и затуханием. */
function tone(name: string, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
  const r = ready(name);
  if (!r) return;
  const { ac, out } = r;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur);
}

/** Шум через фильтр, частота среза падает — получается взрыв. */
function boom(name: string, dur: number, vol: number, f0 = 1400) {
  const r = ready(name);
  if (!r || !noise) return;
  const { ac, out } = r;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  src.buffer = noise;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(80, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur);
}

export const sfx = {
  shoot: () => tone('shoot', 'square', 820, 300, 0.07, 0.025),
  hit: () => tone('hit', 'triangle', 260, 140, 0.05, 0.05),
  explosion: (big = false) => boom(big ? 'explosion-big' : 'explosion', big ? 0.8 : 0.28, big ? 0.35 : 0.16),
  powerUp() {
    tone('powerUp-1', 'sine', 523, 523, 0.09, 0.09);
    tone('powerUp-2', 'sine', 659, 659, 0.09, 0.09, 0.07);
    tone('powerUp-3', 'sine', 784, 784, 0.14, 0.09, 0.14);
  },
  damage() {
    tone('damage', 'sawtooth', 190, 40, 0.4, 0.14);
    boom('damage-noise', 0.35, 0.2, 900);
  },
};
