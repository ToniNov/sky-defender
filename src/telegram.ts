/**
 * Тонкая обёртка над Telegram WebApp API (скрипт telegram-web-app.js подключён в index.html).
 * Всё безопасно вызывать и вне Telegram — тогда вызовы просто ничего не делают.
 */

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { first_name?: string } };
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  HapticFeedback?: {
    impactOccurred(style: ImpactStyle): void;
    notificationOccurred(type: NotificationType): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  CloudStorage?: {
    getItem(key: string, cb: (err: unknown, value?: string) => void): void;
    setItem(key: string, value: string, cb?: (err: unknown, ok?: boolean) => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const tg = window.Telegram?.WebApp;
const supports = (version: string) => !!tg?.isVersionAtLeast?.(version);

/** true, если приложение реально открыто внутри Telegram. */
export const inTelegram = !!tg?.initData;
export const userName = tg?.initDataUnsafe?.user?.first_name;

const BG = '#0b1026';

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Иначе свайп пальцем вниз сворачивает мини-апп прямо посреди боя
  if (supports('7.7')) tg.disableVerticalSwipes?.();
  if (supports('6.1')) {
    tg.setHeaderColor?.(BG);
    tg.setBackgroundColor?.(BG);
  }
}

export const haptic = {
  impact(style: ImpactStyle) {
    if (supports('6.1')) tg?.HapticFeedback?.impactOccurred(style);
  },
  notify(type: NotificationType) {
    if (supports('6.1')) tg?.HapticFeedback?.notificationOccurred(type);
  },
};

export const backButton = supports('6.1') ? tg?.BackButton : undefined;

// ───── Рекорд: localStorage + облако Telegram (синхронизируется между устройствами) ─────

const BEST_KEY = 'best_score';
const TUTORIAL_KEY = 'tutorial_seen';

function readLocal(key = BEST_KEY): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function readCloud(key = BEST_KEY): Promise<number> {
  const cloud = supports('6.9') ? tg?.CloudStorage : undefined;
  if (!cloud) return Promise.resolve(0);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(0), 2000);
    cloud.getItem(key, (err, value) => {
      clearTimeout(timer);
      resolve(err ? 0 : Number(value) || 0);
    });
  });
}

export async function loadBest(): Promise<number> {
  return Math.max(readLocal(), await readCloud());
}

export function saveBest(score: number) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* хранилище недоступно — не страшно */
  }
  if (supports('6.9')) tg?.CloudStorage?.setItem(BEST_KEY, String(score));
}

// ───── Обучение: показываем один раз ─────

/** Быстрая проверка без ожидания облака. */
export const tutorialSeenLocal = () => readLocal(TUTORIAL_KEY) === 1;

export async function loadTutorialSeen(): Promise<boolean> {
  return tutorialSeenLocal() || (await readCloud(TUTORIAL_KEY)) === 1;
}

export function saveTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* хранилище недоступно — не страшно */
  }
  if (supports('6.9')) tg?.CloudStorage?.setItem(TUTORIAL_KEY, '1');
}

// ───── Звук: выключен ли (1 — выключен, 2 — включён, 0 — не задано) ─────

const SOUND_KEY = 'sound_pref';

export async function loadSoundOff(): Promise<boolean> {
  return ((await readCloud(SOUND_KEY)) || readLocal(SOUND_KEY)) === 1;
}

export function saveSoundOff(off: boolean) {
  const value = off ? '1' : '2';
  try {
    localStorage.setItem(SOUND_KEY, value);
  } catch {
    /* хранилище недоступно — не страшно */
  }
  if (supports('6.9')) tg?.CloudStorage?.setItem(SOUND_KEY, value);
}
