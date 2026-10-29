import { WEAPON_COST, WEAPON_KINDS, type WeaponKind } from '../game/balance';
import type { Weapons } from '../progress';
import { CoinIcon } from '../ui/CoinIcon';
import { WeaponBadge } from '../ui/WeaponBadge';

const WEAPON_INFO: Record<WeaponKind, { title: string; about: string }> = {
  gun: { title: 'Пушка', about: 'прямо и метко' },
  spread: { title: 'Веер', about: 'широко, против роя' },
  pierce: { title: 'Иглы', about: 'насквозь по колонне' },
  laser: { title: 'Лазер', about: 'луч по всей линии' },
  rocket: { title: 'Ракеты', about: 'сами находят цель' },
};

/** Ангар, вкладка «Оружие»: купить вид и выбрать, с каким вылетать. */
export function WeaponGrid({
  weapons,
  coins,
  onPick,
}: {
  weapons: Weapons;
  coins: number;
  onPick: (kind: WeaponKind) => void;
}) {
  const { owned, selected } = weapons;
  return (
    <>
      <p className="hangar-note">С чем вылетать. В бою капсулы дают любое оружие.</p>
      <ul className="skins">
        {WEAPON_KINDS.map((kind) => {
          const { title, about } = WEAPON_INFO[kind];
          const cost = WEAPON_COST[kind];
          return (
            <li key={kind} className={`skin${kind === selected ? ' selected' : ''}`}>
              <WeaponBadge kind={kind} className={owned.includes(kind) ? 'big' : 'big locked'} />
              <span className="skin-title">{title}</span>
              <span className="weapon-about">{about}</span>
              {kind === selected ? (
                <span className="skin-state">Выбрано</span>
              ) : owned.includes(kind) ? (
                <button className="btn buy" onClick={() => onPick(kind)} aria-label={`Выбрать оружие: ${title}`}>
                  Выбрать
                </button>
              ) : (
                <button
                  className="btn buy"
                  disabled={cost > coins}
                  onClick={() => onPick(kind)}
                  aria-label={`Купить оружие: ${title} за ${cost}`}
                >
                  <CoinIcon />
                  {cost}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
