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
  maxWeapon: 3, // уровней у каждого вида оружия
  r: 16, // радиус хитбокса
  keySpeed: 460, // скорость с клавиатуры
  dragFactor: 1.25, // во сколько раз самолёт сдвигается дальше пальца
  firstShotDelay: 0.3,
  bulletR: 6,
  startInvuln: 1.2, // неуязвимость в начале партии
  hitInvuln: 1.8, // неуязвимость после попадания
  pickupR: 32, // радиус подбора бонусов
} as const;

/** Залп: пули [смещение по x, скорость по x]. */
type Volley = readonly (readonly [number, number])[];

/** Оружие, которое стреляет пулями: damage — урон одной пули, patterns[n] — залп на уровне n + 1. */
interface VolleySpec {
  interval: number; // пауза между залпами (до улучшения скорострельности)
  damage: number;
  bulletSpeed: number;
  patterns: readonly Volley[];
}
/** Луч: бьёт всех на линии вверх от самолёта раз в interval; beam[n] — уровень n + 1. */
interface BeamSpec {
  interval: number; // тик урона (улучшение скорострельности делает его чаще)
  beam: readonly { dps: number; width: number }[];
}

/** Виды оружия, у каждого PLAYER.maxWeapon уровней. */
export const WEAPONS = {
  gun: {
    interval: 0.15,
    damage: 1,
    bulletSpeed: 760,
    patterns: [
      [[0, 0]],
      [[-9, 0], [9, 0]],
      [[0, 0], [-12, -150], [12, 150]],
    ],
  },
  // веер: широкий конус слабых пуль — против роя, но по одной цели слабее пушки
  spread: {
    interval: 0.2,
    damage: 0.5,
    bulletSpeed: 640,
    patterns: [
      [[0, 0], [-6, -200], [6, 200]],
      [[0, 0], [-6, -140], [6, 140], [-10, -280], [10, 280]],
      [[0, 0], [-5, -110], [5, 110], [-8, -220], [8, 220], [-12, -330], [12, 330]],
    ],
  },
  // лазер: сплошной луч, пробивает всех на линии; урон в секунду ниже пушки — зато по всем сразу.
  // Щит щитоносца луч не пробивает: дальше щита он не идёт
  laser: {
    interval: 0.1,
    beam: [
      { dps: 5, width: 10 },
      { dps: 8, width: 16 },
      { dps: 12, width: 24 },
    ],
  },
} as const satisfies Record<string, VolleySpec | BeamSpec>;

export type WeaponKind = keyof typeof WEAPONS;
export const WEAPON_KINDS = Object.keys(WEAPONS) as WeaponKind[];
/** С этим видом начинается партия. */
export const DEFAULT_WEAPON: WeaponKind = 'gun';

/** Оружие игрока: вид и уровень (1…PLAYER.maxWeapon). */
export interface Weapon {
  kind: WeaponKind;
  level: number;
}

