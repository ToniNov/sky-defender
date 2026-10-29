import type { Progress } from '../progress';

/** Экран поверх меню или паузы. */
export type Overlay = 'settings' | 'hangar' | 'daily' | 'quests' | 'leaders' | 'friends';

/** Доступ к сохранению для других хуков: прочитать свежий прогресс и записать изменение. */
export interface ProgressStore {
  get(): Progress;
  commit(change: Partial<Progress>): void;
}
