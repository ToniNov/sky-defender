import { Application } from '@pixi/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { version } from '../package.json';
import { apiEnabled, canSubmit, fetchLeaderboard, prepareShare, submitScore, type Leaderboard } from './api';
import { music, setAudioEnabled, sfx, unlockAudio } from './audio';
import { dailyReward, dailySlot, dailyState, dayKey } from './daily';
import {
  applyRun,
  claimQuest,
  emptyRunStats,
  questComplete,
  questReward,
  questTarget,
  type Quest,
  type RunStats,
} from './quests';
import { Game, type Phase } from './game/Game';
import {
  DAILY,
  SKIN_NAMES,
  SKINS,
  UPGRADE_NAMES,
  UPGRADES,
  upgradeMax,
  type QuestKind,
  type SkinName,
  type UpgradeName,
} from './game/balance';
import { skinImage } from './game/skins';
import type { Loadout, WorldEvents } from './game/World';
import { loadCloudProgress, loadLocalProgress, mergeProgress, saveProgress, type Progress } from './progress';
import {
  backButton,
  canShareMessage,
  DEFAULT_SETTINGS,
  haptic,
  initTelegram,
  loadSettings,
  loadTutorialSeen,
  saveSettings,
  saveTutorialSeen,
  setHapticEnabled,
  shareMessage,
  tutorialSeenLocal,
  userName,
  type Settings,
} from './telegram';
import './App.css';

