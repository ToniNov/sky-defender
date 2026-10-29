/**
 * События аналитики из игры: POST /api/events.
 * Запрос без подписи (игра открывается и вне Telegram), поэтому всё проверяем и режем:
 * id устройства — только [a-z0-9], числа — целые в разумных пределах, причина — короткое слово.
 */

const SHORT_MAX = 40;
const SCORE_MAX = 10_000_000;
const WAVE_MAX = 1000;
const SECONDS_MAX = 6 * 3600;

export interface LaunchEvent {
  type: 'launch';
  device: string;
  version: string;
  platform: string;
}

export interface RunEvent extends Omit<LaunchEvent, 'type'> {
  type: 'run';
  score: number;
  wave: number;
  seconds: number;
  /** Чем сбит: bullet, missile или вид врага, который протаранил. */
  cause: string;
}

export type GameEvent = LaunchEvent | RunEvent;

const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, SHORT_MAX) : '');
const intIn = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;

/** Тело POST /api/events. null — не событие или испорченное. */
export function parseEvent(body: unknown): GameEvent | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.device !== 'string' || !/^[a-z0-9]{8,32}$/.test(b.device)) return null;
  const base = { device: b.device, version: text(b.version) || '?', platform: text(b.platform) || '?' };
  if (b.type === 'launch') return { type: 'launch', ...base };
  if (b.type !== 'run') return null;
  const { score, wave, seconds, cause } = b;
  if (!intIn(score, SCORE_MAX) || !intIn(wave, WAVE_MAX) || !intIn(seconds, SECONDS_MAX)) return null;
  if (typeof cause !== 'string' || !/^[a-z]{1,20}$/.test(cause)) return null;
  return { type: 'run', ...base, score, wave, seconds, cause };
}
