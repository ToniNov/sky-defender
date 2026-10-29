import { expect, test } from '@playwright/test';
import { pickUp, snapshot, spawnEnemy, spawnPowerUp, startGame } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await startGame(page);
});

test('пушка и жизнь', async ({ page }) => {
  await pickUp(page, 'gun');
  await pickUp(page, 'life');
  const s = await snapshot(page);
  expect(s.weapon).toEqual({ kind: 'gun', level: 2 });
  expect(s.lives).toBe(4);
});

test('урон снимает уровень оружия, но не вид', async ({ page }) => {
  await pickUp(page, 'gun');
  const { player } = await snapshot(page);
  await spawnEnemy(page, 'scout', player.x, player.y);
  await expect.poll(async () => (await snapshot(page)).lives).toBe(2);
  expect((await snapshot(page)).weapon).toEqual({ kind: 'gun', level: 1 });
});

test('щит принимает таран вместо жизни', async ({ page }) => {
  await pickUp(page, 'shield');
  expect((await snapshot(page)).shield).toBe(true);

  const { player } = await snapshot(page);
  await spawnEnemy(page, 'scout', player.x, player.y);
  await expect.poll(async () => (await snapshot(page)).shield).toBe(false);
  expect((await snapshot(page)).lives).toBe(3);
});

test('без щита таран отнимает жизнь', async ({ page }) => {
  const { player } = await snapshot(page);
  await spawnEnemy(page, 'scout', player.x, player.y);
  await expect.poll(async () => (await snapshot(page)).lives).toBe(2);
});

test('магнит притягивает бонус с другого края экрана', async ({ page }) => {
  await pickUp(page, 'magnet');
  expect((await snapshot(page)).magnet).toBeGreaterThan(0);

  const { w } = await snapshot(page);
  await spawnPowerUp(page, 'gun', w - 20, 60);
  await expect.poll(async () => (await snapshot(page)).weapon.level).toBe(2);
});

test('бомба сбивает врагов на экране и ранит босса', async ({ page }) => {
  const { w, player } = await snapshot(page);
  // враги в стороне от линии огня, чтобы их сбила именно бомба
  const x = player.x < w / 2 ? w - 40 : 40;
  await spawnEnemy(page, 'scout', x, 100);
  await spawnEnemy(page, 'saucer', x, 180);
  await spawnEnemy(page, 'mother', w / 2, 120);
  const bossHp = (await snapshot(page)).enemies.find((e) => e.kind === 'mother')!.hp;

  await pickUp(page, 'bomb');
  const s = await snapshot(page);
  expect(s.enemies.map((e) => e.kind)).toEqual(['mother']);
  expect(s.enemies[0].hp).toBeLessThan(bossHp);
  expect(s.enemyBullets).toBe(0);
});
