import { Container, Sprite } from 'pixi.js';
import { sfx } from '../audio';
import {
  COINS,
  DEFAULT_SKIN,
  ENEMY,
  NO_UPGRADES,
  PLAYER,
  POWER_UP,
  WEAPONS,
  type EnemyKind,
  type PowerUpKind,
  type SkinName,
  type Upgrades,
  type Weapon,
  type WeaponKind,
} from './balance';
import type { WorldDebug } from './debug';
import { WEAPON_LOOK, type Textures } from './textures';
import { FORMATIONS, type FormationName } from './waves';
import { collide, type Battle, type HitCause } from './world/collisions';
import { Effects } from './world/Effects';
import { bossAttack, Enemies, type Enemy } from './world/Enemies';
import { Field } from './world/Field';
import { Pickups } from './world/Pickups';
import { Player } from './world/Player';
import { Projectiles } from './world/Projectiles';
import {
  addLife,
  bossDrop,
  comboMultiplier,
  killScore,
  pickWeapon,
  rollDrop,
  startStats,
  takeHit,
} from './world/rules';
import { Waves } from './world/Waves';

/**
 * Игровой мир. Обычный TypeScript-класс без React:
 * объектов на экране сотни и они меняются каждый кадр, поэтому
 * гонять их через state React было бы медленно. React только
 * запускает мир, передаёт ему ввод и показывает HUD по событиям.
 *
 * World — дирижёр: создаёт модули из ./world/, задаёт порядок кадра и решает то,
 * что задевает сразу несколько модулей (сбит враг, попали в игрока, подобран бонус, бомба).
 * Числа правил — в world/rules.ts, баланс — в balance.ts.
 */

export type { EnemyKind } from './balance';
export type UpdateMode = 'run' | 'idle' | 'frozen';

/** С чем игрок вылетает: улучшения и скин из ангара. */
export interface Loadout {
  upgrades: Upgrades;
  skin: SkinName;
}

export interface WorldEvents {
  score(n: number): void;
  lives(n: number): void;
  weapon(w: Weapon): void;
  /** Множитель очков за врагов (1 — комбо нет). */
  combo(multiplier: number): void;
  hit(): void;
  kill(kind: EnemyKind): void;
  powerUp(): void;
  /** Монет собрано за партию. */
  coins(n: number): void;
  /** Началась волна n. */
  wave(n: number): void;
  /** Сбит флагман; flawless — игрок не потерял ни одной жизни, пока тот был на поле. */
  bossDown(flawless: boolean): void;
  gameOver(score: number, death: Death): void;
}

export type { HitCause };

/** Как кончилась партия — для аналитики. */
export interface Death {
  /** Последнее попадание. */
  cause: HitCause;
  /** Сколько секунд шла партия (без пауз). */
  seconds: number;
}

interface Star {
  s: Sprite;
  speed: number;
}

// Оформление событий, которые решает World (у модулей — свои константы)
const ENEMY_COLOR: Record<EnemyKind, number> = {
  scout: 0x7cf27c,
  saucer: 0x7fd8ff,
  mother: 0xc77dff,
  kamikaze: 0xff5a3c,
  shielder: 0xf2c14e,
  splitter: 0xff8fd8,
  mini: 0xff8fd8,
};
/** Искры при подборе; у капсулы оружия — цвет её вида (WEAPON_LOOK). */
const POWER_UP_COLOR: Record<Exclude<PowerUpKind, 'weapon'>, number> = {
  life: 0xff4d8d,
  shield: 0x5fd4ff,
  magnet: 0xff6b6b,
  bomb: 0xff9f1c,
};
/** Подпись при подборе: для оружия (если сменился вид — его название) и жизни хватает HUD, остальные стоит назвать. */
const POWER_UP_LABEL: Partial<Record<PowerUpKind, string>> = {
  shield: 'ЩИТ',
  magnet: 'МАГНИТ',
  bomb: 'БОМБА',
};
const POPUP_BONUS_COLOR = 0xffffff;
const HIT_SPARK_COLOR = 0xffd23f; // искры от попадания по врагу
const DEFLECT_COLOR = 0xdfe6f2; // искры от щита щитоносца
const COIN_COLOR = 0xffd23f;
const DAMAGE_COLOR = 0xffb020; // игрок потерял жизнь
const DEATH_COLOR = 0xff6b3d;
const BOMB_SHAKE = 18;
const DEATH_DELAY = 1.3; // сек от гибели до экрана «Самолёт сбит»

