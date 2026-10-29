import type { ShareState } from '../hooks/useSocial';
import { CoinIcon } from '../ui/CoinIcon';
import { Screen } from '../ui/Screen';

/** «Самолёт сбит»: итог партии. */
export function OverScreen({
  score,
  newRecord,
  best,
  rank,
  runCoins,
  coins,
  share,
  onShare,
  onRestart,
  onMenu,
}: {
  score: number;
  newRecord: boolean;
  best: number;
  /** Место в таблице лидеров; null — сервер не ответил или его нет. */
  rank: number | null;
  runCoins: number;
  coins: number;
  /** null — «Поделиться» недоступно (вне Telegram, без сервера или старый клиент). */
  share: ShareState | null;
  onShare: () => void;
  onRestart: () => void;
  onMenu: () => void;
}) {
  return (
    <Screen>
      <h2 className="title small">Самолёт сбит</h2>
      {newRecord && <p className="record">Новый рекорд!</p>}
      <p className="score-big">{score}</p>
      <p className="best">Рекорд: {best}</p>
      {rank !== null && <p className="best">Место в таблице лидеров: {rank}</p>}
      {runCoins > 0 && (
        <p className="wallet" aria-label={`Собрано монет: ${runCoins}, всего ${coins}`}>
          <CoinIcon />+{runCoins} <span className="wallet-total">всего {coins}</span>
        </p>
      )}
      <button className="btn primary" onClick={onRestart}>
        Ещё раз
      </button>
      {share !== null && (
        <button className="btn ghost" disabled={share === 'busy' || share === 'sent'} onClick={onShare}>
          {share === 'sent' ? '✓ Отправлено' : '📤 Поделиться результатом'}
        </button>
      )}
      {share === 'failed' && <p className="best">Не получилось поделиться. Попробуй ещё раз.</p>}
      <button className="btn ghost" onClick={onMenu}>
        В меню
      </button>
    </Screen>
  );
}
