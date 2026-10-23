import { describe, expect, it } from 'vitest';
import { parseLeaderboard, parseShare, parseSubmit } from './api';

describe('parseLeaderboard', () => {
  it('нормальный ответ сервера', () => {
    const data = { top: [{ name: 'Мария', score: 900 }], me: { rank: 2, score: 500 } };
    expect(parseLeaderboard(data)).toEqual(data);
    expect(parseLeaderboard({ top: [], me: null })).toEqual({ top: [], me: null });
  });

  it('битые строки отбрасываются, битое «моё место» — null', () => {
    const data = { top: [{ name: 'Ок', score: 10 }, { name: 5, score: 1 }, null, { name: 'Б', score: '7' }], me: { rank: '1' } };
    expect(parseLeaderboard(data)).toEqual({ top: [{ name: 'Ок', score: 10 }], me: null });
  });

  it('ответ не той формы', () => {
    for (const data of [null, 'x', {}, { top: 'x' }]) expect(parseLeaderboard(data)).toBeNull();
  });
});

describe('parseSubmit', () => {
  it('рекорд и место', () => {
    expect(parseSubmit({ best: 500, rank: 3 })).toEqual({ best: 500, rank: 3 });
    expect(parseSubmit({ best: 500 })).toBeNull();
    expect(parseSubmit(null)).toBeNull();
  });
});

describe('parseShare', () => {
  it('id подготовленного сообщения', () => {
    expect(parseShare({ id: 'abc' })).toBe('abc');
    for (const data of [null, {}, { id: '' }, { id: 5 }]) expect(parseShare(data)).toBeNull();
  });
});
