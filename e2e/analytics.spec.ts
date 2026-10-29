import { expect, test, type Page } from '@playwright/test';
import pkg from '../package.json' with { type: 'json' };
import { snapshot, spawnEnemy, startGame } from './helpers';

const API = 'http://api.test'; // адрес API задан в playwright.config.ts

/** Подменённый /api/events: какие события пришли. */
async function mockEvents(page: Page) {
  const events: Record<string, unknown>[] = [];
  await page.route(`${API}/api/events`, (r) => {
    if (r.request().method() === 'OPTIONS') {
      return r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    }
    events.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  return events;
}

test('при запуске уходит событие с анонимным id устройства, и id не меняется', async ({ page }) => {
  const events = await mockEvents(page);
  await startGame(page);
  await expect.poll(() => events.filter((e) => e.type === 'launch')).toHaveLength(1);
  expect(events[0]).toMatchObject({ version: pkg.version, platform: 'web' });
  expect(events[0].device).toMatch(/^[a-z0-9]{16}$/);

  await page.reload();
  await expect.poll(() => events.filter((e) => e.type === 'launch')).toHaveLength(2);
  expect(events[1].device).toBe(events[0].device);
});

test('после гибели уходит итог партии: очки, волна, время и чем сбит', async ({ page }) => {
  const events = await mockEvents(page);
  await startGame(page);
  // таранить разведчиками, пока самолёт не собьют
  await expect
    .poll(
      async () => {
        const s = await snapshot(page);
        if (s.alive && s.invuln === 0) await spawnEnemy(page, 'scout', s.player.x, s.player.y);
        return s.alive;
      },
      { timeout: 15_000 },
    )
    .toBe(false);
  await expect(page.getByRole('button', { name: 'Ещё раз' })).toBeVisible();

  await expect.poll(() => events.filter((e) => e.type === 'run')).toHaveLength(1);
  const run = events.find((e) => e.type === 'run')!;
  expect(run).toMatchObject({ cause: 'scout', wave: 1, score: 0, version: pkg.version });
  expect(run.seconds).toBeGreaterThan(0);
});

test('сбит пулей — так и записано', async ({ page }) => {
  const events = await mockEvents(page);
  await startGame(page);
  await page.evaluate(() => window.__world!.crash('bullet'));
  await expect.poll(() => events.find((e) => e.type === 'run')?.cause).toBe('bullet');
});
