import { expect, type Page } from '@playwright/test';
import { POWER_UP } from '../src/game/balance.ts';
import type { DebugSnapshot } from '../src/game/debug.ts';

/** Ошибки из консоли и необработанные исключения страницы. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // «Failed to load resource» — это внешние скрипты, которые startGame блокирует нарочно
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  return errors;
}

/**
 * Открыть игру и нажать «Взлететь».
 * Внешние скрипты (Telegram SDK, шрифты) отключены: игра работает и без них, а тесты не зависят от сети.
 * calm — выключить случайных врагов и дождаться конца стартовой неуязвимости.
 */
export async function startGame(page: Page, { calm = true } = {}) {
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Взлететь' }).click();
  await page.waitForFunction(() => window.__world?.snapshot().alive);
  if (calm) {
    await page.evaluate(() => window.__world!.setAutoSpawn(false));
    await expect.poll(async () => (await snapshot(page)).invuln).toBe(0);
  }
}

export function snapshot(page: Page): Promise<DebugSnapshot> {
  return page.evaluate(() => window.__world!.snapshot());
}

export function spawnEnemy(page: Page, kind: string, x: number, y: number) {
  return page.evaluate(([k, ex, ey]) => window.__world!.spawnEnemy(k, ex, ey), [kind, x, y] as const);
}

export function spawnPowerUp(page: Page, kind: string, x: number, y: number) {
  return page.evaluate(([k, px, py]) => window.__world!.spawnPowerUp(k, px, py), [kind, x, y] as const);
}

export function movePlayer(page: Page, x: number, y: number) {
  return page.evaluate(([px, py]) => window.__world!.movePlayer(px, py), [x, y] as const);
}

export function spawnMissile(page: Page, x: number, y: number) {
  return page.evaluate(([mx, my]) => window.__world!.spawnMissile(mx, my), [x, y] as const);
}

export async function setCheats(page: Page, cheats: { noDamage?: boolean; holdFire?: boolean }) {
  await page.evaluate((c) => window.__world!.setCheats(c), cheats);
  // пули, выпущенные до прекращения огня, ещё летят — ждём, пока покинут экран
  if (cheats.holdFire) await page.waitForTimeout(1300);
}

/** Положить бонус прямо на самолёт и дождаться, пока его подберут. */
export async function pickUp(page: Page, kind: string) {
  // ждём очки за подбор, а не пустое поле: сбитые бомбой враги сами могут уронить бонус
  const { player, score } = await snapshot(page);
  await spawnPowerUp(page, kind, player.x, player.y);
  await expect.poll(async () => (await snapshot(page)).score).toBeGreaterThanOrEqual(score + POWER_UP.points);
}

/** Подменённый Telegram: что игра передала в shareMessage и что «ответил» пользователь. */
declare global {
  interface Window {
    __shared?: string[];
    __shareSent?: boolean;
    __opened?: string[];
  }
}

/**
 * Притвориться, что игра открыта в Telegram: есть initData (подпись проверяет сервер, а его подменяют тесты).
 * version — версия Bot API клиента; shareMessage запоминает id и сразу «отправляет» (window.__shareSent),
 * openTelegramLink запоминает ссылки (window.__opened).
 */
export async function fakeTelegram(page: Page, { version = '6.0' } = {}): Promise<string> {
  const initData = 'auth_date=1&user=%7B%22id%22%3A42%7D&hash=test';
  await page.addInitScript(
    ([data, ver]) => {
      const noop = () => {};
      const atLeast = (v: string) => {
        const [a, b] = v.split('.').map(Number);
        const [x, y] = ver.split('.').map(Number);
        return x > a || (x === a && y >= b);
      };
      window.__shared = [];
      window.__shareSent = true;
      window.__opened = [];
      Object.assign(window, {
        Telegram: {
          WebApp: {
            initData: data,
            initDataUnsafe: {},
            ready: noop,
            expand: noop,
            isVersionAtLeast: atLeast,
            shareMessage: (id: string, cb?: (sent: boolean) => void) => {
              window.__shared!.push(id);
              cb?.(window.__shareSent!);
            },
            openTelegramLink: (url: string) => window.__opened!.push(url),
          },
        },
      });
    },
    [initData, version] as const,
  );
  return initData;
}
