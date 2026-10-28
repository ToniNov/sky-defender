import { Application } from '@pixi/react';
import { useCallback, useState } from 'react';
import { apiEnabled, canSubmit } from './api';
import { Game, type Phase } from './game/Game';
import type { Overlay } from './hooks/types';
import { useAppShell } from './hooks/useAppShell';
import { useProgress } from './hooks/useProgress';
import { useRun } from './hooks/useRun';
import { useSettings } from './hooks/useSettings';
import { useSocial } from './hooks/useSocial';
import { useTutorial } from './hooks/useTutorial';
import { DailyScreen } from './screens/DailyScreen';
import { FriendsScreen } from './screens/FriendsScreen';
import { HangarScreen } from './screens/HangarScreen';
import { Hud } from './screens/Hud';
import { LeadersScreen } from './screens/LeadersScreen';
import { MenuScreen } from './screens/MenuScreen';
import { OverScreen } from './screens/OverScreen';
import { PauseScreen } from './screens/PauseScreen';
import { QuestsScreen } from './screens/QuestsScreen';
import { QuestToast } from './screens/QuestToast';
import { SettingsScreen } from './screens/SettingsScreen';
import { TutorialHint } from './screens/TutorialHint';
import { canShareMessage, userName } from './telegram';
import './App.css';

/** «Поделиться» работает только в Telegram, с сервером и новым клиентом (Bot API 8.0+). */
const canShare = canSubmit && canShareMessage;

/** Фаза игры, открытый экран и сборка экранов из хуков. Логика — в hooks/, разметка — в screens/. */
export default function App() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const close = useCallback(() => setOverlay(null), []);

  useAppShell(phase, setPhase, overlay, close);
  const settings = useSettings();
  const save = useProgress();
  const tutorial = useTutorial(phase);
  const social = useSocial(save.store, overlay);
  const run = useRun(save.store, phase, setPhase);
  const { progress } = save;

  const { start: beginRun } = run;
  const { resetShare } = social;
  const { begin: beginTutorial } = tutorial;
  const start = useCallback(() => {
    beginRun();
    resetShare();
    beginTutorial();
    setPhase('playing');
  }, [beginRun, resetShare, beginTutorial]);

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
        <Game phase={phase} session={run.session} events={run.events} loadout={save.loadout} />
      </Application>

      {inGame && (
        <Hud
          score={run.score}
          combo={run.combo}
          weapon={run.weapon}
          coins={run.coins}
          lives={run.lives}
          soundOn={settings.soundOn}
          onToggleSound={settings.toggleSound}
          onPause={() => setPhase('paused')}
        />
      )}

      {tutorial.shown && <TutorialHint />}

      {phase === 'menu' && !overlay && (
        <MenuScreen
          skin={progress.skins.selected}
          pilot={userName}
          dailyCoins={save.daily.available ? save.daily.reward : null}
          questsReady={save.questsReady}
          showLeaders={apiEnabled}
          newFriends={canSubmit ? (social.referrals?.unclaimed ?? 0) : null}
          best={progress.best}
          coins={progress.coins}
          onStart={start}
          onOpen={setOverlay}
        />
      )}

      {overlay === 'settings' && <SettingsScreen settings={settings.settings} onChange={settings.update} onClose={close} />}

      {overlay === 'hangar' && (
        <HangarScreen progress={progress} onBuy={save.buyUpgrade} onPickSkin={save.pickSkin} onClose={close} />
      )}

      {overlay === 'quests' && <QuestsScreen quests={progress.quests.active} onClaim={save.claimQuest} onClose={close} />}

      {overlay === 'leaders' && <LeadersScreen board={social.board} onInvite={() => setOverlay('friends')} onClose={close} />}

      {overlay === 'friends' && (
        <FriendsScreen
          referrals={social.referrals}
          asked={social.referralsAsked}
          onClaim={social.claimFriends}
          onInvite={social.invite}
          onClose={close}
        />
      )}

      {run.questToast && phase === 'playing' && <QuestToast quest={run.questToast} />}

      {overlay === 'daily' && save.daily.available && (
        <DailyScreen
          streak={save.daily.streak}
          onClaim={() => {
            save.claimDaily();
            close();
          }}
          onClose={close}
        />
      )}

      {phase === 'paused' && !overlay && (
        <PauseScreen
          score={run.score}
          onResume={() => setPhase('playing')}
          onSettings={() => setOverlay('settings')}
          onMenu={() => setPhase('menu')}
        />
      )}

      {phase === 'over' && (
        <OverScreen
          score={run.score}
          newRecord={run.newRecord}
          best={progress.best}
          rank={run.rank}
          runCoins={run.coins}
          coins={progress.coins}
          share={canShare ? social.share : null}
          onShare={() => social.shareScore(run.score)}
          onRestart={start}
          onMenu={() => setPhase('menu')}
        />
      )}
    </div>
  );
}
