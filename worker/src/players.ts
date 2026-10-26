import type { TelegramUser } from './initData';

/** Потолок очков за партию: всё, что выше, — точно подделка. Темп набора проверяет plausibleScore. */
export const MAX_SCORE = 10_000_000;
export const NAME_MAX = 32;

/**
 * Сколько очков в секунду можно набрать с запасом. Оценка сверху из баланса игры:
 * поздние волны — построение (~5 врагов) раз в ~0,5 с, до 40 очков за врага, комбо ×5 — около 600 в секунду.
 * Честный игрок до потолка не дотягивает; поднять, если баланс станет щедрее.
 */
export const SCORE_PER_SEC = 800;
/** Запас на быстрый старт: бонусы и первое построение. */
export const SCORE_HEADROOM = 3000;
/** Партия дольше этого считается брошенной — результат за неё не принимается. */
export const RUN_TTL_MS = 3 * 60 * 60 * 1000;

/** Можно ли честно набрать score за elapsedMs миллисекунд с начала партии (часы сервера). */
export function plausibleScore(score: number, elapsedMs: number): boolean {
  if (elapsedMs < 0 || elapsedMs > RUN_TTL_MS) return false;
  return score <= SCORE_HEADROOM + (SCORE_PER_SEC * elapsedMs) / 1000;
}

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