export class World {
  readonly root = new Container();
  readonly keys = new Set<string>();

  private ev: WorldEvents;
  private field = new Field();

  // Слои отрисовки (снизу вверх)
  private starLayer = new Container();
  private bulletLayer = new Container();
  private enemyLayer = new Container();
  private itemLayer = new Container();
  private playerLayer = new Container();
  private fxLayer = new Container();

  private player: Player;
  private fx: Effects;
  private shots: Projectiles;
  private enemies: Enemies;
  private pickups: Pickups;
  private waves: Waves;
  private battle: Battle;

  private stars: Star[] = [];
  private starsPlaced = false;

  private score = 0;
  private coinCount = 0; // монет собрано за партию
  private combo = 0; // врагов сбито подряд без урона
  private upgrades: Upgrades = NO_UPGRADES; // из ангара, на всю партию
  private skin: SkinName = DEFAULT_SKIN;
  private deathTimer = 0;
  private death: Death = { cause: 'bullet', seconds: 0 };
  private autoSpawn = true; // e2e-тесты выключают случайных врагов
  private cheats = { noDamage: false, holdFire: false }; // тоже только для тестов

  constructor(textures: Textures, events: WorldEvents) {
    this.ev = events;
    const field = this.field;
    this.root.addChild(this.starLayer, this.bulletLayer, this.enemyLayer, this.itemLayer, this.playerLayer, this.fxLayer);

    this.player = new Player(textures, field);
    this.playerLayer.addChild(this.player.view);
    this.fx = new Effects(textures, this.fxLayer, this.root, field);
    this.shots = new Projectiles(textures, this.bulletLayer, this.fxLayer, field, this.player, this.fx);
    this.enemies = new Enemies(textures, this.enemyLayer, this.fxLayer, field, this.player, this.shots);
    this.pickups = new Pickups(textures, this.itemLayer, field, this.player);
    this.waves = new Waves(field, this.enemies, this.fx, (n) => this.ev.wave(n));
    // надписи и вспышка — поверх всех слоёв
    this.root.addChild(this.waves.warnText, this.waves.waveText, this.fx.overlay);

    this.battle = {
      field,
      player: this.player,
      shots: this.shots,
      enemies: this.enemies,
      pickups: this.pickups,
      damageEnemy: (e, x, y, damage) => this.damageEnemy(e, x, y, damage),
      deflect: (x, y) => this.deflect(x, y),
      destroyEnemy: (e, byPlayer) => this.destroyEnemy(e, byPlayer),
      damagePlayer: (cause) => this.damagePlayer(cause),
      pickCoin: (i) => this.pickCoin(i),
      coinsPicked: () => {
        this.ev.coins(this.coinCount);
        sfx.coin();
      },
      pickPowerUp: (i) => this.pickPowerUp(i),
    };

    for (let i = 0; i < 90; i++) {
      const depth = Math.random();
      const s = new Sprite(textures.star);
      s.anchor.set(0.5);
      s.alpha = 0.15 + depth * 0.85;
      s.scale.set(0.35 + depth * 0.9);
      this.starLayer.addChild(s);
      this.stars.push({ s, speed: 12 + depth * 120 });
    }
  }

  // ───────────── управление снаружи ─────────────

  resize(w: number, h: number) {
    this.field.w = w;
    this.field.h = h;
    if (!this.starsPlaced) {
      for (const st of this.stars) st.s.position.set(Math.random() * w, Math.random() * h);
      this.starsPlaced = true;
    }
    if (this.field.alive) this.player.clampToField();
  }

  /** Убрать всё с поля (для главного меню). */
  clear() {
    this.enemies.clear();
    this.shots.clear();
    this.pickups.clear();
    this.fx.clear();
    this.waves.clear();
    this.player.hide();
    this.field.alive = false;
    this.deathTimer = 0;
  }

