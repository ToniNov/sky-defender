import { DAILY } from './game/balance';

/**
 * Ежедневная награда. Дни считаются по местному времени устройства:
 * без сервера перевод часов не остановить, это задача для v0.5.
 */

export interface Daily {
  /** День последней награды, YYYY-MM-DD ('' — ещё не забирал). */
  last: string;
  /** Сколько дней подряд забирал награду (по день last включительно). */
  streak: number;
}

export const NO_DAILY: Daily = { last: '', streak: 0 };

export const isDayKey = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function dayKey(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Можно ли сегодня забрать награду и каким по счёту днём серии она будет. */
export function dailyState(daily: Daily, today = dayKey()): { available: boolean; streak: number } {
  if (daily.last === today) return { available: false, streak: daily.streak };
  const continues = daily.last !== '' && dayNumber(today) - dayNumber(daily.last) === 1;
  return { available: true, streak: continues ? daily.streak + 1 : 1 };
}

/** Место дня серии в недельном круге наград (0…6). */
export const dailySlot = (streak: number) => (Math.max(1, streak) - 1) % DAILY.rewards.length;
export const dailyReward = (streak: number) => DAILY.rewards[dailySlot(streak)];
