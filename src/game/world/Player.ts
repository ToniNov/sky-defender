import { Container, Sprite } from 'pixi.js';
import { DEFAULT_SKIN, PLAYER, type SkinName } from '../balance';
import { planeTexture, type Textures } from '../textures';
import type { Field } from './Field';
import { clamp, rand, startStats } from './rules';

const MAGNET_BLINK_TIME = 2; // последние секунды магнита кольцо мигает

/**
 * Самолёт игрока: спрайт с пламенем, щитом и кольцом магнита, движение, таймеры и перезарядка.
 * Что происходит при попадании или подборе бонуса — решает World (это задевает и HUD, и врагов).
 */
export class Player {
  /** Контейнер самолёта; его позиция — позиция игрока. */
  readonly view = new Container();

  lives: number = PLAYER.startLives;
  weapon = 1;
  invuln = 0;
  shield = false;
  /** Сколько ещё действует магнит. */
  magnet = 0;
  fireInterval: number = PLAYER.fireInterval;
  magnetTime = 0;
  private fireCd = 0;

  private tx: Textures;
  private field: Field;
  private flame: Sprite;
  private body: Sprite;
  private shieldBubble: Sprite;
  private magnetRing: Sprite;

  constructor(textures: Textures, field: Field) {
    this.tx = textures;
    this.field = field;
    this.flame = new Sprite(textures.flame);
    this.flame.anchor.set(0.5, 0);
    this.flame.y = 24;
    this.body = new Sprite(textures[planeTexture(DEFAULT_SKIN)]);
    this.body.anchor.set(0.5);
    this.shieldBubble = new Sprite(textures.shieldBubble);
    this.shieldBubble.anchor.set(0.5);
    this.shieldBubble.visible = false;
    this.magnetRing = new Sprite(textures.magnetRing);
    this.magnetRing.anchor.set(0.5);
    this.magnetRing.visible = false;
    this.view.addChild(this.flame, this.body, this.magnetRing, this.shieldBubble);
    this.view.visible = false;
  }

  get x() {
    return this.view.x;
  }
  get y() {
    return this.view.y;
  }

  /** Новый вылет: характеристики из startStats, скин, позиция внизу по центру. */
  reset(stats: ReturnType<typeof startStats>, skin: SkinName) {
    this.body.texture = this.tx[planeTexture(skin)];
    this.lives = stats.lives;
    this.weapon = stats.weapon;
    this.fireInterval = stats.fireInterval;
    this.magnetTime = stats.magnetTime;
    this.fireCd = PLAYER.firstShotDelay;
    this.invuln = PLAYER.startInvuln;
    this.view.visible = true;
    this.view.position.set(this.field.w / 2, this.field.h - 120);
  }

  /** Убрать с поля (меню). */
  hide() {
    this.setShield(false);
    this.setMagnet(0);
    this.view.visible = false;
  }

  moveTo(x: number, y: number) {
    this.view.position.set(x, y);
    this.clampToField();
  }

  moveBy(dx: number, dy: number) {
    this.moveTo(this.view.x + dx, this.view.y + dy);
  }

  /** Не даём улететь за край и слишком высоко. */
  clampToField() {
    const { w, h } = this.field;
    this.view.x = clamp(this.view.x, 26, w - 26);
    this.view.y = clamp(this.view.y, h * 0.3, h - 50);
  }

  setShield(on: boolean) {
    this.shield = on;
    this.shieldBubble.visible = on;
  }

  setMagnet(seconds: number) {
    this.magnet = seconds;
    this.magnetRing.visible = seconds > 0;
  }

  /** Клавиатура, анимация, таймеры щита/магнита/неуязвимости. Возвращает true, если пора стрелять. */
  update(dt: number, keys: ReadonlySet<string>, holdFire: boolean): boolean {
    const sp = PLAYER.keySpeed * dt;
    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= sp;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx += sp;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= sp;
    if (keys.has('ArrowDown') || keys.has('KeyS')) dy += sp;
    this.moveBy(dx, dy);

    this.flame.scale.set(rand(0.85, 1.1), rand(0.7, 1.35));

    if (this.magnet > 0) {
      this.magnet -= dt;
      this.magnetRing.rotation += dt * 1.5;
      this.magnetRing.visible = this.magnet > MAGNET_BLINK_TIME || Math.floor(this.magnet * 8) % 2 === 0;
      if (this.magnet <= 0) this.magnetRing.visible = false;
    }
    if (this.shield) this.shieldBubble.scale.set(1 + Math.sin(this.field.elapsed * 6) * 0.04);

    if (this.invuln > 0) {
      this.invuln -= dt;
      this.view.alpha = Math.floor(this.invuln * 12) % 2 ? 0.3 : 1;
    } else {
      this.view.alpha = 1;
    }

    this.fireCd -= dt;
    if (this.fireCd > 0 || holdFire) return false;
    this.fireCd = this.fireInterval;
    return true;
  }
}
