jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../study-cycles/study-cycles.service', () => ({ StudyCyclesService: class {} }));
jest.mock('../goals/goals.service', () => ({ GoalsService: class {} }));

import { summarizeStudyDays, upcomingDays } from './student-context.service';

describe('summarizeStudyDays', () => {
  const now = new Date(2026, 9, 30, 15, 0); // sex 30/10/2026

  it('avisa quando não houve estudo', () => {
    expect(summarizeStudyDays([], now)).toContain('não concluiu nenhum ciclo');
  });

  it('soma por dia, calcula médias e o melhor dia da semana', () => {
    const cycles = [
      { completedAt: new Date(2026, 9, 28, 10, 0), durationMinutes: 25 },
      { completedAt: new Date(2026, 9, 28, 11, 0), durationMinutes: 25 },
      { completedAt: new Date(2026, 9, 30, 9, 0), durationMinutes: 60 },
      { completedAt: null, durationMinutes: 25 },
    ];

    const summary = summarizeStudyDays(cycles, now);

    expect(summary).toContain('Dias com estudo: 2 de 14');
    expect(summary).toContain('Média por dia estudado: 55min');
    expect(summary).toContain('Dia da semana em que mais estudou: sexta-feira (1h)');
    expect(summary.match(/30\/10 1h/)).not.toBeNull();
  });

  it('ignora ciclos mais antigos que a janela', () => {
    const old = [{ completedAt: new Date(2026, 8, 1, 10, 0), durationMinutes: 90 }];
    expect(summarizeStudyDays(old, now)).toContain('não concluiu nenhum ciclo');
  });
});

describe('upcomingDays', () => {
  it('lista os próximos dias com o dia da semana correto', () => {
    const list = upcomingDays(new Date(2026, 9, 30, 15, 0), 7).split('; ');

    expect(list).toHaveLength(7);
    expect(list[0]).toContain('31/10');
    expect(list[0].toLowerCase()).toContain('sáb');
    expect(list[6]).toContain('06/11');
    expect(list[6].toLowerCase()).toContain('sex');
  });
});
