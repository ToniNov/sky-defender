import { expect, test } from '@playwright/test';
import { collectErrors, snapshot, startGame } from './helpers.ts';

test('меню → игра → пауза → меню без ошибок', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page, { calm: false });

  await expect(page.getByLabel('Жизни: 3')).toBeVisible();
  // игра идёт: враги появляются сами, автострельба сбивает хоть кого-то
  await expect.poll(async () => (await snapshot(page)).enemies.length, { timeout: 5000 }).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeVisible();
  await page.getByRole('button', { name: 'В меню' }).click();
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('самолёт летит за пальцем', async ({ page }) => {
  await startGame(page);
  const before = (await snapshot(page)).player;
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(160, 560, { steps: 5 });
  await page.mouse.up();
  const after = (await snapshot(page)).player;
  expect(after.x).toBeLessThan(before.x);
  expect(after.y).toBeLessThan(before.y);
});

test('автострельба сбивает разведчика и даёт очки', async ({ page }) => {
  await startGame(page);
  const { player } = await snapshot(page);
  await page.evaluate(([x]) => window.__world!.spawnEnemy('scout', x, 80), [player.x] as const);
  await expect.poll(async () => (await snapshot(page)).score).toBeGreaterThan(0);
});
