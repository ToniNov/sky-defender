import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_SKIN, SKIN_NAMES, SKINS } from '../src/game/balance.ts';
import { skinSvg } from '../src/game/skins.ts';
import { SAVE_VERSION } from '../src/progress.ts';

/** Открыть меню с сохранением (только при первом заходе — покупки переживают перезагрузку). */
async function openWithSave(page: Page, save: Record<string, unknown>, v = SAVE_VERSION) {
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript((json) => {
    if (!localStorage.getItem('progress')) localStorage.setItem('progress', json);
  }, JSON.stringify({ v, best: 0, coins: 0, t: 1, ...save }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();
}

async function openSkins(page: Page) {
  await page.getByRole('button', { name: 'Ангар' }).click();
  await page.getByRole('tab', { name: 'Скины' }).click();
}

/** Вылететь (закрыв ангар, если открыт) и узнать, в каком скине самолёт. */
async function launchedSkin(page: Page) {
  const done = page.getByRole('button', { name: 'Готово' });
  if (await done.isVisible()) await done.click();
  await page.getByRole('button', { name: 'Взлететь' }).click();
  await page.waitForFunction(() => window.__world?.snapshot().alive);
  return page.evaluate(() => window.__world!.snapshot().skin);
}

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('progress')!));

test('в рисунках скинов у polygon только целые координаты (иначе Pixi рисует криво)', () => {
  for (const skin of SKIN_NAMES) {
    for (const [, points] of skinSvg(skin).matchAll(/<polygon points="([^"]*)"/g)) {
      expect(points, `скин ${skin}`).toMatch(/^[\d, -]+$/);
    }
  }
});

test('новый игрок летает на классике', async ({ page }) => {
  await openWithSave(page, {});
  await openSkins(page);
  await expect(page.getByText('Выбран')).toHaveCount(1);
  expect(await launchedSkin(page)).toBe(DEFAULT_SKIN);
});

test('покупка скина списывает монеты, надевает его и переживает перезагрузку', async ({ page }) => {
  const cost = SKINS.delta.cost;
  await openWithSave(page, { coins: cost + 10 });
  await openSkins(page);
  await page.getByRole('button', { name: `Купить скин: Дельта за ${cost}` }).click();
  await expect(page.getByLabel('Монеты: 10').first()).toBeVisible();
  expect((await saved(page)).skins).toEqual({ owned: ['classic', 'delta'], selected: 'delta' });

  await page.reload();
  await openSkins(page);
  await expect(page.getByRole('button', { name: /Купить скин: Дельта/ })).toHaveCount(0);
  expect(await launchedSkin(page)).toBe('delta');
});

test('без монет скин не купить', async ({ page }) => {
  await openWithSave(page, { coins: SKINS.sunset.cost - 1 });
  await openSkins(page);
  await expect(page.getByRole('button', { name: /Купить скин: Закат/ })).toBeDisabled();
});

test('купленные скины переключаются бесплатно', async ({ page }) => {
  await openWithSave(page, { coins: 5, skins: { owned: ['classic', 'night'], selected: 'night' } });
  await openSkins(page);
  await page.getByRole('button', { name: 'Выбрать скин: Классика' }).click();
  await expect(page.getByRole('button', { name: 'Выбрать скин: Ночь' })).toBeVisible();
  expect(await saved(page)).toMatchObject({ coins: 5, skins: { selected: 'classic' } });
  expect(await launchedSkin(page)).toBe('classic');
});

test('нельзя выбрать некупленный скин подделкой сохранения', async ({ page }) => {
  await openWithSave(page, { skins: { owned: ['classic'], selected: 'stealth' } });
  expect(await launchedSkin(page)).toBe(DEFAULT_SKIN);
});

test('скины из новой версии игры не теряются', async ({ page }) => {
  await openWithSave(page, { coins: 500, skins: { owned: ['classic', 'ufo'], selected: 'ufo' } }, SAVE_VERSION + 1);
  await openSkins(page);
  await page.getByRole('button', { name: /Купить скин: Закат/ }).click();
  expect((await saved(page)).skins.owned).toEqual(['classic', 'sunset', 'ufo']);
});

test('сохранение версии 4 получает классический скин и сохраняет остальное', async ({ page }) => {
  await openWithSave(page, { best: 9, coins: 300, upgrades: { magnet: 1 } }, 4);
  await openSkins(page);
  await page.getByRole('button', { name: /Купить скин: Закат/ }).click();
  expect(await saved(page)).toMatchObject({
    v: SAVE_VERSION,
    best: 9,
    coins: 300 - SKINS.sunset.cost,
    upgrades: { magnet: 1 },
    skins: { owned: ['classic', 'sunset'], selected: 'sunset' },
  });
});