const TUTORIAL_MAX_MS = 8000;
const QUEST_TOAST_MS = 2600;
/** «Поделиться» работает только в Telegram, с сервером и новым клиентом (Bot API 8.0+). */
const canShare = canSubmit && canShareMessage;

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
  const [overlay, setOverlay] = useState<'settings' | 'hangar' | 'daily' | 'quests' | 'leaders' | null>(null); // экран поверх меню или паузы
  const [cloudReady, setCloudReady] = useState(false); // пока облако не ответило, награду дня не даём — вдруг уже забрал на другом устройстве
  const progressRef = useRef(progress);
  const runRef = useRef<RunStats>(emptyRunStats()); // статистика партии для заданий и монет
  const bankedRef = useRef<RunStats>(emptyRunStats()); // она же на момент прошлого зачисления в прогресс
  const toastedRef = useRef(new Set<QuestKind>()); // о каких заданиях уже сказали в этой партии
  const [questToast, setQuestToast] = useState<Quest | null>(null);
  const [rank, setRank] = useState<number | null>(null); // место в таблице лидеров после партии
  const submitRef = useRef(0); // номер отправки рекорда: ответ на старую не должен попасть в новую партию
  const [share, setShare] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
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
      setCloudReady(true);
    });
  }, []);

  const commitProgress = useCallback((change: Partial<Progress>) => {
    const next = { ...progressRef.current, ...change, t: Date.now() };
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /** Зачислить монеты, задания и рекорд партии в сохранение. Можно звать сколько угодно раз — ничего не задвоится. */
  const bank = useCallback(
    (finalScore = 0) => {
      const p = progressRef.current;
      const run = runRef.current;
      const coins = run.coins - bankedRef.current.coins;
      const quests = applyRun(p.quests, run, bankedRef.current);
      bankedRef.current = { ...run, kills: { ...run.kills } };
      if (coins <= 0 && finalScore <= p.best && JSON.stringify(quests) === JSON.stringify(p.quests)) return;
      commitProgress({ best: Math.max(p.best, finalScore), coins: p.coins + coins, quests });
    },
    [commitProgress],
  );

  /** Сказать в бою, что задание выполнено (награду забирают в меню). */
  const checkQuests = useCallback(() => {
    const live = applyRun(progressRef.current.quests, runRef.current, bankedRef.current);
    const q = live.active.find((a) => questComplete(a) && !toastedRef.current.has(a.kind));
    if (!q) return;
    toastedRef.current.add(q.kind);
    const already = progressRef.current.quests.active.find((a) => a.kind === q.kind);
    if (already && questComplete(already)) return; // было выполнено ещё до партии
    setQuestToast(q);
    haptic.notify('success');
  }, []);

  useEffect(() => {
    if (!questToast) return;
    const timer = setTimeout(() => setQuestToast(null), QUEST_TOAST_MS);
    return () => clearTimeout(timer);
  }, [questToast]);

  const claimQuestAt = useCallback(
    (i: number) => {
      const p = progressRef.current;
      const result = claimQuest(p.quests, i);
      if (!result) return;
      commitProgress({ coins: p.coins + result.reward, quests: result.quests });
      unlockAudio();
      sfx.powerUp();
      haptic.notify('success');
    },
    [commitProgress],
  );

  const daily = dailyState(progress.daily);
  const dailyAvailable = cloudReady && daily.available;

  const questsReady = progress.quests.active.filter(questComplete).length;
  const loadout = useMemo<Loadout>(
    () => ({ upgrades: progress.upgrades, skin: progress.skins.selected }),
    [progress.upgrades, progress.skins.selected],
  );

  /** Купить скин (и сразу надеть) или надеть уже купленный. */
  const pickSkin = useCallback(
    (skin: SkinName) => {
      const { coins, skins } = progressRef.current;
      if (skins.owned.includes(skin)) {
        if (skins.selected !== skin) commitProgress({ skins: { ...skins, selected: skin } });
        haptic.impact('light');
        return;
      }
      const cost = SKINS[skin].cost;
      if (cost > coins) return;
      commitProgress({ coins: coins - cost, skins: { owned: [...skins.owned, skin], selected: skin } });
      haptic.notify('success');
    },
    [commitProgress],
  );

  const claimDaily = useCallback(() => {
    const p = progressRef.current;
    const today = dayKey();
    const { available, streak } = dailyState(p.daily, today);
    if (!available) return;
    commitProgress({ coins: p.coins + dailyReward(streak), daily: { last: today, streak } });
    unlockAudio();
    sfx.powerUp();
    haptic.notify('success');
    setOverlay(null);
  }, [commitProgress]);

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
    setRank(null);
    setShare('idle');
    submitRef.current++;
    runRef.current = emptyRunStats();
    bankedRef.current = emptyRunStats();
    toastedRef.current.clear();
    setQuestToast(null);
    setTutorial(!tutorialSeenRef.current);
    setSession((s) => s + 1);
    setPhase('playing');
    haptic.impact('medium');
    unlockAudio();
  }, []);

  /** Сервер готовит сообщение с очками партии, Telegram открывает выбор чата. */
  const shareScore = useCallback(async () => {
    setShare('busy');
    haptic.impact('light');
    const id = await prepareShare(score);
    if (!id) {
      setShare('failed');
      return;
    }
    const sent = await shareMessage(id);
    setShare(sent ? 'sent' : 'idle'); // закрыл окно, не выбрав чат, — можно нажать ещё раз
    if (sent) haptic.notify('success');
  }, [score]);

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
      score: (n) => {
        setScore(n);
        runRef.current.score = n;
        checkQuests();
      },
      lives: setLives,
      weapon: setWeapon,
      combo: (m) => {
        setCombo(m);
        runRef.current.combo = Math.max(runRef.current.combo, m);
        checkQuests();
      },
      hit: () => haptic.impact('heavy'),
      kill: (kind) => {
        haptic.impact(kind === 'mother' ? 'heavy' : 'light');
        const { kills } = runRef.current;
        kills[kind] = (kills[kind] ?? 0) + 1;
        checkQuests();
      },
      bossDown: (flawless) => {
        if (flawless) runRef.current.flawlessBosses++;
        checkQuests();
      },
      powerUp: () => {
        haptic.notify('success');
        runRef.current.powerUps++;
        checkQuests();
      },
      coins: (n) => {
        setRunCoins(n);
        runRef.current.coins = n;
        checkQuests();
      },
      wave: (n) => {
        runRef.current.wave = n;
        checkQuests();
      },
      gameOver: (final) => {
        const record = final > progressRef.current.best;
        bank(final);
        setNewRecord(record);
        // Шлём рекорд, а не очки партии: так на сервер попадёт и рекорд, поставленный до таблицы лидеров
        const id = ++submitRef.current;
        submitScore(progressRef.current.best).then((r) => {
          if (r && id === submitRef.current) setRank(r.rank);
        });
        setPhase('over');
        haptic.notify(record ? 'success' : 'error');
      },
    }),
    [bank, checkQuests],
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
        <Game phase={phase} session={session} events={events} loadout={loadout} />
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
            <img src={skinImage(progress.skins.selected)} width={72} height={72} alt="" />
          </div>
          <h1 className="title">
            Небесный
            <br />
            патруль
          </h1>
          <p className="subtitle">
            {userName ? `Пилот ${userName}, пришельцы атакуют!` : 'Пришельцы атакуют. Только ты можешь их остановить!'}
          </p>
          {dailyAvailable && (
            <button className="btn gift" onClick={() => setOverlay('daily')}>
              🎁 Награда дня: <CoinIcon />
              {dailyReward(daily.streak)}
            </button>
          )}
          <button className="btn primary" onClick={start}>
            Взлететь
          </button>
          <div className="menu-row">
            <button className="btn ghost" onClick={() => setOverlay('hangar')}>
              Ангар
            </button>
            <button className="btn ghost" onClick={() => setOverlay('quests')}>
              Задания
              {questsReady > 0 && (
                <span className="badge" aria-label={`Готово к получению: ${questsReady}`}>
                  {questsReady}
                </span>
              )}
            </button>
          </div>
          {apiEnabled && (
            <button className="btn ghost" onClick={() => setOverlay('leaders')}>
              🏆 Лидеры
            </button>
          )}
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

      {overlay === 'hangar' && (
        <HangarScreen progress={progress} onBuy={buyUpgrade} onPickSkin={pickSkin} onClose={() => setOverlay(null)} />
      )}

      {overlay === 'quests' && (
        <QuestsScreen quests={progress.quests.active} onClaim={claimQuestAt} onClose={() => setOverlay(null)} />
      )}

      {overlay === 'leaders' && <LeadersScreen onClose={() => setOverlay(null)} />}

      {questToast && phase === 'playing' && (
        <div className="quest-toast" role="status">
          <span className="quest-toast-check">✓</span> {questTitle(questToast)}
        </div>
      )}

      {overlay === 'daily' && dailyAvailable && (
        <DailyScreen streak={daily.streak} onClaim={claimDaily} onClose={() => setOverlay(null)} />
      )}

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
          {rank !== null && <p className="best">Место в таблице лидеров: {rank}</p>}
          {runCoins > 0 && (
            <p className="wallet" aria-label={`Собрано монет: ${runCoins}, всего ${progress.coins}`}>
              <CoinIcon />+{runCoins} <span className="wallet-total">всего {progress.coins}</span>
            </p>
          )}
          <button className="btn primary" onClick={start}>
            Ещё раз
          </button>
          {canShare && (
            <button className="btn ghost" disabled={share === 'busy' || share === 'sent'} onClick={shareScore}>
              {share === 'sent' ? '✓ Отправлено' : '📤 Поделиться результатом'}
            </button>
          )}
          {share === 'failed' && <p className="best">Не получилось поделиться. Попробуй ещё раз.</p>}
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

