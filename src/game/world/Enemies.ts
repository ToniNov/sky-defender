import { Graphics, Sprite, type Container } from 'pixi.js';
import { sfx } from '../../audio';
import { ENEMY, ENEMY_FIRST_SHOT, type EnemyKind } from '../balance';
import type { Textures } from '../textures';
import type { Field } from './Field';
import type { Player } from './Player';
import { removeAt } from './pool';
import type { Projectiles } from './Projectiles';
import { bossAttackAt, bossHp, clamp, difficulty, rand, randIn, type BossAttack } from './rules';

/** Подсветка босса перед атакой — по цвету видно, что сейчас прилетит. */
const BOSS_WINDUP_TINT: Record<BossAttack, number> = {
  fan: 0xff8fa8,
  burst: 0xffe066,
  homing: 0x7fffd4,
};
const KAMIKAZE_AIM_TINT = 0xffff66; // мигание перед тараном
const HIT_TINT = 0xff7777; // вспышка при попадании
const BOSS_BAR_WIDTH = 76;

export interface Enemy {
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
  flawless: boolean; // босс: игрок ещё не терял жизнь, пока он на поле
}

export const bossAttack = (e: Enemy) => bossAttackAt(e.phase);

/** Враги: появление, движение каждого вида, стрельба, атаки босса. Что бывает при их гибели — решает World. */
export class Enemies {
  readonly list: Enemy[] = [];

  private tx: Textures;
  private layer: Container;
  private barLayer: Container;
  private field: Field;
  private player: Player;
  private shots: Projectiles;

  constructor(
    textures: Textures,
    layer: Container,
    barLayer: Container,
    field: Field,
    player: Player,
    shots: Projectiles,
  ) {
    this.tx = textures;
    this.layer = layer;
    this.barLayer = barLayer;
    this.field = field;
    this.player = player;
    this.shots = shots;
  }

  hasBoss() {
    return this.list.some((e) => e.kind === 'mother');
  }

  /** Новый враг над верхним краем экрана (yOffset — ещё выше, для построений). */
  spawn(kind: EnemyKind, x?: number, yOffset = 0): Enemy {
    const cfg = ENEMY[kind];
    const { mother, saucer } = ENEMY;
    const { w, h, elapsed } = this.field;
    const hp = kind === 'mother' ? bossHp(elapsed) : cfg.hp;
    const amp = kind === 'saucer' ? rand(saucer.amp[0], Math.min(saucer.amp[1], w / 4)) : 0;
    let ex = x ?? rand(cfg.r + 10, w - cfg.r - 10);
    if (kind === 'saucer') ex = clamp(ex, cfg.r + amp, w - cfg.r - amp);

    const s = new Sprite(this.tx[kind]);
    s.anchor.set(0.5);
    s.position.set(ex, -cfg.r - 10 - yOffset);
    this.layer.addChild(s);

    const e: Enemy = {
      s,
      kind,
      hp,
      maxHp: hp,
      r: cfg.r,
      vx: 0,
      vy: kind === 'mother' ? mother.speed : randIn(ENEMY[kind].speed) * difficulty(elapsed),
      baseX: ex,
      amp,
      t: rand(0, 6),
      fireCd: kind === 'mother' ? mother.firstShot : randIn(ENEMY_FIRST_SHOT),
      flash: 0,
      phase: 0,
      timer: 0,
      stopY: kind === 'kamikaze' ? randIn(ENEMY.kamikaze.stopAt) * h : 0,
      shots: 0,
      inFormation: false,
      flawless: true,
    };
    if (kind === 'mother') {
      e.bar = new Graphics();
      this.barLayer.addChild(e.bar);
      this.drawBar(e);
    }
    this.list.push(e);
    return e;
  }

  /** Полоска HP над боссом. */
  drawBar(e: Enemy) {
    if (!e.bar) return;
    const w = BOSS_BAR_WIDTH;
    e.bar
      .clear()
      .roundRect(-w / 2, 0, w, 6, 3)
      .fill({ color: 0x000000, alpha: 0.5 })
      .roundRect(-w / 2, 0, Math.max(0, (w * e.hp) / e.maxHp), 6, 3)
      .fill(0xff4d6d);
  }

  /** Убрать врага с поля (без эффектов). false — его уже нет. */
  remove(e: Enemy): boolean {
    const i = this.list.indexOf(e);
    if (i < 0) return false;
    this.removeAt(i);
    return true;
  }

  private removeAt(i: number) {
    this.list[i].bar?.destroy();
    removeAt(this.list, i);
  }

