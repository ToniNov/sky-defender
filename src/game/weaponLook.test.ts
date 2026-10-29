import { describe, expect, it } from 'vitest';
import { WEAPON_KINDS } from './balance';
import { WEAPON_LOOK, weaponCssColor } from './weaponLook';

describe('вид оружия', () => {
  it('цвет для CSS — шесть шестнадцатеричных цифр', () => {
    expect(weaponCssColor('gun')).toBe('#ffd23f');
    for (const kind of WEAPON_KINDS) expect(weaponCssColor(kind)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('у каждого вида своя буква', () => {
    const letters = WEAPON_KINDS.map((k) => WEAPON_LOOK[k].letter);
    expect(new Set(letters).size).toBe(letters.length);
  });
});
