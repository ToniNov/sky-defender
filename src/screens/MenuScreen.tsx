import { version } from '../../package.json';
import type { SkinName } from '../game/balance';
import { skinImage } from '../game/ships';
import type { Overlay } from '../hooks/types';
import { CoinIcon } from '../ui/CoinIcon';
import { Screen } from '../ui/Screen';

export function MenuScreen({
  skin,
  pilot,
  dailyCoins,
  questsReady,
  showLeaders,
  newFriends,
  best,
  coins,
  onStart,
  onOpen,
}: {
  skin: SkinName;
  /** Имя из Telegram; вне Telegram — нет. */
  pilot: string | undefined;
  /** Награда дня, если её можно забрать сегодня. */
  dailyCoins: number | null;
  questsReady: number;
  showLeaders: boolean;
  /** Новых друзей по ссылке; null — кнопки «Друзья» нет (вне Telegram или без сервера). */
  newFriends: number | null;
  best: number;
  coins: number;
  onStart: () => void;
  onOpen: (overlay: Overlay) => void;
}) {
  return (
    <>
      <div className="corner">
        <button className="icon-btn" onClick={() => onOpen('settings')} aria-label="Настройки">
          <span className="sound-icon">⚙️</span>
        </button>
      </div>
      <Screen>
        <div className="logo" aria-hidden>
          <img src={skinImage(skin)} width={72} height={72} alt="" />
        </div>
        <h1 className="title">
          Небесный
          <br />
          патруль
        </h1>
        <p className="subtitle">{pilot ? `Пилот ${pilot}, пришельцы атакуют!` : 'Пришельцы атакуют. Только ты можешь их остановить!'}</p>
        {dailyCoins !== null && (
          <button className="btn gift" onClick={() => onOpen('daily')}>
            🎁 Награда дня: <CoinIcon />
            {dailyCoins}
          </button>
        )}
        <button className="btn primary" onClick={onStart}>
          Взлететь
        </button>
        <div className="menu-row">
          <button className="btn ghost" onClick={() => onOpen('hangar')}>
            Ангар
          </button>
          <button className="btn ghost" onClick={() => onOpen('quests')}>
            Задания
            {questsReady > 0 && (
              <span className="badge" aria-label={`Готово к получению: ${questsReady}`}>
                {questsReady}
              </span>
            )}
          </button>
        </div>
        {showLeaders && (
          <div className="menu-row">
            <button className="btn ghost" onClick={() => onOpen('leaders')}>
              🏆 Лидеры
            </button>
            {newFriends !== null && (
              <button className="btn ghost" onClick={() => onOpen('friends')}>
                👥 Друзья
                {newFriends > 0 && (
                  <span className="badge" aria-label={`Новых друзей: ${newFriends}`}>
                    {newFriends}
                  </span>
                )}
              </button>
            )}
          </div>
        )}
        {best > 0 && <p className="best">Рекорд: {best}</p>}
        {coins > 0 && (
          <p className="wallet" aria-label={`Монеты: ${coins}`}>
            <CoinIcon />
            {coins}
          </p>
        )}
        <ul className="hints">
          <li>Веди пальцем по экрану — самолёт летит следом</li>
          <li>Стрельба автоматическая</li>
          <li>
            <span className="star">★</span> усиливает пушку, <span className="heart">♥</span> даёт жизнь
          </li>
        </ul>
        <p className="version">v{version}</p>
      </Screen>
    </>
  );
}
