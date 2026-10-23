import { describe, expect, it } from 'vitest';
import { parseClaim, parseLeaderboard, parseReferrals, parseShare, parseSubmit } from './api';

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

describe('parseReferrals', () => {
  it('ссылка и счётчики друзей', () => {
    const data = { link: 'https://t.me/b/play?startapp=ref_1', invited: 3, unclaimed: 1 };
    expect(parseReferrals(data)).toEqual(data);
    expect(parseReferrals({ link: null, invited: 0, unclaimed: 0 })).toEqual({ link: null, invited: 0, unclaimed: 0 });
  });

  it('ответ не той формы', () => {
    for (const data of [null, {}, { invited: 1 }, { invited: 1, unclaimed: 2 }, { invited: '1', unclaimed: 0 }]) {
      expect(parseReferrals(data)).toBeNull();
    }
  });
});

describe('parseClaim', () => {
  it('сколько друзей засчитать', () => {
    expect(parseClaim({ claimed: 2 })).toBe(2);
    expect(parseClaim({ claimed: 0 })).toBe(0);
    for (const data of [null, {}, { claimed: -1 }, { claimed: 1.5 }]) expect(parseClaim(data)).toBeNull();
  });
});
