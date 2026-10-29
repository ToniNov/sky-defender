import { describe, expect, it } from 'vitest';
import { COMBO, DIFFICULTY_TIME, ENEMY, NO_UPGRADES, PLAYER, POWER_UP, UPGRADES, WEAPON_KINDS, WEAPONS, type Weapon } from '../balance';
import {
  addLife,
  beamTop,
  bossAttackAt,
  bossDrop,
  bossHp,
  comboMultiplier,
  difficulty,
  fireInterval,
  inBeam,
  killScore,
  loseWeaponLevel,
  near,
  nextWeaponKind,
  pickWeapon,
  rollDrop,
  shieldBlocks,
  startStats,
  takeHit,
  turnToward,
} from './rules';

const gun = (level: number): Weapon => ({ kind: 'gun', level });
const spread = (level: number): Weapon => ({ kind: 'spread', level });

describe('столкновения', () => {
  it('near: касание кругов по сумме радиусов', () => {
    expect(near({ x: 0, y: 0 }, { x: 3, y: 4 }, 5.01)).toBe(true);
    expect(near({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(false); // ровно на границе — ещё не касание
  });

  it('щитоносец отражает пули снизу по центру, но не по краям и не сверху', () => {
    const shielder = { x: 100, y: 100 };
    const { plateHalf } = ENEMY.shielder;
    expect(shieldBlocks({ x: 100, y: 120 }, shielder)).toBe(true);
    expect(shieldBlocks({ x: 100 + plateHalf + 1, y: 120 }, shielder)).toBe(false);
    expect(shieldBlocks({ x: 100, y: 90 }, shielder)).toBe(false);
  });
});

describe('попадание в игрока', () => {
  it('щит принимает удар целиком', () => {
    expect(takeHit({ lives: 3, weapon: gun(3), shield: true, combo: 12 })).toEqual({
      lives: 3,
      weapon: gun(3),
      shield: false,
      combo: 12,
      absorbed: true,
    });
  });

  it('без щита — минус жизнь, минус уровень оружия, комбо с нуля', () => {
    expect(takeHit({ lives: 3, weapon: gun(3), shield: false, combo: 12 })).toEqual({
      lives: 2,
      weapon: gun(2),
      shield: false,
      combo: 0,
      absorbed: false,
    });
  });

  it('оружие не опускается ниже первого уровня', () => {
    expect(takeHit({ lives: 2, weapon: gun(1), shield: false, combo: 0 }).weapon).toEqual(gun(1));
  });
});

describe('оружие', () => {
  it('тот же вид — уровень +1, но не выше максимума', () => {
    expect(pickWeapon(gun(1), 'gun')).toEqual(gun(2));
    expect(pickWeapon(gun(PLAYER.maxWeapon), 'gun')).toEqual(gun(PLAYER.maxWeapon));
  });

  it('другой вид — смена вида, уровень сохраняется', () => {
    expect(pickWeapon(spread(2), 'gun')).toEqual(gun(2));
    expect(pickWeapon(gun(PLAYER.maxWeapon), 'spread')).toEqual(spread(PLAYER.maxWeapon));
  });

  it('капсула перебирает все виды по кругу', () => {
    let kind = WEAPON_KINDS[0];
    const seen = new Set([kind]);
    for (let i = 1; i < WEAPON_KINDS.length; i++) seen.add((kind = nextWeaponKind(kind)));
    expect(seen.size).toBe(WEAPON_KINDS.length);
    expect(nextWeaponKind(kind)).toBe(WEAPON_KINDS[0]);
  });

  it('при уроне теряется уровень, вид остаётся', () => {
    expect(loseWeaponLevel(spread(3))).toEqual(spread(2));
    expect(loseWeaponLevel(spread(1))).toEqual(spread(1));
  });

  it('у каждого вида залп или луч на каждый уровень', () => {
    for (const kind of WEAPON_KINDS) {
      const spec = WEAPONS[kind];
      expect('beam' in spec ? spec.beam : spec.patterns).toHaveLength(PLAYER.maxWeapon);
    }
  });

  it('пауза между залпами — от вида и скорострельности', () => {
    expect(fireInterval(gun(1), 1)).toBe(WEAPONS.gun.interval);
    expect(fireInterval(gun(3), 0.8)).toBeCloseTo(WEAPONS.gun.interval * 0.8);
  });
});

describe('луч лазера', () => {
  const { plateHalf, plateY } = ENEMY.shielder;

  it('без щитоносцев уходит до заданного верха', () => {
    expect(beamTop(100, 600, [], -40)).toBe(-40);
  });

  it('упирается в щит ближайшего щитоносца над самолётом', () => {
    const shielders = [
      { x: 100, y: 100 },
      { x: 105, y: 300 }, // ближе к самолёту — он и держит луч
      { x: 100, y: 700 }, // ниже самолёта — не мешает
    ];
    expect(beamTop(100, 600, shielders, -40)).toBe(300 + plateY);
  });

  it('щитоносца сбоку от луча не замечает', () => {
    expect(beamTop(100, 600, [{ x: 100 + plateHalf, y: 300 }], -40)).toBe(-40);
  });

  it('задевает круг, если тот касается полосы луча', () => {
    const beam = { x: 100, half: 5, top: 200, bottom: 600 };
    expect(inBeam(beam, { x: 120, y: 400 }, 16)).toBe(true);
    expect(inBeam(beam, { x: 122, y: 400 }, 16)).toBe(false); // сбоку
    expect(inBeam(beam, { x: 100, y: 180 }, 16)).toBe(false); // за щитом
    expect(inBeam(beam, { x: 100, y: 620 }, 16)).toBe(false); // позади самолёта
  });
});

describe('очки и комбо', () => {
  it('множитель растёт каждые killsPerStep врагов и упирается в максимум', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(COMBO.killsPerStep - 1)).toBe(1);
    expect(comboMultiplier(COMBO.killsPerStep)).toBe(2);
    expect(comboMultiplier(10_000)).toBe(COMBO.maxMultiplier);
  });

  it('очки за врага умножаются на текущий множитель, а следующий враг может его поднять', () => {
    const combo = COMBO.killsPerStep - 1;
    const kill = killScore('saucer', combo);
    expect(kill.points).toBe(ENEMY.saucer.points); // этот враг — ещё по старому множителю
    expect(kill.combo).toBe(combo + 1);
    expect(kill.multiplierChanged).toBe(true);
    expect(kill.multiplier).toBe(2);
    expect(killScore('saucer', kill.combo).points).toBe(ENEMY.saucer.points * 2);
  });

  it('без смены множителя multiplierChanged = false', () => {
    expect(killScore('scout', 0).multiplierChanged).toBe(false);
  });
});

describe('бонусы', () => {
  it('rollDrop раскладывает [0, 1) по шансам из POWER_UP.drops', () => {
    const { weapon, life } = POWER_UP.drops;
    expect(rollDrop(0)).toBe('weapon');
    expect(rollDrop(weapon - 1e-9)).toBe('weapon');
    expect(rollDrop(weapon)).toBe('life');
    expect(rollDrop(weapon + life)).toBe('shield');
    expect(rollDrop(0.999)).toBeNull(); // чаще всего не выпадает ничего
  });

  it('шансы выпадения похожи на заявленные', () => {
    const total = Object.values(POWER_UP.drops).reduce((a, b) => a + b, 0);
    let dropped = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) if (rollDrop((i + 0.5) / n)) dropped++;
    expect(dropped / n).toBeCloseTo(total, 3);
  });

  it('с босса — жизнь, если есть куда и повезло, иначе капсула оружия', () => {
    expect(bossDrop(3, 0)).toBe('life');
    expect(bossDrop(3, 0.99)).toBe('weapon');
    expect(bossDrop(PLAYER.maxLives, 0)).toBe('weapon');
  });

  it('жизни не выше максимума', () => {
    expect(addLife(3)).toBe(4);
    expect(addLife(PLAYER.maxLives)).toBe(PLAYER.maxLives);
  });
});

