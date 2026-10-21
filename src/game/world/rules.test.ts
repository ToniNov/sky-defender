import { describe, expect, it } from 'vitest';
import { COMBO, DIFFICULTY_TIME, ENEMY, NO_UPGRADES, PLAYER, POWER_UP, UPGRADES } from '../balance';
import {
  addLife,
  bossAttackAt,
  bossDrop,
  bossHp,
  comboMultiplier,
  difficulty,
  killScore,
  near,
  rollDrop,
  shieldBlocks,
  startStats,
  takeHit,
  turnToward,
  upgradeWeapon,
} from './rules';

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
    expect(takeHit({ lives: 3, weapon: 3, shield: true, combo: 12 })).toEqual({
      lives: 3,
      weapon: 3,
      shield: false,
      combo: 12,
      absorbed: true,
    });
  });

  it('без щита — минус жизнь, минус уровень пушки, комбо с нуля', () => {
    expect(takeHit({ lives: 3, weapon: 3, shield: false, combo: 12 })).toEqual({
      lives: 2,
      weapon: 2,
      shield: false,
      combo: 0,
      absorbed: false,
    });
  });

  it('пушка не опускается ниже первого уровня', () => {
    expect(takeHit({ lives: 2, weapon: 1, shield: false, combo: 0 }).weapon).toBe(1);
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
    const { gun, life } = POWER_UP.drops;
    expect(rollDrop(0)).toBe('gun');
    expect(rollDrop(gun - 1e-9)).toBe('gun');
    expect(rollDrop(gun)).toBe('life');
    expect(rollDrop(gun + life)).toBe('shield');
    expect(rollDrop(0.999)).toBeNull(); // чаще всего не выпадает ничего
  });

  it('шансы выпадения похожи на заявленные', () => {
    const total = Object.values(POWER_UP.drops).reduce((a, b) => a + b, 0);
    let dropped = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) if (rollDrop((i + 0.5) / n)) dropped++;
    expect(dropped / n).toBeCloseTo(total, 3);
  });

  it('с босса — жизнь, если есть куда и повезло, иначе пушка', () => {
    expect(bossDrop(3, 0)).toBe('life');
    expect(bossDrop(3, 0.99)).toBe('gun');
    expect(bossDrop(PLAYER.maxLives, 0)).toBe('gun');
  });

  it('пушка и жизни не выше максимума', () => {
    expect(upgradeWeapon(1)).toBe(2);
    expect(upgradeWeapon(PLAYER.maxWeapon)).toBe(PLAYER.maxWeapon);
    expect(addLife(3)).toBe(4);
    expect(addLife(PLAYER.maxLives)).toBe(PLAYER.maxLives);
  });
});

describe('старт партии', () => {
  it('без улучшений — значения из balance.ts', () => {
    expect(startStats(NO_UPGRADES)).toEqual({
      lives: PLAYER.startLives,
      weapon: 1,
      fireInterval: PLAYER.fireInterval,
      magnetTime: POWER_UP.magnetTime,
    });
  });

  it('улучшения из ангара, жизни и пушка не выше максимума', () => {
    const s = startStats({ fireRate: 2, startWeapon: 9, extraLife: 9, magnet: 1 });
    expect(s.weapon).toBe(PLAYER.maxWeapon);
    expect(s.lives).toBe(PLAYER.maxLives);
    expect(s.fireInterval).toBeCloseTo(PLAYER.fireInterval * (1 - 2 * UPGRADES.fireRate.intervalStep));
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
