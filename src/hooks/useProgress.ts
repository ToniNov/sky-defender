import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dailyReward, dailyState, dayKey } from '../daily';
import { SKINS, UPGRADES, WEAPON_COST, type SkinName, type UpgradeName, type WeaponKind } from '../game/balance';
import type { Loadout } from '../game/World';
import { loadCloudProgress, loadLocalProgress, mergeProgress, saveProgress, type Progress } from '../progress';
import { claimQuest as claimQuestIn, questComplete } from '../quests';
import { haptic } from '../telegram';
import { rewardFeedback } from './feedback';
import type { ProgressStore } from './types';

/** Сохранение: рекорд, монеты, ангар, скины, оружие, задания, награда дня. Сразу с устройства, потом сливается с облаком. */
export function useProgress() {
  const [progress, setProgress] = useState<Progress>(loadLocalProgress);
  const [cloudReady, setCloudReady] = useState(false); // пока облако не ответило, награду дня не даём — вдруг уже забрал на другом устройстве
  const ref = useRef(progress);

  useEffect(() => {
    loadCloudProgress().then((cloud) => {
      const merged = mergeProgress(ref.current, cloud);
      ref.current = merged;
      setProgress(merged);
      setCloudReady(true);
    });
  }, []);

  const commit = useCallback((change: Partial<Progress>) => {
    const next = { ...ref.current, ...change, t: Date.now() };
    ref.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  const store = useMemo<ProgressStore>(() => ({ get: () => ref.current, commit }), [commit]);

  const buyUpgrade = useCallback(
    (name: UpgradeName) => {
      const { coins, upgrades } = ref.current;
      const cost = UPGRADES[name].costs[upgrades[name]];
      if (cost === undefined || cost > coins) return;
      commit({ coins: coins - cost, upgrades: { ...upgrades, [name]: upgrades[name] + 1 } });
      haptic.notify('success');
    },
    [commit],
  );

  /** Купить скин (и сразу надеть) или надеть уже купленный. */
  const pickSkin = useCallback(
    (skin: SkinName) => {
      const { coins, skins } = ref.current;
      if (skins.owned.includes(skin)) {
        if (skins.selected !== skin) commit({ skins: { ...skins, selected: skin } });
        haptic.impact('light');
        return;
      }
      const cost = SKINS[skin].cost;
      if (cost > coins) return;
      commit({ coins: coins - cost, skins: { owned: [...skins.owned, skin], selected: skin } });
      haptic.notify('success');
    },
    [commit],
  );

  /** Купить вид оружия (и сразу сделать стартовым) или выбрать уже купленный. */
  const pickWeapon = useCallback(
    (kind: WeaponKind) => {
      const { coins, weapons } = ref.current;
      if (weapons.owned.includes(kind)) {
        if (weapons.selected !== kind) commit({ weapons: { ...weapons, selected: kind } });
        haptic.impact('light');
        return;
      }
      const cost = WEAPON_COST[kind];
      if (cost > coins) return;
      commit({ coins: coins - cost, weapons: { owned: [...weapons.owned, kind], selected: kind } });
      haptic.notify('success');
    },
    [commit],
  );

  const claimDaily = useCallback(() => {
    const p = ref.current;
    const today = dayKey();
    const { available, streak } = dailyState(p.daily, today);
    if (!available) return;
    commit({ coins: p.coins + dailyReward(streak), daily: { last: today, streak } });
    rewardFeedback();
  }, [commit]);

  const claimQuest = useCallback(
    (i: number) => {
      const p = ref.current;
      const result = claimQuestIn(p.quests, i);
      if (!result) return;
      commit({ coins: p.coins + result.reward, quests: result.quests });
      rewardFeedback();
    },
    [commit],
  );

  const daily = dailyState(progress.daily);
  const loadout = useMemo<Loadout>(
    () => ({ upgrades: progress.upgrades, skin: progress.skins.selected, weapon: progress.weapons.selected }),
    [progress.upgrades, progress.skins.selected, progress.weapons.selected],
  );

  return {
    progress,
    store,
    loadout,
    /** Серия дней, сколько дадут сегодня и можно ли забрать (только когда облако ответило). */
    daily: { streak: daily.streak, reward: dailyReward(daily.streak), available: cloudReady && daily.available },
    questsReady: progress.quests.active.filter(questComplete).length,
    buyUpgrade,
    pickSkin,
    pickWeapon,
    claimDaily,
    claimQuest,
  };
}
