import { Graphics, Text, type Container, type Sprite } from 'pixi.js';
import type { Textures } from '../textures';
import type { Field } from './Field';
import { releaseAll, releaseAt, removeAt, SpritePool } from './pool';
import { clamp, rand } from './rules';

/**
 * Эффекты: искры, всплывающие очки, вспышка бомбы и тряска экрана.
 * Только оформление — на ход игры не влияют.
 */

const POPUP_LIFE = 0.8; // сек
const POPUP_RISE = 60; // px/сек
const BOMB_FLASH = 0.35; // сек, белая вспышка на весь экран
const SHAKE_DECAY = 40; // на столько пикселей в секунду затухает тряска

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

export class Effects {
  /** Белая вспышка поверх всего — World кладёт её последней в root. */
  readonly overlay = new Graphics();

  private sparkPool: SpritePool;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private layer: Container;
  private root: Container;
  private field: Field;
  private flash = 0; // остаток вспышки от бомбы
  private shake = 0;

  constructor(textures: Textures, layer: Container, root: Container, field: Field) {
    this.layer = layer;
    this.root = root;
    this.field = field;
    this.sparkPool = new SpritePool(textures.spark, layer);
    this.overlay.visible = false;
  }

  /** Разлёт искр из точки. */
  explode(x: number, y: number, color: number, count: number, speed: number) {
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

  /** Всплывающая надпись: «+25», «ЩИТ +50». */
  popup(x: number, y: number, text: string, color: number) {
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
    s.position.set(clamp(x, 30, this.field.w - 30), y);
    this.layer.addChild(s);
    this.popups.push({ s, life: POPUP_LIFE });
  }

  flashBomb() {
    this.flash = BOMB_FLASH;
  }

  /** Встряхнуть экран с силой n (заменяет текущую тряску). */
  setShake(n: number) {
    this.shake = n;
  }

  /** Тряска не слабее n — для долгих эффектов, чтобы не гасить более сильный удар. */
  shakeAtLeast(n: number) {
    this.shake = Math.max(this.shake, n);
  }

  update(dt: number) {
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

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.s.y -= POPUP_RISE * dt;
      const k = p.life / POPUP_LIFE;
      p.s.alpha = Math.min(1, k * 2.5);
      p.s.scale.set(1 + Math.max(0, k - 0.8) * 2); // короткий «выпрыг» в начале
      if (p.life <= 0) removeAt(this.popups, i);
    }

    if (this.flash > 0) {
      this.flash -= dt;
      // рисуем с запасом за края, чтобы тряска не открывала полосы
      this.overlay
        .clear()
        .rect(-40, -40, this.field.w + 80, this.field.h + 80)
        .fill({ color: 0xffffff, alpha: Math.max(0, this.flash / BOMB_FLASH) * 0.6 });
      this.overlay.visible = this.flash > 0;
    }
  }

  /** Сдвинуть всю сцену на величину тряски — в самом конце кадра. */
  applyShake(dt: number) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY);
      this.root.position.set(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
    } else {
      this.root.position.set(0, 0);
    }
  }

  clear() {
    releaseAll(this.particles, this.sparkPool);
    while (this.popups.length) removeAt(this.popups, this.popups.length - 1);
    this.flash = 0;
    this.overlay.visible = false;
    this.shake = 0;
    this.root.position.set(0, 0);
  }
}
