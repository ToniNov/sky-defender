/**
 * Отладочный доступ к игровому миру для e2e-тестов (Playwright).
 * Есть только в dev-сборке: `window.__world`. В прод-сборку не попадает.
 * Файл без импортов, чтобы тесты могли брать отсюда типы.
 */

export interface DebugObject {
  kind: string;
  x: number;
  y: number;
}

export interface DebugEnemy extends DebugObject {
  hp: number;
  /** У босса — текущая или ближайшая атака. */
  attack?: string;
}

export interface DebugSnapshot {
  w: number;
  h: number;
  alive: boolean;
  score: number;
  /** Монет собрано за партию. */
  coins: number;
  /** Уровни улучшений из ангара в этой партии. */
  upgrades: Record<string, number>;
  fireInterval: number;
  skin: string;
  wave: number;
  lives: number;
  weapon: number;
  combo: number;
  invuln: number;
  shield: boolean;
  magnet: number;
  player: { x: number; y: number };
  enemies: DebugEnemy[];
  powerUps: DebugObject[];
  coinsOnField: DebugObject[];
  missiles: DebugObject[];
  enemyBullets: number;
  /** Пуль игрока на поле. */
  playerBullets: number;
}

export interface WorldDebug {
  snapshot(): DebugSnapshot;
  /** Включить или выключить случайное появление врагов. */
  setAutoSpawn(on: boolean): void;
  /** Сразу начать волну n (и включить спавн). */
  startWave(n: number): void;
  /** Выпустить одно построение из waves.ts. */
  spawnFormation(name: string): void;
  spawnEnemy(kind: string, x: number, y: number): void;
  spawnPowerUp(kind: string, x: number, y: number): void;
  spawnCoin(x: number, y: number): void;
  /** Самонаводящийся снаряд босса, летит вниз. */
  spawnMissile(x: number, y: number): void;
  movePlayer(x: number, y: number): void;
  /** Читы для тестов: игрок не получает урон / не стреляет. Сбрасываются при новой игре. */
  setCheats(cheats: { noDamage?: boolean; holdFire?: boolean }): void;
  /** Сразу сбить самолёт: партия закончится, как от последнего попадания. cause — чем сбит (HitCause), по умолчанию пулей. */
  crash(cause?: string): void;
}

declare global {
  interface Window {
    __world?: WorldDebug;
  }
}
