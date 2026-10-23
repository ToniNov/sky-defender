import { describe, expect, it } from 'vitest';
import { inviteLink, parseReferrer } from './referrals';

describe('inviteLink', () => {
  it('ссылка на мини-апп с startapp=ref_<id>', () => {
    expect(inviteLink('https://t.me/sky_bot/play', 42)).toBe('https://t.me/sky_bot/play?startapp=ref_42');
  });
});

describe('parseReferrer', () => {
  it('id пригласившего из start_param', () => {
    expect(parseReferrer('ref_42', 7)).toBe(42);
  });

  it('свой id, чужой формат или пусто — не приглашение', () => {
    for (const p of [undefined, '', 'ref_7', 'ref_', 'ref_abc', 'ref_-5', 'ref_0', 'ref_4.2', 'promo_42', 'ref_1234567890123456']) {
      expect(parseReferrer(p, 7)).toBeNull();
    }
  });
});
