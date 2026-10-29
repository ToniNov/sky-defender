import { questComplete, questReward, questTarget, type Quest } from '../quests';
import { CoinIcon } from '../ui/CoinIcon';
import { questTitle } from '../ui/questTitle';
import { Screen } from '../ui/Screen';

export function QuestsScreen({ quests, onClaim, onClose }: { quests: Quest[]; onClaim: (i: number) => void; onClose: () => void }) {
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
