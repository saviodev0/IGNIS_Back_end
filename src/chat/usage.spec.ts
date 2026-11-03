import { dayKey, estimateTokens, nextMidnight, parseLimit, readUsage } from './usage';

describe('dayKey / nextMidnight', () => {
  it('usa o dia local no formato YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
    expect(dayKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });

  it('a próxima meia-noite é o começo do dia seguinte', () => {
    const next = nextMidnight(new Date(2026, 10, 3, 15, 30));

    expect(dayKey(next)).toBe('2026-11-04');
    expect([next.getHours(), next.getMinutes()]).toEqual([0, 0]);
  });
});

describe('estimateTokens', () => {
  it('conta cerca de 1 token a cada 4 caracteres', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('readUsage', () => {
  it('lê o formato da API e devolve null quando não há uso', () => {
    expect(readUsage({ prompt_tokens: 120, completion_tokens: 30 })).toEqual({ promptTokens: 120, completionTokens: 30 });
    expect(readUsage({ completion_tokens: 7 })).toEqual({ promptTokens: 0, completionTokens: 7 });
    expect(readUsage(undefined)).toBeNull();
    expect(readUsage({})).toBeNull();
  });
});

describe('parseLimit', () => {
  it.each([
    [undefined, 200000],
    ['', 200000],
    ['50000', 50000],
    [1234.9, 1234],
    ['0', 0],
    ['abc', 0],
    [-5, 0],
  ])('%p -> %p', (value, expected) => {
    expect(parseLimit(value)).toBe(expected);
  });
});
