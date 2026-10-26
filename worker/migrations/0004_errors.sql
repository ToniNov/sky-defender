-- Ошибки из игры. Одинаковые (fingerprint) складываются в одну строку со счётчиком.
-- Личных данных нет: только текст ошибки, стек, версия игры и платформа.
CREATE TABLE errors (
  fingerprint TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  stack TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE INDEX errors_last_seen ON errors (last_seen DESC);
