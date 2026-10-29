import {
  COMBO,
  DEFAULT_WEAPON,
  DIFFICULTY_TIME,
  ENEMY,
  PLAYER,
  POWER_UP,
  UPGRADES,
  WEAPON_KINDS,
  WEAPONS,
  type EnemyKind,
  type PowerUpKind,
  type Upgrades,
  type Weapon,
  type WeaponKind,
} from '../balance';

/**
 * Правила боя без Pixi: только числа, никаких спрайтов. Их проверяют тесты Vitest (rules.test.ts).
 * Модули мира берут отсюда решения, а сами двигают спрайты и рисуют эффекты.
 */

export interface Point {
  x: number;
  y: number;
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randIn = ([a, b]: readonly [number, number]) => rand(a, b);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Множитель сложности: плавно растёт со временем партии. */
export const difficulty = (elapsed: number) => 1 + elapsed / DIFFICULTY_TIME;

/** Столкновение двух кругов: d — сумма радиусов. */
export const near = (a: Point, b: Point, d: number) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < d * d;
};

/** С чем игрок начинает партию с учётом улучшений из ангара. */
export function startStats(upgrades: Upgrades) {
  return {
    lives: Math.min(PLAYER.maxLives, PLAYER.startLives + upgrades.extraLife),
    weapon: { kind: DEFAULT_WEAPON, level: Math.min(PLAYER.maxWeapon, 1 + upgrades.startWeapon) } satisfies Weapon,
    /** Множитель паузы между залпами от улучшения скорострельности. */
    reload: 1 - UPGRADES.fireRate.intervalStep * upgrades.fireRate,
    magnetTime: POWER_UP.magnetTime + UPGRADES.magnet.timeStep * upgrades.magnet,
  };
}

/** Пауза между залпами: своя у каждого вида, короче с улучшением скорострельности. */
export const fireInterval = (weapon: Weapon, reload: number) => WEAPONS[weapon.kind].interval * reload;

/** Луч лазера: полоса шириной 2 × half от самолёта (bottom) вверх до top. */
export interface Beam {
  x: number;
  half: number;
  top: number;
  bottom: number;
}

/** Где кончается луч: на щите ближайшего щитоносца над самолётом, иначе на top (за верхом экрана). */
export function beamTop(x: number, bottom: number, shielders: readonly Point[], top: number) {
  for (const s of shielders) {
    const plate = s.y + ENEMY.shielder.plateY;
    if (plate < bottom && plate > top && Math.abs(x - s.x) < ENEMY.shielder.plateHalf) top = plate;
  }
  return top;
}

/** Задевает ли луч круг с центром p и радиусом r. */
export const inBeam = (b: Beam, p: Point, r: number) =>
  Math.abs(p.x - b.x) < b.half + r && p.y + r > b.top && p.y - r < b.bottom;

/** Подобрано оружие kind: тот же вид — уровень +1 (не выше максимума), другой — смена вида с тем же уровнем. */
export const pickWeapon = (weapon: Weapon, kind: WeaponKind): Weapon =>
  kind === weapon.kind ? { kind, level: Math.min(PLAYER.maxWeapon, weapon.level + 1) } : { kind, level: weapon.level };

/** Следующий вид оружия в капсуле: по кругу WEAPON_KINDS. */
export const nextWeaponKind = (kind: WeaponKind): WeaponKind =>
  WEAPON_KINDS[(WEAPON_KINDS.indexOf(kind) + 1) % WEAPON_KINDS.length];

/** Урон по игроку: вид остаётся, уровень −1, но не ниже первого. */
export const loseWeaponLevel = (weapon: Weapon): Weapon => ({ kind: weapon.kind, level: Math.max(1, weapon.level - 1) });

export interface Pilot {
  lives: number;
  weapon: Weapon;
  shield: boolean;
  /** Врагов сбито подряд без урона. */
  combo: number;
}

/** Попадание в игрока: щит принимает удар целиком, иначе −жизнь, −уровень оружия и комбо с нуля. */
export function takeHit(p: Pilot): Pilot & { absorbed: boolean } {
  if (p.shield) return { ...p, shield: false, absorbed: true };
  return { lives: p.lives - 1, weapon: loseWeaponLevel(p.weapon), shield: false, combo: 0, absorbed: false };
}

/** Множитель очков за врагов: +1 за каждые COMBO.killsPerStep подряд, не больше максимума. */
export const comboMultiplier = (combo: number) => Math.min(COMBO.maxMultiplier, 1 + Math.floor(combo / COMBO.killsPerStep));

/** Очки за сбитого врага при текущем комбо. После него комбо на 1 больше — множитель мог вырасти. */
export function killScore(kind: EnemyKind, combo: number) {
  const multiplier = comboMultiplier(combo);
  const next = comboMultiplier(combo + 1);
  return { points: ENEMY[kind].points * multiplier, combo: combo + 1, multiplier: next, multiplierChanged: next !== multiplier };
}

const DROP_KINDS = Object.keys(POWER_UP.drops) as PowerUpKind[];

/** Бонус с обычного врага; r — случайное число от 0 до 1. Шансы — POWER_UP.drops, в сумме меньше 1. */
export function rollDrop(r: number): PowerUpKind | null {
  let left = r;
  for (const kind of DROP_KINDS) {
    left -= POWER_UP.drops[kind];
    if (left < 0) return kind;
  }
  return null;
}

/** Бонус с босса всегда есть: жизнь (с шансом, если есть куда) или капсула оружия. */
export const bossDrop = (lives: number, r: number): PowerUpKind =>
  lives < PLAYER.maxLives && r < POWER_UP.bossLifeChance ? 'life' : 'weapon';

export const addLife = (lives: number) => Math.min(PLAYER.maxLives, lives + 1);

/** HP флагмана растёт со временем партии. */
export const bossHp = (elapsed: number) =>
  ENEMY.mother.hp + Math.floor(elapsed / ENEMY.mother.hpGrowthEvery) * ENEMY.mother.hpGrowth;

/** Щитоносец неуязвим снизу по центру: такая пуля отлетает, бить надо по краям. */
export const shieldBlocks = (bullet: Point, shielder: Point) =>
  bullet.y > shielder.y && Math.abs(bullet.x - shielder.x) < ENEMY.shielder.plateHalf;

/** Повернуть угол к цели, но не больше чем на maxTurn — так от самонаводящегося снаряда можно увернуться. */
export function turnToward(angle: number, target: number, maxTurn: number) {
  const diff = Math.atan2(Math.sin(target - angle), Math.cos(target - angle)); // кратчайший поворот, −π…π
  return angle + clamp(diff, -maxTurn, maxTurn);
}

/** Атаки босса идут по кругу. */
export const BOSS_ATTACKS = ['fan', 'burst', 'homing'] as const;
export type BossAttack = (typeof BOSS_ATTACKS)[number];
export const bossAttackAt = (phase: number): BossAttack => BOSS_ATTACKS[phase % BOSS_ATTACKS.length];
