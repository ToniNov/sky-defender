import { describe, expect, it } from 'vitest';
import { dataCheckString, signInitData, verifyInitData } from './initData';

const TOKEN = '123456:TEST-token';
const NOW = 1_800_000_000;
const USER = { id: 42, first_name: 'Антон', username: 'pilot' };

/** initData, как её прислал бы Telegram: поля + подпись. */
async function makeInitData(fields: Record<string, string>, token = TOKEN): Promise<string> {
  const params = new URLSearchParams(fields);
  params.set('hash', await signInitData(params, token));
  return params.toString();
}

const fields = (over: Record<string, string> = {}) => ({
  auth_date: String(NOW - 60),
  query_id: 'AAE',
  user: JSON.stringify(USER),
  ...over,
});

describe('dataCheckString', () => {
  it('поля по алфавиту через перевод строки, без hash', () => {
    const params = new URLSearchParams({ user: '{}', hash: 'x', auth_date: '1' });
    expect(dataCheckString(params)).toBe('auth_date=1\nuser={}');
  });
});

describe('verifyInitData', () => {
  it('верная подпись — игрок из поля user', async () => {
    const result = await verifyInitData(await makeInitData(fields()), TOKEN, NOW);
    expect(result).toEqual({ ok: true, user: USER, authDate: NOW - 60 });
  });

  it('подменённое поле не проходит', async () => {
    const params = new URLSearchParams(await makeInitData(fields()));
    params.set('user', JSON.stringify({ ...USER, id: 1 }));
    expect(await verifyInitData(params.toString(), TOKEN, NOW)).toEqual({ ok: false, reason: 'bad-hash' });
  });

  it('подпись чужим токеном не проходит', async () => {
    const initData = await makeInitData(fields(), '999:other');
    expect(await verifyInitData(initData, TOKEN, NOW)).toEqual({ ok: false, reason: 'bad-hash' });
  });

  it('без hash — отказ', async () => {
    expect(await verifyInitData(new URLSearchParams(fields()).toString(), TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'no-hash',
    });
  });

  it('старая initData просрочена', async () => {
    const initData = await makeInitData(fields({ auth_date: String(NOW - 2 * 24 * 3600) }));
    expect(await verifyInitData(initData, TOKEN, NOW)).toEqual({ ok: false, reason: 'expired' });
  });

  it('без игрока или с битым user — отказ', async () => {
    const noUser = await makeInitData({ auth_date: String(NOW) });
    expect(await verifyInitData(noUser, TOKEN, NOW)).toEqual({ ok: false, reason: 'no-user' });
    const badUser = await makeInitData(fields({ user: '{"id":"42"}' }));
    expect(await verifyInitData(badUser, TOKEN, NOW)).toEqual({ ok: false, reason: 'no-user' });
  });
});
