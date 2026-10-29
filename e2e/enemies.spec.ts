import { expect, test } from '@playwright/test';
import { movePlayer, setCheats, snapshot, spawnEnemy, startGame } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await startGame(page);
});

test('сплиттер распадается на два осколка', async ({ page }) => {
  const { player } = await snapshot(page);
  await spawnEnemy(page, 'splitter', player.x, 60);
  await expect
    .poll(async () => (await snapshot(page)).enemies.filter((e) => e.kind === 'mini').length)
    .toBe(2);
});

test('щитоносец неуязвим для пуль снизу по центру', async ({ page }) => {
  // появившись посреди потока пуль, он мог бы словить пулю сверху — поэтому стреляем только с чистого поля
  await setCheats(page, { holdFire: true });
  await expect.poll(async () => (await snapshot(page)).playerBullets).toBe(0);
  const { player } = await snapshot(page);
  await spawnEnemy(page, 'shielder', player.x, 60);
  const hpOf = async () => (await snapshot(page)).enemies.find((e) => e.kind === 'shielder')?.hp;
  const hp = await hpOf();
  await setCheats(page, { holdFire: false });
  await page.waitForTimeout(1200); // успевает получить десяток пуль в щит
  expect(await hpOf()).toBe(hp);
});

test('щитоносец получает урон, если пролететь под ним', async ({ page }) => {
  const { player, w } = await snapshot(page);
  await spawnEnemy(page, 'shielder', w / 2, 200);
  // щитоносец подъезжает под игрока медленнее самолёта: пролетая мимо, пули попадают в край
  for (let x = 40; x <= w - 40; x += 10) {
    await movePlayer(page, x, player.y);
    await page.waitForTimeout(40);
  }
  await expect
    .poll(async () => (await snapshot(page)).enemies.find((e) => e.kind === 'shielder')?.hp ?? 0)
    .toBeLessThan(4);
});

test('камикадзе целится и таранит игрока', async ({ page }) => {
  const { w, player } = await snapshot(page);
  // ставим камикадзе вне линии огня, иначе его собьют, пока он целится
  await movePlayer(page, w - 40, player.y);
  await spawnEnemy(page, 'kamikaze', 40, 60);
  await expect.poll(async () => (await snapshot(page)).lives, { timeout: 5000 }).toBe(2);
});
