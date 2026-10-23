/**
 * Проверка initData — строки, которую Telegram передаёт мини-аппу (Telegram.WebApp.initData).
 * Подпись: HMAC-SHA256 от отсортированных полей, ключ — HMAC-SHA256("WebAppData", токен бота).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | { ok: false; reason: 'no-hash' | 'bad-hash' | 'expired' | 'no-user' };

/** Сколько секунд initData считается свежей. */
export const INIT_DATA_TTL = 24 * 60 * 60;

const enc = new TextEncoder();

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Сравнение за одинаковое время, чтобы подпись нельзя было подобрать по задержке ответа. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Строка для подписи: все поля, кроме hash, по алфавиту, «ключ=значение» через перевод строки. */
export function dataCheckString(params: URLSearchParams): string {
  return [...params]
    .filter(([key]) => key !== 'hash')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
}

/** Подпись initData токеном бота (hex). */
export async function signInitData(params: URLSearchParams, botToken: string): Promise<string> {
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  return toHex(await hmac(secret, dataCheckString(params)));
}

function parseUser(raw: string | null): TelegramUser | null {
  if (!raw) return null;
  try {
    const user: unknown = JSON.parse(raw);
    if (typeof user !== 'object' || user === null) return null;
    const { id, first_name } = user as Partial<TelegramUser>;
    return typeof id === 'number' && typeof first_name === 'string' ? (user as TelegramUser) : null;
  } catch {
    return null;
  }
}

/** now — текущее время в секундах (параметр нужен для тестов). */
export async function verifyInitData(
  initData: string,
  botToken: string,
  now = Date.now() / 1000,
  ttl = INIT_DATA_TTL,
): Promise<InitDataResult> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no-hash' };
  if (!safeEqual(await signInitData(params, botToken), hash)) return { ok: false, reason: 'bad-hash' };

  const authDate = Number(params.get('auth_date'));
  if (!authDate || now - authDate > ttl) return { ok: false, reason: 'expired' };

  const user = parseUser(params.get('user'));
  if (!user) return { ok: false, reason: 'no-user' };
  return { ok: true, user, authDate };
}
