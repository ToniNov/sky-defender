/**
 * Сбор ошибок: необработанные исключения и отклонённые промисы уходят на сервер (api.ts → POST /api/errors).
 * Одну и ту же ошибку за сессию шлём один раз, всего — не больше MAX_REPORTS: упавший цикл кадров не завалит сервер.
 */
import { version } from '../package.json';
import { type ErrorReport, sendErrorReport } from './api';
import { platform } from './telegram';

export const MAX_REPORTS = 5;

/** Текст и стек из того, что бросили: Error, строка или что угодно. null — сообщать нечего. */
export function describeError(err: unknown): { message: string; stack: string } | null {
  if (err instanceof Error) {
    const message = `${err.name}: ${err.message}`;
    return { message, stack: err.stack ?? '' };
  }
  if (typeof err === 'string') return err.trim() ? { message: err.trim(), stack: '' } : null;
  if (err === undefined || err === null) return null;
  try {
    return { message: `Non-Error: ${JSON.stringify(err)}`, stack: '' };
  } catch {
    return { message: `Non-Error: ${String(err)}`, stack: '' };
  }
}

/** Ошибки, которые нам ничего не скажут: чужие скрипты без подробностей (CORS прячет текст). */
const NOISE = /^Script error\.?$/;

/** Счётчик отчётов за сессию: отсекает повторы и лишнее. send — куда отправлять (в тестах — подмена). */
export function createReporter(send: (r: ErrorReport) => void, max = MAX_REPORTS) {
  const sent = new Set<string>();
  return (err: unknown) => {
    const d = describeError(err);
    if (!d || NOISE.test(d.message) || sent.size >= max) return;
    const key = `${d.message}\n${d.stack.split('\n')[1] ?? ''}`;
    if (sent.has(key)) return;
    sent.add(key);
    send({ ...d, version, platform });
  };
}

/** Отправить ошибку (например, из ErrorBoundary). */
export const reportError = createReporter((r) => void sendErrorReport(r));

/** Ловить всё, что не поймал код игры. Вызывать один раз при запуске. */
export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}
