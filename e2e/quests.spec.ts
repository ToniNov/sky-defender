import { expect, test, type Page } from '@playwright/test';
import { QUESTS } from '../src/game/balance.ts';
import { SAVE_VERSION } from '../src/progress.ts';
import { pickUp, setCheats, snapshot, spawnEnemy } from './helpers.ts';

type SavedQuest = { kind: string; tier: number; progress: number };

/** Открыть меню с сохранением (только при первом заходе — дальше живёт своё). */
async function openWithSave(page: Page, save: Record<string, unknown> | null) {
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (save) {
    await page.addInitScript((json) => {
      if (!localStorage.getItem('progress')) localStorage.setItem('progress', json);
    }, JSON.stringify({ v: 4, best: 0, coins: 0, t: 1, ...save }));
  }
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Взлететь' })).toBeVisible();
}

const quests = (...active: SavedQuest[]) => ({ quests: { active, done: {} } });

async function launch(page: Page) {
  await page.getByRole('button', { name: 'Взлететь' }).click();
  await page.waitForFunction(() => window.__world?.snapshot().alive);
  await page.evaluate(() => window.__world!.setAutoSpawn(false));
  await expect.poll(async () => (await snapshot(page)).invuln).toBe(0);
}

/** Поставить разведчика над самолётом и дождаться, пока его собьют. */
async function shootScout(page: Page) {
  const { player, score } = await snapshot(page);
  await spawnEnemy(page, 'scout', player.x, 80);
  await expect.poll(async () => (await snapshot(page)).score).toBeGreaterThan(score);
}

async function toMenu(page: Page) {
  await page.getByRole('button', { name: 'Пауза' }).click();
  await page.getByRole('button', { name: 'В меню' }).click();
}

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('progress')!));
const savedQuest = async (page: Page, kind: string): Promise<SavedQuest | undefined> =>
  (await saved(page)).quests.active.find((q: SavedQuest) => q.kind === kind);

test('новый игрок получает три первых задания', async ({ page }) => {
  await openWithSave(page, null);
  await page.getByRole('button', { name: 'Задания' }).click();
  await expect(page.getByRole('progressbar')).toHaveCount(QUESTS.active);
  await expect(page.getByText(`Сбей ${QUESTS.kinds.scout.target} разведчиков`)).toBeVisible();
  await expect(page.getByText(`Сбей ${QUESTS.kinds.saucer.target} тарелок`)).toBeVisible();
  await expect(page.getByText(`Сбей ${QUESTS.kinds.kamikaze.target} камикадзе`)).toBeVisible();
});

test('задание выполняется в бою, награду забирают в меню, на его место встаёт новое', async ({ page }) => {
  const target = QUESTS.kinds.scout.target;
  await openWithSave(
    page,
    quests(
      { kind: 'scout', tier: 0, progress: target - 2 },
      { kind: 'saucer', tier: 0, progress: 0 },
      { kind: 'kamikaze', tier: 0, progress: 0 },
    ),
  );
  await launch(page);
  await shootScout(page);
  await shootScout(page);
  await expect(page.getByRole('status')).toContainText(`Сбей ${target} разведчиков`);

  await toMenu(page);
  await expect(page.getByLabel('Готово к получению: 1')).toBeVisible();
  await page.getByRole('button', { name: /Задания/ }).click();
  await page.getByRole('button', { name: `Забрать награду: Сбей ${target} разведчиков` }).click();

  const s = await saved(page);
  expect(s.coins).toBe(QUESTS.kinds.scout.reward);
  expect(s.quests.done).toEqual({ scout: 1 });
  // на место разведчиков — следующий по порядку тип, которого ещё не было
  expect(s.quests.active.map((q: SavedQuest) => q.kind)).toEqual(['shielder', 'saucer', 'kamikaze']);
  await expect(page.getByLabel('Готово к получению: 1')).toHaveCount(0);
});

test('пауза не задваивает прогресс', async ({ page }) => {
  await openWithSave(page, quests({ kind: 'scout', tier: 0, progress: 0 }));
  await launch(page);
  await shootScout(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Пауза' }).click();
    await page.getByRole('button', { name: 'Продолжить' }).click();
  }
  await toMenu(page);
  expect((await savedQuest(page, 'scout'))?.progress).toBe(1);
});

