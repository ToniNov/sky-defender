import { expect, test, type Page } from '@playwright/test';
import pkg from '../package.json' with { type: 'json' };

const { version } = pkg;

const API = 'http://api.test'; // адрес API задан в playwright.config.ts

/** Подменённый /api/errors: какие отчёты пришли. */
async function mockErrors(page: Page) {
  const reports: { message: string; stack: string; version: string; platform: string }[] = [];
  await page.route(`${API}/api/errors`, (r) => {
    if (r.request().method() === 'OPTIONS') {
      return r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    }
    reports.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();
  return reports;
}

test('необработанная ошибка уходит на сервер один раз, с версией игры', async ({ page }) => {
  const reports = await mockErrors(page);
  const crash = () => page.evaluate(() => setTimeout(() => (window as { boom?: () => void }).boom!()));
  await page.evaluate(() => {
    (window as { boom?: () => void }).boom = () => {
      throw new Error('проверка сбора ошибок');
    };
  });
  await crash();
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0]).toMatchObject({ message: 'Error: проверка сбора ошибок', version, platform: 'web' });
  expect(reports[0].stack).toContain('boom');

  await crash(); // та же ошибка ещё раз — повторно не шлём
  await page.waitForTimeout(300);
  expect(reports).toHaveLength(1);
});

test('отклонённый промис тоже уходит на сервер', async ({ page }) => {
  const reports = await mockErrors(page);
  await page.evaluate(() => {
    void Promise.reject(new Error('промис упал'));
  });
  await expect.poll(() => reports.map((r) => r.message)).toEqual(['Error: промис упал']);
});

test('игра работает, даже если сервер ошибок не отвечает', async ({ page }) => {
  await page.route(`${API}/**`, (r) => r.abort());
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/');
  await page.evaluate(() => setTimeout(() => { throw new Error('без сервера') }));
  await page.getByRole('button', { name: 'Взлететь' }).click();
  await page.waitForFunction(() => window.__world?.snapshot().alive);
});
