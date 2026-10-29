import { describe, expect, it } from 'vitest';
import { parseEvent } from './events';

const device = 'abc123def456ghi7';

describe('parseEvent', () => {
  it('запуск', () => {
    const body = { type: 'launch', device, version: '0.5.0', platform: 'ios 8.0' };
    expect(parseEvent(body)).toEqual(body);
  });

  it('конец партии', () => {
    const body = {
      type: 'run',
      device,
      version: '0.6.0',
      platform: 'web',
      score: 1200,
      wave: 4,
      seconds: 84,
      cause: 'kamikaze',
      weapon: 'laser',
      weaponLevel: 2,
      startWeapon: 'gun',
      mainWeapon: 'rocket',
    };
    expect(parseEvent(body)).toEqual(body);
  });

  it('партия из старой игры, без оружия — оружие пустое', () => {
    const body = { type: 'run', device, version: '0.5.0', platform: 'web', score: 1200, wave: 4, seconds: 84, cause: 'kamikaze' };
    expect(parseEvent(body)).toEqual({ ...body, weapon: null, weaponLevel: null, startWeapon: null, mainWeapon: null });
  });

  it('оружие — либо всё годное, либо его нет', () => {
    const ok = { type: 'run', device, score: 10, wave: 1, seconds: 30, cause: 'bullet' };
    const weapon = { weapon: 'gun', weaponLevel: 1, startWeapon: 'gun', mainWeapon: 'gun' };
    expect(parseEvent({ ...ok, ...weapon })).not.toBeNull();
    for (const bad of [
      { weapon: 'Laser' },
      { weapon: undefined },
      { weaponLevel: 0.5 },
      { weaponLevel: 99 },
      { weaponLevel: undefined },
      { mainWeapon: "x'; DROP TABLE" },
      { startWeapon: 5 },
    ]) {
      expect(parseEvent({ ...ok, ...weapon, ...bad }), JSON.stringify(bad)).toBeNull();
    }
  });

  it('без версии и платформы — «?», длинные обрезаются', () => {
    const r = parseEvent({ type: 'launch', device, platform: 'x'.repeat(500) });
    expect(r?.version).toBe('?');
    expect(r?.platform).toHaveLength(40);
  });

  it('без годного id устройства — не событие', () => {
    for (const d of [undefined, '', 'short', 'ABCDEFGH12', 'abc-defgh-12', 'a'.repeat(33), 5]) {
      expect(parseEvent({ type: 'launch', device: d })).toBeNull();
    }
  });

  it('неизвестный тип — не событие', () => {
    for (const body of [null, 'x', {}, { type: 'hack', device }]) expect(parseEvent(body)).toBeNull();
  });

  it('у партии числа целые и в пределах, причина — короткое слово', () => {
    const ok = { type: 'run', device, score: 10, wave: 1, seconds: 30, cause: 'bullet' };
    expect(parseEvent(ok)).not.toBeNull();
    for (const bad of [
      { score: -1 },
      { score: 1.5 },
      { score: '10' },
      { score: 1e9 },
      { wave: 5000 },
      { seconds: 99999 },
      { cause: '' },
      { cause: 'Bullet' },
      { cause: "x'; DROP TABLE" },
      { cause: undefined },
    ]) {
      expect(parseEvent({ ...ok, ...bad }), JSON.stringify(bad)).toBeNull();
    }
  });
});
