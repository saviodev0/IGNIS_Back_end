jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { AchievementsService } from './achievements.service';

const achievements = [
  { id: 1, code: 'C5', name: '5 ciclos', description: '', icon: 'a', type: 'CYCLES', requirement: 5 },
  { id: 2, code: 'M100', name: '100 minutos', description: '', icon: 'b', type: 'MINUTES', requirement: 100 },
  { id: 3, code: 'S3', name: '3 dias seguidos', description: '', icon: 'c', type: 'STREAK', requirement: 3 },
];

const day = (daysAgo: number) => new Date(2026, 10, 11 - daysAgo, 10);

const build = (cycles: { durationMinutes: number; completedAt: Date | null }[], unlockedIds: number[] = []) =>
  new AchievementsService({
    achievement: { findMany: jest.fn().mockResolvedValue(achievements) },
    userAchievement: { findMany: jest.fn().mockResolvedValue(unlockedIds.map((achievementId) => ({ achievementId }))) },
    studyCycle: { findMany: jest.fn().mockResolvedValue(cycles) },
  } as any);

const byCode = (list: any[]) => Object.fromEntries(list.map((item) => [item.code, item]));

describe('AchievementsService.findAll', () => {
  it('aluno sem ciclos começa com tudo zerado e bloqueado', async () => {
    const result = byCode(await build([]).findAll('u'));

    expect(result.C5).toMatchObject({ progress: 0, unlocked: false });
    expect(result.M100).toMatchObject({ progress: 0, unlocked: false });
    expect(result.S3).toMatchObject({ progress: 0, unlocked: false });
  });

  it('conta ciclos e minutos concluídos', async () => {
    const result = byCode(await build([
      { durationMinutes: 25, completedAt: day(0) },
      { durationMinutes: 25, completedAt: day(0) },
    ]).findAll('u'));

    expect(result.C5.progress).toBe(2);
    expect(result.M100.progress).toBe(50);
  });

  it('o progresso para no valor exigido', async () => {
    const cycles = Array.from({ length: 8 }, () => ({ durationMinutes: 30, completedAt: day(0) }));
    const result = byCode(await build(cycles).findAll('u'));

    expect(result.C5.progress).toBe(5);
    expect(result.M100.progress).toBe(100);
  });

  it('a sequência conta dias seguidos, não ciclos no mesmo dia', async () => {
    const result = byCode(await build([
      { durationMinutes: 25, completedAt: day(0) },
      { durationMinutes: 25, completedAt: day(0) },
      { durationMinutes: 25, completedAt: day(1) },
      { durationMinutes: 25, completedAt: day(2) },
    ]).findAll('u'));

    expect(result.S3.progress).toBe(3);
  });

  it('uma falha de um dia quebra a sequência, mas a maior continua valendo', async () => {
    const result = byCode(await build([
      { durationMinutes: 25, completedAt: day(0) },
      { durationMinutes: 25, completedAt: day(2) },
      { durationMinutes: 25, completedAt: day(3) },
      { durationMinutes: 25, completedAt: day(4) },
      { durationMinutes: 25, completedAt: day(5) },
    ]).findAll('u'));

    expect(result.S3.progress).toBe(3);
  });

  it('ciclo sem data de conclusão não entra na sequência', async () => {
    const result = byCode(await build([{ durationMinutes: 25, completedAt: null }]).findAll('u'));

    expect(result.S3.progress).toBe(0);
    expect(result.C5.progress).toBe(1);
  });

  it('marca como desbloqueadas as conquistas que o aluno já tem', async () => {
    const result = byCode(await build([], [2]).findAll('u'));

    expect(result.M100.unlocked).toBe(true);
    expect(result.C5.unlocked).toBe(false);
  });

  it('devolve as conquistas na ordem em que o banco entregou', async () => {
    const result = await build([]).findAll('u');

    expect(result.map((item) => item.code)).toEqual(['C5', 'M100', 'S3']);
  });
});
