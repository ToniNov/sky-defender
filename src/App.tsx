import { Application } from '@pixi/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { version } from '../package.json';
import { music, setAudioEnabled, unlockAudio } from './audio';
import { Game, type Phase } from './game/Game';
import { UPGRADE_NAMES, UPGRADES, upgradeMax, type UpgradeName } from './game/balance';
import type { WorldEvents } from './game/World';
import { loadCloudProgress, loadLocalProgress, mergeProgress, saveProgress, type Progress } from './progress';
import {
  backButton,
  DEFAULT_SETTINGS,
  haptic,
  initTelegram,
  loadSettings,
  loadTutorialSeen,
  saveSettings,
  saveTutorialSeen,
  setHapticEnabled,
  tutorialSeenLocal,
  userName,
  type Settings,
} from './telegram';
import './App.css';

const TUTORIAL_MAX_MS = 8000;

export default function App() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [session, setSession] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [weapon, setWeapon] = useState(1);
  const [combo, setCombo] = useState(1);
  const [progress, setProgress] = useState<Progress>(loadLocalProgress);
  const [runCoins, setRunCoins] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [overlay, setOverlay] = useState<'settings' | 'hangar' | null>(null); // экран поверх меню или паузы
  const progressRef = useRef(progress);
  const runCoinsRef = useRef(0);
  const bankedRef = useRef(0); // сколько монет этой партии уже зачислено в прогресс
  const tutorialSeenRef = useRef(tutorialSeenLocal());

  useEffect(() => {
    initTelegram();
    loadSettings().then((s) => {
      setAudioEnabled(s.sfx, s.music);
      setHapticEnabled(s.haptics);
      setSettings(s);
    });
    loadTutorialSeen().then((seen) => {
      if (seen) tutorialSeenRef.current = true;
    });
    loadCloudProgress().then((cloud) => {
      const merged = mergeProgress(progressRef.current, cloud);
      progressRef.current = merged;
      setProgress(merged);
    });
  }, []);

  const commitProgress = useCallback((change: Partial<Progress>) => {
    const next = { ...progressRef.current, ...change, t: Date.now() };
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /** Зачислить монеты партии и рекорд в сохранение. Можно звать сколько угодно раз — монеты не задвоятся. */
  const bank = useCallback(
    (finalScore = 0) => {
      const p = progressRef.current;
      const coins = runCoinsRef.current - bankedRef.current;
      if (coins <= 0 && finalScore <= p.best) return;
      bankedRef.current = runCoinsRef.current;
      commitProgress({ best: Math.max(p.best, finalScore), coins: p.coins + coins });
    },
    [commitProgress],
  );

  const buyUpgrade = useCallback(
    (name: UpgradeName) => {
      const { coins, upgrades } = progressRef.current;
      const cost = UPGRADES[name].costs[upgrades[name]];
      if (cost === undefined || cost > coins) return;
      commitProgress({ coins: coins - cost, upgrades: { ...upgrades, [name]: upgrades[name] + 1 } });
      haptic.notify('success');
    },
    [commitProgress],
  );

  // На паузе и при выходе в меню монеты сохраняем сразу: игру могут закрыть, не доиграв
  useEffect(() => {
    if (phase === 'paused' || phase === 'menu') bank();
  }, [phase, bank]);

  const start = useCallback(() => {
    setNewRecord(false);
    bankedRef.current = 0;
    setTutorial(!tutorialSeenRef.current);
    setSession((s) => s + 1);
    setPhase('playing');
    haptic.impact('medium');
    unlockAudio();
  }, []);

  const updateSettings = useCallback((next: Settings) => {
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
    () => updateSettings({ ...settings, sfx: !soundOn, music: !soundOn }),
    [settings, soundOn, updateSettings],
  );

  // Музыка играет только во время боя
  useEffect(() => {
    if (phase === 'playing') music.start();
    else music.stop();
  }, [phase]);

  // События из игрового мира → состояние React (HUD) + вибрация
  const events = useMemo<WorldEvents>(
    () => ({
      score: setScore,
      lives: setLives,
      weapon: setWeapon,
      combo: setCombo,
      hit: () => haptic.impact('heavy'),
      kill: (kind) => haptic.impact(kind === 'mother' ? 'heavy' : 'light'),
      powerUp: () => haptic.notify('success'),
      coins: (n) => {
        runCoinsRef.current = n;
        setRunCoins(n);
      },
      gameOver: (final) => {
        const record = final > progressRef.current.best;
        bank(final);
        setNewRecord(record);
        setPhase('over');
        haptic.notify(record ? 'success' : 'error');
      },
    }),
    [bank],
  );

  // Подсказка «веди пальцем»: пропадает при первом касании (или через пару секунд) и больше не показывается
  useEffect(() => {
    if (!tutorial || phase !== 'playing') return;
    const done = () => {
      tutorialSeenRef.current = true;
      saveTutorialSeen();
      setTutorial(false);
    };
    const timer = setTimeout(done, TUTORIAL_MAX_MS);
    window.addEventListener('pointerdown', done);
    window.addEventListener('keydown', done);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', done);
      window.removeEventListener('keydown', done);
    };
  }, [tutorial, phase]);

  // Пауза, если свернули Telegram / переключили вкладку
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPhase((p) => (p === 'playing' ? 'paused' : p));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Esc / P — пауза на компьютере (открытые настройки или ангар Esc закрывает)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (overlay) {
        if (e.code === 'Escape') setOverlay(null);
        return;
      }
      setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay]);

  // Системная кнопка «Назад» в Telegram: закрывает настройки и ангар; в бою — пауза, на паузе — в меню
  useEffect(() => {
    const bb = backButton;
    if (!bb || (phase !== 'playing' && phase !== 'paused' && !overlay)) return;
    const onBack = () => {
      if (overlay) setOverlay(null);
      else setPhase((p) => (p === 'playing' ? 'paused' : 'menu'));
    };
    bb.show();
    bb.onClick(onBack);
    return () => {
      bb.offClick(onBack);
      bb.hide();
    };
  }, [phase, overlay]);

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
        <Game phase={phase} session={session} events={events} upgrades={progress.upgrades} />
      </Application>

      {inGame && (
        <header className="hud">
          <div className="hud-score">
            <span className="hud-label">Очки</span>
            <span className="hud-value">
              {score}
              {combo > 1 && (
                // key меняется с множителем — значок заново проигрывает анимацию
                <span key={combo} className="hud-combo" aria-label={`Множитель очков ×${combo}`}>
                  ×{combo}
                </span>
              )}
            </span>
            <span className="hud-weapon" aria-label={`Пушка: уровень ${weapon}`}>
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= weapon ? 'on' : ''} />
              ))}
            </span>
            <span className="hud-coins" aria-label={`Монеты за партию: ${runCoins}`}>
              <CoinIcon />
              {runCoins}
            </span>
          </div>
          <div className="hud-right">
            <div className="hearts" aria-label={`Жизни: ${lives}`}>
              {Array.from({ length: lives }, (_, i) => (
                <Heart key={i} />
              ))}
            </div>
            <SoundButton on={soundOn} onClick={toggleSound} />
            <button className="icon-btn" onClick={() => setPhase('paused')} aria-label="Пауза">
              <span className="pause-icon" />
            </button>
          </div>
        </header>
      )}

      {tutorial && phase === 'playing' && (
        <div className="tutorial" aria-hidden>
          <span className="tutorial-hand">👆</span>
          <p>Веди пальцем — самолёт летит следом</p>
        </div>
      )}

      {phase === 'menu' && !overlay && (
        <div className="corner">
          <button className="icon-btn" onClick={() => setOverlay('settings')} aria-label="Настройки">
            <span className="sound-icon">⚙️</span>
          </button>
        </div>
      )}

      {phase === 'menu' && !overlay && (
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
          <button className="btn ghost" onClick={() => setOverlay('hangar')}>
            Ангар
          </button>
          {progress.best > 0 && <p className="best">Рекорд: {progress.best}</p>}
          {progress.coins > 0 && (
            <p className="wallet" aria-label={`Монеты: ${progress.coins}`}>
              <CoinIcon />
              {progress.coins}
            </p>
          )}
          <ul className="hints">
            <li>Веди пальцем по экрану — самолёт летит следом</li>
            <li>Стрельба автоматическая</li>
            <li>
              <span className="star">★</span> усиливает пушку, <span className="heart">♥</span> даёт жизнь
            </li>
          </ul>
          <p className="version">v{version}</p>
        </Screen>
      )}

      {overlay === 'settings' && (
        <SettingsScreen settings={settings} onChange={updateSettings} onClose={() => setOverlay(null)} />
      )}

      {overlay === 'hangar' && <HangarScreen progress={progress} onBuy={buyUpgrade} onClose={() => setOverlay(null)} />}

      {phase === 'paused' && !overlay && (
        <Screen>
          <h2 className="title small">Пауза</h2>
          <p className="score-big">{score}</p>
          <button className="btn primary" onClick={() => setPhase('playing')}>
            Продолжить
          </button>
          <button className="btn ghost" onClick={() => setOverlay('settings')}>
            Настройки
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
          <p className="best">Рекорд: {progress.best}</p>
          {runCoins > 0 && (
            <p className="wallet" aria-label={`Собрано монет: ${runCoins}, всего ${progress.coins}`}>
              <CoinIcon />+{runCoins} <span className="wallet-total">всего {progress.coins}</span>
            </p>
          )}
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

const SETTING_ROWS: { key: keyof Settings; label: string }[] = [
  { key: 'sfx', label: 'Звуки' },
  { key: 'music', label: 'Музыка' },
  { key: 'haptics', label: 'Вибрация' },
];

function SettingsScreen({
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

const UPGRADE_INFO: Record<UpgradeName, { title: string; effect: (level: number) => string }> = {
  fireRate: {
    title: 'Скорострельность',
    effect: (l) => `+${Math.round((1 / (1 - UPGRADES.fireRate.intervalStep * l) - 1) * 100)}% выстрелов`,
  },
  startWeapon: { title: 'Стартовая пушка', effect: (l) => `уровень ${1 + l} с начала боя` },
  extraLife: { title: 'Запасная жизнь', effect: (l) => `+${l} к жизням на старте` },
  magnet: { title: 'Сильный магнит', effect: (l) => `+${l * UPGRADES.magnet.timeStep} с действия` },
};

function HangarScreen({
  progress,
  onBuy,
  onClose,
}: {
  progress: Progress;
  onBuy: (name: UpgradeName) => void;
  onClose: () => void;
}) {
  return (
    <Screen>
      <h2 className="title small">Ангар</h2>
      <p className="wallet" aria-label={`Монеты: ${progress.coins}`}>
        <CoinIcon />
        {progress.coins}
      </p>
      <ul className="upgrades">
        {UPGRADE_NAMES.map((name) => {
          const level = progress.upgrades[name];
          const max = upgradeMax(name);
          const cost = UPGRADES[name].costs[level];
          const info = UPGRADE_INFO[name];
          return (
            <li className="upgrade" key={name}>
              <div className="upgrade-text">
                <span className="upgrade-title">{info.title}</span>
                <span className="upgrade-effect">{level > 0 ? info.effect(level) : 'не куплено'}</span>
                <span className="upgrade-pips" aria-label={`Уровень ${level} из ${max}`}>
                  {Array.from({ length: max }, (_, i) => (
                    <i key={i} className={i < level ? 'on' : ''} />
                  ))}
                </span>
              </div>
              {cost === undefined ? (
                <span className="upgrade-max">Макс.</span>
              ) : (
                <button
                  className="btn buy"
                  disabled={cost > progress.coins}
                  onClick={() => onBuy(name)}
                  aria-label={`Купить: ${info.title} за ${cost}`}
                >
                  <CoinIcon />
                  {cost}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button className="btn primary" onClick={onClose}>
        Готово
      </button>
    </Screen>
  );
}

function SoundButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className="icon-btn" onClick={onClick} aria-label={on ? 'Выключить звук' : 'Включить звук'}>
      <span className="sound-icon">{on ? '🔊' : '🔇'}</span>
    </button>
  );
}

function Heart() {
  return (
    <svg viewBox="0 0 24 24" className="heart-icon" aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.3 2.9 4 6.9 4c2.2 0 3.7 1.2 5.1 3 1.4-1.8 2.9-3 5.1-3 4 0 6.1 4.3 4.5 7.8C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

function CoinIcon() {
  return <i className="coin-icon" aria-hidden />;
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