export const ENEMY = {
  scout: {
    hp: 1,
    r: 16,
    points: 10,
    speed: [170, 230], // × сложность
    turnAccel: 90, // доворот на игрока
    maxVx: 90,
    snakeAmp: 90, // змейка: размах (не больше четверти экрана)
    snakeWavelength: 70, // змейка: чем больше, тем плавнее изгибы
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
    attackPause: 1.1, // пауза между атаками (атаки идут по кругу: веер → очередь → ракеты)
    windup: 0.45, // перед атакой босс подсвечивается её цветом
    fan: {
      count: 9, // пуль в веере, летят вниз с просветами
      spread: 1.7, // ширина веера, рад
      speed: 190,
    },
    burst: {
      count: 6, // прицельная очередь
      interval: 0.1,
      speed: 270,
      jitter: 0.06, // разброс, рад
    },
    homing: {
      count: 2,
      speed: 170,
      turnRate: 2.2, // поворот к игроку, рад/с
      homingTime: 2.6, // потом летит по прямой
      r: 8,
    },
  },
  kamikaze: {
    hp: 1,
    r: 15,
    points: 20,
    speed: [130, 160], // скорость захода на позицию
    stopAt: [0.08, 0.25], // останавливается на этой доле высоты экрана
    aimTime: 0.7, // целится (мигает), затем таранит
    dashAccel: 900, // разгон в сторону игрока
    dashMaxSpeed: 620,
  },
  shielder: {
    hp: 4,
    r: 26,
    points: 40,
    speed: [45, 60], // × сложность
    trackSpeed: 55, // сдвигается под игрока, но медленнее его
    plateHalf: 16, // полуширина щита снизу: пули ближе к центру отлетают
    plateY: 20, // низ щита ниже центра на столько — здесь останавливается лазер
  },
  splitter: {
    hp: 3,
    r: 22,
    points: 20,
    speed: [80, 110], // × сложность
  },
  mini: {
    // осколок сплиттера
    hp: 1,
    r: 12,
    points: 10,
    speed: [140, 180], // × сложность
    splitVx: 140, // разлёт в стороны
  },
} as const;

export type EnemyKind = keyof typeof ENEMY;

/** Задержка первого выстрела обычных врагов. */
export const ENEMY_FIRST_SHOT: readonly [number, number] = [1.2, 3];
export const ENEMY_BULLET_R = 5;

/** Волны: построения вылетают по очереди, волна кончается, когда поле опустело. Состав волн — в waves.ts. */
export const WAVES = {
  introTime: 1.6, // баннер «ВОЛНА N» до первого построения
  formations: 4, // построений в первой волне
  formationsGrowth: 0.7, // + за каждую следующую волну
  maxFormations: 14,
  gap: 1.7, // пауза между построениями в первой волне
  gapDecay: 0.1, // на столько короче с каждой волной
  minGap: 0.6,
  jitter: [0.8, 1.2], // случайный множитель паузы
  maxClearWait: 5, // после последнего построения ждём пустого поля, но не дольше
  bossEvery: 5, // каждая такая волна — с боссом
  bossEscortInterval: 4, // пока босс на поле, подлетает сопровождение
} as const;

export const BOSS = {
  warnTime: 2.2, // между предупреждением и появлением
} as const;

export const POWER_UP = {
  // шанс выпадения каждого бонуса с обычного врага (в сумме — шанс любого)
  drops: {
    weapon: 0.06, // капсула оружия
    life: 0.03,
    shield: 0.03,
    magnet: 0.025,
    bomb: 0.015,
  },
  bossLifeChance: 0.5, // с босса всегда бонус: жизнь (если не максимум) или капсула оружия
  weaponCycle: 2, // вид оружия в летящей капсуле меняется с таким периодом
  fallSpeed: 110,
  points: 50,
  shieldBreakInvuln: 1, // неуязвимость после того, как щит принял удар
  magnetTime: 10, // сколько действует магнит
  magnetSpeed: 560, // с такой скоростью бонусы летят к игроку
  bombBossDamage: 6, // урон бомбы боссу (остальных врагов на экране сбивает сразу)
} as const;

/** Монеты: падают из врагов, копятся между партиями (тратятся в ангаре). */
export const COINS = {
  dropChance: 0.35, // шанс монеты с обычного врага
  boss: 12, // столько монет рассыпает босс
  scatter: 140, // разлёт монет босса, px/с
  fallSpeed: 130,
} as const;

/**
 * Ангар: улучшения за монеты, действуют с начала каждой партии.
 * costs[n] — цена перехода с уровня n на n + 1, длина массива = максимальный уровень.
 */
export const UPGRADES = {
  fireRate: {
    costs: [40, 100, 220],
    intervalStep: 0.1, // −10% к паузе между выстрелами за уровень
  },
  startWeapon: {
    costs: [120, 350], // +1 к стартовому уровню пушки
  },
  extraLife: {
    costs: [80, 260], // +1 жизнь на старте (не больше PLAYER.maxLives)
  },
  magnet: {
    costs: [30, 80, 180],
    timeStep: 4, // +секунд действия магнита за уровень
  },
} as const;

