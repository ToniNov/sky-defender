import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { sfx } from '../audio';
import {
  BOSS,
  COINS,
  COMBO,
  DIFFICULTY_TIME,
  ENEMY,
  ENEMY_BULLET_R,
  ENEMY_FIRST_SHOT,
  NO_UPGRADES,
  PLAYER,
  POWER_UP,
  UPGRADES,
  WAVES,
  WEAPON_PATTERNS,
  type PowerUpKind,
  type Upgrades,
} from './balance';
import type { WorldDebug } from './debug';
import type { Textures } from './textures';
import { BOSS_ESCORTS, FORMATIONS, planWave, type FormationName } from './waves';

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
  /** Монет собрано за партию. */
  coins(n: number): void;
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
  /** Камикадзе: 0 — заходит на позицию, 1 — целится, 2 — таранит. Босс: номер атаки по кругу. */
  phase: number;
  timer: number;
  stopY: number;
  shots: number; // босс: сколько пуль осталось в очереди
  inFormation: boolean; // разведчик в строю не доворачивает на игрока, иначе строй слипается
}
type BossAttack = 'fan' | 'burst' | 'homing';
interface Missile {
  s: Sprite;
  vx: number;
  vy: number;
  homing: number; // сколько ещё доворачивает на игрока
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
interface Coin {
  s: Sprite;
  vx: number;
  vy: number;
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
const BOSS_ATTACKS: readonly BossAttack[] = ['fan', 'burst', 'homing'];
/** Подсветка босса перед атакой — по цвету видно, что сейчас прилетит. */
const BOSS_WINDUP_TINT: Record<BossAttack, number> = {
  fan: 0xff8fa8,
  burst: 0xffe066,
  homing: 0x7fffd4,
};
const MISSILE_COLOR = 0x7fffd4;
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
const COIN_COLOR = 0xffd23f;
const COIN_DRAG = 3; // разлёт монет босса гаснет за ~1/3 с

const WAVE_TEXT_COLOR = 0xffe066;

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

const bossAttack = (e: Enemy) => BOSS_ATTACKS[e.phase % BOSS_ATTACKS.length];

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
  private waveText: Text;

  private bulletPool: SpritePool;
  private enemyBulletPool: SpritePool;
  private sparkPool: SpritePool;
  private coinPool: SpritePool;

  private stars: Star[] = [];
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private particles: Particle[] = [];
  private powerUps: PowerUp[] = [];
  private coins: Coin[] = [];
  private missiles: Missile[] = [];
  private popups: Popup[] = [];

  private w = 0;
  private h = 0;
  private starsPlaced = false;

  private score = 0;
  private coinCount = 0; // монет собрано за партию
  private upgrades: Upgrades = NO_UPGRADES; // из ангара, на всю партию
  private fireInterval: number = PLAYER.fireInterval;
  private magnetTime: number = POWER_UP.magnetTime;
  private lives: number = PLAYER.startLives;
  private weapon = 1;
  private combo = 0; // врагов сбито подряд без урона
  private elapsed = 0;
  private wave = 0;
  private waveQueue: FormationName[] = []; // построения, которые ещё не вылетели
  private waveTimer = 0; // до следующего построения (или конец ожидания пустого поля)
  private waveBanner = 0; // сколько ещё показывать «ВОЛНА N»
  private fireCd = 0;
  private invuln = 0;
  private shake = 0;
  private alive = false;
  private deathTimer = 0;
  private bossWarn = 0;
  private shield = false;
  private magnet = 0; // сколько ещё действует магнит
  private flash = 0; // остаток вспышки от бомбы
  private autoSpawn = true; // e2e-тесты выключают случайных врагов
  private cheats = { noDamage: false, holdFire: false }; // тоже только для тестов

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
    this.coinPool = new SpritePool(textures.coin, this.itemLayer);

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

