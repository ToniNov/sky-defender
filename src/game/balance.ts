/**
 * Баланс игры: все числа, от которых зависит сложность и темп.
 * Время — в секундах, скорости — в пикселях в секунду, шансы — от 0 до 1.
 * Оформление (цвета, искры, тряска) живёт в World.ts.
 */

/** Рост сложности: множитель = 1 + время партии / DIFFICULTY_TIME. */
export const DIFFICULTY_TIME = 100;

export const PLAYER = {
  startLives: 3,
  maxLives: 5,
  maxWeapon: 3,
  r: 16, // радиус хитбокса
  keySpeed: 460, // скорость с клавиатуры
  dragFactor: 1.25, // во сколько раз самолёт сдвигается дальше пальца
  fireInterval: 0.15,
  firstShotDelay: 0.3,
  bulletSpeed: 760,
  bulletR: 6,
  startInvuln: 1.2, // неуязвимость в начале партии
  hitInvuln: 1.8, // неуязвимость после попадания
  pickupR: 32, // радиус подбора бонусов
} as const;

/** Узоры выстрела по уровню пушки: [смещение по x, скорость по x]. */
export const WEAPON_PATTERNS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 0]],
  2: [[-9, 0], [9, 0]],
  3: [[0, 0], [-12, -150], [12, 150]],
};

export const ENEMY = {
  scout: {
    hp: 1,
    r: 16,
    points: 10,
    speed: [170, 230], // × сложность
    turnAccel: 90, // доворот на игрока
    maxVx: 90,
  },
  saucer: {
    hp: 3,
    r: 24,
    points: 25,
    speed: [80, 110], // × сложность
    amp: [30, 90], // размах качания, не больше четверти экрана
    shootsAfter: 15, // начинают стрелять с этой секунды партии
    fireInterval: [2, 3.5], // ÷ сложность
    bulletSpeed: 220, // + время партии
  },
  mother: {
    hp: 18,
    hpGrowth: 4, // +HP за каждые hpGrowthEvery секунд партии
    hpGrowthEvery: 30,
    r: 44,
    points: 150,
    speed: 60,
    firstShot: 1.5,
    fireInterval: 1.2,
    bulletSpeed: 210,
    spread: [-0.35, 0, 0.35], // углы веера, рад
  },
} as const;

/** Задержка первого выстрела обычных врагов. */
export const ENEMY_FIRST_SHOT: readonly [number, number] = [1.2, 3];
export const ENEMY_BULLET_R = 5;

export const SPAWN = {
  firstDelay: 1,
  baseInterval: 1, // интервал в начале партии
  intervalDecay: 0.01, // на столько интервал короче за каждую секунду
  minInterval: 0.28,
  jitter: [0.7, 1.3], // случайный множитель интервала
  bossSlowdown: 1.8, // пока босс на поле, враги появляются реже
  saucerChance: 0.12, // + время / saucerChanceTime, но не больше saucerChanceMax
  saucerChanceTime: 150,
  saucerChanceMax: 0.45,
  wedgeAfter: 8, // клин из трёх разведчиков — с этой секунды
  wedgeChance: 0.25,
} as const;

export const BOSS = {
  after: 30, // босс может появиться с этой секунды
  chance: 0.06, // шанс на каждой волне
  warnTime: 2.2, // между предупреждением и появлением
} as const;

export const POWER_UP = {
  // шанс выпадения каждого бонуса с обычного врага (в сумме — шанс любого)
  drops: {
    gun: 0.06,
    life: 0.03,
    shield: 0.03,
    magnet: 0.025,
    bomb: 0.015,
  },
  bossLifeChance: 0.5, // с босса всегда бонус: жизнь (если не максимум) или пушка
  fallSpeed: 110,
  points: 50,
  shieldBreakInvuln: 1, // неуязвимость после того, как щит принял удар
  magnetTime: 10, // сколько действует магнит
  magnetSpeed: 560, // с такой скоростью бонусы летят к игроку
  bombBossDamage: 6, // урон бомбы боссу (остальных врагов на экране сбивает сразу)
} as const;

export type PowerUpKind = keyof typeof POWER_UP.drops;

/** Комбо: сбитые подряд враги без урона увеличивают множитель очков за врагов. */
export const COMBO = {
  killsPerStep: 5, // столько врагов подряд — множитель +1
  maxMultiplier: 5,
} as const;
