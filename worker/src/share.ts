/**
 * Сообщение «Поделиться результатом»: сервер готовит его через Bot API savePreparedInlineMessage,
 * игра открывает окно выбора чата через WebApp.shareMessage(id).
 * https://core.telegram.org/bots/api#savepreparedinlinemessage
 */
import type { TelegramUser } from './initData';
import { displayName } from './players';

/** Русское склонение после числа: 1 очко, 2 очка, 5 очков. */
function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

export function shareText(user: TelegramUser, score: number): string {
  return `🛩 ${displayName(user)}: ${score} ${plural(score, 'очко', 'очка', 'очков')} в «Небесном патруле»!\nСможешь больше?`;
}

/** InlineQueryResultArticle: текст с результатом и кнопка, которая открывает игру. */
export function shareResult(user: TelegramUser, score: number, appUrl: string) {
  return {
    type: 'article',
    id: `score-${user.id}-${score}`,
    title: `Мой результат: ${score}`,
    input_message_content: { message_text: shareText(user, score) },
    reply_markup: { inline_keyboard: [[{ text: '✈️ Играть', url: appUrl }]] },
  };
}

/** id из ответа Bot API { ok, result: PreparedInlineMessage }; null — Telegram отказал. */
export function preparedMessageId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { ok, result } = data as { ok?: unknown; result?: { id?: unknown } };
  return ok === true && typeof result?.id === 'string' ? result.id : null;
}
