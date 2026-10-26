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

export interface FriendEntry extends LeaderEntry {
  /** Строка самого игрока. */
  me: boolean;
}

export interface Leaderboard {
  top: LeaderEntry[];
  /** Своё место; null — ещё не играл или открыто вне Telegram. */
  me: { rank: number; score: number } | null;
  /** Таблица среди друзей вместе с самим игроком; null — открыто вне Telegram. */
  friends: FriendEntry[] | null;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

const isEntry = (e: unknown): e is LeaderEntry =>
  typeof e === 'object' && e !== null && typeof (e as LeaderEntry).name === 'string' && isInt((e as LeaderEntry).score);

/** Проверить ответ /api/leaderboard; null — ответ не той формы. */
export function parseLeaderboard(data: unknown): Leaderboard | null {
  if (typeof data !== 'object' || data === null) return null;
  const { top, me, friends } = data as { top?: unknown; me?: unknown; friends?: unknown };
  if (!Array.isArray(top)) return null;
  const mine = me as { rank?: unknown; score?: unknown } | null | undefined;
  const okMe = mine && isInt(mine.rank) && isInt(mine.score) ? { rank: mine.rank, score: mine.score } : null;
  const okFriends = Array.isArray(friends)
    ? friends.filter(isEntry).map((e) => ({ name: e.name, score: e.score, me: (e as Partial<FriendEntry>).me === true }))
    : null;
  return { top: top.filter(isEntry), me: okMe, friends: okFriends };
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

export interface Referrals {
  /** Ссылка-приглашение; null — на сервере не настроен адрес мини-аппа. */
  link: string | null;
  /** Сколько друзей пришло по ссылке и сыграло. */
  invited: number;
  /** За скольких из них ещё не забрана награда. */
  unclaimed: number;
}

/** Проверить ответ /api/referrals; null — ответ не той формы. */
export function parseReferrals(data: unknown): Referrals | null {
  if (typeof data !== 'object' || data === null) return null;
  const { link, invited, unclaimed } = data as { link?: unknown; invited?: unknown; unclaimed?: unknown };
  if (!isInt(invited) || !isInt(unclaimed) || unclaimed < 0 || unclaimed > invited) return null;
  return { link: typeof link === 'string' && link !== '' ? link : null, invited, unclaimed };
}

/** Проверить ответ /api/referrals/claim: за скольких друзей выдать награду; null — ответ не той формы. */
export function parseClaim(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const { claimed } = data as { claimed?: unknown };
  return isInt(claimed) && claimed >= 0 ? claimed : null;
}

export async function fetchReferrals(): Promise<Referrals | null> {
  if (!canSubmit) return null;
  return parseReferrals(await request('/api/referrals'));
}

/** Забрать награду за пришедших друзей. Сервер отдаёт каждого друга один раз — монеты начисляет игра. */
export async function claimReferrals(): Promise<number | null> {
  if (!canSubmit) return null;
  return parseClaim(await request('/api/referrals/claim', { method: 'POST' }));
}

// Начало партии и её результат уходят строго по очереди: иначе при быстром «Ещё раз»
// старт новой партии может обогнать результат прежней, и сервер его не примет
let queue: Promise<unknown> = Promise.resolve();
function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task);
  queue = next;
  return next;
}

/** Партия началась: сервер засекает время, чтобы потом проверить, можно ли набрать столько очков. */
export function startRun(): Promise<unknown> {
  if (!canSubmit) return Promise.resolve(null);
  return inOrder(() => request('/api/run', { method: 'POST' }));
}

/** Отправить очки партии. Сервер примет их один раз и только если их можно набрать за время с startRun. */
export function submitScore(score: number): Promise<{ best: number; rank: number } | null> {
  if (!canSubmit) return Promise.resolve(null);
  const body = JSON.stringify({ score });
  return inOrder(async () =>
    parseSubmit(await request('/api/score', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })),
  );
}
