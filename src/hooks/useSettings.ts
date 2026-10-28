import { useCallback, useEffect, useState } from 'react';
import { setAudioEnabled, unlockAudio } from '../audio';
import { DEFAULT_SETTINGS, haptic, loadSettings, saveSettings, setHapticEnabled, type Settings } from '../telegram';

/** Настройки звука, музыки и вибрации: загрузка, сохранение, быстрая кнопка звука в бою. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadSettings().then((s) => {
      setAudioEnabled(s.sfx, s.music);
      setHapticEnabled(s.haptics);
      setSettings(s);
    });
  }, []);

  const update = useCallback((next: Settings) => {
    setSettings(next);
    setAudioEnabled(next.sfx, next.music);
    setHapticEnabled(next.haptics);
    saveSettings(next);
    unlockAudio(); // переключатель — тоже жест пользователя
    haptic.impact('light');
  }, []);

  const soundOn = settings.sfx || settings.music;
  // Быстрая кнопка в бою: выключает или включает и эффекты, и музыку сразу
  const toggleSound = useCallback(
    () => update({ ...settings, sfx: !soundOn, music: !soundOn }),
    [settings, soundOn, update],
  );

  return { settings, update, soundOn, toggleSound };
}