const SKIN_TITLE: Record<SkinName, string> = {
  classic: 'Классика',
  sunset: 'Закат',
  emerald: 'Изумруд',
  night: 'Ночь',
  delta: 'Дельта',
  stealth: 'Стелс',
  biplane: 'Ретро',
};

function HangarScreen({
  progress,
  onBuy,
  onPickSkin,
  onClose,
}: {
  progress: Progress;
  onBuy: (name: UpgradeName) => void;
  onPickSkin: (skin: SkinName) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'upgrades' | 'skins'>('upgrades');
  return (
    <Screen>
      <h2 className="title small">Ангар</h2>
      <p className="wallet" aria-label={`Монеты: ${progress.coins}`}>
        <CoinIcon />
        {progress.coins}
      </p>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'upgrades'} onClick={() => setTab('upgrades')}>
          Улучшения
        </button>
        <button role="tab" aria-selected={tab === 'skins'} onClick={() => setTab('skins')}>
          Скины
        </button>
      </div>
      {tab === 'skins' ? (
        <SkinGrid progress={progress} onPick={onPickSkin} />
      ) : (
        <UpgradeList progress={progress} onBuy={onBuy} />
      )}
      <button className="btn primary" onClick={onClose}>
        Готово
      </button>
    </Screen>
  );
}

/** Русское склонение после числа: 1 монету, 2 монеты, 5 монет. */
function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

const QUEST_TITLE: Record<QuestKind, (n: number) => string> = {
  scout: (n) => `Сбей ${n} ${plural(n, 'разведчика', 'разведчиков', 'разведчиков')}`,
  saucer: (n) => `Сбей ${n} ${plural(n, 'тарелку', 'тарелки', 'тарелок')}`,
  kamikaze: (n) => `Сбей ${n} камикадзе`,
  shielder: (n) => `Сбей ${n} ${plural(n, 'щитоносца', 'щитоносцев', 'щитоносцев')}`,
  splitter: (n) => `Сбей ${n} ${plural(n, 'сплиттера', 'сплиттеров', 'сплиттеров')}`,
  boss: (n) => (n === 1 ? 'Сбей флагмана' : `Сбей ${n} ${plural(n, 'флагмана', 'флагманов', 'флагманов')}`),
  flawlessBoss: (n) =>
    `${n === 1 ? 'Сбей флагмана' : `Сбей ${n} ${plural(n, 'флагмана', 'флагманов', 'флагманов')}`}, не потеряв жизни`,
  coins: (n) => `Собери ${n} ${plural(n, 'монету', 'монеты', 'монет')}`,
  powerUps: (n) => `Подбери ${n} ${plural(n, 'бонус', 'бонуса', 'бонусов')}`,
  wave: (n) => `Дойди до волны ${n} за партию`,
  score: (n) => `Набери ${n} ${plural(n, 'очко', 'очка', 'очков')} за партию`,
  combo: (n) => `Разгони комбо до ×${n}`,
};

