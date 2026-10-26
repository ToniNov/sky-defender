/**
 * API игры на Cloudflare Workers + D1.
 * Игрок подтверждается заголовком `Authorization: tma <initData>` — подпись проверяет verifyInitData.
 *
 *   GET  /api/health       — жив ли сервер
 *   GET  /api/leaderboard  — топ игроков; с заголовком Authorization ещё своё место и таблица среди друзей
 *   POST /api/run          — партия началась: сервер запоминает время старта
 *   POST /api/score        — { score } после партии; принимается, если столько можно набрать за время партии
 *   POST /api/share       — { score } → { id } подготовленного сообщения для WebApp.shareMessage
 *   GET  /api/referrals    — { link, invited, unclaimed }: ссылка-приглашение и сколько друзей пришло
 *   POST /api/referrals/claim — { claimed }: за скольких друзей выдать награду (монеты начисляет игра)
 */
import { type TelegramUser, verifyInitData } from './initData';
import { displayName, parseScore, plausibleScore } from './players';
import { inviteLink, parseReferrer } from './referrals';
import { preparedMessageId, shareResult } from './share';

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string; // секрет: wrangler secret put BOT_TOKEN, локально — worker/.dev.vars
  ALLOWED_ORIGINS: string; // через запятую: откуда игре можно ходить в API
  APP_URL: string; // ссылка на мини-апп (https://t.me/<бот>/<приложение>) для кнопки «Играть»; пусто — делиться нельзя
}

const LEADERBOARD_SIZE = 50;

interface LeaderRow {
  name: string;
  score: number;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (error: string, status: number) => json({ error }, status);

interface Auth {
  user: TelegramUser;
  startParam?: string;
}

/** Игрок из заголовка Authorization; null — заголовка нет или подпись неверна. */
async function authorize(request: Request, env: Env): Promise<Auth | null> {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('tma ')) return null;
  const result = await verifyInitData(header.slice(4), env.BOT_TOKEN);
  return result.ok ? { user: result.user, startParam: result.startParam } : null;
}

async function rankOf(env: Env, score: number): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS above FROM players WHERE best_score > ?')
    .bind(score)
    .first<{ above: number }>();
  return (row?.above ?? 0) + 1;
}

async function leaderboard(request: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT name, best_score AS score FROM players WHERE best_score > 0 ORDER BY best_score DESC, updated_at ASC LIMIT ?',
  )
    .bind(LEADERBOARD_SIZE)
    .all<LeaderRow>();

  const user = (await authorize(request, env))?.user;
  let me: { rank: number; score: number } | null = null;
  let friends: FriendRow[] | null = null;
  if (user) {
    const row = await env.DB.prepare('SELECT best_score FROM players WHERE id = ?')
      .bind(user.id)
      .first<{ best_score: number }>();
    if (row && row.best_score > 0) me = { rank: await rankOf(env, row.best_score), score: row.best_score };
    friends = await friendsBoard(env, user.id);
  }
  return json({ top: results, me, friends });
}

interface FriendRow extends LeaderRow {
  me: boolean;
}

const FRIENDS_SIZE = 100;

/** Таблица среди друзей: сам игрок, кого он пригласил и кто пригласил его. Сам игрок — даже без очков. */
async function friendsBoard(env: Env, playerId: number): Promise<FriendRow[]> {
  const { results } = await env.DB.prepare(
    `WITH circle (id) AS (
       SELECT ?1
       UNION SELECT invitee_id FROM referrals WHERE referrer_id = ?1
       UNION SELECT referrer_id FROM referrals WHERE invitee_id = ?1
     )
     SELECT p.name, p.best_score AS score, p.id = ?1 AS me
     FROM players p JOIN circle c ON c.id = p.id
     WHERE p.best_score > 0 OR p.id = ?1
     ORDER BY p.best_score DESC, p.updated_at ASC
     LIMIT ?2`,
  )
    .bind(playerId, FRIENDS_SIZE)
    .all<{ name: string; score: number; me: number }>();
  return results.map((r) => ({ name: r.name, score: r.score, me: r.me === 1 }));
}

/** Засчитать друга пригласившему — только если тот сам уже играл. Повторно не засчитывается (invitee_id — ключ). */
async function recordReferral(env: Env, invitee: number, startParam: string | undefined, now: number) {
  const referrer = parseReferrer(startParam, invitee);
  if (referrer === null) return;
  await env.DB.prepare(
    `INSERT INTO referrals (invitee_id, referrer_id, created_at)
     SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM players WHERE id = ?2)
     ON CONFLICT (invitee_id) DO NOTHING`,
  )
    .bind(invitee, referrer, now)
    .run();
}

