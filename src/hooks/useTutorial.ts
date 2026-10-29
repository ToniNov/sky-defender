import { useCallback, useEffect, useRef, useState } from 'react';
import type { Phase } from '../game/Game';
import { loadTutorialSeen, saveTutorialSeen, tutorialSeenLocal } from '../telegram';

const TUTORIAL_MAX_MS = 8000;

/** Подсказка «веди пальцем»: пропадает при первом касании (или через пару секунд) и больше не показывается. */
export function useTutorial(phase: Phase) {
  const [tutorial, setTutorial] = useState(false);
  const seenRef = useRef(tutorialSeenLocal());

  useEffect(() => {
    loadTutorialSeen().then((seen) => {
      if (seen) seenRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!tutorial || phase !== 'playing') return;
    const done = () => {
      seenRef.current = true;
      saveTutorialSeen();
      setTutorial(false);
    };
    const timer = setTimeout(done, TUTORIAL_MAX_MS);
    window.addEventListener('pointerdown', done);
    window.addEventListener('keydown', done);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', done);
      window.removeEventListener('keydown', done);
    };
  }, [tutorial, phase]);

  /** В начале партии: показать, если ещё не видели. */
  const begin = useCallback(() => setTutorial(!seenRef.current), []);

  return { shown: tutorial && phase === 'playing', begin };
}