const questTitle = (q: Quest) => QUEST_TITLE[q.kind](questTarget(q));

function QuestsScreen({ quests, onClaim, onClose }: { quests: Quest[]; onClaim: (i: number) => void; onClose: () => void }) {
  return (
    <Screen>
      <h2 className="title small">Задания</h2>
      <ul className="quests">
        {quests.map((q, i) => {
          const target = questTarget(q);
          const title = questTitle(q);
          return (
            <li className="quest" key={q.kind}>
              <div className="quest-text">
                <span className="quest-title">{title}</span>
                <span className="quest-bar" role="progressbar" aria-label={title} aria-valuenow={q.progress} aria-valuemax={target}>
                  <i style={{ width: `${(q.progress / target) * 100}%` }} />
                </span>
                <span className="quest-progress">
                  {q.progress} / {target}
                </span>
              </div>
              {questComplete(q) ? (
                <button className="btn buy" onClick={() => onClaim(i)} aria-label={`Забрать награду: ${title}`}>
                  <CoinIcon />
                  {questReward(q)}
                </button>
              ) : (
                <span className="quest-reward" aria-label={`Награда ${questReward(q)}`}>
                  <CoinIcon />
                  {questReward(q)}
                </span>
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

function UpgradeList({ progress, onBuy }: { progress: Progress; onBuy: (name: UpgradeName) => void }) {
  return (
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
  );
}

function SkinGrid({ progress, onPick }: { progress: Progress; onPick: (skin: SkinName) => void }) {
  const { owned, selected } = progress.skins;
  return (
    <ul className="skins">
      {SKIN_NAMES.map((skin) => {
        const title = SKIN_TITLE[skin];
        const cost = SKINS[skin].cost;
        const has = owned.includes(skin);
        return (
          <li key={skin} className={`skin${skin === selected ? ' selected' : ''}`}>
            <img src={skinImage(skin)} width={48} height={48} alt="" className={has ? '' : 'locked'} />
            <span className="skin-title">{title}</span>
            {skin === selected ? (
              <span className="skin-state">Выбран</span>
            ) : has ? (
              <button className="btn buy" onClick={() => onPick(skin)} aria-label={`Выбрать скин: ${title}`}>
                Выбрать
              </button>
            ) : (
              <button
                className="btn buy"
                disabled={cost > progress.coins}
                onClick={() => onPick(skin)}
                aria-label={`Купить скин: ${title} за ${cost}`}
              >
                <CoinIcon />
                {cost}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LeadersScreen({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<Leaderboard | null | 'loading'>('loading');
  useEffect(() => {
    let open = true;
    fetchLeaderboard().then((b) => open && setBoard(b));
    return () => {
      open = false;
    };
  }, []);
  return (
    <Screen>
      <h2 className="title small">Лидеры</h2>
      {board === 'loading' ? (
        <p className="subtitle">Загрузка…</p>
      ) : board === null ? (
        <p className="subtitle">Таблица сейчас недоступна. Попробуй позже.</p>
      ) : board.top.length === 0 ? (
        <p className="subtitle">Пока здесь никого нет — стань первым!</p>
      ) : (
        <ol className="leaders">
          {board.top.map((e, i) => (
            <li className="leader" key={i}>
              <span className="leader-rank">{i + 1}</span>
              <span className="leader-name">{e.name}</span>
              <span className="leader-score">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
      {board && board !== 'loading' && board.me && (
        <p className="record">
          Твоё место: {board.me.rank} · {board.me.score}
        </p>
      )}
      <button className="btn primary" onClick={onClose}>
        Готово
      </button>
    </Screen>
  );
}

function DailyScreen({ streak, onClaim, onClose }: { streak: number; onClaim: () => void; onClose: () => void }) {
  const slot = dailySlot(streak);
  return (
    <Screen>
      <h2 className="title small">Награда дня</h2>
      <p className="subtitle">Заходи каждый день — награда растёт. Пропустишь день — серия начнётся заново.</p>
      <ol className="daily-days">
        {DAILY.rewards.map((coins, i) => (
          <li
            key={i}
            className={i < slot ? 'done' : i === slot ? 'today' : ''}
            aria-label={`День ${i + 1}: ${coins}${i < slot ? ', получено' : i === slot ? ', сегодня' : ''}`}
          >
            <span className="daily-day">{i < slot ? '✓' : `День ${i + 1}`}</span>
            <CoinIcon />
            <span className="daily-coins">{coins}</span>
          </li>
        ))}
      </ol>
      <button className="btn primary" onClick={onClaim}>
        Забрать {dailyReward(streak)}
      </button>
      <button className="btn ghost" onClick={onClose}>
        Позже
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
