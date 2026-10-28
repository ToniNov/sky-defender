import { sfx, unlockAudio } from '../audio';
import { haptic } from '../telegram';

/** Звук и вибрация, когда игрок забрал награду. Нажатие — жест пользователя, звук можно включить. */
export function rewardFeedback() {
  unlockAudio();
  sfx.powerUp();
  haptic.notify('success');
}
