import { Sprite, type Container, type Texture } from 'pixi.js';

/** Быстрое удаление из массива без сдвига (порядок не важен). */
export function removeAt<T extends { s: Container }>(arr: T[], i: number) {
  arr[i].s.destroy();
  arr[i] = arr[arr.length - 1];
  arr.pop();
}

/**
 * Пул спрайтов для частых объектов (пули, искры, монеты): вместо создания и уничтожения
 * Sprite на каждый выстрел спрятанные спрайты переиспользуются — меньше работы
 * сборщику мусора и меньше подтормаживаний на слабых телефонах.
 */
export class SpritePool {
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
export function releaseAt<T extends { s: Sprite }>(arr: T[], i: number, pool: SpritePool) {
  pool.release(arr[i].s);
  arr[i] = arr[arr.length - 1];
  arr.pop();
}

/** Освободить весь список. */
export function releaseAll<T extends { s: Sprite }>(arr: T[], pool: SpritePool) {
  while (arr.length) releaseAt(arr, arr.length - 1, pool);
}
