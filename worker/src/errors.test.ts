import { describe, expect, it } from 'vitest';
import { MESSAGE_MAX, STACK_MAX, errorFingerprint, parseErrorReport } from './errors';

describe('parseErrorReport', () => {
  it('нормальный отчёт', () => {
    const body = { message: 'boom', stack: 'Error: boom\n    at f (index.js:1:2)', version: '0.5.0', platform: 'ios 8.0' };
    expect(parseErrorReport(body)).toEqual(body);
  });

  it('без версии и платформы — «?», длинное обрезается', () => {
    const r = parseErrorReport({ message: 'x'.repeat(5000), stack: 's'.repeat(9000) });
    expect(r?.message).toHaveLength(MESSAGE_MAX);
    expect(r?.stack).toHaveLength(STACK_MAX);
    expect(r?.version).toBe('?');
    expect(r?.platform).toBe('?');
  });

  it('без текста ошибки — не отчёт', () => {
    for (const body of [null, 'x', {}, { message: '' }, { message: '   ' }, { message: 5 }]) {
      expect(parseErrorReport(body)).toBeNull();
    }
  });
});

describe('errorFingerprint', () => {
  const report = (stack: string, version = '0.5.0') => ({ message: 'boom', stack, version, platform: 'ios' });

  it('то же место в коде — та же ошибка, даже с другой платформы', () => {
    const a = report('Error: boom\n    at f (index.js:10:5)\n    at g (index.js:20:1)');
    const b = { ...report('Error: boom\n    at f (index.js:10:5)'), platform: 'android' };
    expect(errorFingerprint(a)).toBe(errorFingerprint(b));
  });

  it('другое место или другая версия — разные ошибки', () => {
    const a = report('Error: boom\n    at f (index.js:10:5)');
    expect(errorFingerprint(a)).not.toBe(errorFingerprint(report('Error: boom\n    at h (index.js:99:1)')));
    expect(errorFingerprint(a)).not.toBe(errorFingerprint(report('Error: boom\n    at f (index.js:10:5)', '0.6.0')));
  });
});
