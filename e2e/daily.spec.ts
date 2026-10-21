import { expect, test, type Page } from '@playwright/test';
import { DAILY } from '../src/game/balance.ts';
import { SAVE_VERSION } from '../src/progress.ts';

const TODAY = '2026-10-21';
const YESTERDAY = '2026-10-20';

/** Открыть меню «сегодня» (полдень TODAY) с заданным сохранением. */
async function openOn(page: Page, save: Record<string, unknown> | null) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (save) {
    await page.addInitScript((json) => {
      if (!localStorage.getItem('progress')) localStorage.setItem('progress', json);
    }, JSON.stringify({ v: 3, best: 0, t: 1, ...save }));
  }
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();
}

const giftButton = (page: Page) => page.getByRole('button', { name: /Награда дня/ });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('progress')!));

async function claim(page: Page) {
  await giftButton(page).click();
  await page.getByRole('button', { name: /^Забрать/ }).click();
  await expect(giftButton(page)).toHaveCount(0);
}

test('первый вход: награда первого дня, второй раз за день — нельзя', async ({ page }) => {
  await openOn(page, null);
  await giftButton(page).click();
  await expect(page.getByLabel(`День 1: ${DAILY.rewards[0]}, сегодня`)).toBeVisible();
  await page.getByRole('button', { name: /^Забрать/ }).click();

  await expect(page.getByLabel(`Монеты: ${DAILY.rewards[0]}`)).toBeVisible();
  expect((await saved(page)).daily).toEqual({ last: TODAY, streak: 1 });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();
  await expect(giftButton(page)).toHaveCount(0);
});

test('серия продолжается, если заходил вчера', async ({ page }) => {
  await openOn(page, { coins: 5, daily: { last: YESTERDAY, streak: 3 } });
  await giftButton(page).click();
  await expect(page.getByLabel(`День 3: ${DAILY.rewards[2]}, получено`)).toBeVisible();
  await page.getByRole('button', { name: /^Забрать/ }).click();
  await expect(page.getByLabel(`Монеты: ${5 + DAILY.rewards[3]}`)).toBeVisible();
  expect((await saved(page)).daily).toEqual({ last: TODAY, streak: 4 });
});

test('пропуск дня сбрасывает серию', async ({ page }) => {
  await openOn(page, { coins: 0, daily: { last: '2026-10-19', streak: 5 } });
  await claim(page);
  expect(await saved(page)).toMatchObject({ coins: DAILY.rewards[0], daily: { last: TODAY, streak: 1 } });
});

test('после последнего дня круг начинается заново', async ({ page }) => {
  await openOn(page, { coins: 0, daily: { last: YESTERDAY, streak: DAILY.rewards.length } });
  await claim(page);
  expect(await saved(page)).toMatchObject({ coins: DAILY.rewards[0], daily: { streak: DAILY.rewards.length + 1 } });
});

test('«Позже» не забирает награду', async ({ page }) => {
  await openOn(page, { coins: 0 });
  await giftButton(page).click();
  await page.getByRole('button', { name: 'Позже' }).click();
  await expect(giftButton(page)).toBeVisible();
  expect((await saved(page)).coins).toBe(0);
});

test('сохранение версии 2 получает пустую серию', async ({ page }) => {
  await openOn(page, null);
  await page.evaluate(() => localStorage.setItem('progress', JSON.stringify({ v: 2, best: 9, coins: 7, upgrades: { magnet: 1 }, t: 1 })));
  await page.reload();
  await claim(page);
  expect(await saved(page)).toMatchObject({
    v: SAVE_VERSION,
    best: 9,
    coins: 7 + DAILY.rewards[0],
    upgrades: { magnet: 1 },
    daily: { last: TODAY, streak: 1 },
  });
});
