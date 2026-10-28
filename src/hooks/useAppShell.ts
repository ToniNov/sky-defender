import { useEffect } from 'react';
import { music } from '../audio';
import type { Phase } from '../game/Game';
import { backButton, initTelegram } from '../telegram';
import type { Overlay } from './types';

type SetPhase = (update: Phase | ((p: Phase) => Phase)) => void;

/**
 * Оболочка мини-аппа вокруг фаз игры: запуск Telegram, пауза при сворачивании,
 * Esc / P на компьютере, системная кнопка «Назад», музыка только в бою.
 */
export function useAppShell(phase: Phase, setPhase: SetPhase, overlay: Overlay | null, closeOverlay: () => void) {
  useEffect(() => {
    initTelegram();
  }, []);

  // Пауза, если свернули Telegram / переключили вкладку
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPhase((p) => (p === 'playing' ? 'paused' : p));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setPhase]);

  // Esc / P — пауза на компьютере (открытые настройки или ангар Esc закрывает)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (overlay) {
        if (e.code === 'Escape') closeOverlay();
        return;
      }
      setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, closeOverlay, setPhase]);

  // Системная кнопка «Назад» в Telegram: закрывает настройки и ангар; в бою — пауза, на паузе — в меню
  useEffect(() => {
    const bb = backButton;
    if (!bb || (phase !== 'playing' && phase !== 'paused' && !overlay)) return;
    const onBack = () => {
      if (overlay) closeOverlay();
      else setPhase((p) => (p === 'playing' ? 'paused' : 'menu'));
    };
    bb.show();
    bb.onClick(onBack);
    return () => {
      bb.offClick(onBack);
      bb.hide();
    };
  }, [phase, overlay, closeOverlay, setPhase]);

  // Музыка играет только во время боя
  useEffect(() => {
    if (phase === 'playing') music.start();
    else music.stop();
  }, [phase]);
}
