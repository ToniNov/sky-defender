import { useCallback, useEffect, useState } from 'react';
import {
  canSubmit,
  claimReferrals,
  fetchLeaderboard,
  fetchReferrals,
  prepareShare,
  type Leaderboard,
  type Referrals,
} from '../api';
import { REFERRAL } from '../game/balance';
import { haptic, shareLink, shareMessage } from '../telegram';
import { rewardFeedback } from './feedback';
import type { Overlay, ProgressStore } from './types';

const INVITE_TEXT = 'Полетели со мной в «Небесный патруль» — сбивать пришельцев!';

export type ShareState = 'idle' | 'busy' | 'sent' | 'failed';
/** 'loading' — ждём сервер, null — сервер не ответил. */
export type BoardState = Leaderboard | null | 'loading';

/** Всё, что связано с другими игроками: таблица лидеров, друзья по ссылке, «Поделиться результатом». */
export function useSocial(store: ProgressStore, overlay: Overlay | null) {
  const [referrals, setReferrals] = useState<Referrals | null>(null); // друзья по ссылке; null — ещё не знаем или сервера нет
  const [referralsAsked, setReferralsAsked] = useState(false); // сервер уже ответил (или не ответил) хотя бы раз
  const [board, setBoard] = useState<BoardState>('loading');
  const [share, setShare] = useState<ShareState>('idle');

  // Сколько друзей пришло — при запуске и при каждом открытии экрана «Друзья»
  useEffect(() => {
    if (!canSubmit || (overlay !== null && overlay !== 'friends')) return;
    fetchReferrals().then((r) => {
      if (r) setReferrals(r);
      setReferralsAsked(true);
    });
  }, [overlay]);

  // Таблица лидеров — заново при каждом открытии экрана; при закрытии снова «загрузка»
  useEffect(() => {
    if (overlay !== 'leaders') return;
    let open = true;
    fetchLeaderboard().then((b) => open && setBoard(b));
    return () => {
      open = false;
      setBoard('loading');
    };
  }, [overlay]);

  const claimFriends = useCallback(async () => {
    const claimed = await claimReferrals();
    if (!claimed) return;
    store.commit({ coins: store.get().coins + claimed * REFERRAL.reward });
    setReferrals((r) => r && { ...r, unclaimed: 0 });
    rewardFeedback();
  }, [store]);

  const invite = useCallback(() => {
    if (!referrals?.link) return;
    haptic.impact('light');
    shareLink(referrals.link, INVITE_TEXT);
  }, [referrals]);

  /** Сервер готовит сообщение с очками партии, Telegram открывает выбор чата. */
  const shareScore = useCallback(async (score: number) => {
    setShare('busy');
    haptic.impact('light');
    const id = await prepareShare(score);
    if (!id) {
      setShare('failed');
      return;
    }
    const sent = await shareMessage(id);
    setShare(sent ? 'sent' : 'idle'); // закрыл окно, не выбрав чат, — можно нажать ещё раз
    if (sent) haptic.notify('success');
  }, []);

  const resetShare = useCallback(() => setShare('idle'), []);

  return { referrals, referralsAsked, claimFriends, invite, board, share, shareScore, resetShare };
}
