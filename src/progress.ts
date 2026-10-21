import { isDayKey, NO_DAILY, type Daily } from './daily';
import { NO_UPGRADES, UPGRADE_NAMES, upgradeMax, type Upgrades } from './game/balance';
import { readCloudString, readLocalString, writeString } from './telegram';

/**
 * Прогресс игрока между партиями: рекорд, монеты (дальше — улучшения, скины, задания).
 * Хранится одним JSON с номером версии `v` — на устройстве и в облаке Telegram.
 *
 * Поменяли формат → поднять SAVE_VERSION и дописать шаг в MIGRATIONS:
 * старые сохранения обновятся при загрузке, а не сбросятся.
 */

export interface Progress {
  best: number;
  coins: number;
  /** Уровни улучшений из ангара. */
  upgrades: Upgrades;
  /** Серия ежедневных наград. */
  daily: Daily;
  /** Время последнего сохранения (мс): из облака и устройства берём более свежее. */
  t: number;
}

type Raw = Record<string, unknown>;

export const SAVE_VERSION = 3;
const KEY = 'progress';
const LEGACY_BEST_KEY = 'best_score'; // до версии 1 рекорд лежал отдельным числом

/** MIGRATIONS[n] переводит данные версии n в версию n + 1. */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  0: (d) => ({ ...d, coins: 0 }),
  1: (d) => ({ ...d, upgrades: {} }),
  2: (d) => ({ ...d, daily: { last: '', streak: 0 } }),
};

export const EMPTY_PROGRESS: Progress = { best: 0, coins: 0, upgrades: NO_UPGRADES, daily: NO_DAILY, t: 0 };

const count = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);

/**
 * Поля, о которых эта версия игры не знает (их записала более новая версия, например на другом устройстве),
 * сохраняем как есть — иначе старый клиент из кэша стёр бы чужой прогресс.
 */
let unknownFields: Raw = {};
let storedVersion = 0; // и номер версии не понижаем
let unknownUpgrades: Raw = {}; // и улучшения, которых здесь ещё нет

export function migrate(data: Raw): Raw {
  let d = data;
  let v = count(d.v);
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`Нет миграции сохранения с версии ${v}`);
    d = { ...step(d), v: ++v };
  }
  return d;
}

function parse(json: string | null, legacyBest: string | null): Raw | null {
  if (json) {
    try {
      const d: unknown = JSON.parse(json);
      if (d && typeof d === 'object' && !Array.isArray(d)) return migrate(d as Raw);
    } catch {
      /* битые данные — как будто их нет */
    }
  }
  return legacyBest ? migrate({ v: 0, best: Number(legacyBest) }) : null;
}

function toProgress(d: Raw | null): Progress {
  if (!d) return EMPTY_PROGRESS;
  const { v, best, coins, upgrades, daily, t, ...rest } = d;
  unknownFields = { ...unknownFields, ...rest };
  storedVersion = Math.max(storedVersion, count(v));
  const raw: Raw = upgrades && typeof upgrades === 'object' ? (upgrades as Raw) : {};
  const known = { ...NO_UPGRADES };
  for (const name of UPGRADE_NAMES) known[name] = Math.min(upgradeMax(name), count(raw[name]));
  for (const [name, level] of Object.entries(raw)) if (!(name in known)) unknownUpgrades[name] = level;
  const dl: Raw = daily && typeof daily === 'object' ? (daily as Raw) : {};
  const last = isDayKey(dl.last) ? dl.last : '';
  return {
    best: count(best),
    coins: count(coins),
    upgrades: known,
    daily: { last, streak: last ? count(dl.streak) : 0 },
    t: count(t),
  };
}

/** Из двух копий берём более свежую, а рекорд — лучший из обеих. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const fresh = b.t > a.t ? b : a;
  return { ...fresh, best: Math.max(a.best, b.best) };
}

/** Мгновенно, с устройства — чтобы меню сразу показало рекорд и монеты. */
export function loadLocalProgress(): Progress {
  return toProgress(parse(readLocalString(KEY), readLocalString(LEGACY_BEST_KEY)));
}

/** Копия из облака Telegram (до 2 секунд). */
export async function loadCloudProgress(): Promise<Progress> {
  const [json, legacy] = await Promise.all([readCloudString(KEY), readCloudString(LEGACY_BEST_KEY)]);
  return toProgress(parse(json, legacy));
}

export function saveProgress(p: Progress) {
  writeString(
    KEY,
    JSON.stringify({
      ...unknownFields,
      v: Math.max(SAVE_VERSION, storedVersion),
      best: p.best,
      coins: p.coins,
      upgrades: { ...unknownUpgrades, ...p.upgrades },
      daily: p.daily,
      t: p.t,
    }),
  );
}
