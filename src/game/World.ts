import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { sfx } from '../audio';
import { BOSS, COMBO, DIFFICULTY_TIME, ENEMY, ENEMY_BULLET_R, ENEMY_FIRST_SHOT, PLAYER, POWER_UP, SPAWN, WEAPON_PATTERNS, type PowerUpKind } from './balance';
import type { Textures } from './textures';

/**
 * Игровой мир. Обычный TypeScript-класс без React:
 * объектов на экране сотни и они меняются каждый кадр, поэтому
 * гонять их через state React было бы медленно. React только
 * запускает мир, передаёт ему ввод и показывает HUD по событиям.
 */

export type EnemyKind = 'scout' | 'saucer' | 'mother' | 'kamikaze' | 'shielder' | 'splitter' | 'mini';
export type UpdateMode = 'run' | 'idle' | 'frozen';

export interface WorldEvents {
  score(n: number): void;
  lives(n: number): void;
  weapon(n: number): void;
  /** Множитель очков за врагов (1 — комбо нет). */
  combo(multiplier: number): void;
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
  /** Камикадзе: 0 — заходит на позицию, 1 — целится, 2 — таранит. */
  phase: number;
  timer: number;
  stopY: number;
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
interface Popup {
  s: Text;
  life: number;
}
interface PowerUp {
  s: Sprite;
  kind: PowerUpKind;
  t: number;
}
interface Star {
  s: Sprite;
  speed: number;
}

const ENEMY_COLOR: Record<EnemyKind, number> = {
  scout: 0x7cf27c,
  saucer: 0x7fd8ff,
  mother: 0xc77dff,
  kamikaze: 0xff5a3c,
  shielder: 0xf2c14e,
  splitter: 0xff8fd8,
  mini: 0xff8fd8,
};
const KAMIKAZE_AIM_TINT = 0xffff66; // мигание перед тараном
const DEFLECT_COLOR = 0xdfe6f2; // искры от щита щитоносца

const POWER_UP_COLOR: Record<PowerUpKind, number> = {
  gun: 0xffd23f,
  life: 0xff4d8d,
  shield: 0x5fd4ff,
  magnet: 0xff6b6b,
  bomb: 0xff9f1c,
};
/** Подпись при подборе: для пушки и жизни хватает HUD, остальные стоит назвать. */
const POWER_UP_LABEL: Partial<Record<PowerUpKind, string>> = {
  shield: 'ЩИТ',
  magnet: 'МАГНИТ',
  bomb: 'БОМБА',
};
const DROP_KINDS = Object.keys(POWER_UP.drops) as PowerUpKind[];
const MAGNET_BLINK_TIME = 2; // последние секунды магнита кольцо мигает
const BOMB_FLASH = 0.35; // сек, белая вспышка на весь экран
const BOMB_SHAKE = 18;

const POPUP_LIFE = 0.8; // сек
const POPUP_RISE = 60; // px/сек
const POPUP_BONUS_COLOR = 0xffffff;
const BOSS_WARN_SHAKE = 3; // сила тряски экрана во время предупреждения

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randIn = ([a, b]: readonly [number, number]) => rand(a, b);
const difficulty = (elapsed: number) => 1 + elapsed / DIFFICULTY_TIME;
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

/**
 * Пул спрайтов для частых объектов (пули, искры): вместо создания и уничтожения
 * Sprite на каждый выстрел спрятанные спрайты переиспользуются — меньше работы
 * сборщику мусора и меньше подтормаживаний на слабых телефонах.
 */
class SpritePool {
  private free: Sprite[] = [];
  private texture: Texture;
  private layer: Container;

  constructor(texture: Texture, layer: Container) {
    this.texture = texture;
    this.layer = layer;
  }

  get(): Sprite {
    let s = this.free.pop();
    if (!s) {
      s = new Sprite(this.texture);
      s.anchor.set(0.5);
      this.layer.addChild(s);
    }
    s.visible = true;
    s.alpha = 1;
    s.rotation = 0;
    s.scale.set(1);
    s.tint = 0xffffff;
    return s;
  }

