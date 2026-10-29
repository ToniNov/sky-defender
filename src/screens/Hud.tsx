import { PLAYER, type Weapon } from '../game/balance';
import { CoinIcon } from '../ui/CoinIcon';
import { Heart } from '../ui/Heart';
import { SoundButton } from '../ui/SoundButton';

/** Полоса сверху в бою: очки, комбо, пушка, монеты, жизни, звук и пауза. */
export function Hud({
  score,
  combo,
  weapon,
  coins,
  lives,
  soundOn,
  onToggleSound,
  onPause,
}: {
  score: number;
  combo: number;
  weapon: Weapon;
  coins: number;
  lives: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onPause: () => void;
}) {
  return (
    <header className="hud">
      <div className="hud-score">
        <span className="hud-label">Очки</span>
        <span className="hud-value">
          {score}
          {combo > 1 && (
            // key меняется с множителем — значок заново проигрывает анимацию
            <span key={combo} className="hud-combo" aria-label={`Множитель очков ×${combo}`}>
              ×{combo}
            </span>
          )}
        </span>
        <span className="hud-weapon" aria-label={`Пушка: уровень ${weapon.level}`}>
          {Array.from({ length: PLAYER.maxWeapon }, (_, i) => (
            <i key={i} className={i < weapon.level ? 'on' : ''} />
          ))}
        </span>
        <span className="hud-coins" aria-label={`Монеты за партию: ${coins}`}>
          <CoinIcon />
          {coins}
        </span>
      </div>
      <div className="hud-right">
        <div className="hearts" aria-label={`Жизни: ${lives}`}>
          {Array.from({ length: lives }, (_, i) => (
            <Heart key={i} />
          ))}
        </div>
        <SoundButton on={soundOn} onClick={onToggleSound} />
        <button className="icon-btn" onClick={onPause} aria-label="Пауза">
          <span className="pause-icon" />
        </button>
      </div>
    </header>
  );
}
