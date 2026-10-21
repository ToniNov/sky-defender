import { expect, test, type Page } from '@playwright/test';
import { COINS } from '../src/game/balance.ts';
import { movePlayer, pickUp, setCheats, snapshot, spawnEnemy, startGame } from './helpers.ts';

function spawnCoin(page: Page, x: number, y: number) {
  return page.evaluate(([cx, cy]) => window.__world!.spawnCoin(cx, cy), [x, y] as const);
}

/** Положить монету на самолёт и дождаться, пока её подберут. */
async function collectCoin(page: Page) {
  const { player, coins } = await snapshot(page);
  await spawnCoin(page, player.x, player.y);
  await expect.poll(async () => (await snapshot(page)).coins).toBe(coins + 1);
}

const savedProgress = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('progress') ?? 'null') as Record<string, unknown> | null);

async function pauseToMenu(page: Page) {
  await page.getByRole('button', { name: 'Пауза' }).click();
  await page.getByRole('button', { name: 'В меню' }).click();
}

test('монета подбирается и видна в HUD', async ({ page }) => {
  await startGame(page);
  await collectCoin(page);
  await collectCoin(page);
  await expect(page.getByLabel('Монеты за партию: 2')).toBeVisible();
});

test('магнит притягивает монеты', async ({ page }) => {
  await startGame(page);
  await pickUp(page, 'magnet');
  const { w } = await snapshot(page);
  await spawnCoin(page, w - 20, 60);
  await expect.poll(async () => (await snapshot(page)).coins).toBe(1);
});

test('босс рассыпает монеты', async ({ page }) => {
  await startGame(page);
  await setCheats(page, { noDamage: true });
  const { w } = await snapshot(page);
  await movePlayer(page, w / 2, 9999);
  await spawnEnemy(page, 'mother', w / 2, 120);
  await expect
    .poll(async () => {
      const s = await snapshot(page);
      return s.coinsOnField.length + s.coins;
    }, { timeout: 15000 })
    .toBeGreaterThanOrEqual(COINS.boss);
});

test('монеты сохраняются между партиями и после перезагрузки', async ({ page }) => {
  await startGame(page);
  await collectCoin(page);
  await collectCoin(page);
  await collectCoin(page);
  await pauseToMenu(page);
  await expect(page.getByLabel('Монеты: 3')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Монеты: 3')).toBeVisible();

  // вторая партия добавляет к накопленному, а не перезаписывает
  await page.getByRole('button', { name: 'Взлететь' }).click();
  await page.waitForFunction(() => window.__world?.snapshot().alive);
  await page.evaluate(() => window.__world!.setAutoSpawn(false));
  await collectCoin(page);
  await pauseToMenu(page);
  await expect(page.getByLabel('Монеты: 4')).toBeVisible();
});

test('пауза не задваивает монеты', async ({ page }) => {
  await startGame(page);
  await collectCoin(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Пауза' }).click();
    await page.getByRole('button', { name: 'Продолжить' }).click();
  }
  expect((await savedProgress(page))?.coins).toBe(1);
});

test('старый рекорд переезжает в новое сохранение', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('progress')) localStorage.setItem('best_score', '500');
  });
  await startGame(page);
  await collectCoin(page);
  await pauseToMenu(page);
  await expect(page.getByText('Рекорд: 500')).toBeVisible();
  expect(await savedProgress(page)).toMatchObject({ v: 3, best: 500, coins: 1, upgrades: { fireRate: 0 } });
});

test('сохранение из новой версии игры не теряет незнакомые поля', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('progress', JSON.stringify({ v: 9, best: 10, coins: 3, skins: ['red'], t: 1 }));
  });
  await startGame(page);
  await collectCoin(page);
  await pauseToMenu(page);
  expect(await savedProgress(page)).toMatchObject({ v: 9, best: 10, coins: 4, skins: ['red'] });
});
