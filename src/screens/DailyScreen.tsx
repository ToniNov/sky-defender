import { dailyReward, dailySlot } from '../daily';
import { DAILY } from '../game/balance';
import { CoinIcon } from '../ui/CoinIcon';
import { Screen } from '../ui/Screen';

export function DailyScreen({ streak, onClaim, onClose }: { streak: number; onClaim: () => void; onClose: () => void }) {
  const slot = dailySlot(streak);
  return (
    <Screen>
      <h2 className="title small">Награда дня</h2>
      <p className="subtitle">Заходи каждый день — награда растёт. Пропустишь день — серия начнётся заново.</p>
      <ol className="daily-days">
        {DAILY.rewards.map((coins, i) => (
          <li
            key={i}
            className={i < slot ? 'done' : i === slot ? 'today' : ''}
            aria-label={`День ${i + 1}: ${coins}${i < slot ? ', получено' : i === slot ? ', сегодня' : ''}`}
          >
            <span className="daily-day">{i < slot ? '✓' : `День ${i + 1}`}</span>
            <CoinIcon />
            <span className="daily-coins">{coins}</span>
          </li>
        ))}
      </ol>
      <button className="btn primary" onClick={onClaim}>
        Забрать {dailyReward(streak)}
      </button>
      <button className="btn ghost" onClick={onClose}>
        Позже
      </button>
    </Screen>
  );
}