/** Партия началась: запоминаем время старта по своим часам — клиенту в этом верить нельзя. */
async function startRun(request: Request, env: Env): Promise<Response> {
  const user = (await authorize(request, env))?.user;
  if (!user) return fail('unauthorized', 401);
  await env.DB.prepare(
    'INSERT INTO runs (player_id, started_at) VALUES (?1, ?2) ON CONFLICT (player_id) DO UPDATE SET started_at = excluded.started_at',
  )
    .bind(user.id, Date.now())
    .run();
  return json({ ok: true });
}

async function submitScore(request: Request, env: Env): Promise<Response> {
  const auth = await authorize(request, env);
  if (!auth) return fail('unauthorized', 401);
  const { user } = auth;
  const score = parseScore(await request.json().catch(() => null));
  if (score === null) return fail('bad-score', 400);

  const now = Date.now();
  // Партия закрывается при любой попытке: нельзя подождать и прислать то же ещё раз
  const run = await env.DB.prepare('DELETE FROM runs WHERE player_id = ? RETURNING started_at')
    .bind(user.id)
    .first<{ started_at: number }>();
  if (!run) return fail('no-run', 409);
  if (!plausibleScore(score, now - run.started_at)) {
    console.warn('implausible score', user.id, score, now - run.started_at);
    return fail('implausible', 422);
  }

  // Приглашение засчитывается новому игроку: кто уже играл, тот пришёл не по ссылке
  const known = await env.DB.prepare('SELECT 1 FROM players WHERE id = ?').bind(user.id).first();
  if (!known) await recordReferral(env, user.id, auth.startParam, now);

  // Лучший результат не уменьшается; имя обновляем — игрок мог его сменить
  const row = await env.DB.prepare(
    `INSERT INTO players (id, name, best_score, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       updated_at = CASE WHEN excluded.best_score > best_score THEN excluded.updated_at ELSE updated_at END,
       best_score = MAX(best_score, excluded.best_score)
     RETURNING best_score`,
  )
    .bind(user.id, displayName(user), score, now)
    .first<{ best_score: number }>();

  const best = row?.best_score ?? score;
  return json({ best, rank: await rankOf(env, best) });
}

async function share(request: Request, env: Env): Promise<Response> {
  const user = (await authorize(request, env))?.user;
  if (!user) return fail('unauthorized', 401);
  if (!env.APP_URL) return fail('share-disabled', 503);
  const score = parseScore(await request.json().catch(() => null));
  if (score === null) return fail('bad-score', 400);

  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/savePreparedInlineMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: user.id,
      result: shareResult(user, score, inviteLink(env.APP_URL, user.id)), // «Играть» — сразу приглашение
      allow_user_chats: true,
      allow_group_chats: true,
    }),
  });
  const data: unknown = await res.json().catch(() => null);
  const id = preparedMessageId(data);
  if (!id) {
    console.error('savePreparedInlineMessage', res.status, data);
    return fail('telegram-error', 502);
  }
  return json({ id });
}

async function referrals(request: Request, env: Env): Promise<Response> {
  const user = (await authorize(request, env))?.user;
  if (!user) return fail('unauthorized', 401);
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS invited, COALESCE(SUM(rewarded = 0), 0) AS unclaimed FROM referrals WHERE referrer_id = ?',
  )
    .bind(user.id)
    .first<{ invited: number; unclaimed: number }>();
  return json({
    link: env.APP_URL ? inviteLink(env.APP_URL, user.id) : null,
    invited: row?.invited ?? 0,
    unclaimed: row?.unclaimed ?? 0,
  });
}

async function claimReferrals(request: Request, env: Env): Promise<Response> {
  const user = (await authorize(request, env))?.user;
  if (!user) return fail('unauthorized', 401);
  // Одним запросом: двойное нажатие не выдаст награду дважды
  const { results } = await env.DB.prepare(
    'UPDATE referrals SET rewarded = 1 WHERE referrer_id = ? AND rewarded = 0 RETURNING invitee_id',
  )
    .bind(user.id)
    .all();
  return json({ claimed: results.length });
}

export default {
  async fetch(request, env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(request.url);
    const route = `${request.method} ${pathname}`;
    let response: Response;
    try {
      if (route === 'GET /api/health') response = json({ ok: true });
      else if (route === 'GET /api/leaderboard') response = await leaderboard(request, env);
      else if (route === 'POST /api/run') response = await startRun(request, env);
      else if (route === 'POST /api/score') response = await submitScore(request, env);
      else if (route === 'POST /api/share') response = await share(request, env);
      else if (route === 'GET /api/referrals') response = await referrals(request, env);
      else if (route === 'POST /api/referrals/claim') response = await claimReferrals(request, env);
      else response = fail('not-found', 404);
    } catch (err) {
      console.error(err);
      response = fail('server-error', 500);
    }
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
    return response;
  },
} satisfies ExportedHandler<Env>;
