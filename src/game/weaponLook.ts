import type { WeaponKind } from './balance';

/**
 * Как выглядит вид оружия: цвет и буква капсулы, название при смене.
 * Без Pixi — отсюда берут и текстуры игры, и HUD.
 */
export const WEAPON_LOOK: Record<WeaponKind, { color: number; letter: string; label: string }> = {
  gun: { color: 0xffd23f, letter: 'П', label: 'ПУШКА' },
  spread: { color: 0x6ff2c0, letter: 'В', label: 'ВЕЕР' },
  laser: { color: 0xff5c8a, letter: 'Л', label: 'ЛАЗЕР' },
  pierce: { color: 0x8ab4ff, letter: 'И', label: 'ИГЛЫ' },
  rocket: { color: 0xff9a3c, letter: 'Р', label: 'РАКЕТЫ' },
};

/** Цвет вида для CSS: 0xffd23f → '#ffd23f'. */
export const weaponCssColor = (kind: WeaponKind) => `#${WEAPON_LOOK[kind].color.toString(16).padStart(6, '0')}`;
