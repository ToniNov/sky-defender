import { QUEST_KINDS, QUESTS, type EnemyKind, type QuestKind } from './game/balance';

/**
 * Задания: чистые функции без React и хранилища.
 * Прогресс копится в RunStats во время партии и переносится в сохранение
 * вместе с монетами (пауза, меню, конец партии) — см. bank() в App.tsx.
 */

export interface Quest {
  kind: QuestKind;
  /** Сколько раз задание этого типа уже выполнялось к моменту выдачи — от этого цель и награда. */
  tier: number;
  progress: number;
}

export interface Quests {
  active: Quest[];
  /** Сколько раз выполнено задание каждого типа. */
  done: Partial<Record<QuestKind, number>>;
}

/** Статистика текущей партии. */
export interface RunStats {
  kills: Partial<Record<EnemyKind, number>>;
  flawlessBosses: number;
  coins: number;
  powerUps: number;
  wave: number;
  score: number;
  combo: number;
}

export const emptyRunStats = (): RunStats => ({ kills: {}, flawlessBosses: 0, coins: 0, powerUps: 0, wave: 0, score: 0, combo: 1 });

/** sum — копится между партиями, best — лучший результат за одну партию. */
const STAT: Record<QuestKind, { mode: 'sum' | 'best'; value: (r: RunStats) => number }> = {
  scout: { mode: 'sum', value: (r) => r.kills.scout ?? 0 },
  saucer: { mode: 'sum', value: (r) => r.kills.saucer ?? 0 },
  kamikaze: { mode: 'sum', value: (r) => r.kills.kamikaze ?? 0 },
  shielder: { mode: 'sum', value: (r) => r.kills.shielder ?? 0 },
  splitter: { mode: 'sum', value: (r) => r.kills.splitter ?? 0 },
  boss: { mode: 'sum', value: (r) => r.kills.mother ?? 0 },
  flawlessBoss: { mode: 'sum', value: (r) => r.flawlessBosses },
  coins: { mode: 'sum', value: (r) => r.coins },
  powerUps: { mode: 'sum', value: (r) => r.powerUps },
  wave: { mode: 'best', value: (r) => r.wave },
  score: { mode: 'best', value: (r) => r.score },
  combo: { mode: 'best', value: (r) => r.combo },
};

export function questTarget(q: Pick<Quest, 'kind' | 'tier'>) {
  const k = QUESTS.kinds[q.kind];
  const target = k.target + k.targetStep * q.tier;
  return 'max' in k ? Math.min(k.max, target) : target;
}

export const questReward = (q: Pick<Quest, 'kind' | 'tier'>) => {
  const k = QUESTS.kinds[q.kind];
  return k.reward + k.rewardStep * q.tier;
};

export const questComplete = (q: Quest) => q.progress >= questTarget(q);

/**
 * Прогресс заданий с учётом партии: run — статистика сейчас, banked — на момент прошлого зачисления
 * (для накопительных заданий добавляется только разница, чтобы не посчитать дважды).
 */
export function applyRun(quests: Quests, run: RunStats, banked: RunStats): Quests {
  const active = quests.active.map((q) => {
    const { mode, value } = STAT[q.kind];
    const progress = mode === 'sum' ? q.progress + value(run) - value(banked) : Math.max(q.progress, value(run));
    return { ...q, progress: Math.min(progress, questTarget(q)) };
  });
  return { ...quests, active };
}

/** Следующее задание: тип, которого нет среди активных и который выполнялся реже всего (при равенстве — по порядку). */
function nextQuest(quests: Quests): Quest {
  const taken = new Set(quests.active.map((q) => q.kind));
  const free = QUEST_KINDS.filter((k) => !taken.has(k));
  const kind = free.reduce((a, b) => ((quests.done[b] ?? 0) < (quests.done[a] ?? 0) ? b : a));
  return { kind, tier: quests.done[kind] ?? 0, progress: 0 };
}

/** Дополнить список активных заданий до QUESTS.active. */
export function fillQuests(quests: Quests): Quests {
  let q = quests;
  while (q.active.length < QUESTS.active) q = { ...q, active: [...q.active, nextQuest(q)] };
  return q;
}

/** Забрать награду за задание i: новое задание встаёт на то же место. */
export function claimQuest(quests: Quests, i: number): { quests: Quests; reward: number } | null {
  const q = quests.active[i];
  if (!q || !questComplete(q)) return null;
  const done = { ...quests.done, [q.kind]: (quests.done[q.kind] ?? 0) + 1 };
  const rest = { active: quests.active.filter((_, j) => j !== i), done };
  const fresh = nextQuest(rest);
  const active = [...rest.active];
  active.splice(i, 0, fresh);
  return { quests: { active, done }, reward: questReward(q) };
}
