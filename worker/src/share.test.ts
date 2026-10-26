import { describe, expect, it } from 'vitest';
import { preparedMessageId, shareResult, shareText } from './share';

const USER = { id: 42, first_name: 'Антон' };

describe('shareText', () => {
  it('имя, очки со склонением и вызов', () => {
    expect(shareText(USER, 1)).toBe('🛩 Антон: 1 очко в «Небесном патруле»!\nСможешь больше?');
    expect(shareText(USER, 22)).toContain('22 очка');
    expect(shareText(USER, 1250)).toContain('1250 очков');
    expect(shareText(USER, 11)).toContain('11 очков');
  });
});

describe('shareResult', () => {
  it('статья с кнопкой «Играть» на мини-апп', () => {
    const result = shareResult(USER, 500, 'https://t.me/bot/play');
    expect(result.type).toBe('article');
    expect(result.input_message_content.message_text).toBe(shareText(USER, 500));
    expect(result.reply_markup.inline_keyboard).toEqual([[{ text: '✈️ Играть', url: 'https://t.me/bot/play' }]]);
    expect(new TextEncoder().encode(result.id).length).toBeLessThanOrEqual(64); // ограничение Bot API
  });
});

describe('preparedMessageId', () => {
  it('id из успешного ответа, иначе null', () => {
    expect(preparedMessageId({ ok: true, result: { id: 'abc', expiration_date: 1 } })).toBe('abc');
    expect(preparedMessageId({ ok: false, description: 'Unauthorized' })).toBeNull();
    expect(preparedMessageId(null)).toBeNull();
  });
});
