import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version } from '../package.json';

/** localStorage в памяти; fetch подменён — смотрим, что ушло на сервер. */
let store: Map<string, string>;
let sent: Record<string, unknown>[];

beforeEach(() => {
  store = new Map();
  sent = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string));
    return new Response('{}');
  });
  vi.stubEnv('VITE_API_URL', 'http://api.test');
  vi.resetModules(); // id устройства запоминается в модуле — каждый тест с чистого листа
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const load = () => import('./analytics');

describe('id устройства', () => {
  it('новый id — 16 символов [a-z0-9], и он проходит проверку', async () => {
    const { newDeviceId, isDeviceId } = await load();
    const id = newDeviceId();
    expect(id).toMatch(/^[a-z0-9]{16}$/);
    expect(isDeviceId(id)).toBe(true);
  });

  it('пустое, короткое и с чужими символами — не id', async () => {
    const { isDeviceId } = await load();
    for (const id of [null, '', 'abc', 'ABCDEFGH12', 'abc-defgh-12', 'a'.repeat(33)]) expect(isDeviceId(id)).toBe(false);
  });

  it('id создаётся один раз и переживает перезапуск', async () => {
    (await load()).trackLaunch();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const first = sent[0].device;
    expect(store.get('device_id')).toBe(first);

    vi.resetModules();
    (await load()).trackLaunch();
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].device).toBe(first);
  });

  it('испорченный id в хранилище заменяется новым', async () => {
    store.set('device_id', 'плохой');
    (await load()).trackLaunch();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].device).toMatch(/^[a-z0-9]{16}$/);
  });
});

describe('события', () => {
  it('запуск — с версией игры и платформой', async () => {
    (await load()).trackLaunch();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ type: 'launch', version, platform: 'web' });
  });

  it('конец партии — очки, волна, целые секунды и чем сбит', async () => {
    const { runEvent } = await load();
    expect(runEvent('abcdefgh', 1200, 4, { cause: 'kamikaze', seconds: 83.6 })).toEqual({
      type: 'run',
      device: 'abcdefgh',
      version,
      platform: 'web',
      score: 1200,
      wave: 4,
      seconds: 84,
      cause: 'kamikaze',
    });
  });
});