    this.waveText = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 34,
        fontWeight: '900',
        fill: WAVE_TEXT_COLOR,
        stroke: { color: 0x000000, width: 6 },
      },
    });
    this.waveText.anchor.set(0.5);
    this.waveText.visible = false;
    this.root.addChild(this.waveText);

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
    for (const list of [this.enemies, this.powerUps, this.missiles, this.popups]) {
      while (list.length) removeAt(list as { s: Container }[], list.length - 1);
    }
    while (this.bullets.length) releaseAt(this.bullets, this.bullets.length - 1, this.bulletPool);
    while (this.enemyBullets.length) releaseAt(this.enemyBullets, this.enemyBullets.length - 1, this.enemyBulletPool);
    while (this.particles.length) releaseAt(this.particles, this.particles.length - 1, this.sparkPool);
    while (this.coins.length) releaseAt(this.coins, this.coins.length - 1, this.coinPool);
    this.alive = false;
    this.deathTimer = 0;
    this.setShield(false);
    this.magnet = 0;
    this.magnetRing.visible = false;
    this.flash = 0;
    this.bombFlash.visible = false;
    this.waveBanner = 0;
    this.waveText.visible = false;
    this.cancelBossWarning();
    this.player.visible = false;
    this.root.position.set(0, 0);
  }

  /** Новая игра с улучшениями из ангара. */
  reset(upgrades: Upgrades = NO_UPGRADES) {
    this.clear();
    this.upgrades = upgrades;
    this.fireInterval = PLAYER.fireInterval * (1 - UPGRADES.fireRate.intervalStep * upgrades.fireRate);
    this.magnetTime = POWER_UP.magnetTime + UPGRADES.magnet.timeStep * upgrades.magnet;
    this.score = 0;
    this.coinCount = 0;
    this.lives = Math.min(PLAYER.maxLives, PLAYER.startLives + upgrades.extraLife);
    this.weapon = Math.min(PLAYER.maxWeapon, 1 + upgrades.startWeapon);
    this.combo = 0;
    this.elapsed = 0;
    this.fireCd = PLAYER.firstShotDelay;
    this.invuln = PLAYER.startInvuln;
    this.shake = 0;
    this.alive = true;
    this.autoSpawn = true;
    this.cheats = { noDamage: false, holdFire: false };
    this.player.visible = true;
    this.player.position.set(this.w / 2, this.h - 120);
    this.ev.score(0);
    this.ev.lives(this.lives);
    this.ev.weapon(this.weapon);
    this.ev.combo(1);
    this.ev.coins(0);
    this.startWave(1);
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
      if (this.autoSpawn) this.updateWaves(dt);
    } else if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.ev.gameOver(this.score);
    }

    this.updateBullets(dt);
    this.updateEnemies(dt, diff);
    this.updateEnemyBullets(dt);
    this.updateMissiles(dt);
    this.updatePowerUps(dt);
    this.updateCoins(dt);
    this.updateParticles(dt);
    this.updatePopups(dt);
    this.updateBossWarning(dt);
    this.updateWaveBanner(dt);
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
    if (this.fireCd <= 0 && !this.cheats.holdFire) {
      this.fire();
      this.fireCd = this.fireInterval;
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
    if (this.cheats.noDamage) return;
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

  // ───────────── волны ─────────────

  private startWave(n: number) {
    this.wave = n;
    this.waveQueue = planWave(n);
    this.waveTimer = WAVES.introTime;
    this.waveBanner = WAVES.introTime;
    this.waveText.text = `ВОЛНА ${n}`;
  }

  /** Построения вылетают по очереди; когда все вылетели и поле опустело — следующая волна. */
  private updateWaves(dt: number) {
    this.waveTimer -= dt;
    if (this.waveQueue.length) {
      if (this.waveTimer > 0) return;
      this.spawnFormation(this.waveQueue.shift()!);
      this.waveTimer = this.waveQueue.length
        ? Math.max(WAVES.minGap, WAVES.gap - (this.wave - 1) * WAVES.gapDecay) * randIn(WAVES.jitter)
        : WAVES.maxClearWait;
      return;
    }

    const bossOnField = this.enemies.some((e) => e.kind === 'mother');
    if (bossOnField || this.bossWarn > 0) {
      // волна босса кончается только с его смертью, а пока подлетает сопровождение
      if (bossOnField && this.waveTimer <= 0) {
        this.spawnFormation(BOSS_ESCORTS[Math.floor(Math.random() * BOSS_ESCORTS.length)]);
        this.waveTimer = WAVES.bossEscortInterval;
      }
      return;
    }

    if (this.enemies.length === 0 || this.waveTimer <= 0) this.startWave(this.wave + 1);
  }

  private updateWaveBanner(dt: number) {
    if (this.waveBanner <= 0) return;
    this.waveBanner -= dt;
    const k = this.waveBanner / WAVES.introTime;
    this.waveText.visible = this.waveBanner > 0;
    this.waveText.position.set(this.w / 2, this.h * 0.4);
    this.waveText.alpha = Math.min(1, k * 3); // в конце плавно гаснет
    this.waveText.scale.set(1 + Math.max(0, k - 0.85) * 2); // и «выпрыгивает» в начале
  }

  /** Расставить построение над верхним краем экрана. */
  private spawnFormation(f: FormationName) {
    const w = this.w;
    // разведчики в построении летят с общей скоростью, иначе строй рассыпается сразу
    const scoutVy = randIn(ENEMY.scout.speed) * difficulty(this.elapsed);
    const scout = (x: number, yOffset = 0) => {
      const e = this.spawn('scout', x, yOffset);
      e.vy = scoutVy;
      e.inFormation = true;
      return e;
    };
    switch (f) {
      case 'boss':
        this.bossWarn = BOSS.warnTime;
        break;
      case 'scout':
        this.spawn('scout');
        break;
      case 'line':
        for (let i = 0; i < 5; i++) scout((w * (i + 1)) / 6);
        break;
      case 'wedge': {
        const x = rand(90, w - 90);
        scout(x);
        for (const side of [-1, 1]) {
          scout(x + side * 32, 34);
          scout(x + side * 64, 68);
        }
        break;
      }
      case 'snake': {
        // все с одной скоростью и по одной кривой — получается змейка
        const amp = Math.min(ENEMY.scout.snakeAmp, w / 4);
        const x = rand(amp + 20, w - amp - 20);
        for (let i = 0; i < 6; i++) {
          const e = scout(x, i * 44);
          e.baseX = x;
          e.amp = amp;
        }
        break;
      }
      case 'saucers':
        this.spawn('saucer', w / 3);
        this.spawn('saucer', (2 * w) / 3);
        break;
      case 'splitters':
        this.spawn('splitter', w * 0.3);
        this.spawn('splitter', w * 0.7, 40);
        break;
      case 'kamikazes':
        for (let i = 0; i < 3; i++) this.spawn('kamikaze', (w * (i + 1)) / 4, i * 30);
        break;
      case 'shielderGuard': {
        const x = rand(80, w - 80);
        this.spawn('shielder', x);
        scout(clamp(x - 50, 20, w - 20), 30);
        scout(clamp(x + 50, 20, w - 20), 30);
        break;
      }
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
      shots: 0,
      inFormation: false,
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

      if (e.kind === 'scout' && e.amp > 0) {
        // разведчик из змейки: x зависит от высоты, поэтому вся змейка идёт по одной кривой
        const { snakeWavelength } = ENEMY.scout;
        s.y += e.vy * dt;
        s.x = e.baseX + Math.sin(s.y / snakeWavelength) * e.amp;
        s.rotation = -Math.cos(s.y / snakeWavelength) * (e.amp / snakeWavelength) * 0.5;
      } else if (e.kind === 'scout') {
        // разведчики слегка доворачивают на игрока
        const { turnAccel, maxVx } = ENEMY.scout;
        if (this.alive && !e.inFormation) e.vx = clamp(e.vx + Math.sign(this.player.x - s.x) * turnAccel * dt, -maxVx, maxVx);
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

      if (this.alive && s.y > 0) {
        if (e.kind === 'saucer' && this.elapsed > ENEMY.saucer.shootsAfter) {
          e.fireCd -= dt;
          if (e.fireCd <= 0) {
            const { saucer } = ENEMY;
            this.enemyShoot(s.x, s.y + 14, 0, saucer.bulletSpeed + this.elapsed);
            e.fireCd = randIn(saucer.fireInterval) / diff;
          }
        } else if (e.kind === 'mother') {
          this.updateBossAttack(e, dt);
        }
      }

      e.flash = Math.max(0, e.flash - dt);
      s.tint = e.flash > 0 ? 0xff7777 : 0xffffff;
      if (e.kind === 'mother' && e.flash <= 0 && e.shots === 0 && e.fireCd < ENEMY.mother.windup) {
        s.tint = BOSS_WINDUP_TINT[bossAttack(e)];
      }
      if (e.kind === 'kamikaze' && e.phase === 1 && Math.floor(e.timer * 12) % 2) s.tint = KAMIKAZE_AIM_TINT;
      e.bar?.position.set(s.x, s.y - e.r - 10);

      if (s.y > this.h + e.r + 20 || s.x < -120 || s.x > this.w + 120) {
        e.bar?.destroy();
        removeAt(this.enemies, i);
      }
    }
  }

  /** Атаки босса по кругу: веер → очередь → самонаводящиеся снаряды, между ними пауза. */
  private updateBossAttack(e: Enemy, dt: number) {
    const { mother } = ENEMY;
    const x = e.s.x;
    const y = e.s.y + 24;
    e.fireCd -= dt;
    if (e.fireCd > 0) return;

    if (e.shots > 0) {
      // идёт очередь
      this.enemyShoot(x, y, rand(-1, 1) * mother.burst.jitter, mother.burst.speed);
      e.shots--;
      if (e.shots > 0) e.fireCd = mother.burst.interval;
      else this.nextBossAttack(e);
      return;
    }

    const attack = bossAttack(e);
    if (attack === 'fan') {
      // веер вниз, а не в игрока: между пулями есть просветы
      const { count, spread, speed } = mother.fan;
      for (let n = 0; n < count; n++) this.enemyShootAt(x, y, Math.PI / 2 + (n / (count - 1) - 0.5) * spread, speed);
      this.nextBossAttack(e);
    } else if (attack === 'burst') {
      e.shots = mother.burst.count;
      e.fireCd = 0;
    } else {
      for (let n = 0; n < mother.homing.count; n++) {
        const side = n % 2 ? 1 : -1;
        this.spawnMissile(x + side * 30, y, Math.PI / 2 + side * 0.7);
      }
      sfx.missile();
      this.nextBossAttack(e);
    }
  }

  private nextBossAttack(e: Enemy) {
    e.phase++;
    e.fireCd = ENEMY.mother.attackPause;
  }

  private spawnMissile(x: number, y: number, angle: number) {
    const { speed, homingTime } = ENEMY.mother.homing;
    const s = new Sprite(this.tx.missile);
    s.anchor.set(0.5);
    s.position.set(x, y);
    this.fxLayer.addChild(s);
    this.missiles.push({ s, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, homing: homingTime });
  }

  private updateMissiles(dt: number) {
    const { speed, turnRate } = ENEMY.mother.homing;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      let angle = Math.atan2(m.vy, m.vx);
      if (m.homing > 0 && this.alive) {
        // доворачиваем к игроку не быстрее turnRate — от снаряда можно увернуться
        m.homing -= dt;
        const target = Math.atan2(this.player.y - m.s.y, this.player.x - m.s.x);
        const diff = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
        angle += clamp(diff, -turnRate * dt, turnRate * dt);
        m.vx = Math.cos(angle) * speed;
        m.vy = Math.sin(angle) * speed;
      }
      m.s.x += m.vx * dt;
      m.s.y += m.vy * dt;
      m.s.rotation = angle - Math.PI / 2;
      const { x, y } = m.s;
      if (y > this.h + 30 || y < -60 || x < -30 || x > this.w + 30) removeAt(this.missiles, i);
    }
  }

  private destroyMissile(i: number) {
    const { x, y } = this.missiles[i].s;
    this.explode(x, y, MISSILE_COLOR, 10, 180);
    sfx.hit();
    removeAt(this.missiles, i);
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
      for (let k = 0; k < COINS.boss; k++) {
        const a = (k / COINS.boss) * Math.PI * 2;
        this.spawnCoin(x, y, Math.cos(a) * COINS.scatter, Math.sin(a) * COINS.scatter);
      }
      this.spawnPowerUp(x, y, this.lives < PLAYER.maxLives && Math.random() < POWER_UP.bossLifeChance ? 'life' : 'gun');
      return;
    }
    if (Math.random() < COINS.dropChance) this.spawnCoin(x, y, 0, 0);
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

  /** Выстрел в игрока (со смещением угла). */
  private enemyShoot(x: number, y: number, angleOffset: number, speed: number) {
    const angle = this.alive
      ? Math.atan2(this.player.y - y, this.player.x - x) + angleOffset
      : Math.PI / 2 + angleOffset;
    this.enemyShootAt(x, y, angle, speed);
  }

  /** Выстрел под заданным углом (0 — вправо, π/2 — вниз). */
  private enemyShootAt(x: number, y: number, angle: number, speed: number) {
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

  private spawnCoin(x: number, y: number, vx: number, vy: number) {
    const s = this.coinPool.get();
    s.position.set(x, y);
    this.coins.push({ s, vx, vy, t: Math.random() * 6 });
  }

  private updateCoins(dt: number) {
    const drag = Math.exp(-COIN_DRAG * dt);
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      if (this.magnet > 0 && this.alive) {
        const dx = this.player.x - c.s.x;
        const dy = this.player.y - c.s.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, POWER_UP.magnetSpeed * dt);
        c.s.x += (dx / d) * step;
        c.s.y += (dy / d) * step;
      } else {
        c.vx *= drag;
        c.vy *= drag;
        c.s.x += c.vx * dt;
        c.s.y += (c.vy + COINS.fallSpeed) * dt;
      }
      c.s.scale.x = Math.cos(c.t * 6); // монета вращается
      if (c.s.y > this.h + 20) releaseAt(this.coins, i, this.coinPool);
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
    while (this.missiles.length) this.destroyMissile(this.missiles.length - 1);
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

    // пули игрока → самонаводящиеся снаряды
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const j = this.missiles.findIndex((m) => near(b.s, m.s, b.r + ENEMY.mother.homing.r));
      if (j < 0) continue;
      releaseAt(this.bullets, i, this.bulletPool);
      this.destroyMissile(j);
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

    // самонаводящиеся снаряды → игрок
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      if (vulnerable && near(this.missiles[i].s, this.player, PLAYER.r + ENEMY.mother.homing.r)) {
        this.destroyMissile(i);
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

    // монеты
    let picked = false;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!near(c.s, this.player, PLAYER.pickupR)) continue;
      this.explode(c.s.x, c.s.y, COIN_COLOR, 4, 90);
      releaseAt(this.coins, i, this.coinPool);
      this.coinCount++;
      picked = true;
    }
    if (picked) {
      this.ev.coins(this.coinCount);
      sfx.coin();
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
        this.magnet = this.magnetTime;
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

  // ───────────── отладка для e2e-тестов ─────────────

  debugApi(): WorldDebug {
    const pos = (c: Container) => ({ x: c.x, y: c.y });
    return {
      snapshot: () => ({
        w: this.w,
        h: this.h,
        alive: this.alive,
        score: this.score,
        coins: this.coinCount,
        upgrades: { ...this.upgrades },
        fireInterval: this.fireInterval,
        wave: this.wave,
        lives: this.lives,
        weapon: this.weapon,
        combo: this.comboMultiplier(),
        invuln: Math.max(0, this.invuln),
        shield: this.shield,
        magnet: Math.max(0, this.magnet),
        player: pos(this.player),
        enemies: this.enemies.map((e) => ({
          kind: e.kind,
          hp: e.hp,
          ...(e.kind === 'mother' ? { attack: bossAttack(e) } : {}),
          ...pos(e.s),
        })),
        powerUps: this.powerUps.map((p) => ({ kind: p.kind, ...pos(p.s) })),
        coinsOnField: this.coins.map((c) => ({ kind: 'coin', ...pos(c.s) })),
        missiles: this.missiles.map((m) => ({ kind: 'missile', ...pos(m.s) })),
        enemyBullets: this.enemyBullets.length,
      }),
      setAutoSpawn: (on) => {
        this.autoSpawn = on;
      },
      spawnEnemy: (kind, x, y) => {
        if (!(kind in ENEMY)) throw new Error(`Нет такого врага: ${kind}`);
        const e = this.spawn(kind as EnemyKind, x);
        e.s.y = y;
      },
      spawnPowerUp: (kind, x, y) => {
        if (!(kind in POWER_UP.drops)) throw new Error(`Нет такого бонуса: ${kind}`);
        this.spawnPowerUp(x, y, kind as PowerUpKind);
      },
      spawnCoin: (x, y) => this.spawnCoin(x, y, 0, 0),
      startWave: (n) => {
        this.autoSpawn = true;
        this.startWave(n);
      },
      spawnFormation: (name) => {
        if (!(name in FORMATIONS) && name !== 'boss') throw new Error(`Нет такого построения: ${name}`);
        this.spawnFormation(name as FormationName);
      },
      setCheats: (cheats) => {
        this.cheats = { ...this.cheats, ...cheats };
      },
      spawnMissile: (x, y) => this.spawnMissile(x, y, Math.PI / 2),
      movePlayer: (x, y) => {
        this.player.position.set(x, y);
        this.clampPlayer();
      },
    };
  }
}
