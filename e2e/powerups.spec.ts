import { expect, test } from '@playwright/test';
import { POWER_UP } from '../src/game/balance.ts';
import { pickUp, snapshot, spawnEnemy, spawnPowerUp, startGame } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await startGame(page);
});

test('капсула того же оружия и жизнь', async ({ page }) => {
  await pickUp(page, 'weapon');
  await pickUp(page, 'life');
  const s = await snapshot(page);
  expect(s.weapon).toEqual({ kind: 'gun', level: 2 });
  expect(s.lives).toBe(4);
});

test('капсула другого вида меняет оружие, уровень остаётся', async ({ page }) => {
  await pickUp(page, 'weapon');
  await pickUp(page, 'weapon', { weapon: 'spread' });
  expect((await snapshot(page)).weapon).toEqual({ kind: 'spread', level: 2 });
  await pickUp(page, 'weapon', { weapon: 'spread' });
  expect((await snapshot(page)).weapon).toEqual({ kind: 'spread', level: 3 });
});

test('HUD показывает вид оружия и уровень', async ({ page }) => {
  const badge = page.locator('.hud-weapon');
  await expect(badge).toHaveAttribute('aria-label', 'Оружие: пушка, уровень 1');
  await expect(badge.locator('.weapon-badge')).toHaveText('П');
  await pickUp(page, 'weapon', { weapon: 'laser' });
  await pickUp(page, 'weapon', { weapon: 'laser' });
  await expect(badge).toHaveAttribute('aria-label', 'Оружие: лазер, уровень 2');
  await expect(badge.locator('.weapon-badge')).toHaveText('Л');
  await expect(badge.locator('i.on')).toHaveCount(2);
});

test('вид в летящей капсуле меняется', async ({ page }) => {
  const { w } = await snapshot(page);
  await spawnPowerUp(page, 'weapon', w / 2, -200, { weapon: 'gun', cycles: true });
  const capsule = async () => (await snapshot(page)).powerUps.find((u) => u.kind === 'weapon')?.weapon;
  expect(await capsule()).toBe('gun');
  await expect.poll(capsule, { timeout: POWER_UP.weaponCycle * 1000 + 2000 }).toBe('spread');
});

test('веер стреляет широким конусом, пушка — прямо', async ({ page }) => {
  // самый дальний от самолёта по горизонтали полёт пули
  const spread = async () => {
    const { player, playerBulletPositions } = await snapshot(page);
    return Math.max(0, ...playerBulletPositions.map((b) => Math.abs(b.x - player.x)));
  };
  await page.waitForTimeout(500);
  expect(await spread()).toBeLessThan(5); // пушка первого уровня — одна пуля строго вверх

  await pickUp(page, 'weapon', { weapon: 'spread' });
  await expect.poll(spread).toBeGreaterThan(100);
  expect((await snapshot(page)).weapon).toEqual({ kind: 'spread', level: 1 });
});

test('урон снимает уровень оружия, но не вид', async ({ page }) => {
  await pickUp(page, 'weapon');
  const { player } = await snapshot(page);
  await spawnEnemy(page, 'scout', player.x, player.y);
  await expect.poll(async () => (await snapshot(page)).lives).toBe(2);
  expect((await snapshot(page)).weapon).toEqual({ kind: 'gun', level: 1 });
});

test('щит принимает таран вместо жизни', async ({ page }) => {
  await pickUp(page, 'shield');
  expect((await snapshot(page)).shield).toBe(true);

  const { player } = await snapshot(page);
  await spawnEnemy(page, 'scout', player.x, player.y);
  await expect.poll(async () => (await snapshot(page)).shield).toBe(false);
  expect((await snapshot(page)).lives).toBe(3);
});

test('без щита таран отнимает жизнь', async ({ page }) => {
  const { player } = await snapshot(page);
  await spawnEnemy(page, 'scout', player.x, player.y);
  await expect.poll(async () => (await snapshot(page)).lives).toBe(2);
});

test('магнит притягивает бонус с другого края экрана', async ({ page }) => {
  await pickUp(page, 'magnet');
  expect((await snapshot(page)).magnet).toBeGreaterThan(0);

  const { w } = await snapshot(page);
  await spawnPowerUp(page, 'weapon', w - 20, 60);
  await expect.poll(async () => (await snapshot(page)).weapon.level).toBe(2);
});

test('бомба сбивает врагов на экране и ранит босса', async ({ page }) => {
  const { w, player } = await snapshot(page);
  // враги в стороне от линии огня, чтобы их сбила именно бомба
  const x = player.x < w / 2 ? w - 40 : 40;
  await spawnEnemy(page, 'scout', x, 100);
  await spawnEnemy(page, 'saucer', x, 180);
  await spawnEnemy(page, 'mother', w / 2, 120);
  const bossHp = (await snapshot(page)).enemies.find((e) => e.kind === 'mother')!.hp;

  await pickUp(page, 'bomb');
  const s = await snapshot(page);
  expect(s.enemies.map((e) => e.kind)).toEqual(['mother']);
  expect(s.enemies[0].hp).toBeLessThan(bossHp);
  expect(s.enemyBullets).toBe(0);
});
