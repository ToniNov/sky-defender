import type { QuestKind } from '../game/balance';
import { questTarget, type Quest } from '../quests';
import { plural } from './plural';

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

/** Подпись задания: в списке заданий и во всплывашке в бою. */
export const questTitle = (q: Quest) => QUEST_TITLE[q.kind](questTarget(q));
