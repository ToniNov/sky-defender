import { expect, test, type Page } from '@playwright/test';
import { ENEMY } from '../src/game/balance.ts';
import { movePlayer, pickUp, setCheats, snapshot, spawnEnemy, startGame } from './helpers.ts';

/** Самолёт по центру снизу, урона не получает, в руках оружие kind. */
async function arm(page: Page, kind: string) {
  await startGame(page);
  await setCheats(page, { noDamage: true });
  const { w, player } = await snapshot(page);
  await movePlayer(page, w / 2, player.y);
  await pickUp(page, 'weapon', { weapon: kind });
}

test.describe('лазер', () => {
  test.beforeEach(({ page }) => arm(page, 'laser'));
  test('лазер — луч от самолёта вверх, со сменой оружия гаснет', async ({ page }) => {
    const { beam, player, weapon } = await snapshot(page);
    expect(weapon).toEqual({ kind: 'laser', level: 1 });
    expect(beam).not.toBeNull();
    expect(beam!.x).toBe(player.x);
    expect(beam!.top).toBeLessThan(0);

    await pickUp(page, 'weapon', { weapon: 'gun' });
    expect((await snapshot(page)).beam).toBeNull();
  });

  test('лазер бьёт насквозь: разведчик за сплиттером сбит раньше сплиттера', async ({ page }) => {
    // огонь — только когда враги уже стоят: иначе летящие пули достали бы разведчика сразу
    await setCheats(page, { holdFire: true });
    const { player } = await snapshot(page);
    await spawnEnemy(page, 'splitter', player.x, 300);
    await spawnEnemy(page, 'scout', player.x, 120);
    await setCheats(page, { holdFire: false });
    // пуля сначала попала бы в сплиттер; луч задевает обоих, и разведчику (1 HP) хватает пары тиков
    await expect
      .poll(async () => (await snapshot(page)).enemies.map((e) => e.kind), { intervals: [50] })
      .toEqual(['splitter']);
  });

  test('щит щитоносца держит луч', async ({ page }) => {
    const { player } = await snapshot(page);
    await spawnEnemy(page, 'shielder', player.x, 200);
    await page.waitForTimeout(1000);
    const { enemies, beam } = await snapshot(page);
    const shielder = enemies.find((e) => e.kind === 'shielder')!;
    expect(shielder.hp).toBe(ENEMY.shielder.hp);
    expect(beam!.top).toBeCloseTo(shielder.y + ENEMY.shielder.plateY, -1);
  });
});

test.describe('ракеты', () => {
  test.beforeEach(({ page }) => arm(page, 'rocket'));

  test('вылетают в стороны и доворачивают на врага сбоку', async ({ page }) => {
    const { w, player, weapon } = await snapshot(page);
    expect(weapon).toEqual({ kind: 'rocket', level: 1 });
    // тарелка в стороне от линии огня: прямая пуля прошла бы мимо
    await spawnEnemy(page, 'saucer', w / 2 + 120, player.y - 450);
    await expect.poll(async () => (await snapshot(page)).enemies, { timeout: 4000 }).toEqual([]);
  });

  test('достают щитоносца: щит их не держит', async ({ page }) => {
    const { player } = await snapshot(page);
    await spawnEnemy(page, 'shielder', player.x, 200);
    await expect.poll(async () => (await snapshot(page)).enemies, { timeout: 4000 }).toEqual([]);
  });
});
