import { Container, Graphics, Sprite } from 'pixi.js';
import type { Textures } from './textures';

/**
 * Игровой мир. Обычный TypeScript-класс без React:
 * объектов на экране сотни и они меняются каждый кадр, поэтому
 * гонять их через state React было бы медленно. React только
 * запускает мир, передаёт ему ввод и показывает HUD по событиям.
 */

export type EnemyKind = 'scout' | 'saucer' | 'mother';
export type UpdateMode = 'run' | 'idle' | 'frozen';

export interface WorldEvents {
  score(n: number): void;
  lives(n: number): void;
  weapon(n: number): void;
  hit(): void;
  kill(kind: EnemyKind): void;
  powerUp(): void;
  gameOver(score: number): void;
}

interface Enemy {
  s: Sprite;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  r: number;
  vx: number;
  vy: number;
  baseX: number;
  amp: number;
  t: number;
  fireCd: number;
  flash: number;
  bar?: Graphics;
}
interface Bullet {
  s: Sprite;
  vx: number;
  vy: number;
  r: number;
}
interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
}
interface PowerUp {
  s: Sprite;
  kind: 'gun' | 'life';
  t: number;
}
interface Star {
  s: Sprite;
  speed: number;
}

const ENEMY = {
  scout: { hp: 1, r: 16, points: 10, color: 0x7cf27c },
  saucer: { hp: 3, r: 24, points: 25, color: 0x7fd8ff },
  mother: { hp: 18, r: 44, points: 150, color: 0xc77dff },
} as const;

const START_LIVES = 3;
const MAX_LIVES = 5;
const MAX_WEAPON = 3;
const PLAYER_R = 16;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const near = (a: Container, b: Container, d: number) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < d * d;
};

/** Быстрое удаление из массива без сдвига (порядок не важен). */
function removeAt<T extends { s: Container }>(arr: T[], i: number) {
  arr[i].s.destroy();
  arr[i] = arr[arr.length - 1];
  arr.pop();
}

export class World {
  readonly root = new Container();
  readonly keys = new Set<string>();

  private tx: Textures;
  private ev: WorldEvents;

  // Слои отрисовки (снизу вверх)
  private starLayer = new Container();
  private bulletLayer = new Container();
  private enemyLayer = new Container();
  private itemLayer = new Container();
  private playerLayer = new Container();
  private fxLayer = new Container();

  private player = new Container();
  private flame: Sprite;

  private stars: Star[] = [];
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private particles: Particle[] = [];
  private powerUps: PowerUp[] = [];

  private w = 0;
  private h = 0;
  private starsPlaced = false;

  private score = 0;
  private lives = START_LIVES;
  private weapon = 1;
  private elapsed = 0;
  private spawnCd = 0;
  private fireCd = 0;
  private invuln = 0;
  private shake = 0;
  private alive = false;
  private deathTimer = 0;

  constructor(textures: Textures, events: WorldEvents) {
    this.tx = textures;
    this.ev = events;
    this.root.addChild(
      this.starLayer,
      this.bulletLayer,
      this.enemyLayer,
      this.itemLayer,
      this.playerLayer,
      this.fxLayer,
    );

    for (let i = 0; i < 90; i++) {
      const depth = Math.random();
      const s = new Sprite(textures.star);
      s.anchor.set(0.5);
      s.alpha = 0.15 + depth * 0.85;
      s.scale.set(0.35 + depth * 0.9);
      this.starLayer.addChild(s);
      this.stars.push({ s, speed: 12 + depth * 120 });
    }

    this.flame = new Sprite(textures.flame);
    this.flame.anchor.set(0.5, 0);
    this.flame.y = 24;
    const body = new Sprite(textures.plane);
    body.anchor.set(0.5);
    this.player.addChild(this.flame, body);
    this.player.visible = false;
    this.playerLayer.addChild(this.player);
  }

