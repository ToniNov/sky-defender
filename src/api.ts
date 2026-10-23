/**
 * Запросы к серверу игры (worker/). Адрес — VITE_API_URL при сборке; без него таблицы лидеров нет.
 * Любая ошибка сети или сервера → null: игра работает и без сервера.
 */
import { initData } from './telegram';

const API_URL: string = import.meta.env.VITE_API_URL ?? '';
const TIMEOUT_MS = 5000;

/** Сервер настроен — можно показывать таблицу лидеров. */
export const apiEnabled = API_URL !== '';
/** Можно отправлять очки: нужна подпись Telegram, вне Telegram её нет. */
export const canSubmit = apiEnabled && initData !== '';

export interface LeaderEntry {
  name: string;
  score: number;
}

export interface Leaderboard {
  top: LeaderEntry[];
  /** Своё место; null — ещё не играл или открыто вне Telegram. */
  me: { rank: number; score: number } | null;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Проверить ответ /api/leaderboard; null — ответ не той формы. */
export function parseLeaderboard(data: unknown): Leaderboard | null {
  if (typeof data !== 'object' || data === null) return null;
  const { top, me } = data as { top?: unknown; me?: unknown };
  if (!Array.isArray(top)) return null;
  const entries = top.filter(
    (e): e is LeaderEntry => typeof e === 'object' && e !== null && typeof e.name === 'string' && isInt(e.score),
  );
  const mine = me as { rank?: unknown; score?: unknown } | null | undefined;
  const okMe = mine && isInt(mine.rank) && isInt(mine.score) ? { rank: mine.rank, score: mine.score } : null;
  return { top: entries, me: okMe };
}

/** Проверить ответ /api/score; null — ответ не той формы. */
export function parseSubmit(data: unknown): { best: number; rank: number } | null {
  if (typeof data !== 'object' || data === null) return null;
  const { best, rank } = data as { best?: unknown; rank?: unknown };
  return isInt(best) && isInt(rank) ? { best, rank } : null;
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!apiEnabled) return null;
  const headers = new Headers(init.headers);
  if (initData) headers.set('Authorization', `tma ${initData}`);
  try {
    const res = await fetch(`${API_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function fetchLeaderboard(): Promise<Leaderboard | null> {
  return parseLeaderboard(await request('/api/leaderboard'));
}

/** Проверить ответ /api/share; null — ответ не той формы. */
export function parseShare(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { id } = data as { id?: unknown };
  return typeof id === 'string' && id !== '' ? id : null;
}

/** Попросить сервер подготовить сообщение с результатом; вернёт id для shareMessage. */
export async function prepareShare(score: number): Promise<string | null> {
  if (!canSubmit) return null;
  const body = JSON.stringify({ score });
  return parseShare(await request('/api/share', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }));
}

/** Отправить рекорд. Сервер хранит лучший результат, так что слать можно сколько угодно раз. */
export async function submitScore(score: number): Promise<{ best: number; rank: number } | null> {
  if (!canSubmit) return null;
  const body = JSON.stringify({ score });
  return parseSubmit(await request('/api/score', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }));
}
