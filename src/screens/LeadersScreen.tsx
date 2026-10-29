import { useState } from 'react';
import type { LeaderEntry } from '../api';
import type { BoardState } from '../hooks/useSocial';
import { Screen } from '../ui/Screen';

export function LeadersScreen({ board, onInvite, onClose }: { board: BoardState; onInvite: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<'all' | 'friends'>('all');
  const loaded = board !== 'loading' && board !== null ? board : null;
  // друзей видно только в Telegram: вне него сервер не знает, кто ты
  const friends = loaded?.friends ?? null;
  return (
    <Screen>
      <h2 className="title small">Лидеры</h2>
      {friends && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>
            Все
          </button>
          <button role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')}>
            Друзья
          </button>
        </div>
      )}
      {board === 'loading' ? (
        <p className="subtitle">Загрузка…</p>
      ) : board === null ? (
        <p className="subtitle">Таблица сейчас недоступна. Попробуй позже.</p>
      ) : tab === 'friends' && friends ? (
        <>
          {friends.length > 0 && <LeaderList entries={friends} />}
          {!friends.some((f) => !f.me) && (
            <>
              <p className="subtitle">Позови друзей по своей ссылке — здесь появятся их рекорды.</p>
              <button className="btn ghost" onClick={onInvite}>
                Позвать друзей
              </button>
            </>
          )}
        </>
      ) : board.top.length === 0 ? (
        <p className="subtitle">Пока здесь никого нет — стань первым!</p>
      ) : (
        <LeaderList entries={board.top} />
      )}
      {tab === 'all' && loaded?.me && (
        <p className="record">
          Твоё место: {loaded.me.rank} · {loaded.me.score}
        </p>
      )}
      <button className="btn primary" onClick={onClose}>
        Готово
      </button>
    </Screen>
  );
}

function LeaderList({ entries }: { entries: (LeaderEntry & { me?: boolean })[] }) {
  return (
    <ol className="leaders">
      {entries.map((e, i) => (
        <li className={e.me ? 'leader me' : 'leader'} key={i}>
          <span className="leader-rank">{i + 1}</span>
          <span className="leader-name">{e.me ? `${e.name} (ты)` : e.name}</span>
          <span className="leader-score">{e.score}</span>
        </li>
      ))}
    </ol>
  );
}
