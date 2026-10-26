import type { TelegramUser } from './initData';

/** Потолок очков за партию: всё, что выше, — точно подделка. Настоящая проверка правдоподобности — отдельная задача. */
export const MAX_SCORE = 10_000_000;
export const NAME_MAX = 32;

/** Имя для таблицы лидеров: «Имя Фамилия», обрезанное до NAME_MAX символов. */
export function displayName(user: TelegramUser): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return [...(full || 'Пилот')].slice(0, NAME_MAX).join('');
}

/** Тело POST /api/score: { score } — целое от 0 до MAX_SCORE. null — запрос неверный. */
export function parseScore(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const { score } = body as { score?: unknown };
  return typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= MAX_SCORE ? score : null;
}
