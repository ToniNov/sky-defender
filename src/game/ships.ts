import { Assets, type Texture } from 'pixi.js';
import { SKIN_NAMES, type SkinName } from './balance';
import { skinSvg } from './skins';
import { planeTexture, type TextureName } from './textures';

/**
 * Нарисованные модели кораблей: src/assets/ships/<файл>.png, 256×256, центр картинки = центр хитбокса.
 * Как их делать — docs/art-brief.md. Если картинки нет или она не загрузилась,
 * остаётся векторный рисунок из textures.ts / skins.ts.
 */
const FILES = import.meta.glob<string>('../assets/ships/*.png', { eager: true, query: '?url', import: 'default' });
const fileUrl = (file: string): string | undefined => FILES[`../assets/ships/${file}.png`];

/** Какой файл у какой текстуры и каким квадратом (px на экране) её показывать. */
const SHIPS: Partial<Record<TextureName, { file: string; size: number }>> = {
  ...Object.fromEntries(SKIN_NAMES.map((skin) => [planeTexture(skin), { file: `player-${skin}`, size: 64 }])),
  scout: { file: 'enemy-scout', size: 40 },
  saucer: { file: 'enemy-saucer', size: 60 },
  mother: { file: 'enemy-mother', size: 110 },
  kamikaze: { file: 'enemy-kamikaze', size: 44 }, // узкий — квадрат крупнее, чтобы не потерялся
  shielder: { file: 'enemy-shielder', size: 56 },
  splitter: { file: 'enemy-splitter', size: 48 },
  mini: { file: 'enemy-mini', size: 36 }, // левая половина сплиттера, правый осколок зеркалится
};

export type ShipTextures = Partial<Record<TextureName, Texture>>;

/** Загрузить картинки кораблей. Не загрузилась — просто нет в ответе. */
export async function loadShipTextures(): Promise<ShipTextures> {
  const entries = await Promise.all(
    Object.entries(SHIPS).map(async ([name, { file, size }]) => {
      const src = fileUrl(file);
      if (!src) return null;
      try {
        // resolution ужимает 256 px картинки до нужного размера на экране; мипмапы — чтобы не рябило при уменьшении
        const texture = await Assets.load<Texture>({ src, data: { resolution: 256 / size, autoGenerateMipmaps: true } });
        return [name, texture] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((e) => e !== null));
}

/** Картинка скина для <img> в меню и ангаре: нарисованная, а если её нет — векторная. */
export const skinImage = (skin: SkinName) =>
  fileUrl(`player-${skin}`) ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(skinSvg(skin))}`;
