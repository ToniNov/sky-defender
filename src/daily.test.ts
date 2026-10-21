import { describe, expect, it } from 'vitest';
import { dailyReward, dailySlot, dailyState, dayKey, isDayKey, NO_DAILY } from './daily';
import { DAILY } from './game/balance';

describe('dayKey', () => {
  it('местная дата с ведущими нулями', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('isDayKey отличает дату от мусора', () => {
    expect(isDayKey('2026-10-21')).toBe(true);
    for (const bad of ['', '2026-1-5', '21.10.2026', 20261021, null]) expect(isDayKey(bad)).toBe(false);
  });
});

describe('dailyState', () => {
  it('первый раз — первый день серии', () => {
    expect(dailyState(NO_DAILY, '2026-10-21')).toEqual({ available: true, streak: 1 });
  });

  it('второй раз за день — нельзя', () => {
    expect(dailyState({ last: '2026-10-21', streak: 4 }, '2026-10-21')).toEqual({ available: false, streak: 4 });
  });

  it('заходил вчера — серия продолжается', () => {
    expect(dailyState({ last: '2026-10-20', streak: 4 }, '2026-10-21')).toEqual({ available: true, streak: 5 });
  });

  it('через границу месяца и года — тоже «вчера»', () => {
    expect(dailyState({ last: '2026-02-28', streak: 1 }, '2026-03-01').streak).toBe(2);
    expect(dailyState({ last: '2026-12-31', streak: 1 }, '2027-01-01').streak).toBe(2);
  });

  it('переход на летнее время не рвёт серию', () => {
    // в Европе часы переводят в ночь на 29 марта 2026 — сутки короче 24 часов
    expect(dailyState({ last: '2026-03-28', streak: 3 }, '2026-03-29').streak).toBe(4);
  });

  it('пропуск дня сбрасывает серию', () => {
    expect(dailyState({ last: '2026-10-19', streak: 6 }, '2026-10-21')).toEqual({ available: true, streak: 1 });
  });

  it('если часы перевели назад — серия с начала', () => {
    expect(dailyState({ last: '2026-10-25', streak: 6 }, '2026-10-21')).toEqual({ available: true, streak: 1 });
  });
});

describe('dailyReward', () => {
  it('растёт по дням и после последнего дня идёт по кругу', () => {
    const n = DAILY.rewards.length;
    expect(dailyReward(1)).toBe(DAILY.rewards[0]);
    expect(dailyReward(n)).toBe(DAILY.rewards[n - 1]);
    expect(dailyReward(n + 1)).toBe(DAILY.rewards[0]);
    expect(dailySlot(n + 3)).toBe(2);
  });

  it('серия 0 (никогда не забирал) считается первым днём', () => {
    expect(dailySlot(0)).toBe(0);
  });
});