  release(s: Sprite) {
    s.visible = false;
    this.free.push(s);
  }
}

/** Как removeAt, но спрайт не уничтожается, а возвращается в пул. */
function releaseAt<T extends { s: Sprite }>(arr: T[], i: number, pool: SpritePool) {
  pool.release(arr[i].s);
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
  private shieldBubble: Sprite;
  private magnetRing: Sprite;
  private bombFlash = new Graphics();
  private warnText: Text;

  private bulletPool: SpritePool;
  private enemyBulletPool: SpritePool;
  private sparkPool: SpritePool;

  private stars: Star[] = [];
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private particles: Particle[] = [];
  private powerUps: PowerUp[] = [];
  private popups: Popup[] = [];

  private w = 0;
  private h = 0;
  private starsPlaced = false;

  private score = 0;
  private lives: number = PLAYER.startLives;
  private weapon = 1;
  private combo = 0; // врагов сбито подряд без урона
  private elapsed = 0;
  private spawnCd = 0;
  private fireCd = 0;
  private invuln = 0;
  private shake = 0;
  private alive = false;
  private deathTimer = 0;
  private bossWarn = 0;
  private shield = false;
  private magnet = 0; // сколько ещё действует магнит
  private flash = 0; // остаток вспышки от бомбы

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

    this.bulletPool = new SpritePool(textures.bullet, this.bulletLayer);
    this.enemyBulletPool = new SpritePool(textures.enemyBullet, this.fxLayer);
    this.sparkPool = new SpritePool(textures.spark, this.fxLayer);

    this.warnText = new Text({
      text: 'ВНИМАНИЕ!\nФЛАГМАН',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 28,
        fontWeight: '900',
        align: 'center',
        fill: 0xff4d6d,
        stroke: { color: 0x000000, width: 5 },
      },
    });
    this.warnText.anchor.set(0.5);
    this.warnText.visible = false;
    this.root.addChild(this.warnText);

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
    this.shieldBubble = new Sprite(textures.shieldBubble);
    this.shieldBubble.anchor.set(0.5);
    this.magnetRing = new Sprite(textures.magnetRing);
    this.magnetRing.anchor.set(0.5);
    this.shieldBubble.visible = false;
    this.magnetRing.visible = false;
    this.player.addChild(this.flame, body, this.magnetRing, this.shieldBubble);
    this.player.visible = false;
    this.playerLayer.addChild(this.player);

