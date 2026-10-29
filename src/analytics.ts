/**
 * Аналитика: запуски игры и итоги партий (очки, волна, длительность, чем сбит) → api.ts → POST /api/events.
 * Игрок — случайный анонимный id устройства, не Telegram-id. Смотреть: npm run api:stats и api:deaths.
 */
import { version } from '../package.json';
import { type AnalyticsEvent, sendEvent } from './api';
import type { Death } from './game/World';
import { platform, readLocalString, writeString } from './telegram';

const DEVICE_KEY = 'device_id';

/** Подходит ли строка как id устройства (то же проверяет сервер). */
export const isDeviceId = (id: string | null): id is string => !!id && /^[a-z0-9]{8,32}$/.test(id);

/** Новый случайный id: 16 символов [a-z0-9]. */
export function newDeviceId(random = Math.random): string {
  let id = '';
  while (id.length < 16) id += Math.floor(random() * 36).toString(36);
  return id;
}

let device: string | null = null;
function deviceId(): string {
  if (device) return device;
  const saved = readLocalString(DEVICE_KEY);
  device = isDeviceId(saved) ? saved : newDeviceId();
  if (device !== saved) writeString(DEVICE_KEY, device);
  return device;
}

/** Событие конца партии: секунды — целые, остальное как есть. */
export function runEvent(device: string, score: number, wave: number, death: Death): AnalyticsEvent {
  return { type: 'run', device, version, platform, score, wave, seconds: Math.round(death.seconds), cause: death.cause };
}

/** Игра открылась. Вызывать один раз при запуске. */
export function trackLaunch() {
  void sendEvent({ type: 'launch', device: deviceId(), version, platform });
}

/** Партия кончилась гибелью самолёта. */
export function trackRun(score: number, wave: number, death: Death) {
  void sendEvent(runEvent(deviceId(), score, wave, death));
}
