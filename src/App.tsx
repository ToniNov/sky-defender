import { Application } from '@pixi/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Game, type Phase } from './game/Game';
import type { WorldEvents } from './game/World';
import { backButton, haptic, initTelegram, loadBest, saveBest, userName } from './telegram';
import './App.css';

export default function App() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [session, setSession] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [weapon, setWeapon] = useState(1);
  const [best, setBest] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const bestRef = useRef(0);

  useEffect(() => {
    initTelegram();
    loadBest().then((b) => {
      bestRef.current = Math.max(bestRef.current, b);
      setBest(bestRef.current);
    });
  }, []);

  const start = useCallback(() => {
    setNewRecord(false);
    setSession((s) => s + 1);
    setPhase('playing');
    haptic.impact('medium');
  }, []);

  // События из игрового мира → состояние React (HUD) + вибрация
  const events = useMemo<WorldEvents>(
    () => ({
      score: setScore,
      lives: setLives,
      weapon: setWeapon,
      hit: () => haptic.impact('heavy'),
      kill: (kind) => haptic.impact(kind === 'mother' ? 'heavy' : 'light'),
      powerUp: () => haptic.notify('success'),
      gameOver: (final) => {
        const record = final > bestRef.current;
        if (record) {
          bestRef.current = final;
          setBest(final);
          saveBest(final);
        }
        setNewRecord(record);
        setPhase('over');
        haptic.notify(record ? 'success' : 'error');
      },
    }),
    [],
  );

  // Пауза, если свернули Telegram / переключили вкладку
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPhase((p) => (p === 'playing' ? 'paused' : p));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Esc / P — пауза на компьютере
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Системная кнопка «Назад» в Telegram: в бою — пауза, на паузе — в меню
  useEffect(() => {
    const bb = backButton;
    if (!bb || (phase !== 'playing' && phase !== 'paused')) return;
    const onBack = () => setPhase((p) => (p === 'playing' ? 'paused' : 'menu'));
    bb.show();
    bb.onClick(onBack);
    return () => {
      bb.offClick(onBack);
      bb.hide();
    };
  }, [phase]);

  const inGame = phase === 'playing' || phase === 'paused';

  return (
    <div className="app">
      <Application
        resizeTo={window}
        backgroundAlpha={0}
        antialias
        autoDensity
        resolution={Math.min(window.devicePixelRatio || 1, 2)}
      >
        <Game phase={phase} session={session} events={events} />
      </Application>

      {inGame && (
        <header className="hud">
          <div className="hud-score">
            <span className="hud-label">Очки</span>
            <span className="hud-value">{score}</span>
            <span className="hud-weapon" aria-label={`Пушка: уровень ${weapon}`}>
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= weapon ? 'on' : ''} />
              ))}
            </span>
          </div>
          <div className="hud-right">
            <div className="hearts" aria-label={`Жизни: ${lives}`}>
              {Array.from({ length: lives }, (_, i) => (
                <Heart key={i} />
              ))}
            </div>
            <button className="icon-btn" onClick={() => setPhase('paused')} aria-label="Пауза">
              <span className="pause-icon" />
            </button>
          </div>
        </header>
      )}

      {phase === 'menu' && (
        <Screen>
          <div className="logo" aria-hidden>
            <PlaneIcon />
          </div>
          <h1 className="title">
            Небесный
            <br />
            патруль
          </h1>
          <p className="subtitle">
            {userName ? `Пилот ${userName}, пришельцы атакуют!` : 'Пришельцы атакуют. Только ты можешь их остановить!'}
          </p>
          <button className="btn primary" onClick={start}>
            Взлететь
          </button>
          {best > 0 && <p className="best">Рекорд: {best}</p>}
          <ul className="hints">
            <li>Веди пальцем по экрану — самолёт летит следом</li>
            <li>Стрельба автоматическая</li>
            <li>
              <span className="star">★</span> усиливает пушку, <span className="heart">♥</span> даёт жизнь
            </li>
          </ul>
        </Screen>
      )}

      {phase === 'paused' && (
        <Screen>
          <h2 className="title small">Пауза</h2>
          <p className="score-big">{score}</p>
          <button className="btn primary" onClick={() => setPhase('playing')}>
            Продолжить
          </button>
          <button className="btn ghost" onClick={() => setPhase('menu')}>
            В меню
          </button>
        </Screen>
      )}

      {phase === 'over' && (
        <Screen>
          <h2 className="title small">Самолёт сбит</h2>
          {newRecord && <p className="record">Новый рекорд!</p>}
          <p className="score-big">{score}</p>
          <p className="best">Рекорд: {best}</p>
          <button className="btn primary" onClick={start}>
            Ещё раз
          </button>
          <button className="btn ghost" onClick={() => setPhase('menu')}>
            В меню
          </button>
        </Screen>
      )}
    </div>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="screen">
      <div className="card">{children}</div>
    </div>
  );
}

function Heart() {
  return (
    <svg viewBox="0 0 24 24" className="heart-icon" aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.3 2.9 4 6.9 4c2.2 0 3.7 1.2 5.1 3 1.4-1.8 2.9-3 5.1-3 4 0 6.1 4.3 4.5 7.8C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 64 64" width="72" height="72">
      <polygon points="32,20 62,40 62,47 32,39 2,47 2,40" fill="#3fa9f5" />
      <polygon points="32,46 46,57 46,61 32,56 18,61 18,57" fill="#2b7fc4" />
      <rect x="26" y="4" width="12" height="54" rx="6" fill="#eef6ff" />
      <rect x="26" y="30" width="12" height="4" fill="#ff5a5f" />
      <ellipse cx="32" cy="17" rx="3.5" ry="7" fill="#1b2b48" />
    </svg>
  );
}
