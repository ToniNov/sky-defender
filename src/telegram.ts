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
  shareMessage?(msgId: string, cb?: (sent: boolean) => void): void;
  openTelegramLink?(url: string): void;
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

// typeof — чтобы модуль можно было импортировать и в Node (e2e-тесты берут оттуда константы)
const tg = typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
const supports = (version: string) => !!tg?.isVersionAtLeast?.(version);

/** true, если приложение реально открыто внутри Telegram. */
export const inTelegram = !!tg?.initData;
export const userName = tg?.initDataUnsafe?.user?.first_name;
/** Подписанные данные запуска — сервер проверяет по ним, кто играет. Вне Telegram пусто. */
export const initData = tg?.initData ?? '';

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

let hapticOn = true;
export const setHapticEnabled = (on: boolean) => {
  hapticOn = on;
};

export const haptic = {
  impact(style: ImpactStyle) {
    if (hapticOn && supports('6.1')) tg?.HapticFeedback?.impactOccurred(style);
  },
  notify(type: NotificationType) {
    if (hapticOn && supports('6.1')) tg?.HapticFeedback?.notificationOccurred(type);
  },
};

export const backButton = supports('6.1') ? tg?.BackButton : undefined;

/** Открыть ссылку t.me внутри Telegram (с 6.1), вне Telegram — в новой вкладке. */
export function openTelegramLink(url: string) {
  if (supports('6.1') && tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

/** Окно выбора чата, чтобы отправить ссылку с текстом. */
export function shareLink(url: string, text: string) {
  openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
}

/** Окно «Поделиться» есть с Bot API 8.0. */
export const canShareMessage = supports('8.0') && !!tg?.shareMessage;

/** Открыть выбор чата для сообщения, которое подготовил сервер. true — сообщение отправлено. */
export function shareMessage(msgId: string): Promise<boolean> {
  const share = tg?.shareMessage;
  if (!canShareMessage || !share) return Promise.resolve(false);
  return new Promise((resolve) => share.call(tg, msgId, (sent) => resolve(sent)));
}

// ───── Хранилище: localStorage + облако Telegram (синхронизируется между устройствами) ─────

const TUTORIAL_KEY = 'tutorial_seen';

const cloudStorage = () => (supports('6.9') ? tg?.CloudStorage : undefined);

export function readLocalString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Значение из облака Telegram; null — нет значения, облака или ответа за 2 секунды. */
export function readCloudString(key: string): Promise<string | null> {
  const cloud = cloudStorage();
  if (!cloud) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2000);
    cloud.getItem(key, (err, value) => {
      clearTimeout(timer);
      resolve(err || !value ? null : value);
    });
  });
}

/** Записать и на устройство, и в облако. */
export function writeString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно — не страшно */
  }
  cloudStorage()?.setItem(key, value);
}

const readLocal = (key: string) => Number(readLocalString(key)) || 0;
const readCloud = async (key: string) => Number(await readCloudString(key)) || 0;

// ───── Обучение: показываем один раз ─────

/** Быстрая проверка без ожидания облака. */
export const tutorialSeenLocal = () => readLocal(TUTORIAL_KEY) === 1;

export async function loadTutorialSeen(): Promise<boolean> {
  return tutorialSeenLocal() || (await readCloud(TUTORIAL_KEY)) === 1;
}

export function saveTutorialSeen() {
  writeString(TUTORIAL_KEY, '1');
}

// ───── Настройки: звук, музыка, вибрация ─────

export interface Settings {
  sfx: boolean;
  music: boolean;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = { sfx: true, music: true, haptics: true };

const SETTINGS_KEY = 'settings';
const SETTINGS_SET = 8; // признак «настройки сохранялись» (0 = не задано); биты 0–2 — выключено: эффекты, музыка, вибрация

const encodeSettings = (s: Settings) => SETTINGS_SET | (s.sfx ? 0 : 1) | (s.music ? 0 : 2) | (s.haptics ? 0 : 4);

export async function loadSettings(): Promise<Settings> {
  const v = (await readCloud(SETTINGS_KEY)) || readLocal(SETTINGS_KEY);
  if (!v) return DEFAULT_SETTINGS;
  return { sfx: !(v & 1), music: !(v & 2), haptics: !(v & 4) };
}

export function saveSettings(s: Settings) {
  writeString(SETTINGS_KEY, String(encodeSettings(s)));
}
