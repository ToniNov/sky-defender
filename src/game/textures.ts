import { Graphics, type Renderer, type Texture } from 'pixi.js';
import { SKIN_NAMES, type SkinName } from './balance';
import { skinSvg } from './skins';

/**
 * Вся графика игры рисуется векторно через Graphics и один раз
 * "запекается" в текстуры. Дальше в игре используются только быстрые Sprite.
 * Хотите свои картинки — замените нужный пункт на Assets.load('plane.png').
 */
/** Самолёт игрока в каждом скине: plane_classic, plane_delta… */
export type PlaneTextureName = `plane_${SkinName}`;
export const planeTexture = (skin: SkinName): PlaneTextureName => `plane_${skin}`;

export type TextureName =
  | PlaneTextureName
  | 'flame'
  | 'bullet'
  | 'enemyBullet'
  | 'missile'
  | 'scout'
  | 'saucer'
  | 'mother'
  | 'kamikaze'
  | 'shielder'
  | 'splitter'
  | 'mini'
  | 'spark'
  | 'star'
  | 'gun'
  | 'life'
  | 'shield'
  | 'magnet'
  | 'bomb'
  | 'shieldBubble'
  | 'magnetRing'
  | 'coin';

export type Textures = Record<TextureName, Texture>;

export function makeTextures(renderer: Renderer): Textures {
  const bake = (draw: (g: Graphics) => void) => {
    const g = new Graphics();
    draw(g);
    const texture = renderer.generateTexture({ target: g, resolution: 3, antialias: true });
    g.destroy();
    return texture;
  };

  const planes = Object.fromEntries(
    SKIN_NAMES.map((skin) => [planeTexture(skin), bake((g) => g.svg(skinSvg(skin)))]),
  ) as Record<PlaneTextureName, Texture>;

  return {
    // Самолёты игрока (носом вверх, ~60×58) — рисунки в skins.ts
    ...planes,

    flame: bake((g) => {
      g.poly([0, 0, 10, 0, 5, 18]).fill(0xff8a00);
      g.poly([2, 0, 8, 0, 5, 10]).fill(0xffe066);
    }),

    bullet: bake((g) => {
      g.roundRect(0, 0, 6, 18, 3).fill(0xffd23f);
      g.roundRect(1.5, 2, 3, 13, 1.5).fill(0xffffff);
    }),

    enemyBullet: bake((g) => {
      g.circle(6, 6, 6).fill(0xff3d6e);
      g.circle(6, 6, 3).fill(0xffffff);
    }),

    // Самонаводящийся снаряд босса (носом вниз), его можно сбить
    missile: bake((g) => {
      g.circle(9, 9, 9).fill({ color: 0x7fffd4, alpha: 0.25 });
      g.poly([9, 18, 14, 8, 12, 2, 6, 2, 4, 8]).fill(0x3fbf9f);
      g.poly([9, 15, 11.5, 8, 9, 4, 6.5, 8]).fill(0x7fffd4);
      g.circle(9, 9, 1.8).fill(0xffffff);
    }),

    // Маленький зелёный пришелец — быстрый, 1 попадание
    scout: bake((g) => {
      g.moveTo(13, 8).lineTo(9, 2).stroke({ width: 2, color: 0x7cf27c });
      g.moveTo(27, 8).lineTo(31, 2).stroke({ width: 2, color: 0x7cf27c });
      g.circle(9, 2, 2.5).fill(0xb6ff8a);
      g.circle(31, 2, 2.5).fill(0xb6ff8a);
      g.ellipse(20, 18, 16, 13).fill(0x4fbf4f);
      g.ellipse(20, 15.5, 14, 10).fill(0x7cf27c);
      g.ellipse(13, 18, 5, 6).fill(0x0d1b0d);
      g.ellipse(27, 18, 5, 6).fill(0x0d1b0d);
      g.circle(14.5, 16, 1.6).fill(0xffffff);
      g.circle(28.5, 16, 1.6).fill(0xffffff);
      g.moveTo(16, 26).quadraticCurveTo(20, 29, 24, 26).stroke({ width: 1.5, color: 0x0d1b0d });
    }),

    // Летающая тарелка — качается, стреляет
    saucer: bake((g) => {
      g.ellipse(30, 14, 13, 11).fill({ color: 0x9be7ff, alpha: 0.9 });
      g.circle(30, 15, 5).fill(0x7cf27c);
      g.ellipse(25, 9, 3, 2).fill({ color: 0xffffff, alpha: 0.8 });
      g.ellipse(30, 30, 11, 3).fill({ color: 0x7fd8ff, alpha: 0.55 });
      g.ellipse(30, 22, 29, 9).fill(0x6f78a0);
      g.ellipse(30, 20, 29, 6).fill(0xb7bfe0);
      for (const x of [10, 20, 30, 40, 50]) g.circle(x, 23.5, 2.2).fill(0xffe066);
    }),

    // Корабль-матка — босс
    mother: bake((g) => {
      g.ellipse(55, 20, 26, 18).fill({ color: 0xe0b3ff, alpha: 0.92 });
      g.ellipse(46, 12, 7, 4).fill({ color: 0xffffff, alpha: 0.7 });
      g.rect(30, 46, 6, 10).fill(0x3a1a55);
      g.rect(74, 46, 6, 10).fill(0x3a1a55);
      g.rect(52, 48, 6, 11).fill(0x3a1a55);
      g.ellipse(55, 36, 54, 16).fill(0x5a2a82);
      g.ellipse(55, 32, 54, 11).fill(0x8e44c7);
      g.ellipse(55, 30, 40, 6).fill(0xb26be8);
      for (let i = 0; i < 7; i++) g.circle(13 + i * 14, 40, 3).fill(i % 2 ? 0xff4d6d : 0xffe066);
    }),

    // Камикадзе — красный дротик носом вниз, разгоняется на игрока
    kamikaze: bake((g) => {
      g.poly([15, 34, 29, 4, 15, 11, 1, 4]).fill(0xc93a24);
      g.poly([15, 30, 25, 6, 15, 12, 5, 6]).fill(0xff5a3c);
      g.ellipse(15, 18, 4, 5).fill(0x1a0a08);
      g.circle(15, 19.5, 1.6).fill(0xffe066);
    }),

    // Щитоносец — броня снизу, бить можно только по краям
    shielder: bake((g) => {
      g.ellipse(28, 18, 22, 16).fill(0xc9952e);
      g.ellipse(28, 15, 19, 12).fill(0xf2c14e);
      g.ellipse(21, 15, 3.5, 4.5).fill(0x2a1a05);
      g.ellipse(35, 15, 3.5, 4.5).fill(0x2a1a05);
      g.circle(22, 13.5, 1.2).fill(0xffffff);
      g.circle(36, 13.5, 1.2).fill(0xffffff);
      g.roundRect(12, 33, 32, 9, 4).fill(0x8a96ad); // щит, ширина = 2 × plateHalf
      g.roundRect(12, 33, 32, 4, 2).fill(0xdfe6f2);
      for (const x of [17, 28, 39]) g.circle(x, 39, 1.3).fill(0x4a5266);
    }),

    // Сплиттер — при смерти распадается на два осколка
    splitter: bake((g) => {
      g.circle(22, 22, 21).fill(0xc85fa8);
      g.circle(22, 20, 18).fill(0xff8fd8);
      g.moveTo(22, 2).lineTo(19, 12).lineTo(25, 20).lineTo(20, 30).lineTo(22, 42).stroke({ width: 2, color: 0x5a1a48 });
      g.circle(13, 19, 4).fill(0x2a0a22);
      g.circle(31, 19, 4).fill(0x2a0a22);
      g.circle(14, 18, 1.4).fill(0xffffff);
      g.circle(32, 18, 1.4).fill(0xffffff);
    }),

    mini: bake((g) => {
      g.circle(12, 12, 11).fill(0xc85fa8);
      g.circle(12, 11, 9).fill(0xff8fd8);
      g.circle(12, 11, 3).fill(0x2a0a22);
      g.circle(12.8, 10.2, 1).fill(0xffffff);
    }),

    spark: bake((g) => {
      g.circle(4, 4, 4).fill(0xffffff);
    }),

    star: bake((g) => {
      g.circle(2, 2, 2).fill(0xffffff);
    }),

    // Бонус: усиление пушки
    gun: bake((g) => {
      g.circle(14, 14, 14).fill({ color: 0xffd23f, alpha: 0.25 });
      g.star(14, 14, 5, 11, 5).fill(0xffd23f);
      g.star(14, 14, 5, 6, 2.6).fill(0xffffff);
    }),

    // Бонус: дополнительная жизнь
    life: bake((g) => {
      g.circle(14, 14, 14).fill({ color: 0xff4d8d, alpha: 0.25 });
      g.moveTo(14, 22).bezierCurveTo(2, 14, 6, 3, 14, 9.5).bezierCurveTo(22, 3, 26, 14, 14, 22).fill(0xff4d8d);
      g.ellipse(10, 11, 2, 1.4).fill({ color: 0xffffff, alpha: 0.8 });
    }),

    // Бонус: щит
    shield: bake((g) => {
      g.circle(14, 14, 14).fill({ color: 0x5fd4ff, alpha: 0.25 });
      g.poly([14, 4, 23, 7.5, 22, 15, 14, 24, 6, 15, 5, 7.5]).fill(0x5fd4ff);
      g.poly([14, 7, 19.5, 9.5, 19, 14.5, 14, 20.5]).fill({ color: 0xffffff, alpha: 0.6 });
    }),

    // Бонус: магнит (подкова)
    magnet: bake((g) => {
      g.circle(14, 14, 14).fill({ color: 0xff6b6b, alpha: 0.25 });
      g.arc(14, 13, 6.5, Math.PI, 0, true).stroke({ width: 5, color: 0xff6b6b });
      g.moveTo(7.5, 13).lineTo(7.5, 7).stroke({ width: 5, color: 0xff6b6b });
      g.moveTo(20.5, 13).lineTo(20.5, 7).stroke({ width: 5, color: 0xff6b6b });
      g.rect(5, 4, 5, 3.5).fill(0xeef6ff);
      g.rect(18, 4, 5, 3.5).fill(0xeef6ff);
    }),

    // Бонус: бомба
    bomb: bake((g) => {
      g.circle(14, 14, 14).fill({ color: 0xff9f1c, alpha: 0.25 });
      g.circle(13, 16, 8).fill(0x2a2f45);
      g.circle(10.5, 13.5, 2.2).fill({ color: 0xffffff, alpha: 0.5 });
      g.moveTo(18, 10).quadraticCurveTo(21, 6, 23, 6).stroke({ width: 1.8, color: 0xd9c08a });
      g.circle(23, 5.5, 2.6).fill(0xff9f1c);
      g.circle(23, 5.5, 1.2).fill(0xffe066);
    }),

    // Пузырь щита вокруг самолёта
    shieldBubble: bake((g) => {
      g.circle(40, 40, 38).fill({ color: 0x5fd4ff, alpha: 0.12 });
      g.circle(40, 40, 38).stroke({ width: 2.5, color: 0x9be7ff, alpha: 0.85 });
      g.arc(40, 40, 32, -2.5, -1.6).stroke({ width: 3, color: 0xffffff, alpha: 0.6 });
    }),

    // Монета, ~18×18
    coin: bake((g) => {
      g.circle(9, 9, 9).fill(0xe0a100);
      g.circle(9, 9, 7).fill(0xffd23f);
      g.roundRect(7.5, 4.5, 3, 9, 1.5).fill(0xfff1a8);
    }),

    // Пунктирное кольцо, пока действует магнит
    magnetRing: bake((g) => {
      const dashes = 12;
      for (let i = 0; i < dashes; i++) {
        const a = (i / dashes) * Math.PI * 2;
        g.moveTo(46 + Math.cos(a) * 44, 46 + Math.sin(a) * 44);
        g.arc(46, 46, 44, a, a + (Math.PI / dashes) * 0.9);
        g.stroke({ width: 2.5, color: 0xff6b6b, alpha: 0.75 });
      }
    }),
  };
}
