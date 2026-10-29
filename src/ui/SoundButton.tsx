export function SoundButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className="icon-btn" onClick={onClick} aria-label={on ? 'Выключить звук' : 'Включить звук'}>
      <span className="sound-icon">{on ? '🔊' : '🔇'}</span>
    </button>
  );
}
