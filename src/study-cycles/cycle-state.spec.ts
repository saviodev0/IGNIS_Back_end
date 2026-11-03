import { describeCycle } from './cycle-state';

const start = new Date('2026-11-03T10:00:00.000Z');
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

const cycle = (overrides = {}) => ({
  id: 1,
  durationMinutes: 25,
  startedAt: start,
  completed: false,
  completedAt: null,
  pausedAt: null,
  pausedSeconds: 0,
  ...overrides,
});

describe('describeCycle', () => {
  it('em andamento: conta o tempo desde o início', () => {
    const result = describeCycle(cycle(), at(5));

    expect(result.status).toBe('running');
    expect(result.remainingSeconds).toBe(20 * 60);
    expect(result.ignisReward).toBe(25);
  });

  it('pausado: o relógio congela no momento da pausa', () => {
    const result = describeCycle(cycle({ pausedAt: at(10) }), at(40));

    expect(result.status).toBe('paused');
    expect(result.remainingSeconds).toBe(15 * 60);
  });

  it('depois de continuar: o tempo parado não conta como estudo', () => {
    // pausou aos 10 min, ficou 30 min parado e já voltou; aos 45 min de relógio estudou 15
    const result = describeCycle(cycle({ pausedSeconds: 30 * 60 }), at(45));

    expect(result.status).toBe('running');
    expect(result.remainingSeconds).toBe(10 * 60);
  });

  it('nunca fica negativo quando o tempo acabou', () => {
    expect(describeCycle(cycle(), at(90)).remainingSeconds).toBe(0);
  });

  it('concluído: usa o momento da conclusão', () => {
    const result = describeCycle(cycle({ completed: true, completedAt: at(20) }), at(300));

    expect(result.status).toBe('completed');
    expect(result.remainingSeconds).toBe(5 * 60);
  });
});
