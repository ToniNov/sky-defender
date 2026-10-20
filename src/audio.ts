/**
 * Звук: эффекты и фоновая музыка, синтезируются на лету через Web Audio API.
 * Файлов нет, ничего не грузится. Безопасно вызывать до разблокировки звука —
 * тогда вызовы просто ничего не делают.
 */

const MASTER_VOLUME = 0.4;
const MUSIC_VOLUME = 0.3;
/** Минимальный интервал между одинаковыми звуками (сек), чтобы взрывы не сливались в шум. */
const MIN_GAP = 0.04;

// Музыка: 16-е доли, цикл из 4 тактов (Am – F – C – G)
const BPM = 128;
const STEP = 60 / BPM / 4;
const LOOKAHEAD = 0.25; // на сколько секунд вперёд планируем ноты
const TICK_MS = 80;
const BAR_STEPS = 16;
const LOOP_STEPS = BAR_STEPS * 4;
/** Корень аккорда (MIDI) и его терция: минор — 3, мажор — 4. */
const CHORDS = [
  { root: 45, third: 3 },
  { root: 41, third: 4 },
  { root: 48, third: 4 },
  { root: 43, third: 4 },
] as const;
/** Бас по 16-м долям такта: смещение в полутонах или null (пауза). */
const BASS = [0, null, 0, null, 12, null, 0, null, 0, null, 0, null, 12, null, 7, null] as const;
const ARP = [0, 1, 2, 1] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = true;
const lastPlayed = new Map<string, number>();

/** Вызывать из обработчика жеста пользователя (тап по кнопке) — браузеры не разрешают звук раньше. */
export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = enabled ? MASTER_VOLUME : 0;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = MUSIC_VOLUME;
      musicBus.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume().then(beginMusic);
  } catch {
    ctx = null; // звук недоступен — играем молча
  }
}

/** Включить или выключить весь звук (эффекты и музыку). */
export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (master) master.gain.value = on ? MASTER_VOLUME : 0;
}

/** Контекст, если звук разблокирован и звук с таким именем не играл только что. */
function ready(name: string): { ac: AudioContext; out: GainNode } | null {
  if (!ctx || !master || ctx.state !== 'running') return null;
  const now = ctx.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < MIN_GAP) return null;
  lastPlayed.set(name, now);
  return { ac: ctx, out: master };
}

/** Тон с плавным изменением частоты и затуханием, начало в момент t. */
function osc(ac: AudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur);
}

/** Шум через фильтр; частота среза плавно идёт от f0 к f1. */
function noiseHit(ac: AudioContext, out: AudioNode, kind: BiquadFilterType, f0: number, f1: number, t: number, dur: number, vol: number) {
  if (!noise) return;
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  src.buffer = noise;
  filter.type = kind;
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur);
}

function tone(name: string, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
  const r = ready(name);
  if (r) osc(r.ac, r.out, type, f0, f1, r.ac.currentTime + delay, dur, vol);
}

function boom(name: string, dur: number, vol: number, f0 = 1400) {
  const r = ready(name);
  if (r) noiseHit(r.ac, r.out, 'lowpass', f0, 80, r.ac.currentTime, dur, vol);
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

// ───── Музыка ─────

const midiToHz = (n: number) => 440 * 2 ** ((n - 69) / 12);

let musicWanted = false;
let musicTimer: number | undefined;
let nextTime = 0;
let step = 0;

function playStep(ac: AudioContext, bus: AudioNode, i: number, t: number) {
  const s = i % BAR_STEPS;
  const chord = CHORDS[Math.floor(i / BAR_STEPS)];

  if (s % 4 === 0) osc(ac, bus, 'sine', 130, 45, t, 0.14, 0.7); // бочка
  if (s % 4 === 2) noiseHit(ac, bus, 'highpass', 7000, 7000, t, 0.04, 0.12); // хэт

  const bass = BASS[s];
  if (bass !== null) osc(ac, bus, 'sawtooth', midiToHz(chord.root + bass), midiToHz(chord.root + bass) * 0.99, t, STEP * 1.8, 0.2);

  const arp = [0, chord.third, 7][ARP[s % ARP.length]];
  osc(ac, bus, 'triangle', midiToHz(chord.root + 24 + arp), midiToHz(chord.root + 24 + arp), t, STEP * 0.9, 0.12);
}

function scheduleMusic() {
  if (!ctx || !musicBus) return;
  // Ноты, запланированные в прошлом (вкладка тормозила), пропускаем, а не играем кучей
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    if (enabled) playStep(ctx, musicBus, step, nextTime);
    nextTime += STEP;
    step = (step + 1) % LOOP_STEPS;
  }
}

function beginMusic() {
  if (!musicWanted || musicTimer !== undefined || !ctx || ctx.state !== 'running') return;
  nextTime = ctx.currentTime + 0.05;
  scheduleMusic();
  musicTimer = window.setInterval(scheduleMusic, TICK_MS);
}

export const music = {
  start() {
    musicWanted = true;
    beginMusic();
  },
  stop() {
    musicWanted = false;
    window.clearInterval(musicTimer);
    musicTimer = undefined;
  },
};
