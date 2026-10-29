import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackRun } from '../analytics';
import { startRun, submitScore } from '../api';
import { unlockAudio } from '../audio';
import type { QuestKind } from '../game/balance';
import type { Phase } from '../game/Game';
import type { WorldEvents } from '../game/World';
import { applyRun, emptyRunStats, questComplete, type Quest, type RunStats } from '../quests';
import { haptic } from '../telegram';
import type { ProgressStore } from './types';

const QUEST_TOAST_MS = 2600;

/**
 * Партия: события мира → HUD, статистика для заданий и монет, зачисление в сохранение, отправка очков.
 * Единственное место, которое принимает WorldEvents.
 */
export function useRun(store: ProgressStore, phase: Phase, setPhase: (phase: Phase) => void) {
  const [session, setSession] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [weapon, setWeapon] = useState(1);
  const [combo, setCombo] = useState(1);
  const [coins, setCoins] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [rank, setRank] = useState<number | null>(null); // место в таблице лидеров после партии
  const [questToast, setQuestToast] = useState<Quest | null>(null);
  const runRef = useRef<RunStats>(emptyRunStats()); // статистика партии для заданий и монет
  const bankedRef = useRef<RunStats>(emptyRunStats()); // она же на момент прошлого зачисления в прогресс
  const toastedRef = useRef(new Set<QuestKind>()); // о каких заданиях уже сказали в этой партии
  const submitRef = useRef(0); // номер отправки рекорда: ответ на старую не должен попасть в новую партию

  /** Зачислить монеты, задания и рекорд партии в сохранение. Можно звать сколько угодно раз — ничего не задвоится. */
  const bank = useCallback(
    (finalScore = 0) => {
      const p = store.get();
      const run = runRef.current;
      const earned = run.coins - bankedRef.current.coins;
      const quests = applyRun(p.quests, run, bankedRef.current);
      bankedRef.current = { ...run, kills: { ...run.kills } };
      if (earned <= 0 && finalScore <= p.best && JSON.stringify(quests) === JSON.stringify(p.quests)) return;
      store.commit({ best: Math.max(p.best, finalScore), coins: p.coins + earned, quests });
    },
    [store],
  );

  /** Сказать в бою, что задание выполнено (награду забирают в меню). */
  const checkQuests = useCallback(() => {
    const saved = store.get().quests;
    const live = applyRun(saved, runRef.current, bankedRef.current);
    const q = live.active.find((a) => questComplete(a) && !toastedRef.current.has(a.kind));
    if (!q) return;
    toastedRef.current.add(q.kind);
    const already = saved.active.find((a) => a.kind === q.kind);
    if (already && questComplete(already)) return; // было выполнено ещё до партии
    setQuestToast(q);
    haptic.notify('success');
  }, [store]);

  useEffect(() => {
    if (!questToast) return;
    const timer = setTimeout(() => setQuestToast(null), QUEST_TOAST_MS);
    return () => clearTimeout(timer);
  }, [questToast]);

  // На паузе и при выходе в меню монеты сохраняем сразу: игру могут закрыть, не доиграв
  useEffect(() => {
    if (phase === 'paused' || phase === 'menu') bank();
  }, [phase, bank]);

  /** Новая партия: сбросить статистику, пересоздать мир, сказать серверу, что начали. Фазу меняет вызывающий. */
  const start = useCallback(() => {
    setNewRecord(false);
    setRank(null);
    submitRef.current++;
    runRef.current = emptyRunStats();
    bankedRef.current = emptyRunStats();
    toastedRef.current.clear();
    setQuestToast(null);
    setSession((s) => s + 1);
    startRun();
    haptic.impact('medium');
    unlockAudio();
  }, []);

  // События из игрового мира → состояние React (HUD) + вибрация
  const events = useMemo<WorldEvents>(
    () => ({
      score: (n) => {
        setScore(n);
        runRef.current.score = n;
        checkQuests();
      },
      lives: setLives,
      weapon: setWeapon,
      combo: (m) => {
        setCombo(m);
        runRef.current.combo = Math.max(runRef.current.combo, m);
        checkQuests();
      },
      hit: () => haptic.impact('heavy'),
      kill: (kind) => {
        haptic.impact(kind === 'mother' ? 'heavy' : 'light');
        const { kills } = runRef.current;
        kills[kind] = (kills[kind] ?? 0) + 1;
        checkQuests();
      },
      bossDown: (flawless) => {
        if (flawless) runRef.current.flawlessBosses++;
        checkQuests();
      },
      powerUp: () => {
        haptic.notify('success');
        runRef.current.powerUps++;
        checkQuests();
      },
      coins: (n) => {
        setCoins(n);
        runRef.current.coins = n;
        checkQuests();
      },
      wave: (n) => {
        runRef.current.wave = n;
        checkQuests();
      },
      gameOver: (final, death) => {
        const record = final > store.get().best;
        bank(final);
        trackRun(final, runRef.current.wave, death);
        setNewRecord(record);
        // Шлём очки партии: сервер проверяет, можно ли их набрать за время с начала партии
        const id = ++submitRef.current;
        submitScore(final).then((r) => {
          if (r && id === submitRef.current) setRank(r.rank);
        });
        setPhase('over');
        haptic.notify(record ? 'success' : 'error');
      },
    }),
    [bank, checkQuests, store, setPhase],
  );

  return { session, events, start, score, lives, weapon, combo, coins, newRecord, rank, questToast };
}
