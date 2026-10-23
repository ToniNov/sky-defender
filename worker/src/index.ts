/**
 * API игры на Cloudflare Workers + D1.
 * Игрок подтверждается заголовком `Authorization: tma <initData>` — подпись проверяет verifyInitData.
 *
 *   GET  /api/health       — жив ли сервер
 *   GET  /api/leaderboard  — топ игроков; с заголовком Authorization ещё и своё место
 *   POST /api/score        — { score } после партии; сохраняется лучший результат
 */
import { type TelegramUser, verifyInitData } from './initData';
import { displayName, parseScore } from './players';

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string; // секрет: wrangler secret put BOT_TOKEN, локально — worker/.dev.vars
  ALLOWED_ORIGINS: string; // через запятую: откуда игре можно ходить в API
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

/** Игрок из заголовка Authorization; null — заголовка нет или подпись неверна. */
async function authUser(request: Request, env: Env): Promise<TelegramUser | null> {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('tma ')) return null;
  const result = await verifyInitData(header.slice(4), env.BOT_TOKEN);
  return result.ok ? result.user : null;
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

  const user = await authUser(request, env);
  let me: { rank: number; score: number } | null = null;
  if (user) {
    const row = await env.DB.prepare('SELECT best_score FROM players WHERE id = ?')
      .bind(user.id)
      .first<{ best_score: number }>();
    if (row && row.best_score > 0) me = { rank: await rankOf(env, row.best_score), score: row.best_score };
  }
  return json({ top: results, me });
}

async function submitScore(request: Request, env: Env): Promise<Response> {
  const user = await authUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const score = parseScore(await request.json().catch(() => null));
  if (score === null) return fail('bad-score', 400);

  const now = Date.now();
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
      else if (route === 'POST /api/score') response = await submitScore(request, env);
      else response = fail('not-found', 404);
    } catch (err) {
      console.error(err);
      response = fail('server-error', 500);
    }
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
    return response;
  },
} satisfies ExportedHandler<Env>;
