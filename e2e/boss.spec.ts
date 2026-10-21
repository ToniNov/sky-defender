import { expect, test } from '@playwright/test';
import { movePlayer, pickUp, setCheats, snapshot, spawnEnemy, spawnMissile, startGame } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await startGame(page);
});

test('босс чередует веер, очередь и самонаводящиеся снаряды', async ({ page }) => {
  // игрок не стреляет и неуязвим: смотрим только на атаки босса
  await setCheats(page, { noDamage: true, holdFire: true });
  const { w } = await snapshot(page);
  await spawnEnemy(page, 'mother', w / 2, 100);

  const seen = new Set<string>();
  let maxBullets = 0;
  let maxMissiles = 0;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline && !(seen.size === 3 && maxBullets >= 9 && maxMissiles >= 2)) {
    const s = await snapshot(page);
    const boss = s.enemies.find((e) => e.kind === 'mother');
    if (boss?.attack) seen.add(boss.attack);
    maxBullets = Math.max(maxBullets, s.enemyBullets);
    maxMissiles = Math.max(maxMissiles, s.missiles.length);
    await page.waitForTimeout(50);
  }
  expect([...seen].sort()).toEqual(['burst', 'fan', 'homing']);
  expect(maxBullets, 'веер — 9 пуль разом').toBeGreaterThanOrEqual(9);
  expect(maxMissiles, 'два самонаводящихся снаряда').toBeGreaterThanOrEqual(2);
});

test('самонаводящийся снаряд доворачивает к игроку', async ({ page }) => {
  await setCheats(page, { noDamage: true, holdFire: true });
  const { w, player } = await snapshot(page);
  await movePlayer(page, w - 40, player.y);
  await spawnMissile(page, 40, 80);
  await page.waitForTimeout(1200);
  const [m] = (await snapshot(page)).missiles;
  expect(m.x).toBeGreaterThan(120); // выпущен вертикально вниз, а ушёл вправо, к игроку
});

test('снаряд можно сбить', async ({ page }) => {
  const { player } = await snapshot(page);
  await spawnMissile(page, player.x, 80);
  await expect.poll(async () => (await snapshot(page)).missiles.length).toBe(0);
  expect((await snapshot(page)).lives).toBe(3);
});

test('снаряд отнимает жизнь', async ({ page }) => {
  await setCheats(page, { holdFire: true });
  const { player } = await snapshot(page);
  await spawnMissile(page, player.x, player.y - 150);
  await expect.poll(async () => (await snapshot(page)).lives).toBe(2);
});

test('бомба уничтожает снаряды', async ({ page }) => {
  await setCheats(page, { holdFire: true });
  const { w } = await snapshot(page);
  await spawnMissile(page, 40, 60);
  await spawnMissile(page, w - 40, 60);
  await pickUp(page, 'bomb');
  expect((await snapshot(page)).missiles).toEqual([]);
});
