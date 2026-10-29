-- Оружие в итоге партии (игра с версии 0.6): в момент гибели (вид и уровень),
-- с каким вылетел из ангара и с каким провёл больше всего времени. У старых партий и запусков — пусто.
ALTER TABLE events ADD COLUMN weapon TEXT;
ALTER TABLE events ADD COLUMN weapon_level INTEGER;
ALTER TABLE events ADD COLUMN start_weapon TEXT;
ALTER TABLE events ADD COLUMN main_weapon TEXT;
