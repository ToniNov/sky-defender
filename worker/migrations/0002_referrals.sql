-- Кто кого пригласил. Друг засчитывается один раз — когда впервые прислал результат партии.
-- rewarded = 1 — пригласивший уже забрал за него награду.
CREATE TABLE referrals (
  invitee_id INTEGER PRIMARY KEY,
  referrer_id INTEGER NOT NULL,
  rewarded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX referrals_referrer ON referrals (referrer_id);
