import { Graphics, type Renderer, type Texture } from 'pixi.js';

/**
 * Вся графика игры рисуется векторно через Graphics и один раз
 * "запекается" в текстуры. Дальше в игре используются только быстрые Sprite.
 * Хотите свои картинки — замените нужный пункт на Assets.load('plane.png').
 */
export type TextureName =
  | 'plane'
  | 'flame'
  | 'bullet'
  | 'enemyBullet'
  | 'scout'
  | 'saucer'
  | 'mother'
  | 'spark'
  | 'star'
  | 'gun'
  | 'life';

export type Textures = Record<TextureName, Texture>;

export function makeTextures(renderer: Renderer): Textures {
  const bake = (draw: (g: Graphics) => void) => {
    const g = new Graphics();
    draw(g);
    const texture = renderer.generateTexture({ target: g, resolution: 3, antialias: true });
    g.destroy();
    return texture;
  };

  return {
    // Самолёт игрока (носом вверх), ~60×58
    plane: bake((g) => {
      g.poly([32, 20, 62, 40, 62, 47, 32, 39, 2, 47, 2, 40]).fill(0x3fa9f5); // крылья
      g.poly([32, 20, 62, 40, 62, 43, 32, 33, 2, 43, 2, 40]).fill(0x7cc8ff); // блик на крыльях
      g.rect(2, 40, 3, 7).fill(0xff5a5f); // законцовки крыльев
      g.rect(59, 40, 3, 7).fill(0xff5a5f);
      g.poly([32, 46, 46, 57, 46, 61, 32, 56, 18, 61, 18, 57]).fill(0x2b7fc4); // хвост
      g.roundRect(26, 4, 12, 54, 6).fill(0xeef6ff); // фюзеляж
      g.rect(26, 30, 12, 4).fill(0xff5a5f); // полоса
      g.ellipse(32, 17, 3.5, 7).fill(0x1b2b48); // кабина
      g.ellipse(31, 14.5, 1.2, 3).fill({ color: 0xffffff, alpha: 0.7 });
    }),

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
  };
}
