import { expect, test, type Page } from '@playwright/test';
import { SAVE_VERSION } from '../src/progress.ts';
import { fakeTelegram, snapshot } from './helpers.ts';

// Адрес API задан в playwright.config.ts; сам сервер подменяем — тесты не зависят от сети
const API = 'http://api.test';

async function open(page: Page) {
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();
}

test('таблица лидеров из ответа сервера', async ({ page }) => {
  await page.route(`${API}/api/leaderboard`, (r) =>
    r.fulfill({
      json: {
        top: [
          { name: 'Мария', score: 900 },
          { name: 'Антон', score: 500 },
        ],
        me: { rank: 2, score: 500 },
      },
    }),
  );
  await open(page);
  await page.getByRole('button', { name: 'Лидеры' }).click();
  const rows = page.locator('.leader');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Мария');
  await expect(rows.first()).toContainText('900');
  await expect(page.getByText('Твоё место: 2 · 500')).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();
});

test('сервер недоступен — понятное сообщение, а не ошибка', async ({ page }) => {
  await page.route(`${API}/**`, (r) => r.abort());
  await open(page);
  await page.getByRole('button', { name: 'Лидеры' }).click();
  await expect(page.getByText('Таблица сейчас недоступна')).toBeVisible();
});

test('в Telegram рекорд уходит на сервер после партии, место видно на экране', async ({ page }) => {
  await page.addInitScript((json) => {
    if (!localStorage.getItem('progress')) localStorage.setItem('progress', json);
  }, JSON.stringify({ v: SAVE_VERSION, best: 1200, coins: 0, t: 1 }));
  const initData = await fakeTelegram(page);
  const sent: { auth: string | undefined; body: unknown }[] = [];
  await page.route(`${API}/api/score`, async (r) => {
    // предзапрос CORS: браузер спрашивает, можно ли слать заголовок Authorization
    if (r.request().method() === 'OPTIONS') {
      return r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    }
    const auth = (await r.request().headerValue('authorization')) ?? undefined;
    sent.push({ auth, body: r.request().postDataJSON() });
    return r.fulfill({ json: { best: 1200, rank: 7 } });
  });

  await open(page);
  await page.getByRole('button', { name: 'Взлететь' }).click();
  await page.waitForFunction(() => window.__world?.snapshot().alive);
  await page.evaluate(() => window.__world!.crash());
  expect((await snapshot(page)).alive).toBe(false);

  await expect(page.getByText('Место в таблице лидеров: 7')).toBeVisible();
  // рекорд из сохранения больше очков партии — отправляется он
  expect(sent).toEqual([{ auth: `tma ${initData}`, body: { score: 1200 } }]);
});
