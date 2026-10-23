-- Игроки и их рекорды. id — Telegram user id.
CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX players_best_score ON players (best_score DESC);
