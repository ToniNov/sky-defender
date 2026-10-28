import { Screen } from '../ui/Screen';

export function PauseScreen({
  score,
  onResume,
  onSettings,
  onMenu,
}: {
  score: number;
  onResume: () => void;
  onSettings: () => void;
  onMenu: () => void;
}) {
  return (
    <Screen>
      <h2 className="title small">Пауза</h2>
      <p className="score-big">{score}</p>
      <button className="btn primary" onClick={onResume}>
        Продолжить
      </button>
      <button className="btn ghost" onClick={onSettings}>
        Настройки
      </button>
      <button className="btn ghost" onClick={onMenu}>
        В меню
      </button>
    </Screen>
  );
}
