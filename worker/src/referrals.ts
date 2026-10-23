/**
 * Реферальные ссылки: t.me/<бот>/<приложение>?startapp=ref_<id>.
 * Telegram кладёт startapp в initData как start_param, а initData подписана — подделать пригласившего нельзя.
 */

const REF_PREFIX = 'ref_';

/** Ссылка-приглашение от игрока. */
export function inviteLink(appUrl: string, playerId: number): string {
  const url = new URL(appUrl);
  url.searchParams.set('startapp', `${REF_PREFIX}${playerId}`);
  return url.toString();
}

/** Кто пригласил, по start_param; null — не приглашение или приглашение самого себя. */
export function parseReferrer(startParam: string | undefined, selfId: number): number | null {
  if (!startParam?.startsWith(REF_PREFIX)) return null;
  const digits = startParam.slice(REF_PREFIX.length);
  if (!/^\d{1,15}$/.test(digits)) return null;
  const id = Number(digits);
  return id > 0 && id !== selfId ? id : null;
}