    this.bombFlash.visible = false;
    this.root.addChild(this.bombFlash);
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
    for (const e of this.enemies) e.bar?.destroy();
    for (const list of [this.enemies, this.powerUps, this.popups]) {
      while (list.length) removeAt(list as { s: Container }[], list.length - 1);
    }
    while (this.bullets.length) releaseAt(this.bullets, this.bullets.length - 1, this.bulletPool);
    while (this.enemyBullets.length) releaseAt(this.enemyBullets, this.enemyBullets.length - 1, this.enemyBulletPool);
    while (this.particles.length) releaseAt(this.particles, this.particles.length - 1, this.sparkPool);
    this.alive = false;
    this.deathTimer = 0;
    this.setShield(false);
    this.magnet = 0;
    this.magnetRing.visible = false;
    this.flash = 0;
    this.bombFlash.visible = false;
    this.cancelBossWarning();
    this.player.visible = false;
    this.root.position.set(0, 0);
  }

  /** Новая игра. */
  reset() {
    this.clear();
    this.score = 0;
    this.lives = PLAYER.startLives;
    this.weapon = 1;
    this.combo = 0;
    this.elapsed = 0;
    this.spawnCd = SPAWN.firstDelay;
    this.fireCd = PLAYER.firstShotDelay;
    this.invuln = PLAYER.startInvuln;
    this.shake = 0;
    this.alive = true;
    this.player.visible = true;
    this.player.position.set(this.w / 2, this.h - 120);
    this.ev.score(0);
    this.ev.lives(this.lives);
    this.ev.weapon(this.weapon);
    this.ev.combo(1);
  }

  /** Перемещение пальцем: самолёт двигается на столько же, на сколько палец. */
  dragBy(dx: number, dy: number) {
    if (!this.alive) return;
    this.player.x += dx * PLAYER.dragFactor;
    this.player.y += dy * PLAYER.dragFactor;
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
    const diff = difficulty(this.elapsed); // плавный рост сложности

    if (this.alive) {
      this.updatePlayer(dt);
      this.spawnCd -= dt;
      if (this.spawnCd <= 0) {
        this.spawnWave();
        const bossOnField = this.enemies.some((e) => e.kind === 'mother');
        this.spawnCd =
          Math.max(SPAWN.minInterval, SPAWN.baseInterval - this.elapsed * SPAWN.intervalDecay) *
          randIn(SPAWN.jitter) *
          (bossOnField ? SPAWN.bossSlowdown : 1);
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
    this.updatePopups(dt);
    this.updateBossWarning(dt);
    this.updateBombFlash(dt);
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
    const sp = PLAYER.keySpeed * dt;
    if (k.has('ArrowLeft') || k.has('KeyA')) this.player.x -= sp;
    if (k.has('ArrowRight') || k.has('KeyD')) this.player.x += sp;
    if (k.has('ArrowUp') || k.has('KeyW')) this.player.y -= sp;
    if (k.has('ArrowDown') || k.has('KeyS')) this.player.y += sp;
    this.clampPlayer();

    this.flame.scale.set(rand(0.85, 1.1), rand(0.7, 1.35));

    if (this.magnet > 0) {
      this.magnet -= dt;
      this.magnetRing.rotation += dt * 1.5;
      this.magnetRing.visible = this.magnet > MAGNET_BLINK_TIME || Math.floor(this.magnet * 8) % 2 === 0;
      if (this.magnet <= 0) this.magnetRing.visible = false;
    }
    if (this.shield) this.shieldBubble.scale.set(1 + Math.sin(this.elapsed * 6) * 0.04);

    if (this.invuln > 0) {
      this.invuln -= dt;
      this.player.alpha = Math.floor(this.invuln * 12) % 2 ? 0.3 : 1;
    } else {
      this.player.alpha = 1;
    }

    this.fireCd -= dt;
    if (this.fireCd <= 0) {
      this.fire();
      this.fireCd = PLAYER.fireInterval;
    }
  }

  private fire() {
    const { x, y } = this.player;
    const pattern = WEAPON_PATTERNS[this.weapon];
    sfx.shoot();
    for (const [dx, vx] of pattern) {
      const s = this.bulletPool.get();
      s.position.set(x + dx, y - 30);
      s.rotation = Math.atan2(vx, PLAYER.bulletSpeed);
      this.bullets.push({ s, vx, vy: -PLAYER.bulletSpeed, r: PLAYER.bulletR });
    }
  }

  private setShield(on: boolean) {
    this.shield = on;
    this.shieldBubble.visible = on;
  }

  private damagePlayer() {
    const { x, y } = this.player;
    if (this.shield) {
      // щит принимает удар: жизнь, пушка и комбо остаются
      this.setShield(false);
      this.invuln = POWER_UP.shieldBreakInvuln;
      this.shake = 6;
      sfx.shieldBreak();
      this.explode(x, y, POWER_UP_COLOR.shield, 20, 260);
      return;
    }
    this.lives--;
    this.ev.lives(this.lives);
    if (this.combo > 0) {
      this.combo = 0;
      this.ev.combo(1);
    }
    this.ev.hit();
    this.shake = 12;
    sfx.damage();
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
      sfx.explosion(true);
    } else {
      this.invuln = PLAYER.hitInvuln;
    }
  }

  // ───────────── враги ─────────────

  private spawnWave() {
    const t = this.elapsed;
    const bossOnField = this.enemies.some((e) => e.kind === 'mother');
    if (t > BOSS.after && !bossOnField && this.bossWarn <= 0 && Math.random() < BOSS.chance) {
      this.bossWarn = BOSS.warnTime;
    } else if (Math.random() < Math.min(SPAWN.saucerChanceMax, SPAWN.saucerChance + t / SPAWN.saucerChanceTime)) {
      this.spawn('saucer');
    } else if (t > SPAWN.shielderAfter && Math.random() < SPAWN.shielderChance) {
      this.spawn('shielder');
    } else if (t > SPAWN.kamikazeAfter && Math.random() < SPAWN.kamikazeChance) {
      this.spawn('kamikaze');
    } else if (t > SPAWN.splitterAfter && Math.random() < SPAWN.splitterChance) {
      this.spawn('splitter');
    } else if (t > SPAWN.wedgeAfter && Math.random() < SPAWN.wedgeChance) {
      // клин из трёх разведчиков
      const x = rand(70, this.w - 70);
      this.spawn('scout', x);
      this.spawn('scout', x - 32, 34);
      this.spawn('scout', x + 32, 34);
    } else {
      this.spawn('scout');
    }
  }

  private cancelBossWarning() {
    this.bossWarn = 0;
    this.warnText.visible = false;
  }

  /** Надпись и тряска, затем появляется босс. */
  private updateBossWarning(dt: number) {
    if (this.bossWarn <= 0) return;
    if (!this.alive) {
      this.cancelBossWarning();
      return;
    }
    this.bossWarn -= dt;
    if (this.bossWarn <= 0) {
      this.cancelBossWarning();
      this.spawn('mother', this.w / 2);
      return;
    }
    this.warnText.visible = true;
    this.warnText.position.set(this.w / 2, this.h * 0.3);
    this.warnText.alpha = Math.floor(this.bossWarn * 5) % 2 ? 0.25 : 1;
    this.shake = Math.max(this.shake, BOSS_WARN_SHAKE);
  }

  private spawn(kind: EnemyKind, x?: number, yOffset = 0): Enemy {
    const cfg = ENEMY[kind];
    const { mother, saucer } = ENEMY;
    const diff = difficulty(this.elapsed);
    const hp = kind === 'mother' ? mother.hp + Math.floor(this.elapsed / mother.hpGrowthEvery) * mother.hpGrowth : cfg.hp;
    const amp = kind === 'saucer' ? rand(saucer.amp[0], Math.min(saucer.amp[1], this.w / 4)) : 0;
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
      vy: kind === 'mother' ? mother.speed : randIn(ENEMY[kind].speed) * diff,
      baseX: ex,
      amp,
      t: rand(0, 6),
      fireCd: kind === 'mother' ? mother.firstShot : randIn(ENEMY_FIRST_SHOT),
      flash: 0,
      phase: 0,
      timer: 0,
      stopY: kind === 'kamikaze' ? randIn(ENEMY.kamikaze.stopAt) * this.h : 0,
    };
    if (kind === 'mother') {
      e.bar = new Graphics();
      this.fxLayer.addChild(e.bar);
      this.drawBar(e);
    }
    this.enemies.push(e);
    return e;
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
        const { turnAccel, maxVx } = ENEMY.scout;
        if (this.alive) e.vx = clamp(e.vx + Math.sign(this.player.x - s.x) * turnAccel * dt, -maxVx, maxVx);
        s.x += e.vx * dt;
        s.y += e.vy * dt;
        s.rotation = e.vx / 600;
      } else if (e.kind === 'saucer') {
        s.y += e.vy * dt;
        s.x = e.baseX + Math.sin(e.t * 2.2) * e.amp;
      } else if (e.kind === 'mother') {
        const targetY = this.h * 0.12 + 40;
        if (s.y < targetY) s.y += e.vy * dt;
        s.x = this.w / 2 + Math.sin(e.t * 0.7) * (this.w / 2 - 60);
      } else if (e.kind === 'kamikaze') {
        this.updateKamikaze(e, dt);
      } else if (e.kind === 'shielder') {
        // медленно сдвигается под игрока, прикрываясь щитом
        s.y += e.vy * dt;
        if (this.alive) {
          const step = ENEMY.shielder.trackSpeed * dt;
          s.x += clamp(this.player.x - s.x, -step, step);
        }
      } else if (e.kind === 'splitter') {
        s.y += e.vy * dt;
      } else {
        // осколок сплиттера: разлетается в стороны и отскакивает от краёв
        e.vx *= Math.exp(-1.5 * dt);
        s.x += e.vx * dt;
        s.y += e.vy * dt;
        if ((s.x < e.r && e.vx < 0) || (s.x > this.w - e.r && e.vx > 0)) e.vx = -e.vx;
      }

      const shoots = e.kind === 'mother' || (e.kind === 'saucer' && this.elapsed > ENEMY.saucer.shootsAfter);
      if (this.alive && shoots && s.y > 0) {
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          if (e.kind === 'saucer') {
            const { saucer } = ENEMY;
            this.enemyShoot(s.x, s.y + 14, 0, saucer.bulletSpeed + this.elapsed);
            e.fireCd = randIn(saucer.fireInterval) / diff;
          } else {
            const { mother } = ENEMY;
            for (const a of mother.spread) this.enemyShoot(s.x, s.y + 24, a, mother.bulletSpeed);
            e.fireCd = mother.fireInterval;
          }
        }
      }

      e.flash = Math.max(0, e.flash - dt);
      s.tint = e.flash > 0 ? 0xff7777 : 0xffffff;
      if (e.kind === 'kamikaze' && e.phase === 1 && Math.floor(e.timer * 12) % 2) s.tint = KAMIKAZE_AIM_TINT;
      e.bar?.position.set(s.x, s.y - e.r - 10);

      if (s.y > this.h + e.r + 20 || s.x < -120 || s.x > this.w + 120) {
        e.bar?.destroy();
        removeAt(this.enemies, i);
      }
    }
  }

  private updateKamikaze(e: Enemy, dt: number) {
    const s = e.s;
    const cfg = ENEMY.kamikaze;
    if (e.phase === 0) {
      s.y += e.vy * dt;
      if (s.y >= e.stopY) {
        e.phase = 1;
        e.timer = cfg.aimTime;
      }
    } else if (e.phase === 1) {
      // зависает и доворачивает нос на игрока — время увернуться
      e.timer -= dt;
      const dx = this.alive ? this.player.x - s.x : 0;
      const dy = this.alive ? this.player.y - s.y : 1;
      s.rotation = Math.atan2(dy, dx) - Math.PI / 2;
      if (e.timer <= 0) {
        e.phase = 2;
        const d = Math.hypot(dx, dy) || 1;
        e.vx = dx / d;
        e.vy = dy / d;
        e.timer = 0; // дальше timer — текущая скорость
      }
    } else {
      e.timer = Math.min(cfg.dashMaxSpeed, e.timer + cfg.dashAccel * dt);
      s.x += e.vx * e.timer * dt;
      s.y += e.vy * e.timer * dt;
    }
  }

  private deflect(x: number, y: number) {
    this.explode(x, y, DEFLECT_COLOR, 3, 140);
    sfx.deflect();
  }

  private damageEnemy(e: Enemy, x: number, y: number) {
    e.hp--;
    e.flash = 0.07;
    this.explode(x, y, 0xffd23f, 4, 120);
    this.drawBar(e);
    if (e.hp > 0) sfx.hit();
    else this.destroyEnemy(e, true);
  }

  private destroyEnemy(e: Enemy, byPlayer: boolean) {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    const { x, y } = e.s;
    const cfg = ENEMY[e.kind];
    const color = ENEMY_COLOR[e.kind];
    const big = e.kind === 'mother';
    this.explode(x, y, color, big ? 60 : e.r >= 20 ? 24 : 14, big ? 380 : 230);
    this.explode(x, y, 0xffffff, big ? 20 : 6, big ? 200 : 120);
    if (big) this.shake = 14;
    sfx.explosion(big);
    e.bar?.destroy();
    removeAt(this.enemies, i);

    if (!byPlayer) return;
    if (e.kind === 'splitter') {
      for (const side of [-1, 1]) {
        const m = this.spawn('mini');
        m.s.position.set(x + side * 10, y);
        m.vx = side * ENEMY.mini.splitVx;
      }
    }

    const mult = this.comboMultiplier();
    this.combo++;
    const nextMult = this.comboMultiplier();
    if (nextMult !== mult) this.ev.combo(nextMult);

    const points = cfg.points * mult;
    this.score += points;
    this.ev.score(this.score);
    this.ev.kill(e.kind);
    this.spawnPopup(x, y - e.r, `+${points}`, color);

    if (big) {
      this.spawnPowerUp(x, y, this.lives < PLAYER.maxLives && Math.random() < POWER_UP.bossLifeChance ? 'life' : 'gun');
      return;
    }
    let r = Math.random();
    for (const kind of DROP_KINDS) {
      r -= POWER_UP.drops[kind];
      if (r < 0) {
        this.spawnPowerUp(x, y, kind);
        break;
      }
    }
  }

  private comboMultiplier() {
    return Math.min(COMBO.maxMultiplier, 1 + Math.floor(this.combo / COMBO.killsPerStep));
  }

  private enemyShoot(x: number, y: number, angleOffset: number, speed: number) {
    const angle = this.alive
      ? Math.atan2(this.player.y - y, this.player.x - x) + angleOffset
      : Math.PI / 2 + angleOffset;
    const s = this.enemyBulletPool.get();
    s.position.set(x, y);
    this.enemyBullets.push({ s, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: ENEMY_BULLET_R });
  }

  // ───────────── снаряды, бонусы, частицы ─────────────

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      if (b.s.y < -30) releaseAt(this.bullets, i, this.bulletPool);
    }
  }

  private updateEnemyBullets(dt: number) {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      const { x, y } = b.s;
      if (y > this.h + 20 || y < -40 || x < -20 || x > this.w + 20) releaseAt(this.enemyBullets, i, this.enemyBulletPool);
    }
  }

  private spawnPowerUp(x: number, y: number, kind: PowerUpKind) {
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
      if (this.magnet > 0 && this.alive) {
        // магнит тянет бонусы к самолёту
        const dx = this.player.x - p.s.x;
        const dy = this.player.y - p.s.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, POWER_UP.magnetSpeed * dt);
        p.s.x += (dx / d) * step;
        p.s.y += (dy / d) * step;
      } else {
        p.s.y += POWER_UP.fallSpeed * dt;
      }
      p.s.scale.set(1 + Math.sin(p.t * 7) * 0.12);
      if (p.kind === 'gun') p.s.rotation += dt * 2;
      if (p.s.y > this.h + 30) removeAt(this.powerUps, i);
    }
  }

  /** Бомба: сбивает всех врагов на экране, ранит босса и стирает вражеские пули. */
  private detonateBomb() {
    for (const e of [...this.enemies]) {
      if (e.s.y < -e.r) continue; // ещё не вылетел на экран
      if (e.kind === 'mother') {
        e.hp -= POWER_UP.bombBossDamage;
        e.flash = 0.2;
        this.drawBar(e);
        if (e.hp <= 0) this.destroyEnemy(e, true);
      } else {
        this.destroyEnemy(e, true);
      }
    }
    // осколки сплиттеров, появившиеся от взрыва
    for (const e of [...this.enemies]) if (e.kind === 'mini') this.destroyEnemy(e, true);
    for (const b of this.enemyBullets) this.explode(b.s.x, b.s.y, 0xff3d6e, 2, 80);
    while (this.enemyBullets.length) releaseAt(this.enemyBullets, this.enemyBullets.length - 1, this.enemyBulletPool);
    this.flash = BOMB_FLASH;
    this.shake = Math.max(this.shake, BOMB_SHAKE);
    sfx.explosion(true);
  }

  private updateBombFlash(dt: number) {
    if (this.flash <= 0) return;
    this.flash -= dt;
    // рисуем с запасом за края, чтобы тряска не открывала полосы
    this.bombFlash
      .clear()
      .rect(-40, -40, this.w + 80, this.h + 80)
      .fill({ color: 0xffffff, alpha: Math.max(0, this.flash / BOMB_FLASH) * 0.6 });
    this.bombFlash.visible = this.flash > 0;
  }

  private explode(x: number, y: number, color: number, count: number, speed: number) {
    for (let n = 0; n < count; n++) {
      const s = this.sparkPool.get();
      s.blendMode = 'add';
      s.tint = Math.random() < 0.25 ? 0xffffff : color;
      s.position.set(x, y);
      s.scale.set(rand(0.5, 1.6));
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
      if (p.life <= 0) releaseAt(this.particles, i, this.sparkPool);
    }
  }

  private spawnPopup(x: number, y: number, text: string, color: number) {
    const s = new Text({
      text,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 20,
        fontWeight: '800',
        fill: color,
        stroke: { color: 0x000000, width: 4 },
      },
    });
    s.anchor.set(0.5);
    s.position.set(clamp(x, 30, this.w - 30), y);
    this.fxLayer.addChild(s);
    this.popups.push({ s, life: POPUP_LIFE });
  }

  private updatePopups(dt: number) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.s.y -= POPUP_RISE * dt;
      const k = p.life / POPUP_LIFE;
      p.s.alpha = Math.min(1, k * 2.5);
      p.s.scale.set(1 + Math.max(0, k - 0.8) * 2); // короткий «выпрыг» в начале
      if (p.life <= 0) removeAt(this.popups, i);
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
          releaseAt(this.bullets, i, this.bulletPool);
          // щитоносец неуязвим снизу по центру — бить надо по краям
          const blocked = e.kind === 'shielder' && y > e.s.y && Math.abs(x - e.s.x) < ENEMY.shielder.plateHalf;
          if (blocked) this.deflect(x, y);
          else this.damageEnemy(e, x, y);
          break;
        }
      }
    }

    if (!this.alive) return;
    const vulnerable = this.invuln <= 0;

    // пули врагов → игрок
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      if (vulnerable && near(this.enemyBullets[i].s, this.player, PLAYER.r + 4)) {
        releaseAt(this.enemyBullets, i, this.enemyBulletPool);
        this.damagePlayer();
        return;
      }
    }

    // таран
    for (const e of this.enemies) {
      if (vulnerable && near(e.s, this.player, e.r * 0.8 + PLAYER.r)) {
        if (e.kind !== 'mother') this.destroyEnemy(e, false);
        this.damagePlayer();
        return;
      }
    }

    // бонусы
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      if (!near(p.s, this.player, PLAYER.pickupR)) continue;
      const { x, y } = p.s;
      const kind = p.kind;
      // убираем до применения: бомба может породить новые бонусы
      removeAt(this.powerUps, i);
      this.score += POWER_UP.points;
      this.ev.score(this.score);
      if (kind === 'gun') {
        this.weapon = Math.min(PLAYER.maxWeapon, this.weapon + 1);
        this.ev.weapon(this.weapon);
      } else if (kind === 'life') {
        this.lives = Math.min(PLAYER.maxLives, this.lives + 1);
        this.ev.lives(this.lives);
      } else if (kind === 'shield') {
        this.setShield(true);
      } else if (kind === 'magnet') {
        this.magnet = POWER_UP.magnetTime;
        this.magnetRing.visible = true;
      } else {
        this.detonateBomb();
      }
      const label = POWER_UP_LABEL[kind];
      this.spawnPopup(x, y - 20, label ? `${label} +${POWER_UP.points}` : `+${POWER_UP.points}`, POPUP_BONUS_COLOR);
      this.ev.powerUp();
      sfx.powerUp();
      this.explode(x, y, POWER_UP_COLOR[kind], 12, 160);
    }
  }
}
