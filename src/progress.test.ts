import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SKIN, QUESTS, UPGRADES } from './game/balance';

/** localStorage в памяти: в Node его нет, а progress.ts читает и пишет через него. */
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.resetModules(); // у progress.ts есть состояние модуля (незнакомые поля) — каждый тест с чистого листа
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const load = () => import('./progress');
const savedJson = () => JSON.parse(store.get('progress')!);

describe('migrate', () => {
  it('проводит самое старое сохранение через все шаги до текущей версии', async () => {
    const { migrate, SAVE_VERSION } = await load();
    expect(migrate({ v: 0, best: 42 })).toEqual({
      v: SAVE_VERSION,
      best: 42,
      coins: 0,
      upgrades: {},
      daily: { last: '', streak: 0 },
      quests: { active: [], done: {} },
      skins: { owned: [DEFAULT_SKIN], selected: DEFAULT_SKIN },
    });
  });

  it('не трогает данные, которых шаги не касаются', async () => {
    const { migrate } = await load();
    expect(migrate({ v: 3, coins: 77, upgrades: { magnet: 2 } })).toMatchObject({ coins: 77, upgrades: { magnet: 2 } });
  });

  it('сохранение из более новой версии оставляет как есть', async () => {
    const { migrate, SAVE_VERSION } = await load();
    const future = { v: SAVE_VERSION + 3, coins: 1 };
    expect(migrate(future)).toEqual(future);
  });
});

describe('loadLocalProgress', () => {
  it('пустое хранилище — новый игрок с тремя заданиями и классическим скином', async () => {
    const { loadLocalProgress } = await load();
    const p = loadLocalProgress();
    expect(p).toMatchObject({ best: 0, coins: 0, t: 0, skins: { owned: ['classic'], selected: 'classic' } });
    expect(p.quests.active).toHaveLength(QUESTS.active);
  });

  it('рекорд со старого ключа best_score переезжает', async () => {
    store.set('best_score', '1234');
    const { loadLocalProgress } = await load();
    expect(loadLocalProgress()).toMatchObject({ best: 1234, coins: 0 });
  });

  it('битый JSON не ломает загрузку', async () => {
    store.set('progress', '{не json');
    store.set('best_score', '50');
    const { loadLocalProgress } = await load();
    expect(loadLocalProgress().best).toBe(50);
  });

  it('чистит мусор: отрицательные числа, уровни сверх максимума, чужие задания и некупленный скин', async () => {
    store.set(
      'progress',
      JSON.stringify({
        v: 5,
        best: -10,
        coins: 'много',
        upgrades: { fireRate: 99, magnet: 1.7 },
        daily: { last: 'вчера', streak: 5 },
        quests: {
          active: [
            { kind: 'scout', tier: 1, progress: 1e9 },
            { kind: 'scout', tier: 0, progress: 0 }, // дубликат
            { kind: 'dragons', tier: 0, progress: 0 }, // такого типа нет
          ],
          done: { scout: 1, dragons: 3 },
        },
        skins: { owned: ['classic', 'delta'], selected: 'stealth' },
      }),
    );
    const { loadLocalProgress } = await load();
    const p = loadLocalProgress();
    expect(p.best).toBe(0);
    expect(p.coins).toBe(0);
    expect(p.upgrades.fireRate).toBe(UPGRADES.fireRate.costs.length);
    expect(p.upgrades.magnet).toBe(1);
    expect(p.daily).toEqual({ last: '', streak: 0 });
    expect(p.quests.active.map((q) => q.kind)).toEqual(['scout', 'saucer', 'kamikaze']);
    expect(p.quests.active[0].progress).toBe(QUESTS.kinds.scout.target + QUESTS.kinds.scout.targetStep);
    expect(p.quests.done).toEqual({ scout: 1 });
    expect(p.skins).toEqual({ owned: ['classic', 'delta'], selected: 'classic' });
  });
});

describe('saveProgress', () => {
  it('сохраняет текущую версию и всё, что загрузили', async () => {
    const { loadLocalProgress, saveProgress, SAVE_VERSION } = await load();
    const p = loadLocalProgress();
    saveProgress({ ...p, coins: 15, t: 99 });
    expect(savedJson()).toMatchObject({ v: SAVE_VERSION, coins: 15, t: 99 });
  });

  it('не стирает поля, улучшения и скины из более новой версии игры и не понижает версию', async () => {
    store.set(
      'progress',
      JSON.stringify({
        v: 99,
        coins: 5,
        pets: ['дракон'],
        upgrades: { fireRate: 1, laser: 3 },
        skins: { owned: ['classic', 'ufo'], selected: 'ufo' },
      }),
    );
    const { loadLocalProgress, saveProgress } = await load();
    const p = loadLocalProgress();
    saveProgress({ ...p, coins: 6 });
    expect(savedJson()).toMatchObject({
      v: 99,
      coins: 6,
      pets: ['дракон'],
      upgrades: { fireRate: 1, laser: 3 },
      skins: { owned: ['classic', 'ufo'] },
    });
  });

  it('загрузка → сохранение → загрузка ничего не меняет', async () => {
    const { loadLocalProgress, saveProgress } = await load();
    const p = { ...loadLocalProgress(), best: 500, coins: 40, t: 7 };
    saveProgress(p);
    vi.resetModules();
    expect((await load()).loadLocalProgress()).toEqual(p);
  });
});

describe('mergeProgress', () => {
  it('берёт более свежую копию, а рекорд — лучший из двух', async () => {
    const { EMPTY_PROGRESS, mergeProgress } = await load();
    const device = { ...EMPTY_PROGRESS, best: 900, coins: 10, t: 100 };
    const cloud = { ...EMPTY_PROGRESS, best: 300, coins: 70, t: 200 };
    expect(mergeProgress(device, cloud)).toMatchObject({ best: 900, coins: 70, t: 200 });
    expect(mergeProgress(cloud, device)).toMatchObject({ best: 900, coins: 70, t: 200 });
  });

  it('при равном времени остаётся первая копия (с устройства)', async () => {
    const { EMPTY_PROGRESS, mergeProgress } = await load();
    const a = { ...EMPTY_PROGRESS, coins: 1, t: 5 };
    const b = { ...EMPTY_PROGRESS, coins: 2, t: 5 };
    expect(mergeProgress(a, b).coins).toBe(1);
  });
});