  // ───────────── управление снаружи ─────────────

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (!this.starsPlaced) {
      for (const st of this.stars) st.s.position.set(Math.random() * w, Math.random() * h);
      this.starsPlaced = true;
    }
    if (this.alive) this.clampPlayer();
  }

  /** Убрать всё с поля (для главного меню). */
  clear() {
    for (const list of [this.enemies, this.bullets, this.enemyBullets, this.particles, this.powerUps]) {
      while (list.length) removeAt(list as { s: Container }[], list.length - 1);
    }
    for (const c of this.fxLayer.removeChildren()) c.destroy();
    this.alive = false;
    this.deathTimer = 0;
    this.player.visible = false;
    this.root.position.set(0, 0);
  }

  /** Новая игра. */
  reset() {
    this.clear();
    this.score = 0;
    this.lives = START_LIVES;
    this.weapon = 1;
    this.elapsed = 0;
    this.spawnCd = 1;
    this.fireCd = 0.3;
    this.invuln = 1.2;
    this.shake = 0;
    this.alive = true;
    this.player.visible = true;
    this.player.position.set(this.w / 2, this.h - 120);
    this.ev.score(0);
    this.ev.lives(this.lives);
    this.ev.weapon(this.weapon);
  }

  /** Перемещение пальцем: самолёт двигается на столько же, на сколько палец. */
  dragBy(dx: number, dy: number) {
    if (!this.alive) return;
    this.player.x += dx * 1.25;
    this.player.y += dy * 1.25;
    this.clampPlayer();
  }

  update(dtMs: number, mode: UpdateMode) {
    if (mode === 'frozen') return;
    const dt = Math.min(dtMs, 50) / 1000;

    const starSpeed = mode === 'run' ? 1 : 0.6;
    for (const st of this.stars) {
      st.s.y += st.speed * starSpeed * dt;
      if (st.s.y > this.h + 4) {
        st.s.y = -4;
        st.s.x = Math.random() * this.w;
      }
    }
    if (mode === 'idle') return;

    this.elapsed += dt;
    const diff = 1 + this.elapsed / 100; // плавный рост сложности

    if (this.alive) {
      this.updatePlayer(dt);
      this.spawnCd -= dt;
      if (this.spawnCd <= 0) {
        this.spawnWave();
        const bossOnField = this.enemies.some((e) => e.kind === 'mother');
        this.spawnCd = Math.max(0.28, 1 - this.elapsed * 0.01) * rand(0.7, 1.3) * (bossOnField ? 1.8 : 1);
      }
    } else if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.ev.gameOver(this.score);
    }

    this.updateBullets(dt);
    this.updateEnemies(dt, diff);
    this.updateEnemyBullets(dt);
    this.updatePowerUps(dt);
    this.updateParticles(dt);
    this.collide();

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 40);
      this.root.position.set(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
    } else {
      this.root.position.set(0, 0);
    }
  }

  // ───────────── игрок ─────────────

  private clampPlayer() {
    this.player.x = clamp(this.player.x, 26, this.w - 26);
    this.player.y = clamp(this.player.y, this.h * 0.3, this.h - 50);
  }

  private updatePlayer(dt: number) {
    const k = this.keys;
    const sp = 460 * dt;
    if (k.has('ArrowLeft') || k.has('KeyA')) this.player.x -= sp;
    if (k.has('ArrowRight') || k.has('KeyD')) this.player.x += sp;
    if (k.has('ArrowUp') || k.has('KeyW')) this.player.y -= sp;
    if (k.has('ArrowDown') || k.has('KeyS')) this.player.y += sp;
    this.clampPlayer();

    this.flame.scale.set(rand(0.85, 1.1), rand(0.7, 1.35));

    if (this.invuln > 0) {
      this.invuln -= dt;
      this.player.alpha = Math.floor(this.invuln * 12) % 2 ? 0.3 : 1;
    } else {
      this.player.alpha = 1;
    }

    this.fireCd -= dt;
    if (this.fireCd <= 0) {
      this.fire();
      this.fireCd = 0.15;
    }
  }

  private fire() {
    const { x, y } = this.player;
    // [смещение по x, скорость по x]
    const pattern: [number, number][] =
      this.weapon === 1
        ? [[0, 0]]
        : this.weapon === 2
          ? [[-9, 0], [9, 0]]
          : [[0, 0], [-12, -150], [12, 150]];
    for (const [dx, vx] of pattern) {
      const s = new Sprite(this.tx.bullet);
      s.anchor.set(0.5);
      s.position.set(x + dx, y - 30);
      s.rotation = Math.atan2(vx, 760);
      this.bulletLayer.addChild(s);
      this.bullets.push({ s, vx, vy: -760, r: 6 });
    }
  }

  private damagePlayer() {
    const { x, y } = this.player;
    this.lives--;
    this.ev.lives(this.lives);
    this.ev.hit();
    this.shake = 12;
    this.explode(x, y, 0xffb020, 18, 240);
    if (this.weapon > 1) {
      this.weapon--;
      this.ev.weapon(this.weapon);
    }
    if (this.lives <= 0) {
      this.alive = false;
      this.player.visible = false;
      this.explode(x, y, 0xff6b3d, 50, 400);
      this.explode(x, y, 0xffffff, 20, 200);
      this.shake = 22;
      this.deathTimer = 1.3;
    } else {
      this.invuln = 1.8;
    }
  }

  // ───────────── враги ─────────────

  private spawnWave() {
    const t = this.elapsed;
    const bossOnField = this.enemies.some((e) => e.kind === 'mother');
    if (t > 30 && !bossOnField && Math.random() < 0.06) {
      this.spawn('mother', this.w / 2);
    } else if (Math.random() < Math.min(0.45, 0.12 + t / 150)) {
      this.spawn('saucer');
    } else if (t > 8 && Math.random() < 0.25) {
      // клин из трёх разведчиков
      const x = rand(70, this.w - 70);
      this.spawn('scout', x);
      this.spawn('scout', x - 32, 34);
      this.spawn('scout', x + 32, 34);
    } else {
      this.spawn('scout');
    }
  }

  private spawn(kind: EnemyKind, x?: number, yOffset = 0) {
    const cfg = ENEMY[kind];
    const diff = 1 + this.elapsed / 100;
    const hp = kind === 'mother' ? cfg.hp + Math.floor(this.elapsed / 30) * 4 : cfg.hp;
    const amp = kind === 'saucer' ? rand(30, Math.min(90, this.w / 4)) : 0;
    let ex = x ?? rand(cfg.r + 10, this.w - cfg.r - 10);
    if (kind === 'saucer') ex = clamp(ex, cfg.r + amp, this.w - cfg.r - amp);

    const s = new Sprite(this.tx[kind]);
    s.anchor.set(0.5);
    s.position.set(ex, -cfg.r - 10 - yOffset);
    this.enemyLayer.addChild(s);

    const e: Enemy = {
      s,
      kind,
      hp,
      maxHp: hp,
      r: cfg.r,
      vx: 0,
      vy: kind === 'scout' ? rand(170, 230) * diff : kind === 'saucer' ? rand(80, 110) * diff : 60,
      baseX: ex,
      amp,
      t: rand(0, 6),
      fireCd: kind === 'mother' ? 1.5 : rand(1.2, 3),
      flash: 0,
    };
    if (kind === 'mother') {
      e.bar = new Graphics();
      this.fxLayer.addChild(e.bar);
      this.drawBar(e);
    }
    this.enemies.push(e);
  }

  private drawBar(e: Enemy) {
    if (!e.bar) return;
    const w = 76;
    e.bar
      .clear()
      .roundRect(-w / 2, 0, w, 6, 3)
      .fill({ color: 0x000000, alpha: 0.5 })
      .roundRect(-w / 2, 0, Math.max(0, (w * e.hp) / e.maxHp), 6, 3)
      .fill(0xff4d6d);
  }

  private updateEnemies(dt: number, diff: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const s = e.s;
      e.t += dt;

      if (e.kind === 'scout') {
        // разведчики слегка доворачивают на игрока
        if (this.alive) e.vx = clamp(e.vx + Math.sign(this.player.x - s.x) * 90 * dt, -90, 90);
        s.x += e.vx * dt;
        s.y += e.vy * dt;
        s.rotation = e.vx / 600;
      } else if (e.kind === 'saucer') {
        s.y += e.vy * dt;
        s.x = e.baseX + Math.sin(e.t * 2.2) * e.amp;
      } else {
        const targetY = this.h * 0.12 + 40;
        if (s.y < targetY) s.y += e.vy * dt;
        s.x = this.w / 2 + Math.sin(e.t * 0.7) * (this.w / 2 - 60);
      }

      const shoots = e.kind === 'mother' || (e.kind === 'saucer' && this.elapsed > 15);
      if (this.alive && shoots && s.y > 0) {
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          if (e.kind === 'saucer') {
            this.enemyShoot(s.x, s.y + 14, 0, 220 + this.elapsed);
            e.fireCd = rand(2, 3.5) / diff;
          } else {
            for (const a of [-0.35, 0, 0.35]) this.enemyShoot(s.x, s.y + 24, a, 210);
            e.fireCd = 1.2;
          }
        }
      }

      e.flash = Math.max(0, e.flash - dt);
      s.tint = e.flash > 0 ? 0xff7777 : 0xffffff;
      e.bar?.position.set(s.x, s.y - e.r - 10);

      if (s.y > this.h + e.r + 20 || s.x < -120 || s.x > this.w + 120) {
        e.bar?.destroy();
        removeAt(this.enemies, i);
      }
    }
  }

  private damageEnemy(e: Enemy, x: number, y: number) {
    e.hp--;
    e.flash = 0.07;
    this.explode(x, y, 0xffd23f, 4, 120);
    this.drawBar(e);
    if (e.hp <= 0) this.destroyEnemy(e, true);
  }

  private destroyEnemy(e: Enemy, byPlayer: boolean) {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    const { x, y } = e.s;
    const cfg = ENEMY[e.kind];
    const big = e.kind === 'mother';
    this.explode(x, y, cfg.color, big ? 60 : e.kind === 'saucer' ? 24 : 14, big ? 380 : 230);
    this.explode(x, y, 0xffffff, big ? 20 : 6, big ? 200 : 120);
    if (big) this.shake = 14;
    e.bar?.destroy();
    removeAt(this.enemies, i);

    if (!byPlayer) return;
    this.score += cfg.points;
    this.ev.score(this.score);
    this.ev.kill(e.kind);

    const r = Math.random();
    if (big) this.spawnPowerUp(x, y, this.lives < MAX_LIVES && r < 0.5 ? 'life' : 'gun');
    else if (r < 0.06) this.spawnPowerUp(x, y, 'gun');
    else if (r < 0.09) this.spawnPowerUp(x, y, 'life');
  }

  private enemyShoot(x: number, y: number, angleOffset: number, speed: number) {
    const angle = this.alive
      ? Math.atan2(this.player.y - y, this.player.x - x) + angleOffset
      : Math.PI / 2 + angleOffset;
    const s = new Sprite(this.tx.enemyBullet);
    s.anchor.set(0.5);
    s.position.set(x, y);
    this.fxLayer.addChild(s);
    this.enemyBullets.push({ s, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 5 });
  }

  // ───────────── снаряды, бонусы, частицы ─────────────

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      if (b.s.y < -30) removeAt(this.bullets, i);
    }
  }

  private updateEnemyBullets(dt: number) {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      const { x, y } = b.s;
      if (y > this.h + 20 || y < -40 || x < -20 || x > this.w + 20) removeAt(this.enemyBullets, i);
    }
  }

  private spawnPowerUp(x: number, y: number, kind: 'gun' | 'life') {
    const s = new Sprite(this.tx[kind]);
    s.anchor.set(0.5);
    s.position.set(x, y);
    this.itemLayer.addChild(s);
    this.powerUps.push({ s, kind, t: 0 });
  }

  private updatePowerUps(dt: number) {
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.t += dt;
      p.s.y += 110 * dt;
      p.s.scale.set(1 + Math.sin(p.t * 7) * 0.12);
      if (p.kind === 'gun') p.s.rotation += dt * 2;
      if (p.s.y > this.h + 30) removeAt(this.powerUps, i);
    }
  }

  private explode(x: number, y: number, color: number, count: number, speed: number) {
    for (let n = 0; n < count; n++) {
      const s = new Sprite(this.tx.spark);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = Math.random() < 0.25 ? 0xffffff : color;
      s.position.set(x, y);
      s.scale.set(rand(0.5, 1.6));
      this.fxLayer.addChild(s);
      const a = rand(0, Math.PI * 2);
      const v = rand(0.2, 1) * speed;
      const life = rand(0.35, 0.85);
      this.particles.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life });
    }
  }

  private updateParticles(dt: number) {
    const damp = Math.exp(-3 * dt);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.vx *= damp;
      p.vy *= damp;
      p.life -= dt;
      p.s.alpha = Math.max(0, p.life / p.max);
      if (p.life <= 0) removeAt(this.particles, i);
    }
  }

  // ───────────── столкновения ─────────────

  private collide() {
    // пули игрока → враги
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      for (const e of this.enemies) {
        if (near(b.s, e.s, b.r + e.r)) {
          const { x, y } = b.s;
          removeAt(this.bullets, i);
          this.damageEnemy(e, x, y);
          break;
        }
      }
    }

    if (!this.alive) return;
    const vulnerable = this.invuln <= 0;

    // пули врагов → игрок
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      if (vulnerable && near(this.enemyBullets[i].s, this.player, PLAYER_R + 4)) {
        removeAt(this.enemyBullets, i);
        this.damagePlayer();
        return;
      }
    }

    // таран
    for (const e of this.enemies) {
      if (vulnerable && near(e.s, this.player, e.r * 0.8 + PLAYER_R)) {
        if (e.kind !== 'mother') this.destroyEnemy(e, false);
        this.damagePlayer();
        return;
      }
    }

    // бонусы
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      if (!near(p.s, this.player, 32)) continue;
      if (p.kind === 'gun') {
        this.weapon = Math.min(MAX_WEAPON, this.weapon + 1);
        this.ev.weapon(this.weapon);
      } else {
        this.lives = Math.min(MAX_LIVES, this.lives + 1);
        this.ev.lives(this.lives);
      }
      this.score += 50;
      this.ev.score(this.score);
      this.ev.powerUp();
      this.explode(p.s.x, p.s.y, p.kind === 'gun' ? 0xffd23f : 0xff4d8d, 12, 160);
      removeAt(this.powerUps, i);
    }
  }
}