  update(dt: number) {
    const { w, h, elapsed, alive } = this.field;
    const diff = difficulty(elapsed);
    const player = this.player;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
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
        if (alive && !e.inFormation) e.vx = clamp(e.vx + Math.sign(player.x - s.x) * turnAccel * dt, -maxVx, maxVx);
        s.x += e.vx * dt;
        s.y += e.vy * dt;
        s.rotation = e.vx / 600;
      } else if (e.kind === 'saucer') {
        s.y += e.vy * dt;
        s.x = e.baseX + Math.sin(e.t * 2.2) * e.amp;
      } else if (e.kind === 'mother') {
        const targetY = h * 0.12 + 40;
        if (s.y < targetY) s.y += e.vy * dt;
        s.x = w / 2 + Math.sin(e.t * 0.7) * (w / 2 - 60);
      } else if (e.kind === 'kamikaze') {
        this.updateKamikaze(e, dt);
      } else if (e.kind === 'shielder') {
        // медленно сдвигается под игрока, прикрываясь щитом
        s.y += e.vy * dt;
        if (alive) {
          const step = ENEMY.shielder.trackSpeed * dt;
          s.x += clamp(player.x - s.x, -step, step);
        }
      } else if (e.kind === 'splitter') {
        s.y += e.vy * dt;
      } else {
        // осколок сплиттера: разлетается в стороны и отскакивает от краёв
        e.vx *= Math.exp(-1.5 * dt);
        s.x += e.vx * dt;
        s.y += e.vy * dt;
        if ((s.x < e.r && e.vx < 0) || (s.x > w - e.r && e.vx > 0)) e.vx = -e.vx;
      }

      if (alive && s.y > 0) {
        if (e.kind === 'saucer' && elapsed > ENEMY.saucer.shootsAfter) {
          e.fireCd -= dt;
          if (e.fireCd <= 0) {
            const { saucer } = ENEMY;
            this.shots.shootAtPlayer(s.x, s.y + 14, 0, saucer.bulletSpeed + elapsed);
            e.fireCd = randIn(saucer.fireInterval) / diff;
          }
        } else if (e.kind === 'mother') {
          this.updateBossAttack(e, dt);
        }
      }

      e.flash = Math.max(0, e.flash - dt);
      s.tint = e.flash > 0 ? HIT_TINT : 0xffffff;
      if (e.kind === 'mother' && e.flash <= 0 && e.shots === 0 && e.fireCd < ENEMY.mother.windup) {
        s.tint = BOSS_WINDUP_TINT[bossAttack(e)];
      }
      if (e.kind === 'kamikaze' && e.phase === 1 && Math.floor(e.timer * 12) % 2) s.tint = KAMIKAZE_AIM_TINT;
      e.bar?.position.set(s.x, s.y - e.r - 10);

      if (s.y > h + e.r + 20 || s.x < -120 || s.x > w + 120) this.removeAt(i);
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
      this.shots.shootAtPlayer(x, y, rand(-1, 1) * mother.burst.jitter, mother.burst.speed);
      e.shots--;
      if (e.shots > 0) e.fireCd = mother.burst.interval;
      else this.nextBossAttack(e);
      return;
    }

    const attack = bossAttack(e);
    if (attack === 'fan') {
      // веер вниз, а не в игрока: между пулями есть просветы
      const { count, spread, speed } = mother.fan;
      for (let n = 0; n < count; n++) this.shots.shootAt(x, y, Math.PI / 2 + (n / (count - 1) - 0.5) * spread, speed);
      this.nextBossAttack(e);
    } else if (attack === 'burst') {
      e.shots = mother.burst.count;
      e.fireCd = 0;
    } else {
      for (let n = 0; n < mother.homing.count; n++) {
        const side = n % 2 ? 1 : -1;
        this.shots.spawnMissile(x + side * 30, y, Math.PI / 2 + side * 0.7);
      }
      sfx.missile();
      this.nextBossAttack(e);
    }
  }

  private nextBossAttack(e: Enemy) {
    e.phase++;
    e.fireCd = ENEMY.mother.attackPause;
  }

  private updateKamikaze(e: Enemy, dt: number) {
    const s = e.s;
    const cfg = ENEMY.kamikaze;
    const alive = this.field.alive;
    if (e.phase === 0) {
      s.y += e.vy * dt;
      if (s.y >= e.stopY) {
        e.phase = 1;
        e.timer = cfg.aimTime;
      }
    } else if (e.phase === 1) {
      // зависает и доворачивает нос на игрока — время увернуться
      e.timer -= dt;
      const dx = alive ? this.player.x - s.x : 0;
      const dy = alive ? this.player.y - s.y : 1;
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

  clear() {
    while (this.list.length) this.removeAt(this.list.length - 1);
  }
}
