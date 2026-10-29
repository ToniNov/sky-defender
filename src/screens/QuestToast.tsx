import type { Quest } from '../quests';
import { questTitle } from '../ui/questTitle';

/** Всплывашка в бою: задание выполнено, награда ждёт в меню. */
export function QuestToast({ quest }: { quest: Quest }) {
  return (
    <div className="quest-toast" role="status">
      <span className="quest-toast-check">✓</span> {questTitle(quest)}
    </div>
  );
}