export type UpgradeName = keyof typeof UPGRADES;
/** Купленные уровни улучшений (0 — не куплено). */
export type Upgrades = Record<UpgradeName, number>;

export const UPGRADE_NAMES = Object.keys(UPGRADES) as UpgradeName[];
export const NO_UPGRADES: Upgrades = { fireRate: 0, startWeapon: 0, extraLife: 0, magnet: 0 };
export const upgradeMax = (name: UpgradeName) => UPGRADES[name].costs.length;

/** Ежедневная награда: монеты за вход несколько дней подряд, после последнего дня — снова с первого. Пропуск дня сбрасывает серию. */
export const DAILY = {
  rewards: [10, 15, 20, 30, 40, 50, 80],
} as const;

/** Приглашения: монеты за каждого друга, который пришёл по твоей ссылке и сыграл первую партию. */
export const REFERRAL = {
  reward: 100,
} as const;

/**
 * Задания: одновременно активны QUESTS.active штук. Выполнил и забрал награду —
 * на место приходит задание того типа, что выполнялся реже всего, и каждое повторение сложнее.
 * Цель = target + targetStep × сколько раз уже выполнял, награда — так же.
 * Счётчики врагов и монет кратны 5, чтобы подписи склонялись одинаково.
 */
export const QUESTS = {
  active: 3,
  kinds: {
    scout: { target: 40, targetStep: 20, reward: 20, rewardStep: 10 }, // сбить разведчиков (за всё время)
    saucer: { target: 15, targetStep: 10, reward: 25, rewardStep: 10 },
    kamikaze: { target: 10, targetStep: 5, reward: 25, rewardStep: 10 },
    shielder: { target: 5, targetStep: 5, reward: 30, rewardStep: 10 },
    splitter: { target: 10, targetStep: 5, reward: 25, rewardStep: 10 },
    boss: { target: 1, targetStep: 1, reward: 40, rewardStep: 20 },
    flawlessBoss: { target: 1, targetStep: 1, reward: 60, rewardStep: 30 }, // флагман без потери жизни
    coins: { target: 30, targetStep: 30, reward: 20, rewardStep: 10 },
    powerUps: { target: 10, targetStep: 10, reward: 20, rewardStep: 10 },
    wave: { target: 5, targetStep: 2, reward: 30, rewardStep: 15 }, // за одну партию
    score: { target: 1500, targetStep: 1500, reward: 30, rewardStep: 15 }, // за одну партию
    combo: { target: 3, targetStep: 1, max: 5, reward: 25, rewardStep: 15 }, // за одну партию, не больше COMBO.maxMultiplier
  },
} as const;

export type QuestKind = keyof typeof QUESTS.kinds;
export const QUEST_KINDS = Object.keys(QUESTS.kinds) as QuestKind[];

/** Скины самолёта: только внешний вид, на характеристики не влияют. Рисунки — в skins.ts. */
export const SKINS = {
  classic: { cost: 0 }, // есть у всех с начала
  sunset: { cost: 150 },
  emerald: { cost: 150 },
  night: { cost: 250 },
  delta: { cost: 400 },
  stealth: { cost: 500 },
  biplane: { cost: 600 },
} as const;

export type SkinName = keyof typeof SKINS;
export const SKIN_NAMES = Object.keys(SKINS) as SkinName[];
export const DEFAULT_SKIN: SkinName = 'classic';

export type PowerUpKind = keyof typeof POWER_UP.drops;

/** Комбо: сбитые подряд враги без урона увеличивают множитель очков за врагов. */
export const COMBO = {
  killsPerStep: 5, // столько врагов подряд — множитель +1
  maxMultiplier: 5,
} as const;
