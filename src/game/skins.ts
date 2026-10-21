import type { SkinName } from './balance';

/**
 * Скины самолёта: SVG 64×64, носом вверх, центр — середина картинки (там хитбокс).
 * Одна и та же строка запекается в текстуру Pixi (textures.ts) и показывается в меню и ангаре (<img>).
 * Парсер Pixi понимает polygon, path, rect (с rx), circle, ellipse, fill и fill-opacity — другим не пользоваться.
 * В points у polygon — только целые числа: Pixi читает их как /-?\d+/, и 43.5 превращается в «43, 5».
 * Нарисованные картинки, когда появятся, заменят нужный пункт: src/assets/ + Assets.load.
 */

interface Palette {
  wing: string;
  wingLight: string;
  tips: string;
  tail: string;
  body: string;
  stripe: string;
  canopy: string;
}

/** Классическая форма — её перекрашивают первые скины. */
const classic = (c: Palette) => `
  <polygon points="32,20 62,40 62,47 32,39 2,47 2,40" fill="${c.wing}"/>
  <polygon points="32,20 62,40 62,43 32,33 2,43 2,40" fill="${c.wingLight}"/>
  <rect x="2" y="40" width="3" height="7" fill="${c.tips}"/>
  <rect x="59" y="40" width="3" height="7" fill="${c.tips}"/>
  <polygon points="32,46 46,57 46,61 32,56 18,61 18,57" fill="${c.tail}"/>
  <rect x="26" y="4" width="12" height="54" rx="6" fill="${c.body}"/>
  <rect x="26" y="30" width="12" height="4" fill="${c.stripe}"/>
  <ellipse cx="32" cy="17" rx="3.5" ry="7" fill="${c.canopy}"/>
  <ellipse cx="31" cy="14.5" rx="1.2" ry="3" fill="#ffffff" fill-opacity="0.7"/>`;

const SHAPES: Record<SkinName, string> = {
  classic: classic({
    wing: '#3fa9f5',
    wingLight: '#7cc8ff',
    tips: '#ff5a5f',
    tail: '#2b7fc4',
    body: '#eef6ff',
    stripe: '#ff5a5f',
    canopy: '#1b2b48',
  }),
  sunset: classic({
    wing: '#ff8a3d',
    wingLight: '#ffb27a',
    tips: '#ffe066',
    tail: '#d9622b',
    body: '#fff4e6',
    stripe: '#e8434f',
    canopy: '#3b1d2e',
  }),
  emerald: classic({
    wing: '#22c47a',
    wingLight: '#7ef0b4',
    tips: '#ffd23f',
    tail: '#178f58',
    body: '#effff6',
    stripe: '#ffd23f',
    canopy: '#123d2a',
  }),
  night: classic({
    wing: '#2a3050',
    wingLight: '#424a78',
    tips: '#00e5ff',
    tail: '#1c2138',
    body: '#3a4262',
    stripe: '#00e5ff',
    canopy: '#00e5ff',
  }),

  // Реактивный с треугольным крылом
  delta: `
  <polygon points="32,10 62,52 32,46 2,52" fill="#e84a5f"/>
  <polygon points="32,10 47,33 32,30 17,33" fill="#ff8090"/>
  <polygon points="32,46 62,52 58,54 32,49 6,54 2,52" fill="#b8344a"/>
  <polygon points="26,48 22,60 28,60 30,50" fill="#b8344a"/>
  <polygon points="38,48 42,60 36,60 34,50" fill="#b8344a"/>
  <rect x="28" y="2" width="8" height="56" rx="4" fill="#f4f6fb"/>
  <polygon points="28,22 18,30 28,29" fill="#e84a5f"/>
  <polygon points="36,22 46,30 36,29" fill="#e84a5f"/>
  <ellipse cx="32" cy="14" rx="2.6" ry="6" fill="#1b2b48"/>
  <ellipse cx="31.3" cy="12" rx="0.9" ry="2.4" fill="#ffffff" fill-opacity="0.7"/>`,

  // Угловатое «летающее крыло»
  stealth: `
  <polygon points="32,4 62,42 54,46 46,42 40,52 32,47 24,52 18,42 10,46 2,42" fill="#3a3f4f"/>
  <polygon points="32,4 62,42 54,46 46,42 32,22" fill="#2b2f3c"/>
  <polygon points="32,4 2,42 10,46 18,42 32,22" fill="#4a5064"/>
  <polygon points="32,10 37,22 32,30 27,22" fill="#ffc44d"/>
  <polygon points="32,10 35,20 32,24" fill="#fff1b8" fill-opacity="0.8"/>
  <polygon points="2,42 10,46 18,42 18,44 10,48 2,44" fill="#ff5a5f"/>
  <polygon points="62,42 54,46 46,42 46,44 54,48 62,44" fill="#ff5a5f"/>`,

  // Ретро-биплан с пропеллером
  biplane: `
  <rect x="2" y="21" width="60" height="12" rx="5" fill="#e94f37"/>
  <rect x="2" y="21" width="60" height="4" rx="2" fill="#ff8a73"/>
  <circle cx="11" cy="27" r="1.6" fill="#7a2e1f"/>
  <circle cx="20" cy="27" r="1.6" fill="#7a2e1f"/>
  <circle cx="44" cy="27" r="1.6" fill="#7a2e1f"/>
  <circle cx="53" cy="27" r="1.6" fill="#7a2e1f"/>
  <polygon points="32,46 47,53 47,58 32,55 17,58 17,53" fill="#e94f37"/>
  <rect x="27" y="8" width="10" height="50" rx="5" fill="#f6e7c8"/>
  <rect x="27" y="40" width="10" height="3" fill="#e94f37"/>
  <circle cx="32" cy="34" r="3.6" fill="#3b2a20"/>
  <circle cx="32" cy="33" r="1.6" fill="#c08a5a"/>
  <ellipse cx="32" cy="6" rx="13" ry="2" fill="#c9d1e0" fill-opacity="0.75"/>
  <circle cx="32" cy="7" r="2.6" fill="#6b6f7a"/>`,
};

/** Полный SVG скина. */
export const skinSvg = (name: SkinName) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${SHAPES[name]}</svg>`;

/** Тот же SVG как адрес картинки — для <img> в интерфейсе. */
export const skinImage = (name: SkinName) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(skinSvg(name))}`;
