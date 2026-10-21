import { Sprite, type Container } from 'pixi.js';
import { COINS, POWER_UP, type PowerUpKind } from '../balance';
import type { Textures } from '../textures';
import type { Field } from './Field';
import type { Player } from './Player';
import { releaseAll, releaseAt, removeAt, SpritePool } from './pool';

const COIN_DRAG = 3; // разлёт монет босса гаснет за ~1/3 с

export interface PowerUp {
  s: Sprite;
  kind: PowerUpKind;
  t: number;
}
export interface Coin {
  s: Sprite;
  vx: number;
  vy: number;
  t: number;
}

/** То, что падает с врагов и подбирается касанием: бонусы и монеты. Магнит тянет и то и другое. */
export class Pickups {
  readonly powerUps: PowerUp[] = [];
  readonly coins: Coin[] = [];

  private tx: Textures;
  private layer: Container;
  private coinPool: SpritePool;
  private field: Field;
  private player: Player;

  constructor(textures: Textures, layer: Container, field: Field, player: Player) {
    this.tx = textures;
    this.layer = layer;
    this.field = field;
    this.player = player;
    this.coinPool = new SpritePool(textures.coin, layer);
  }

  spawnPowerUp(x: number, y: number, kind: PowerUpKind) {
    const s = new Sprite(this.tx[kind]);
    s.anchor.set(0.5);
    s.position.set(x, y);
    this.layer.addChild(s);
    this.powerUps.push({ s, kind, t: 0 });
  }

  spawnCoin(x: number, y: number, vx = 0, vy = 0) {
    const s = this.coinPool.get();
    s.position.set(x, y);
    this.coins.push({ s, vx, vy, t: Math.random() * 6 });
  }

  removePowerUp(i: number) {
    removeAt(this.powerUps, i);
  }

  removeCoin(i: number) {
    releaseAt(this.coins, i, this.coinPool);
  }

  update(dt: number) {
    const magnet = this.player.magnet > 0 && this.field.alive;
    const { h } = this.field;

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.t += dt;
      if (magnet) this.pull(p.s, dt);
      else p.s.y += POWER_UP.fallSpeed * dt;
      p.s.scale.set(1 + Math.sin(p.t * 7) * 0.12);
      if (p.kind === 'gun') p.s.rotation += dt * 2;
      if (p.s.y > h + 30) this.removePowerUp(i);
    }

    const drag = Math.exp(-COIN_DRAG * dt);
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      if (magnet) {
        this.pull(c.s, dt);
      } else {
        c.vx *= drag;
        c.vy *= drag;
        c.s.x += c.vx * dt;
        c.s.y += (c.vy + COINS.fallSpeed) * dt;
      }
      c.s.scale.x = Math.cos(c.t * 6); // монета вращается
      if (c.s.y > h + 20) this.removeCoin(i);
    }
  }

  /** Магнит: тянет предмет к самолёту. */
  private pull(s: Sprite, dt: number) {
    const dx = this.player.x - s.x;
    const dy = this.player.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = Math.min(d, POWER_UP.magnetSpeed * dt);
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
  }

  clear() {
    while (this.powerUps.length) this.removePowerUp(this.powerUps.length - 1);
    releaseAll(this.coins, this.coinPool);
  }
}
