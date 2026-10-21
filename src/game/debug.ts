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
}

export interface DebugSnapshot {
  w: number;
  h: number;
  alive: boolean;
  score: number;
  lives: number;
  weapon: number;
  combo: number;
  invuln: number;
  shield: boolean;
  magnet: number;
  player: { x: number; y: number };
  enemies: DebugEnemy[];
  powerUps: DebugObject[];
  enemyBullets: number;
}

export interface WorldDebug {
  snapshot(): DebugSnapshot;
  /** Включить или выключить случайное появление врагов. */
  setAutoSpawn(on: boolean): void;
  spawnEnemy(kind: string, x: number, y: number): void;
  spawnPowerUp(kind: string, x: number, y: number): void;
  movePlayer(x: number, y: number): void;
}

declare global {
  interface Window {
    __world?: WorldDebug;
  }
}
