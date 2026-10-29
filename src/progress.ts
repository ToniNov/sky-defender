import { isDayKey, NO_DAILY, type Daily } from './daily';
import {
  DEFAULT_SKIN,
  DEFAULT_WEAPON,
  NO_UPGRADES,
  QUESTS,
  SKINS,
  UPGRADE_NAMES,
  upgradeMax,
  WEAPON_COST,
  type QuestKind,
  type SkinName,
  type Upgrades,
  type WeaponKind,
} from './game/balance';
import { fillQuests, questTarget, type Quest, type Quests } from './quests';
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
  quests: Quests;
  skins: Skins;
  /** Виды оружия из ангара: купленные и стартовый. */
  weapons: Weapons;
  /** Время последнего сохранения (мс): из облака и устройства берём более свежее. */
  t: number;
}

/** Купленное в ангаре (owned) и выбранное из купленного (selected). */
interface Owned<K extends string> {
  owned: K[];
  selected: K;
}
export type Skins = Owned<SkinName>;
export type Weapons = Owned<WeaponKind>;

type Raw = Record<string, unknown>;

export const SAVE_VERSION = 6;
const KEY = 'progress';
const LEGACY_BEST_KEY = 'best_score'; // до версии 1 рекорд лежал отдельным числом

/** MIGRATIONS[n] переводит данные версии n в версию n + 1. */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  0: (d) => ({ ...d, coins: 0 }),
  1: (d) => ({ ...d, upgrades: {} }),
  2: (d) => ({ ...d, daily: { last: '', streak: 0 } }),
  3: (d) => ({ ...d, quests: { active: [], done: {} } }),
  4: (d) => ({ ...d, skins: { owned: [DEFAULT_SKIN], selected: DEFAULT_SKIN } }),
  5: (d) => ({ ...d, weapons: { owned: [DEFAULT_WEAPON], selected: DEFAULT_WEAPON } }),
};

export const EMPTY_PROGRESS: Progress = {
  best: 0, coins: 0, upgrades: NO_UPGRADES, daily: NO_DAILY, quests: fillQuests({ active: [], done: {} }),
  skins: { owned: [DEFAULT_SKIN], selected: DEFAULT_SKIN },
  weapons: { owned: [DEFAULT_WEAPON], selected: DEFAULT_WEAPON },
  t: 0,
};

const count = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);

const isQuestKind = (k: unknown): k is QuestKind => typeof k === 'string' && k in QUESTS.kinds;
const asObject = (x: unknown): Raw => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Raw) : {});

const isSkin = (k: unknown): k is SkinName => typeof k === 'string' && k in SKINS;
const isWeapon = (k: unknown): k is WeaponKind => typeof k === 'string' && k in WEAPON_COST;

/**
 * Купленное из ангара: бесплатное (free) есть всегда. Незнакомое (из более новой версии игры) складываем в unknown —
 * его сохраним как есть, а выбранным тогда считаем free.
 */
function parseOwned<K extends string>(x: unknown, isKind: (k: unknown) => k is K, free: K, unknown: string[]): Owned<K> {
  const raw = asObject(x);
  const list: unknown[] = Array.isArray(raw.owned) ? raw.owned : [];
  for (const k of list) if (typeof k === 'string' && !isKind(k) && !unknown.includes(k)) unknown.push(k);
  const owned = [free, ...list.filter(isKind).filter((k) => k !== free)];
  const selected = isKind(raw.selected) && owned.includes(raw.selected) ? raw.selected : free;
  return { owned: [...new Set(owned)], selected };
}

/** Задания незнакомых типов (из более новой версии игры) отбрасываем — на их место встанут известные. */
function parseQuests(x: unknown): Quests {
  const raw = asObject(x);
  const done: Quests['done'] = {};
  for (const [kind, n] of Object.entries(asObject(raw.done))) if (isQuestKind(kind)) done[kind] = count(n);
  const active: Quest[] = [];
  for (const item of Array.isArray(raw.active) ? raw.active : []) {
    const q = asObject(item);
    if (!isQuestKind(q.kind) || active.some((a) => a.kind === q.kind)) continue;
    const quest = { kind: q.kind, tier: count(q.tier), progress: 0 };
    active.push({ ...quest, progress: Math.min(questTarget(quest), count(q.progress)) });
  }
  return fillQuests({ active: active.slice(0, QUESTS.active), done });
}

/**
 * Поля, о которых эта версия игры не знает (их записала более новая версия, например на другом устройстве),
 * сохраняем как есть — иначе старый клиент из кэша стёр бы чужой прогресс.
 */
let unknownFields: Raw = {};
let storedVersion = 0; // и номер версии не понижаем
let unknownUpgrades: Raw = {}; // и улучшения, которых здесь ещё нет
const unknownSkins: string[] = []; // и скины
const unknownWeapons: string[] = []; // и виды оружия

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
  const { v, best, coins, upgrades, daily, quests, skins, weapons, t, ...rest } = d;
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
    quests: parseQuests(quests),
    skins: parseOwned(skins, isSkin, DEFAULT_SKIN, unknownSkins),
    weapons: parseOwned(weapons, isWeapon, DEFAULT_WEAPON, unknownWeapons),
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
      quests: p.quests,
      skins: { ...p.skins, owned: [...p.skins.owned, ...unknownSkins] },
      weapons: { ...p.weapons, owned: [...p.weapons.owned, ...unknownWeapons] },
      t: p.t,
    }),
  );
}
