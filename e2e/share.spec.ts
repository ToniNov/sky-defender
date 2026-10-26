import { expect, test, type Page } from '@playwright/test';
import { fakeTelegram, snapshot } from './helpers.ts';

const API = 'http://api.test'; // адрес API задан в playwright.config.ts

/** Открыть игру, сыграть и разбиться: экран «Самолёт сбит». */
async function crashed(page: Page) {
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(`${API}/api/score`, (r) => r.fulfill({ json: { best: 0, rank: 1 } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Взлететь' }).click();
  await page.waitForFunction(() => window.__world?.snapshot().alive);
  await page.evaluate(() => window.__world!.setAutoSpawn(false));
  await page.evaluate(() => window.__world!.crash());
  await expect(page.getByText('Самолёт сбит')).toBeVisible();
}

/** Подменённый /api/share: запоминает тела запросов. */
async function mockShare(page: Page, reply: { status?: number; json: unknown }) {
  const bodies: unknown[] = [];
  await page.route(`${API}/api/share`, (r) => {
    if (r.request().method() === 'OPTIONS') {
      return r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    }
    bodies.push(r.request().postDataJSON());
    return r.fulfill(reply);
  });
  return bodies;
}

const shareButton = (page: Page) => page.getByRole('button', { name: 'Поделиться результатом' });

test('сервер готовит сообщение с очками партии, Telegram открывает выбор чата', async ({ page }) => {
  await fakeTelegram(page, { version: '8.0' });
  const bodies = await mockShare(page, { json: { id: 'prep-1' } });
  await crashed(page);
  const { score } = await snapshot(page);

  await shareButton(page).click();
  await expect(page.getByRole('button', { name: '✓ Отправлено' })).toBeDisabled();
  expect(bodies).toEqual([{ score }]);
  expect(await page.evaluate(() => window.__shared)).toEqual(['prep-1']);
});

test('закрыл окно, не выбрав чат, — кнопку можно нажать снова', async ({ page }) => {
  await fakeTelegram(page, { version: '8.0' });
  await page.addInitScript(() => {
    window.__shareSent = false;
  });
  await mockShare(page, { json: { id: 'prep-1' } });
  await crashed(page);

  await shareButton(page).click();
  await expect.poll(() => page.evaluate(() => window.__shared?.length)).toBe(1);
  await expect(shareButton(page)).toBeEnabled();
});

test('сервер отказал — сообщение об ошибке', async ({ page }) => {
  await fakeTelegram(page, { version: '8.0' });
  await mockShare(page, { status: 502, json: { error: 'telegram-error' } });
  await crashed(page);

  await shareButton(page).click();
  await expect(page.getByText('Не получилось поделиться')).toBeVisible();
  expect(await page.evaluate(() => window.__shared)).toEqual([]);
});

test('старый Telegram или игра вне Telegram — кнопки нет', async ({ page }) => {
  await fakeTelegram(page, { version: '7.10' });
  await crashed(page);
  await expect(shareButton(page)).toHaveCount(0);

  const outside = await page.context().newPage();
  await crashed(outside);
  await expect(shareButton(outside)).toHaveCount(0);
});
