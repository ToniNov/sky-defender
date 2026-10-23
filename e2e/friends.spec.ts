import { expect, test, type Page } from '@playwright/test';
import { REFERRAL } from '../src/game/balance.ts';
import { fakeTelegram } from './helpers.ts';

const API = 'http://api.test'; // адрес API задан в playwright.config.ts
const LINK = 'https://t.me/sky_bot/play?startapp=ref_42';

/** Подменённый сервер приглашений: сколько друзей пришло и запросы «забрать». */
async function mockReferrals(page: Page, invited: number, unclaimed: number) {
  const state = { unclaimed, claims: 0 };
  const preflight = { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } };
  await page.route(`${API}/api/referrals`, (r) =>
    r.request().method() === 'OPTIONS'
      ? r.fulfill(preflight)
      : r.fulfill({ json: { link: LINK, invited, unclaimed: state.unclaimed } }),
  );
  await page.route(`${API}/api/referrals/claim`, (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill(preflight);
    state.claims++;
    const claimed = state.unclaimed;
    state.unclaimed = 0;
    return r.fulfill({ json: { claimed } });
  });
  return state;
}

async function open(page: Page) {
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();
}

test('пришли друзья — значок в меню, награда зачисляется один раз', async ({ page }) => {
  await fakeTelegram(page);
  const server = await mockReferrals(page, 3, 2);
  await open(page);

  await expect(page.getByLabel('Новых друзей: 2')).toBeVisible();
  await page.getByRole('button', { name: /Друзья/ }).click();
  await expect(page.getByText('Пришло по твоей ссылке: 3')).toBeVisible();

  await page.getByRole('button', { name: `Забрать ${2 * REFERRAL.reward}` }).click();
  await expect(page.getByRole('button', { name: /^Забрать/ })).toHaveCount(0);
  expect(server.claims).toBe(1);
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByLabel(`Монеты: ${2 * REFERRAL.reward}`)).toBeVisible();
  await expect(page.getByLabel(/Новых друзей/)).toHaveCount(0);
});

test('«Пригласить» открывает выбор чата со ссылкой-приглашением', async ({ page }) => {
  await fakeTelegram(page, { version: '8.0' }); // openTelegramLink — с 6.1
  await mockReferrals(page, 0, 0);
  await open(page);

  await page.getByRole('button', { name: /Друзья/ }).click();
  await page.getByRole('button', { name: 'Пригласить друга' }).click();
  const [opened] = (await page.evaluate(() => window.__opened)) ?? [];
  const url = new URL(opened);
  expect(url.origin + url.pathname).toBe('https://t.me/share/url');
  expect(url.searchParams.get('url')).toBe(LINK);
  expect(url.searchParams.get('text')).toContain('Небесный патруль');
});

test('сервер недоступен — сообщение вместо вечной загрузки', async ({ page }) => {
  await fakeTelegram(page);
  await page.route(`${API}/**`, (r) => r.abort());
  await open(page);
  await page.getByRole('button', { name: /Друзья/ }).click();
  await expect(page.getByText('Сервер сейчас недоступен')).toBeVisible();
});

test('вне Telegram кнопки «Друзья» нет', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'Лидеры' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Друзья/ })).toHaveCount(0);
});
