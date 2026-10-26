import {
  COMBO,
  DIFFICULTY_TIME,
  ENEMY,
  PLAYER,
  POWER_UP,
  UPGRADES,
  type EnemyKind,
  type PowerUpKind,
  type Upgrades,
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
    weapon: Math.min(PLAYER.maxWeapon, 1 + upgrades.startWeapon),
    fireInterval: PLAYER.fireInterval * (1 - UPGRADES.fireRate.intervalStep * upgrades.fireRate),
    magnetTime: POWER_UP.magnetTime + UPGRADES.magnet.timeStep * upgrades.magnet,
  };
}

export interface Pilot {
  lives: number;
  weapon: number;
  shield: boolean;
  /** Врагов сбито подряд без урона. */
  combo: number;
}

/** Попадание в игрока: щит принимает удар целиком, иначе −жизнь, −уровень пушки и комбо с нуля. */
export function takeHit(p: Pilot): Pilot & { absorbed: boolean } {
  if (p.shield) return { ...p, shield: false, absorbed: true };
  return { lives: p.lives - 1, weapon: Math.max(1, p.weapon - 1), shield: false, combo: 0, absorbed: false };
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

/** Бонус с босса всегда есть: жизнь (с шансом, если есть куда) или пушка. */
export const bossDrop = (lives: number, r: number): PowerUpKind =>
  lives < PLAYER.maxLives && r < POWER_UP.bossLifeChance ? 'life' : 'gun';

export const upgradeWeapon = (weapon: number) => Math.min(PLAYER.maxWeapon, weapon + 1);
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
