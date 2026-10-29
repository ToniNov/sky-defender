import { Sprite, type Container } from 'pixi.js';
import { sfx } from '../../audio';
import { ENEMY, ENEMY_BULLET_R, PLAYER, WEAPONS } from '../balance';
import type { Textures } from '../textures';
import type { Effects } from './Effects';
import type { Field } from './Field';
import type { Player } from './Player';
import { releaseAll, releaseAt, removeAt, SpritePool } from './pool';
import { turnToward, type Beam } from './rules';

const MISSILE_COLOR = 0x7fffd4;
const BOMB_BULLET_COLOR = 0xff3d6e; // искры от вражеских пуль, стёртых бомбой
const BEAM_FLICKER = 0.15; // луч дрожит по ширине на столько
const BEAM_GLOW = 2; // свечение шире луча, которым бьёт лазер, во столько раз
const BEAM_FROM_NOSE = 28; // луч начинается от носа самолёта
const BEAM_OFF_SCREEN = -40; // без препятствий луч уходит за верх экрана

export interface Bullet {
  s: Sprite;
  vx: number;
  vy: number;
  r: number;
}
export interface PlayerBullet extends Bullet {
  damage: number;
}
export interface Missile {
  s: Sprite;
  vx: number;
  vy: number;
  homing: number; // сколько ещё доворачивает на игрока
}

/** Снаряды: пули и луч игрока, пули врагов и самонаводящиеся ракеты босса. */
export class Projectiles {
  readonly bullets: PlayerBullet[] = [];
  /** Луч лазера, пока он включён; top обновляют столкновения (луч упирается в щит). */
  beam: Beam | null = null;
  /** Урон луча, накопленный с прошлой проверки столкновений. */
  beamDamage = 0;
  readonly enemyBullets: Bullet[] = [];
  readonly missiles: Missile[] = [];

  private bulletPool: SpritePool;
  private enemyBulletPool: SpritePool;
  private tx: Textures;
  private missileLayer: Container;
  private field: Field;
  private player: Player;
  private fx: Effects;
  private beamSprite: Sprite;

  constructor(textures: Textures, bulletLayer: Container, fxLayer: Container, field: Field, player: Player, fx: Effects) {
    this.tx = textures;
    this.missileLayer = fxLayer;
    this.field = field;
    this.player = player;
    this.fx = fx;
    this.bulletPool = new SpritePool(textures.bullet, bulletLayer);
    this.enemyBulletPool = new SpritePool(textures.enemyBullet, fxLayer);
    this.beamSprite = new Sprite(textures.beam);
    this.beamSprite.anchor.set(0.5, 1);
    this.beamSprite.visible = false;
    bulletLayer.addChild(this.beamSprite);
  }

  /** Залп игрока: узор, скорость и урон пуль — от вида и уровня оружия. У лазера — тик урона луча. */
  firePlayer() {
    const { x, y, weapon } = this.player;
    const spec = WEAPONS[weapon.kind];
    if ('beam' in spec) {
      this.beamDamage += spec.beam[weapon.level - 1].dps * spec.interval;
      return;
    }
    const { patterns, bulletSpeed, damage } = spec;
    sfx.shoot();
    for (const [dx, vx] of patterns[weapon.level - 1]) {
      const s = this.bulletPool.get();
      s.position.set(x + dx, y - 30);
      s.rotation = Math.atan2(vx, bulletSpeed);
      this.bullets.push({ s, vx, vy: -bulletSpeed, r: PLAYER.bulletR, damage });
    }
  }

  /** Вражеский выстрел в игрока (со смещением угла); если игрока нет — вниз. */
  shootAtPlayer(x: number, y: number, angleOffset: number, speed: number) {
    const angle = this.field.alive
      ? Math.atan2(this.player.y - y, this.player.x - x) + angleOffset
      : Math.PI / 2 + angleOffset;
    this.shootAt(x, y, angle, speed);
  }

