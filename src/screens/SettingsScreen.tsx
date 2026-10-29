import type { Settings } from '../telegram';
import { Screen } from '../ui/Screen';

const SETTING_ROWS: { key: keyof Settings; label: string }[] = [
  { key: 'sfx', label: 'Звуки' },
  { key: 'music', label: 'Музыка' },
  { key: 'haptics', label: 'Вибрация' },
];

export function SettingsScreen({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  return (
    <Screen>
      <h2 className="title small">Настройки</h2>
      <div className="settings">
        {SETTING_ROWS.map(({ key, label }) => (
          <div className="setting" key={key}>
            <span>{label}</span>
            <button
              className={`switch${settings[key] ? ' on' : ''}`}
              role="switch"
              aria-checked={settings[key]}
              aria-label={label}
              onClick={() => onChange({ ...settings, [key]: !settings[key] })}
            />
          </div>
        ))}
      </div>
      <button className="btn primary" onClick={onClose}>
        Готово
      </button>
    </Screen>
  );
}
