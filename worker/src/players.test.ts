import { describe, expect, it } from 'vitest';
import { MAX_SCORE, NAME_MAX, displayName, parseScore } from './players';

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
