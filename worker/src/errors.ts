/**
 * Отчёты об ошибках из игры: POST /api/errors.
 * Запрос без подписи (ошибка бывает и вне Telegram), поэтому всё режем по длине,
 * а одинаковые ошибки складываем в одну строку — таблица не разрастается от повторов.
 */

export const MESSAGE_MAX = 300;
export const STACK_MAX = 2000;
const SHORT_MAX = 40;
/** Сколько разных ошибок храним: дальше новые не записываются, повторы старых считаются. */
export const ERRORS_MAX = 1000;

export interface ErrorReport {
  message: string;
  stack: string;
  version: string;
  platform: string;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Тело POST /api/errors: { message, stack?, version?, platform? }. null — без текста ошибки. */
export function parseErrorReport(body: unknown): ErrorReport | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const message = text(b.message, MESSAGE_MAX);
  if (!message) return null;
  return {
    message,
    stack: text(b.stack, STACK_MAX),
    version: text(b.version, SHORT_MAX) || '?',
    platform: text(b.platform, SHORT_MAX) || '?',
  };
}

/** Одна и та же ошибка: та же версия, тот же текст, то же место (первая строка стека с кодом). */
export function errorFingerprint(r: ErrorReport): string {
  const place = r.stack.split('\n').find((line) => /:\d+/.test(line))?.trim() ?? '';
  return `${r.version}|${r.message}|${place}`.slice(0, 500);
}
