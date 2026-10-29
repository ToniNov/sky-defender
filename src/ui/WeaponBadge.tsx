import type { CSSProperties } from 'react';
import type { WeaponKind } from '../game/balance';
import { WEAPON_LOOK, weaponCssColor } from '../game/weaponLook';

/** Капсула вида оружия — цвет и буква, как у капсулы в игре. */
export function WeaponBadge({ kind, className = '' }: { kind: WeaponKind; className?: string }) {
  return (
    <b className={`weapon-badge ${className}`} style={{ '--weapon': weaponCssColor(kind) } as CSSProperties} aria-hidden>
      {WEAPON_LOOK[kind].letter}
    </b>
  );
}
