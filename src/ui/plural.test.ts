import { describe, expect, it } from 'vitest';
import { plural } from './plural';

const coins = (n: number) => plural(n, 'монету', 'монеты', 'монет');

describe('plural', () => {
  it('1, 21, 101 — первая форма', () => {
    expect([1, 21, 101].map(coins)).toEqual(['монету', 'монету', 'монету']);
  });

  it('2–4, 22–24 — вторая форма', () => {
    expect([2, 3, 4, 22, 34].map(coins)).toEqual(['монеты', 'монеты', 'монеты', 'монеты', 'монеты']);
  });

  it('0, 5–20, 11–14 в любой сотне — третья форма', () => {
    expect([0, 5, 11, 12, 14, 19, 20, 111, 112].map(coins)).toEqual(Array(9).fill('монет'));
  });
});
