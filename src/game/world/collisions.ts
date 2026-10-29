import { ENEMY, PLAYER, type EnemyKind } from '../balance';
import type { Enemies, Enemy } from './Enemies';
import type { Field } from './Field';
import type { Pickups } from './Pickups';
import type { Player } from './Player';
import type { Projectiles } from './Projectiles';
import { beamTop, inBeam, near, shieldBlocks } from './rules';

/** Что попало в игрока: пуля, ракета босса или враг, который протаранил (его вид). */
export type HitCause = 'bullet' | 'missile' | EnemyKind;

/**
 * Что нужно столкновениям от мира: сами объекты и реакции на касания.
 * Здесь только «что с чем столкнулось», а последствия (очки, урон, бонусы) решает World.
 */
export interface Battle {
  readonly field: Field;
  readonly player: Player;
  readonly shots: Projectiles;
  readonly enemies: Enemies;
  readonly pickups: Pickups;
  /** Пуля игрока попала во врага в точке (x, y). */
  damageEnemy(e: Enemy, x: number, y: number, damage: number): void;
  /** Пуля отлетела от щита щитоносца. */
  deflect(x: number, y: number): void;
  destroyEnemy(e: Enemy, byPlayer: boolean): void;
  damagePlayer(cause: HitCause): void;
  /** Подобрать монету i (до вызова coinsPicked может быть несколько). */
  pickCoin(i: number): void;
  coinsPicked(): void;
  pickPowerUp(i: number): void;
}

export function collide(b: Battle) {
  const { shots, enemies, pickups, player } = b;

  // пули игрока → враги
  for (let i = shots.bullets.length - 1; i >= 0; i--) {
    const bullet = shots.bullets[i];
    for (const e of enemies.list) {
      if (!near(bullet.s, e.s, bullet.r + e.r)) continue;
      const { x, y } = bullet.s;
      const { damage, homing } = bullet;
      shots.removeBullet(i);
      // ракета заходит сбоку — щит её не держит
      if (e.kind === 'shielder' && !homing && shieldBlocks({ x, y }, e.s)) b.deflect(x, y);
      else b.damageEnemy(e, x, y, damage);
      break;
    }
  }

  // пули игрока → самонаводящиеся снаряды
  for (let i = shots.bullets.length - 1; i >= 0; i--) {
    const bullet = shots.bullets[i];
    const j = shots.missiles.findIndex((m) => near(bullet.s, m.s, bullet.r + ENEMY.mother.homing.r));
    if (j < 0) continue;
    shots.removeBullet(i);
    shots.destroyMissile(j);
  }

  beamHits(b);

  if (!b.field.alive) return;
  const pos = player.view;
  // после попадания — неуязвимость; одно попадание за кадр
  if (player.invuln <= 0) {
    // пули врагов → игрок
    for (let i = shots.enemyBullets.length - 1; i >= 0; i--) {
      if (near(shots.enemyBullets[i].s, pos, PLAYER.r + 4)) {
        shots.removeEnemyBullet(i);
        b.damagePlayer('bullet');
        return;
      }
    }

    // самонаводящиеся снаряды → игрок
    for (let i = shots.missiles.length - 1; i >= 0; i--) {
      if (near(shots.missiles[i].s, pos, PLAYER.r + ENEMY.mother.homing.r)) {
        shots.destroyMissile(i);
        b.damagePlayer('missile');
        return;
      }
    }

    // таран (босс от тарана не погибает)
    for (const e of enemies.list) {
      if (near(e.s, pos, e.r * 0.8 + PLAYER.r)) {
        if (e.kind !== 'mother') b.destroyEnemy(e, false);
        b.damagePlayer(e.kind);
        return;
      }
    }
  }

  // монеты
  let picked = false;
  for (let i = pickups.coins.length - 1; i >= 0; i--) {
    if (!near(pickups.coins[i].s, pos, PLAYER.pickupR)) continue;
    b.pickCoin(i);
    picked = true;
  }
  if (picked) b.coinsPicked();

  // бонусы
  for (let i = pickups.powerUps.length - 1; i >= 0; i--) {
    if (near(pickups.powerUps[i].s, pos, PLAYER.pickupR)) b.pickPowerUp(i);
  }
}

/** Луч лазера → всё на линии до щита щитоносца: урон раз в тик, ракеты босса сгорают сразу. */
function beamHits(b: Battle) {
  const { shots, enemies } = b;
  const beam = shots.beam;
  if (!beam) return;
  const shielders = enemies.list.filter((e) => e.kind === 'shielder').map((e) => e.s);
  beam.top = beamTop(beam.x, beam.bottom, shielders, beam.top);

  for (let i = shots.missiles.length - 1; i >= 0; i--) {
    if (inBeam(beam, shots.missiles[i].s, ENEMY.mother.homing.r)) shots.destroyMissile(i);
  }

  const damage = shots.beamDamage;
  if (damage <= 0) return;
  shots.beamDamage = 0;
  // копия списка: сбитый сплиттер добавляет осколки, а их этот тик задеть не должен
  for (const e of [...enemies.list]) {
    if (!inBeam(beam, e.s, e.r)) continue;
    const y = Math.min(beam.bottom, e.s.y + e.r);
    if (e.kind === 'shielder' && shieldBlocks({ x: beam.x, y: beam.bottom }, e.s)) b.deflect(beam.x, beam.top);
    else b.damageEnemy(e, beam.x, y, damage);
  }
}