test('задание на оружие считает только врагов, сбитых этим оружием', async ({ page }) => {
  const target = QUESTS.kinds.laserKills.target;
  await openWithSave(page, quests({ kind: 'laserKills', tier: 0, progress: target - 1 }));
  await launch(page);
  await setCheats(page, { noDamage: true });
  await shootScout(page); // пушкой — не в счёт: задание ещё не выполнено
  await page.getByRole('button', { name: 'Пауза' }).click();
  expect((await savedQuest(page, 'laserKills'))?.progress).toBe(target - 1);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await pickUp(page, 'weapon', { weapon: 'laser' });
  // пули пушки, выпущенные до смены, ещё летят — разведчика должен сбить именно луч
  await expect.poll(async () => (await snapshot(page)).playerBullets).toBe(0);
  await shootScout(page);
  await expect(page.getByRole('status')).toContainText(`Сбей ${target} врагов лазером`);
  await toMenu(page);
  expect((await savedQuest(page, 'laserKills'))?.progress).toBe(target);
});

test('задание «за партию» берёт лучший результат, а не сумму', async ({ page }) => {
  await openWithSave(page, quests({ kind: 'wave', tier: 0, progress: 3 }));
  await launch(page);
  await page.evaluate(() => window.__world!.startWave(4));
  await page.evaluate(() => window.__world!.setAutoSpawn(false));
  await toMenu(page);
  expect((await savedQuest(page, 'wave'))?.progress).toBe(4);
});

/** Сбить флагмана пушкой третьего уровня (игрок неуязвим); spawn — поставить нового, иначе добить того, что на поле. */
async function killBoss(page: Page, { spawn = true } = {}) {
  await setCheats(page, { noDamage: true, holdFire: false });
  await pickUp(page, 'weapon');
  await pickUp(page, 'weapon');
  const { player } = await snapshot(page);
  if (spawn) await spawnEnemy(page, 'mother', player.x, 120);
  await expect
    .poll(async () => (await snapshot(page)).enemies.some((e) => e.kind === 'mother'), { timeout: 20_000 })
    .toBe(false);
}

test('флагман без потери жизни засчитывается', async ({ page }) => {
  await openWithSave(page, quests({ kind: 'flawlessBoss', tier: 0, progress: 0 }, { kind: 'boss', tier: 0, progress: 0 }));
  await launch(page);
  await killBoss(page);
  await toMenu(page);
  expect((await savedQuest(page, 'flawlessBoss'))?.progress).toBe(1);
  expect((await savedQuest(page, 'boss'))?.progress).toBe(1);
});

test('если потерял жизнь при флагмане — не засчитывается', async ({ page }) => {
  await openWithSave(page, quests({ kind: 'flawlessBoss', tier: 0, progress: 0 }, { kind: 'boss', tier: 0, progress: 0 }));
  await launch(page);
  await setCheats(page, { holdFire: true });
  const { player } = await snapshot(page);
  await spawnEnemy(page, 'mother', player.x, 120);
  await spawnEnemy(page, 'scout', player.x, player.y); // таран
  await expect.poll(async () => (await snapshot(page)).lives).toBe(2);
  await killBoss(page, { spawn: false });
  await toMenu(page);
  expect((await savedQuest(page, 'flawlessBoss'))?.progress).toBe(0);
  expect((await savedQuest(page, 'boss'))?.progress).toBe(1);
});

test('сохранение версии 3 получает задания и сохраняет остальное', async ({ page }) => {
  await page.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(() => {
    if (!localStorage.getItem('progress'))
      localStorage.setItem('progress', JSON.stringify({ v: 3, best: 9, coins: 7, upgrades: { magnet: 1 }, t: 1 }));
  });
  await page.goto('/');
  await launch(page);
  await shootScout(page);
  await toMenu(page);
  const s = await saved(page);
  expect(s).toMatchObject({ v: SAVE_VERSION, best: expect.any(Number), coins: 7, upgrades: { magnet: 1 } });
  expect(s.quests.active).toHaveLength(QUESTS.active);
  expect(s.quests.active[0]).toEqual({ kind: 'scout', tier: 0, progress: 1 });
});
