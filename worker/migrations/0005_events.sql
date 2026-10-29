-- Аналитика: запуски игры и итоги партий. Игрок — случайный id устройства, не Telegram-id.
-- У запуска score, wave, seconds и cause пустые.
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  type TEXT NOT NULL,
  device TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  score INTEGER,
  wave INTEGER,
  seconds INTEGER,
  cause TEXT
);

CREATE INDEX events_at ON events (at);
