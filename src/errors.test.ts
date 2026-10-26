import { describe, expect, it, vi } from 'vitest';
import { version } from '../package.json';
import { createReporter, describeError } from './errors';

describe('describeError', () => {
  it('Error — имя, текст и стек', () => {
    const err = new TypeError('x is undefined');
    expect(describeError(err)).toEqual({ message: 'TypeError: x is undefined', stack: err.stack });
  });

  it('строка и прочее — текстом, пустое — null', () => {
    expect(describeError('упало')).toEqual({ message: 'упало', stack: '' });
    expect(describeError({ code: 5 })).toEqual({ message: 'Non-Error: {"code":5}', stack: '' });
    expect(describeError(undefined)).toBeNull();
    expect(describeError(null)).toBeNull();
    expect(describeError('  ')).toBeNull();
  });
});

describe('createReporter', () => {
  it('отчёт с версией игры', () => {
    const send = vi.fn();
    createReporter(send)(new Error('boom'));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Error: boom', version }));
  });

  it('одна и та же ошибка за сессию — один отчёт', () => {
    const send = vi.fn();
    const report = createReporter(send);
    const err = new Error('boom');
    report(err);
    report(err);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('не больше max разных ошибок за сессию', () => {
    const send = vi.fn();
    const report = createReporter(send, 3);
    for (let i = 0; i < 10; i++) report(`ошибка ${i}`);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('«Script error.» от чужих скриптов не шлём', () => {
    const send = vi.fn();
    createReporter(send)('Script error.');
    expect(send).not.toHaveBeenCalled();
  });
});
