import { WAVES } from './balance';

/**
 * Волны: какие построения бывают и с какой волны они появляются.
 * Где именно встают враги в построении — в World.spawnFormation().
 * Темп волн (паузы, количество построений, босс каждые N волн) — в balance.ts → WAVES.
 */

export type FormationName =
  | 'scout' // одиночный разведчик
  | 'line' // линия из 5 разведчиков поперёк экрана
  | 'wedge' // клин из 5 разведчиков
  | 'snake' // змейка: 6 разведчиков друг за другом по синусоиде
  | 'saucers' // пара тарелок
  | 'splitters' // пара сплиттеров
  | 'kamikazes' // тройка камикадзе
  | 'shielderGuard' // щитоносец с двумя разведчиками
  | 'boss'; // флагман (только в волнах босса)

/** minWave — с какой волны построение может выпасть, weight — насколько часто. */
export const FORMATIONS: Record<Exclude<FormationName, 'boss'>, { minWave: number; weight: number }> = {
  scout: { minWave: 1, weight: 3 },
  line: { minWave: 1, weight: 2 },
  wedge: { minWave: 1, weight: 2 },
  snake: { minWave: 2, weight: 2 },
  saucers: { minWave: 2, weight: 2 },
  splitters: { minWave: 2, weight: 1.5 },
  kamikazes: { minWave: 3, weight: 1.5 },
  shielderGuard: { minWave: 4, weight: 1 },
};

/** Сопровождение босса — лёгкие построения, подлетают, пока он на поле. */
export const BOSS_ESCORTS: readonly FormationName[] = ['scout', 'wedge', 'saucers'];

export const isBossWave = (n: number) => n % WAVES.bossEvery === 0;

/**
 * Построения волны n по порядку. Первое — всегда простое (разогрев),
 * а в волне, где появляется новый враг, он встречается обязательно.
 */
export function planWave(n: number): FormationName[] {
  if (isBossWave(n)) return ['boss'];
  const names = Object.keys(FORMATIONS) as (keyof typeof FORMATIONS)[];
  const allowed = names.filter((f) => FORMATIONS[f].minWave <= n);
  const easy = names.filter((f) => FORMATIONS[f].minWave === 1);
  const count = Math.min(WAVES.maxFormations, WAVES.formations + Math.floor((n - 1) * WAVES.formationsGrowth));

  const rest: FormationName[] = names.filter((f) => FORMATIONS[f].minWave === n && n > 1);
  while (rest.length < count - 1) rest.push(pickWeighted(allowed));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [pickWeighted(easy), ...rest];
}

function pickWeighted(list: (keyof typeof FORMATIONS)[]): FormationName {
  let r = Math.random() * list.reduce((sum, f) => sum + FORMATIONS[f].weight, 0);
  return list.find((f) => (r -= FORMATIONS[f].weight) < 0) ?? list[0];
}
