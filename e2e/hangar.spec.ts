import { expect, test, type Page } from '@playwright/test';
import { PLAYER, POWER_UP, UPGRADES } from '../src/game/balance.ts';
import { pickUp, snapshot } from './helpers.ts';

/** Открыть игру с заданным сохранением (только при первом заходе — покупки переживают перезагрузку). */
async function openWithSave(page: Page, save: Record<string, unknown>) {
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript((json) => {
    if (!localStorage.getItem('progress')) localStorage.setItem('progress', json);
  }, JSON.stringify({ v: 2, best: 0, t: 1, ...save }));
  await page.goto('/');
}

async function launch(page: Page) {
  await page.getByRole('button', { name: 'Взлететь' }).click();
  await page.waitForFunction(() => window.__world?.snapshot().alive);
  await page.evaluate(() => window.__world!.setAutoSpawn(false));
}

const buyButton = (page: Page, title: string) => page.getByRole('button', { name: new RegExp(`^Купить: ${title}`) });

test('покупка списывает монеты и поднимает уровень', async ({ page }) => {
  const cost = UPGRADES.startWeapon.costs[0];
  await openWithSave(page, { coins: cost + 5 });
  await page.getByRole('button', { name: 'Ангар' }).click();
  await buyButton(page, 'Стартовая пушка').click();

  await expect(page.getByLabel('Монеты: 5')).toBeVisible();
  await expect(page.getByLabel('Уровень 1 из 2').first()).toBeVisible();
  // на следующий уровень уже не хватает
  await expect(buyButton(page, 'Стартовая пушка')).toBeDisabled();

  await page.reload();
  await page.getByRole('button', { name: 'Ангар' }).click();
  await expect(page.getByLabel('Монеты: 5')).toBeVisible();
  await expect(buyButton(page, 'Стартовая пушка')).toBeDisabled();
});

test('без монет купить нельзя', async ({ page }) => {
  await openWithSave(page, { coins: 0 });
  await page.getByRole('button', { name: 'Ангар' }).click();
  for (const title of ['Скорострельность', 'Стартовая пушка', 'Запасная жизнь', 'Сильный магнит']) {
    await expect(buyButton(page, title)).toBeDisabled();
  }
});

test('на максимальном уровне кнопки покупки нет', async ({ page }) => {
  await openWithSave(page, { coins: 10000, upgrades: { extraLife: UPGRADES.extraLife.costs.length } });
  await page.getByRole('button', { name: 'Ангар' }).click();
  await expect(buyButton(page, 'Запасная жизнь')).toHaveCount(0);
  await expect(page.getByText('Макс.')).toBeVisible();
});

test('улучшения действуют в партии', async ({ page }) => {
  await openWithSave(page, { coins: 0, upgrades: { fireRate: 2, startWeapon: 1, extraLife: 2, magnet: 1 } });
  await launch(page);
  const s = await snapshot(page);
  expect(s.weapon).toBe(2);
  expect(s.lives).toBe(Math.min(PLAYER.maxLives, PLAYER.startLives + 2));
  expect(s.fireInterval).toBeCloseTo(PLAYER.fireInterval * (1 - 2 * UPGRADES.fireRate.intervalStep));

  await pickUp(page, 'magnet');
  expect((await snapshot(page)).magnet).toBeGreaterThan(POWER_UP.magnetTime);
});

test('без покупок всё как раньше', async ({ page }) => {
  await openWithSave(page, { coins: 0 });
  await launch(page);
  const s = await snapshot(page);
  expect(s.weapon).toBe(1);
  expect(s.lives).toBe(PLAYER.startLives);
  expect(s.fireInterval).toBeCloseTo(PLAYER.fireInterval);
});

test('сохранение версии 1 получает пустые улучшения и не теряет монеты', async ({ page }) => {
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(() => {
    if (!localStorage.getItem('progress')) localStorage.setItem('progress', JSON.stringify({ v: 1, best: 70, coins: 50, t: 1 }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ангар' }).click();
  await expect(page.getByLabel('Монеты: 50')).toBeVisible();
  await buyButton(page, 'Скорострельность').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('progress')!));
  expect(saved).toMatchObject({ v: 2, best: 70, coins: 50 - UPGRADES.fireRate.costs[0], upgrades: { fireRate: 1, magnet: 0 } });
});