  /** Вражеский выстрел под заданным углом (0 — вправо, π/2 — вниз). */
  shootAt(x: number, y: number, angle: number, speed: number) {
    const s = this.enemyBulletPool.get();
    s.position.set(x, y);
    this.enemyBullets.push({ s, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: ENEMY_BULLET_R });
  }

  spawnMissile(x: number, y: number, angle: number) {
    const { speed, homingTime } = ENEMY.mother.homing;
    const s = new Sprite(this.tx.missile);
    s.anchor.set(0.5);
    s.position.set(x, y);
    this.missileLayer.addChild(s);
    this.missiles.push({ s, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, homing: homingTime });
  }

  /** Луч лазера: включён, пока в руках лазер и on (самолёт жив и стреляет). Идёт за самолётом. */
  updateBeam(on: boolean) {
    const { x, y, weapon } = this.player;
    const spec = WEAPONS[weapon.kind];
    if (!on || !('beam' in spec)) {
      this.hideBeam();
      return;
    }
    const half = spec.beam[weapon.level - 1].width / 2;
    const bottom = y - BEAM_FROM_NOSE;
    const top = this.beam?.top ?? BEAM_OFF_SCREEN;
    this.beam = { x, half, bottom, top: BEAM_OFF_SCREEN };
    // рисуем до прошлого препятствия: столкновения этого кадра обновят top для следующего
    const s = this.beamSprite;
    s.visible = true;
    s.position.set(x, bottom);
    s.width = half * 2 * BEAM_GLOW * (1 + (Math.random() - 0.5) * BEAM_FLICKER);
    s.height = Math.max(0, bottom - top);
  }

  private hideBeam() {
    this.beam = null;
    this.beamDamage = 0;
    this.beamSprite.visible = false;
  }

  removeBullet(i: number) {
    releaseAt(this.bullets, i, this.bulletPool);
  }

  removeEnemyBullet(i: number) {
    releaseAt(this.enemyBullets, i, this.enemyBulletPool);
  }

  /** Сбить ракету (пулей, тараном или бомбой) — с искрами и звуком. */
  destroyMissile(i: number) {
    const { x, y } = this.missiles[i].s;
    this.fx.explode(x, y, MISSILE_COLOR, 10, 180);
    sfx.hit();
    removeAt(this.missiles, i);
  }

  /** Бомба: стереть все вражеские пули и ракеты. */
  clearEnemyFire() {
    for (const b of this.enemyBullets) this.fx.explode(b.s.x, b.s.y, BOMB_BULLET_COLOR, 2, 80);
    releaseAll(this.enemyBullets, this.enemyBulletPool);
    while (this.missiles.length) this.destroyMissile(this.missiles.length - 1);
  }

  updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      if (b.s.y < -30) this.removeBullet(i);
    }
  }

  /** Вражеские пули и ракеты — после врагов, чтобы только что выпущенные сразу полетели. */
  updateEnemyFire(dt: number) {
    const { w, h } = this.field;
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      const { x, y } = b.s;
      if (y > h + 20 || y < -40 || x < -20 || x > w + 20) this.removeEnemyBullet(i);
    }

    const { speed, turnRate } = ENEMY.mother.homing;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      let angle = Math.atan2(m.vy, m.vx);
      if (m.homing > 0 && this.field.alive) {
        m.homing -= dt;
        angle = turnToward(angle, Math.atan2(this.player.y - m.s.y, this.player.x - m.s.x), turnRate * dt);
        m.vx = Math.cos(angle) * speed;
        m.vy = Math.sin(angle) * speed;
      }
      m.s.x += m.vx * dt;
      m.s.y += m.vy * dt;
      m.s.rotation = angle - Math.PI / 2;
      const { x, y } = m.s;
      if (y > h + 30 || y < -60 || x < -30 || x > w + 30) removeAt(this.missiles, i);
    }
  }

  clear() {
    this.hideBeam();
    releaseAll(this.bullets, this.bulletPool);
    releaseAll(this.enemyBullets, this.enemyBulletPool);
    while (this.missiles.length) removeAt(this.missiles, this.missiles.length - 1);
  }
}
