import { expect, test } from '@playwright/test';
import { FORMATIONS, planWave } from '../src/game/waves.ts';
import { movePlayer, setCheats, snapshot, startGame } from './helpers.ts';

test.describe('план волн', () => {
  test('каждая 5-я волна — босс', () => {
    expect(planWave(5)).toEqual(['boss']);
    expect(planWave(10)).toEqual(['boss']);
    expect(planWave(4)).not.toContain('boss');
  });

  test('враги появляются не раньше своей волны, а в «свою» волну — обязательно', () => {
    for (let n = 1; n <= 9; n++) {
      if (n % 5 === 0) continue;
      for (let run = 0; run < 20; run++) {
        const plan = planWave(n);
        for (const f of plan) expect(FORMATIONS[f as keyof typeof FORMATIONS].minWave).toBeLessThanOrEqual(n);
        expect(['scout', 'line', 'wedge'], 'волна начинается с простого').toContain(plan[0]);
      }
    }
    expect(planWave(3)).toContain('kamikazes');
    expect(planWave(4)).toContain('shielderGuard');
  });

  test('волны растут', () => {
    expect(planWave(9).length).toBeGreaterThan(planWave(1).length);
  });
});

test.describe('волны в игре', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page);
  });

  test('после первой волны начинается вторая', async ({ page }) => {
    test.setTimeout(60_000);
    await setCheats(page, { noDamage: true });
    await page.evaluate(() => window.__world!.startWave(1));
    await expect.poll(async () => (await snapshot(page)).wave, { timeout: 40_000 }).toBe(2);
  });

  test('волна босса не кончается, пока он жив, и к нему подлетает сопровождение', async ({ page }) => {
    test.setTimeout(60_000);
    await setCheats(page, { noDamage: true, holdFire: true });
    await page.evaluate(() => window.__world!.startWave(5));
    await expect.poll(async () => (await snapshot(page)).enemies.some((e) => e.kind === 'mother'), { timeout: 10_000 }).toBe(true);
    await expect
      .poll(async () => (await snapshot(page)).enemies.filter((e) => e.kind !== 'mother').length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(6000);
    expect((await snapshot(page)).wave).toBe(5);
  });

  test('после смерти босса начинается следующая волна', async ({ page }) => {
    test.setTimeout(90_000);
    await setCheats(page, { noDamage: true });
    await page.evaluate(() => window.__world!.startWave(5));
    const deadline = Date.now() + 70_000;
    for (;;) {
      const s = await snapshot(page);
      if (s.wave === 6 || Date.now() > deadline) break;
      // держимся под боссом, чтобы пули попадали
      const boss = s.enemies.find((e) => e.kind === 'mother');
      if (boss) await movePlayer(page, boss.x, s.player.y);
      await page.waitForTimeout(50);
    }
    expect((await snapshot(page)).wave).toBe(6);
  });
});

test.describe('построения', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page);
    await setCheats(page, { holdFire: true, noDamage: true });
  });

  const kinds = async (page: Parameters<typeof snapshot>[0]) => (await snapshot(page)).enemies.map((e) => e.kind).sort();

  test('линия — 5 разведчиков на одной высоте', async ({ page }) => {
    await page.evaluate(() => window.__world!.spawnFormation('line'));
    await page.waitForTimeout(1500); // строй держится в полёте, а не слипается над игроком
    const { enemies, w } = await snapshot(page);
    expect(enemies).toHaveLength(5);
    expect(new Set(enemies.map((e) => Math.round(e.y))).size).toBe(1);
    const xs = enemies.map((e) => e.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(w / 6, 0);
  });

  test('змейка — 6 разведчиков идут по одной кривой', async ({ page }) => {
    await page.evaluate(() => window.__world!.spawnFormation('snake'));
    await page.waitForTimeout(1500);
    const scouts = (await snapshot(page)).enemies.sort((a, b) => b.y - a.y);
    expect(scouts).toHaveLength(6);
    // идут колонной с одинаковым шагом, но не по прямой
    for (let i = 1; i < scouts.length; i++) expect(scouts[i - 1].y - scouts[i].y).toBeCloseTo(44, 0);
    expect(Math.max(...scouts.map((e) => e.x)) - Math.min(...scouts.map((e) => e.x))).toBeGreaterThan(40);
  });

  const cases: [string, string[]][] = [
    ['wedge', ['scout', 'scout', 'scout', 'scout', 'scout']],
    ['saucers', ['saucer', 'saucer']],
    ['splitters', ['splitter', 'splitter']],
    ['kamikazes', ['kamikaze', 'kamikaze', 'kamikaze']],
    ['shielderGuard', ['scout', 'scout', 'shielder']],
  ];
  for (const [name, expected] of cases) {
    test(`построение ${name}`, async ({ page }) => {
      await page.evaluate((n) => window.__world!.spawnFormation(n), name);
      expect(await kinds(page)).toEqual(expected);
    });
  }
});