  /** Новая игра с улучшениями и скином из ангара. */
  reset({ upgrades, skin }: Loadout = { upgrades: NO_UPGRADES, skin: DEFAULT_SKIN }) {
    this.clear();
    this.upgrades = upgrades;
    this.skin = skin;
    this.player.reset(startStats(upgrades), skin);
    this.score = 0;
    this.coinCount = 0;
    this.combo = 0;
    this.field.elapsed = 0;
    this.field.alive = true;
    this.autoSpawn = true;
    this.cheats = { noDamage: false, holdFire: false };
    this.ev.score(0);
    this.ev.lives(this.player.lives);
    this.ev.weapon(this.player.weapon);
    this.ev.combo(1);
    this.ev.coins(0);
    this.waves.start(1);
  }

  /** Перемещение пальцем: самолёт двигается чуть дальше пальца (PLAYER.dragFactor). */
  dragBy(dx: number, dy: number) {
    if (!this.field.alive) return;
    this.player.moveBy(dx * PLAYER.dragFactor, dy * PLAYER.dragFactor);
  }

  update(dtMs: number, mode: UpdateMode) {
    if (mode === 'frozen') return;
    const dt = Math.min(dtMs, 50) / 1000;

    this.updateStars(dt, mode === 'run' ? 1 : 0.6);
    if (mode === 'idle') return;

    this.field.elapsed += dt;

    if (this.field.alive) {
      if (this.player.update(dt, this.keys, this.cheats.holdFire)) this.shots.firePlayer();
      if (this.autoSpawn) this.waves.update(dt);
    } else if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.ev.gameOver(this.score, this.death);
    }
    this.shots.updateBeam(this.field.alive && !this.cheats.holdFire);

