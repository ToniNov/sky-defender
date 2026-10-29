import { describe, expect, it } from 'vitest';
import { QUEST_KINDS, QUESTS } from './game/balance';
import {
  applyRun,
  claimQuest,
  copyRunStats,
  countKill,
  emptyRunStats,
  fillQuests,
  questComplete,
  questReward,
  questTarget,
  type Quest,
  type Quests,
  type RunStats,
} from './quests';

const run = (patch: Partial<RunStats>): RunStats => ({ ...emptyRunStats(), ...patch });
const withActive = (...active: Quest[]): Quests => ({ active, done: {} });

describe('countKill', () => {
  it('считает врага, вид оружия и флагмана, добитого этим видом', () => {
    const r = emptyRunStats();
    countKill(r, 'scout', 'laser');
    countKill(r, 'mother', 'rocket');
    expect(r.kills).toEqual({ scout: 1, mother: 1 });
    expect(r.weaponKills).toEqual({ laser: 1, rocket: 1 });
    expect(r.weaponBosses).toEqual({ rocket: 1 });
  });

  it('бомба засчитывает врага, но не оружие', () => {
    const r = emptyRunStats();
    countKill(r, 'mother', 'bomb');
    expect(r.kills).toEqual({ mother: 1 });
    expect(r.weaponKills).toEqual({});
    expect(r.weaponBosses).toEqual({});
  });

  it('копия не меняется вместе с партией', () => {
    const r = emptyRunStats();
    const banked = copyRunStats(r);
    countKill(r, 'scout', 'spread');
    expect(banked.kills).toEqual({});
    expect(banked.weaponKills).toEqual({});
  });
});

describe('цель и награда', () => {
  it('растут с каждым повторением задания', () => {
    const k = QUESTS.kinds.saucer;
    expect(questTarget({ kind: 'saucer', tier: 0 })).toBe(k.target);
    expect(questTarget({ kind: 'saucer', tier: 2 })).toBe(k.target + 2 * k.targetStep);
    expect(questReward({ kind: 'saucer', tier: 2 })).toBe(k.reward + 2 * k.rewardStep);
  });

  it('комбо не требует больше максимального множителя', () => {
    expect(questTarget({ kind: 'combo', tier: 100 })).toBe(QUESTS.kinds.combo.max);
  });
});

describe('applyRun', () => {
  it('накопительное задание прибавляет только то, что набрано после прошлого зачисления', () => {
    const quests = withActive({ kind: 'scout', tier: 0, progress: 3 });
    const banked = run({ kills: { scout: 2 } });
    const now = run({ kills: { scout: 7 } });
    expect(applyRun(quests, now, banked).active[0].progress).toBe(3 + 5);
    // повторное зачисление того же самого ничего не добавляет
    expect(applyRun(quests, now, now).active[0].progress).toBe(3);
  });

  it('задание «за партию» берёт лучший результат, а не сумму', () => {
    const quests = withActive({ kind: 'wave', tier: 1, progress: 4 }); // цель выше 6, чтобы не упереться в неё
    expect(applyRun(quests, run({ wave: 3 }), emptyRunStats()).active[0].progress).toBe(4);
    expect(applyRun(quests, run({ wave: 6 }), run({ wave: 5 })).active[0].progress).toBe(6);
  });

  it('прогресс не перескакивает цель', () => {
    const target = questTarget({ kind: 'coins', tier: 0 });
    const quests = withActive({ kind: 'coins', tier: 0, progress: target - 1 });
    const q = applyRun(quests, run({ coins: 1000 }), emptyRunStats()).active[0];
    expect(q.progress).toBe(target);
    expect(questComplete(q)).toBe(true);
  });

  it('задание на оружие считает только врагов, сбитых этим оружием', () => {
    const quests = withActive({ kind: 'laserKills', tier: 0, progress: 0 }, { kind: 'rocketBoss', tier: 0, progress: 0 });
    const now = run({ weaponKills: { laser: 4, gun: 10 }, weaponBosses: { laser: 1 } });
    const [laser, rocketBoss] = applyRun(quests, now, emptyRunStats()).active;
    expect(laser.progress).toBe(4);
    expect(rocketBoss.progress).toBe(0);
  });

  it('осколки сплиттера не засчитываются как сплиттеры', () => {
    const quests = withActive({ kind: 'splitter', tier: 0, progress: 0 });
    expect(applyRun(quests, run({ kills: { mini: 10 } }), emptyRunStats()).active[0].progress).toBe(0);
  });

  it('флагман без урона считается отдельно от любого флагмана', () => {
    const quests = withActive({ kind: 'boss', tier: 1, progress: 0 }, { kind: 'flawlessBoss', tier: 1, progress: 0 });
    const [boss, flawless] = applyRun(quests, run({ kills: { mother: 2 }, flawlessBosses: 1 }), emptyRunStats()).active;
    expect(boss.progress).toBe(2);
    expect(flawless.progress).toBe(1);
  });
});

describe('выдача заданий', () => {
  it('новые типы, которые ещё не выполнялись, выдаются раньше знакомых', () => {
    const done = Object.fromEntries(QUEST_KINDS.filter((k) => k !== 'laserKills').map((k) => [k, 3]));
    const { active } = fillQuests({ active: [{ kind: 'scout', tier: 3, progress: 0 }], done });
    expect(active[1].kind).toBe('laserKills');
  });

  it('новичок получает первые типы по порядку', () => {
    const { active } = fillQuests({ active: [], done: {} });
    expect(active.map((q) => q.kind)).toEqual(['scout', 'saucer', 'kamikaze']);
    expect(active.every((q) => q.tier === 0 && q.progress === 0)).toBe(true);
  });

  it('добавляет тип, который выполнялся реже всего, и не повторяет активные', () => {
    const { active } = fillQuests({
      active: [{ kind: 'scout', tier: 0, progress: 0 }],
      // все типы выполнены по разу, тарелка — дважды
      done: { ...Object.fromEntries(QUEST_KINDS.map((k) => [k, 1])), saucer: 2 },
    });
    expect(active.map((q) => q.kind)).toEqual(['scout', 'kamikaze', 'shielder']);
    expect(active[1].tier).toBe(1);
  });
});

describe('claimQuest', () => {
  const target = questTarget({ kind: 'scout', tier: 0 });
  const quests = withActive(
    { kind: 'saucer', tier: 0, progress: 0 },
    { kind: 'scout', tier: 0, progress: target },
    { kind: 'kamikaze', tier: 0, progress: 0 },
  );

  it('невыполненное задание не забрать', () => {
    expect(claimQuest(quests, 0)).toBeNull();
    expect(claimQuest(quests, 99)).toBeNull();
  });

  it('даёт награду, засчитывает выполнение и ставит новое задание на то же место', () => {
    const result = claimQuest(quests, 1)!;
    expect(result.reward).toBe(questReward({ kind: 'scout', tier: 0 }));
    expect(result.quests.done).toEqual({ scout: 1 });
    expect(result.quests.active.map((q) => q.kind)).toEqual(['saucer', 'shielder', 'kamikaze']);
    expect(result.quests.active[1]).toEqual({ kind: 'shielder', tier: 0, progress: 0 });
  });

  it('не меняет исходные данные', () => {
    const before = JSON.stringify(quests);
    claimQuest(quests, 1);
    expect(JSON.stringify(quests)).toBe(before);
  });
});
