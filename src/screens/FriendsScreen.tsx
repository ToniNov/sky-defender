import type { Referrals } from '../api';
import { REFERRAL } from '../game/balance';
import { CoinIcon } from '../ui/CoinIcon';
import { Screen } from '../ui/Screen';

export function FriendsScreen({
  referrals,
  asked,
  onClaim,
  onInvite,
  onClose,
}: {
  referrals: Referrals | null;
  asked: boolean;
  onClaim: () => void;
  onInvite: () => void;
  onClose: () => void;
}) {
  const unclaimed = referrals?.unclaimed ?? 0;
  return (
    <Screen>
      <h2 className="title small">Друзья</h2>
      <p className="subtitle">
        Позови друга по своей ссылке. Когда друг сыграет первую партию, ты получишь <CoinIcon />
        {REFERRAL.reward}.
      </p>
      {referrals && <p className="best">Пришло по твоей ссылке: {referrals.invited}</p>}
      {unclaimed > 0 && (
        <button className="btn primary" onClick={onClaim}>
          Забрать <CoinIcon />
          {unclaimed * REFERRAL.reward}
        </button>
      )}
      {referrals?.link ? (
        <button className={`btn ${unclaimed > 0 ? 'ghost' : 'primary'}`} onClick={onInvite}>
          Пригласить друга
        </button>
      ) : (
        <p className="subtitle">
          {referrals ? 'Приглашения пока недоступны.' : asked ? 'Сервер сейчас недоступен. Попробуй позже.' : 'Загрузка…'}
        </p>
      )}
      <button className="btn ghost" onClick={onClose}>
        Готово
      </button>
    </Screen>
  );
}
