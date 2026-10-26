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
  // вне Telegram друзей не узнать — вкладок нет
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();
});

test('сервер недоступен — понятное сообщение, а не ошибка', async ({ page }) => {
  await page.route(`${API}/**`, (r) => r.abort());
  await open(page);
  await page.getByRole('button', { name: 'Лидеры' }).click();
  await expect(page.getByText('Таблица сейчас недоступна')).toBeVisible();
});

test('в Telegram партия засекается на сервере, её очки уходят после партии, место видно на экране', async ({ page }) => {
  await page.addInitScript((json) => {
    if (!localStorage.getItem('progress')) localStorage.setItem('progress', json);
  }, JSON.stringify({ v: SAVE_VERSION, best: 1200, coins: 0, t: 1 }));
  const initData = await fakeTelegram(page);
  const sent: { path: string; auth: string | undefined; body: unknown }[] = [];
  await page.route(/\/api\/(run|score)$/, async (r) => {
    // предзапрос CORS: браузер спрашивает, можно ли слать заголовок Authorization
    if (r.request().method() === 'OPTIONS') {
      return r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    }
    const path = new URL(r.request().url()).pathname;
    const auth = (await r.request().headerValue('authorization')) ?? undefined;
    sent.push({ path, auth, body: r.request().postDataJSON() });
    return r.fulfill({ json: path === '/api/run' ? { ok: true } : { best: 1200, rank: 7 } });
  });

  await open(page);
  await page.getByRole('button', { name: 'Взлететь' }).click();
  await page.waitForFunction(() => window.__world?.snapshot().alive);
  await page.evaluate(() => window.__world!.crash());
  expect((await snapshot(page)).alive).toBe(false);

  await expect(page.getByText('Место в таблице лидеров: 7')).toBeVisible();
  // сначала старт партии, потом её очки — не рекорд из сохранения: его сервер проверить не может
  expect(sent).toEqual([
    { path: '/api/run', auth: `tma ${initData}`, body: null },
    { path: '/api/score', auth: `tma ${initData}`, body: { score: 0 } },
  ]);
});

/** Подменённый /api/leaderboard с друзьями (в Telegram запрос идёт с Authorization — нужен ответ на предзапрос CORS). */
async function mockBoard(page: Page, friends: { name: string; score: number; me: boolean }[]) {
  await page.route(`${API}/api/leaderboard`, (r) =>
    r.request().method() === 'OPTIONS'
      ? r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
      : r.fulfill({ json: { top: [{ name: 'Чемпион', score: 9000 }], me: { rank: 12, score: 500 }, friends } }),
  );
}

test('в Telegram есть вкладка «Друзья»: друзья по рекорду, своя строка отмечена', async ({ page }) => {
  await fakeTelegram(page);
  await mockBoard(page, [
    { name: 'Мария', score: 900, me: false },
    { name: 'Антон', score: 500, me: true },
    { name: 'Пётр', score: 100, me: false },
  ]);
  await open(page);
  await page.getByRole('button', { name: 'Лидеры' }).click();
  await expect(page.locator('.leader')).toHaveCount(1); // сначала — общая таблица
  await expect(page.getByText('Твоё место: 12 · 500')).toBeVisible();

  await page.getByRole('tab', { name: 'Друзья' }).click();
  const rows = page.locator('.leader');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Мария');
  await expect(rows.nth(1)).toContainText('Антон (ты)');
  await expect(rows.nth(1)).toHaveClass(/\bme\b/);
  await expect(page.getByText('Твоё место: 12 · 500')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Позвать друзей' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Все' }).click();
  await expect(page.locator('.leader')).toHaveCount(1);
});

test('друзей ещё нет — кнопка «Позвать друзей» ведёт на экран приглашений', async ({ page }) => {
  await fakeTelegram(page);
  await mockBoard(page, [{ name: 'Антон', score: 500, me: true }]);
  await open(page);
  await page.getByRole('button', { name: 'Лидеры' }).click();
  await page.getByRole('tab', { name: 'Друзья' }).click();
  await expect(page.locator('.leader')).toHaveCount(1);
  await page.getByRole('button', { name: 'Позвать друзей' }).click();
  await expect(page.getByRole('heading', { name: 'Друзья' })).toBeVisible();
});
