import { describe, expect, it } from 'vitest';
import { MAX_SCORE, NAME_MAX, RUN_TTL_MS, SCORE_HEADROOM, SCORE_PER_SEC, displayName, parseScore, plausibleScore } from './players';

describe('displayName', () => {
  it('имя и фамилия через пробел', () => {
    expect(displayName({ id: 1, first_name: 'Антон', last_name: 'Новик' })).toBe('Антон Новик');
    expect(displayName({ id: 1, first_name: 'Антон' })).toBe('Антон');
  });

  it('длинное имя обрезается, пустое заменяется', () => {
    expect([...displayName({ id: 1, first_name: 'Я'.repeat(100) })]).toHaveLength(NAME_MAX);
    expect(displayName({ id: 1, first_name: '  ' })).toBe('Пилот');
  });
});

describe('parseScore', () => {
  it('целое от 0 до потолка', () => {
    expect(parseScore({ score: 0 })).toBe(0);
    expect(parseScore({ score: 1250 })).toBe(1250);
    expect(parseScore({ score: MAX_SCORE })).toBe(MAX_SCORE);
  });

  it('всё остальное — неверный запрос', () => {
    for (const body of [null, 'x', {}, { score: '10' }, { score: 1.5 }, { score: -1 }, { score: MAX_SCORE + 1 }]) {
      expect(parseScore(body)).toBeNull();
    }
  });
});

describe('plausibleScore', () => {
  it('столько, сколько можно набрать за время партии', () => {
    expect(plausibleScore(SCORE_HEADROOM, 0)).toBe(true);
    expect(plausibleScore(SCORE_HEADROOM + SCORE_PER_SEC * 60, 60_000)).toBe(true);
  });

  it('быстрее потолка — накрутка', () => {
    expect(plausibleScore(SCORE_HEADROOM + 1, 0)).toBe(false);
    expect(plausibleScore(MAX_SCORE, 60_000)).toBe(false);
  });

  it('партия из будущего или брошенная давно — не принимается', () => {
    expect(plausibleScore(0, -1)).toBe(false);
    expect(plausibleScore(0, RUN_TTL_MS + 1)).toBe(false);
  });
});