    this.shots.updateBullets(dt);
    this.enemies.update(dt);
    this.shots.updateEnemyFire(dt);
    this.pickups.update(dt);
    this.fx.update(dt);
    this.waves.updateBanners(dt);
    collide(this.battle);
    this.fx.applyShake(dt);
  }

  private updateStars(dt: number, speed: number) {
    const { w, h } = this.field;
    for (const st of this.stars) {
      st.s.y += st.speed * speed * dt;
      if (st.s.y > h + 4) {
        st.s.y = -4;
        st.s.x = Math.random() * w;
      }
    }
  }

  // ───────────── игрок ─────────────

  private damagePlayer(cause: HitCause) {
    if (this.cheats.noDamage) return;
    const p = this.player;
    const { x, y } = p;
    const hit = takeHit({ lives: p.lives, weapon: p.weapon, shield: p.shield, combo: this.combo });

    if (hit.absorbed) {
      // щит принял удар: жизнь, оружие и комбо остаются
      p.setShield(false);
      p.invuln = POWER_UP.shieldBreakInvuln;
      this.fx.setShake(6);
      sfx.shieldBreak();
      this.fx.explode(x, y, POWER_UP_COLOR.shield, 20, 260);
      return;
    }

    p.lives = hit.lives;
    this.ev.lives(p.lives);
    for (const e of this.enemies.list) e.flawless = false;
    if (this.combo !== hit.combo) {
      this.combo = hit.combo;
      this.ev.combo(comboMultiplier(this.combo));
    }
    this.ev.hit();
    this.fx.setShake(12);
    sfx.damage();
    this.fx.explode(x, y, DAMAGE_COLOR, 18, 240);
    if (p.weapon.level !== hit.weapon.level) {
      p.weapon = hit.weapon;
      this.ev.weapon(p.weapon);
    }

    if (p.lives > 0) {
      p.invuln = PLAYER.hitInvuln;
      return;
    }
    this.field.alive = false;
    this.death = { cause, seconds: this.field.elapsed };
    p.view.visible = false;
    this.fx.explode(x, y, DEATH_COLOR, 50, 400);
    this.fx.explode(x, y, 0xffffff, 20, 200);
    this.fx.setShake(22);
    this.deathTimer = DEATH_DELAY;
    sfx.explosion(true);
  }

  // ───────────── враги ─────────────

  private deflect(x: number, y: number) {
    this.fx.explode(x, y, DEFLECT_COLOR, 3, 140);
    sfx.deflect();
  }

  private damageEnemy(e: Enemy, x: number, y: number, damage: number) {
    e.hp -= damage;
    e.flash = 0.07;
    this.fx.explode(x, y, HIT_SPARK_COLOR, 4, 120);
    this.enemies.drawBar(e);
    if (e.hp > 0) sfx.hit();
    else this.destroyEnemy(e, true);
  }

  /** Враг уничтожен; byPlayer — сбит игроком (очки, комбо, добыча), а не разбился о него. */
  private destroyEnemy(e: Enemy, byPlayer: boolean) {
    if (!this.enemies.list.includes(e)) return;
    const { x, y } = e.s; // до remove: потом спрайт уничтожен
    const color = ENEMY_COLOR[e.kind];
    const big = e.kind === 'mother';
    this.fx.explode(x, y, color, big ? 60 : e.r >= 20 ? 24 : 14, big ? 380 : 230);
    this.fx.explode(x, y, 0xffffff, big ? 20 : 6, big ? 200 : 120);
    if (big) this.fx.setShake(14);
    sfx.explosion(big);
    this.enemies.remove(e);

    if (!byPlayer) return;
    if (e.kind === 'splitter') {
      for (const side of [-1, 1]) {
        const m = this.enemies.spawn('mini');
        m.s.position.set(x + side * 10, y);
        m.s.scale.x = -side; // картинка осколка — левая половина, правому нужна зеркальная
        m.vx = side * ENEMY.mini.splitVx;
      }
    }

    const kill = killScore(e.kind, this.combo);
    this.combo = kill.combo;
    if (kill.multiplierChanged) this.ev.combo(kill.multiplier);
    this.score += kill.points;
    this.ev.score(this.score);
    this.ev.kill(e.kind);
    if (big) this.ev.bossDown(e.flawless);
    this.fx.popup(x, y - e.r, `+${kill.points}`, color);

    if (big) {
      for (let k = 0; k < COINS.boss; k++) {
        const a = (k / COINS.boss) * Math.PI * 2;
        this.pickups.spawnCoin(x, y, Math.cos(a) * COINS.scatter, Math.sin(a) * COINS.scatter);
      }
      this.pickups.spawnPowerUp(x, y, bossDrop(this.player.lives, Math.random()));
      return;
    }
    if (Math.random() < COINS.dropChance) this.pickups.spawnCoin(x, y);
    const drop = rollDrop(Math.random());
    if (drop) this.pickups.spawnPowerUp(x, y, drop);
  }

  // ───────────── бонусы и монеты ─────────────

  private pickCoin(i: number) {
    const { x, y } = this.pickups.coins[i].s;
    this.fx.explode(x, y, COIN_COLOR, 4, 90);
    this.pickups.removeCoin(i);
    this.coinCount++;
  }

  private pickPowerUp(i: number) {
    const { s, kind, weapon } = this.pickups.powerUps[i];
    const { x, y } = s;
    // убираем до применения: бомба может породить новые бонусы
    this.pickups.removePowerUp(i);
    this.score += POWER_UP.points;
    this.ev.score(this.score);
    const p = this.player;
    let label = kind === 'weapon' ? undefined : POWER_UP_LABEL[kind];
    if (kind === 'weapon') {
      if (weapon !== p.weapon.kind) label = WEAPON_LOOK[weapon].label;
      p.weapon = pickWeapon(p.weapon, weapon);
      this.ev.weapon(p.weapon);
    } else if (kind === 'life') {
      p.lives = addLife(p.lives);
      this.ev.lives(p.lives);
    } else if (kind === 'shield') {
      p.setShield(true);
    } else if (kind === 'magnet') {
      p.setMagnet(p.magnetTime);
    } else {
      this.detonateBomb();
    }
    this.fx.popup(x, y - 20, label ? `${label} +${POWER_UP.points}` : `+${POWER_UP.points}`, POPUP_BONUS_COLOR);
    this.ev.powerUp();
    sfx.powerUp();
    this.fx.explode(x, y, kind === 'weapon' ? WEAPON_LOOK[weapon].color : POWER_UP_COLOR[kind], 12, 160);
  }

  /** Бомба: сбивает всех врагов на экране, ранит босса и стирает вражеские пули. */
  private detonateBomb() {
    for (const e of [...this.enemies.list]) {
      if (e.s.y < -e.r) continue; // ещё не вылетел на экран
      if (e.kind === 'mother') {
        e.hp -= POWER_UP.bombBossDamage;
        e.flash = 0.2;
        this.enemies.drawBar(e);
        if (e.hp <= 0) this.destroyEnemy(e, true);
      } else {
        this.destroyEnemy(e, true);
      }
    }
    // осколки сплиттеров, появившиеся от взрыва
    for (const e of [...this.enemies.list]) if (e.kind === 'mini') this.destroyEnemy(e, true);
    this.shots.clearEnemyFire();
    this.fx.flashBomb();
    this.fx.shakeAtLeast(BOMB_SHAKE);
    sfx.explosion(true);
  }

  // ───────────── отладка для e2e-тестов ─────────────

  debugApi(): WorldDebug {
    const pos = (c: Container) => ({ x: c.x, y: c.y });
    const p = this.player;
    return {
      snapshot: () => ({
        w: this.field.w,
        h: this.field.h,
        alive: this.field.alive,
        score: this.score,
        coins: this.coinCount,
        upgrades: { ...this.upgrades },
        skin: this.skin,
        fireInterval: p.fireInterval,
        wave: this.waves.wave,
        lives: p.lives,
        weapon: { ...p.weapon },
        combo: comboMultiplier(this.combo),
        invuln: Math.max(0, p.invuln),
        shield: p.shield,
        magnet: Math.max(0, p.magnet),
        player: pos(p.view),
        enemies: this.enemies.list.map((e) => ({
          kind: e.kind,
          hp: e.hp,
          ...(e.kind === 'mother' ? { attack: bossAttack(e) } : {}),
          ...pos(e.s),
        })),
        powerUps: this.pickups.powerUps.map((u) => ({
          kind: u.kind,
          ...(u.kind === 'weapon' ? { weapon: u.weapon } : {}),
          ...pos(u.s),
        })),
        coinsOnField: this.pickups.coins.map((c) => ({ kind: 'coin', ...pos(c.s) })),
        missiles: this.shots.missiles.map((m) => ({ kind: 'missile', ...pos(m.s) })),
        enemyBullets: this.shots.enemyBullets.length,
        playerBullets: this.shots.bullets.length,
        playerBulletPositions: this.shots.bullets.map((b) => pos(b.s)),
        beam: this.shots.beam && { ...this.shots.beam },
      }),
      setAutoSpawn: (on) => {
        this.autoSpawn = on;
      },
      spawnEnemy: (kind, x, y) => {
        if (!(kind in ENEMY)) throw new Error(`Нет такого врага: ${kind}`);
        const e = this.enemies.spawn(kind as EnemyKind, x);
        e.s.y = y;
      },
      spawnPowerUp: (kind, x, y, capsule = {}) => {
        if (!(kind in POWER_UP.drops)) throw new Error(`Нет такого бонуса: ${kind}`);
        const weapon = capsule.weapon ?? p.weapon.kind;
        if (!(weapon in WEAPONS)) throw new Error(`Нет такого оружия: ${weapon}`);
        this.pickups.spawnPowerUp(x, y, kind as PowerUpKind, {
          weapon: weapon as WeaponKind,
          cycles: capsule.cycles ?? false,
        });
      },
      spawnCoin: (x, y) => this.pickups.spawnCoin(x, y),
      startWave: (n) => {
        this.autoSpawn = true;
        this.waves.start(n);
      },
      spawnFormation: (name) => {
        if (!(name in FORMATIONS) && name !== 'boss') throw new Error(`Нет такого построения: ${name}`);
        this.waves.spawnFormation(name as FormationName);
      },
      setCheats: (cheats) => {
        this.cheats = { ...this.cheats, ...cheats };
      },
      spawnMissile: (x, y) => this.shots.spawnMissile(x, y, Math.PI / 2),
      movePlayer: (x, y) => p.moveTo(x, y),
      crash: (cause = 'bullet') => {
        p.lives = 1;
        p.setShield(false);
        this.cheats.noDamage = false;
        this.damagePlayer(cause as HitCause);
      },
    };
  }
}