describe('старт партии', () => {
  it('без улучшений — значения из balance.ts', () => {
    expect(startStats(NO_UPGRADES)).toEqual({
      lives: PLAYER.startLives,
      weapon: gun(1),
      reload: 1,
      magnetTime: POWER_UP.magnetTime,
    });
  });

  it('улучшения из ангара, жизни и пушка не выше максимума', () => {
    const s = startStats({ fireRate: 2, startWeapon: 9, extraLife: 9, magnet: 1 });
    expect(s.weapon).toEqual(gun(PLAYER.maxWeapon));
    expect(s.lives).toBe(PLAYER.maxLives);
    expect(s.reload).toBeCloseTo(1 - 2 * UPGRADES.fireRate.intervalStep);
    expect(s.magnetTime).toBe(POWER_UP.magnetTime + UPGRADES.magnet.timeStep);
  });
});

describe('враги', () => {
  it('сложность растёт линейно со временем', () => {
    expect(difficulty(0)).toBe(1);
    expect(difficulty(DIFFICULTY_TIME)).toBe(2);
  });

  it('HP флагмана растёт ступеньками', () => {
    const { hp, hpGrowth, hpGrowthEvery } = ENEMY.mother;
    expect(bossHp(0)).toBe(hp);
    expect(bossHp(hpGrowthEvery - 0.1)).toBe(hp);
    expect(bossHp(hpGrowthEvery * 2)).toBe(hp + 2 * hpGrowth);
  });

  it('атаки босса идут по кругу', () => {
    expect([0, 1, 2, 3].map(bossAttackAt)).toEqual(['fan', 'burst', 'homing', 'fan']);
  });

  it('ракета доворачивает к цели не больше чем на maxTurn и выбирает короткую сторону', () => {
    expect(turnToward(0, 1, 0.1)).toBeCloseTo(0.1);
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05); // близкую цель — ровно на неё
    // с 170° на −170° короче через 180°, а не назад через 0
    const from = (170 * Math.PI) / 180;
    expect(turnToward(from, (-170 * Math.PI) / 180, 0.1)).toBeCloseTo(from + 0.1);
  });
});
