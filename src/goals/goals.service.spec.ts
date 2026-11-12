jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { BadRequestException } from '@nestjs/common';

import { GoalsService } from './goals.service';

const build = (prisma: Record<string, any> = {}) => new GoalsService(prisma as any);

describe('GoalsService.create', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date(2026, 10, 11, 10, 30))); // quarta, 11/11/2026
  afterEach(() => jest.useRealTimers());

  const created = () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));
    const service = build({ goal: { findFirst: jest.fn().mockResolvedValue(null), create } });

    return { service, create };
  };

  it('recusa tipo inválido', async () => {
    await expect(build().create('u', 'YEARLY', 60)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([0, -5, NaN])('recusa meta de %s minutos', async (minutes) => {
    await expect(build().create('u', 'DAILY', minutes)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa quando já existe meta ativa do mesmo tipo', async () => {
    const create = jest.fn();
    const service = build({ goal: { findFirst: jest.fn().mockResolvedValue({ id: 9 }), create } });

    await expect(service.create('u', 'WEEKLY', 300)).rejects.toThrow('Você já possui uma meta weekly ativa.');
    expect(create).not.toHaveBeenCalled();
  });

  it('meta diária vale do começo ao fim de hoje', async () => {
    const { service, create } = created();

    await service.create('u', 'DAILY', 120);

    expect(create.mock.calls[0][0].data).toMatchObject({
      userId: 'u',
      type: 'DAILY',
      targetMinutes: 120,
      startDate: new Date(2026, 10, 11, 0, 0, 0, 0),
      endDate: new Date(2026, 10, 11, 23, 59, 59, 999),
    });
  });

  it('meta semanal vai até o domingo', async () => {
    const { service, create } = created();

    await service.create('u', 'WEEKLY', 600);

    expect(create.mock.calls[0][0].data.endDate).toEqual(new Date(2026, 10, 15, 23, 59, 59, 999));
  });

  it('meta semanal criada no domingo termina no próprio dia', async () => {
    jest.setSystemTime(new Date(2026, 10, 15, 9, 0));
    const { service, create } = created();

    await service.create('u', 'WEEKLY', 600);

    expect(create.mock.calls[0][0].data.endDate).toEqual(new Date(2026, 10, 15, 23, 59, 59, 999));
  });

  it('meta mensal vai até o último dia do mês', async () => {
    const { service, create } = created();

    await service.create('u', 'MONTHLY', 2400);

    expect(create.mock.calls[0][0].data.endDate).toEqual(new Date(2026, 10, 30, 23, 59, 59, 999));
  });
});

describe('GoalsService leitura e exclusão', () => {
  const goal = {
    id: 3,
    type: 'DAILY',
    targetMinutes: 100,
    startDate: new Date(2026, 10, 11),
    endDate: new Date(2026, 10, 11, 23, 59),
    completed: false,
    createdAt: new Date(2026, 10, 11),
  };

  const withCycles = (minutes: number[], found: any = goal) =>
    build({
      goal: { findFirst: jest.fn().mockResolvedValue(found), findMany: jest.fn().mockResolvedValue(found ? [found] : []) },
      studyCycle: { findMany: jest.fn().mockResolvedValue(minutes.map((durationMinutes) => ({ durationMinutes }))) },
    });

  it('calcula o progresso a partir dos ciclos concluídos no período', async () => {
    const result = await withCycles([25, 25]).findOne('u', 3);

    expect(result).toMatchObject({ id: 3, progressMinutes: 50, progressPercent: 50, completed: false });
  });

  it('a porcentagem para em 100 e a meta conta como cumprida', async () => {
    const result = await withCycles([60, 60]).findOne('u', 3);

    expect(result).toMatchObject({ progressMinutes: 120, progressPercent: 100, completed: true });
  });

  it('só consulta ciclos concluídos do aluno dentro do período da meta', async () => {
    const studyCycle = { findMany: jest.fn().mockResolvedValue([]) };
    const service = build({ goal: { findFirst: jest.fn().mockResolvedValue(goal) }, studyCycle });

    await service.findOne('u', 3);

    expect(studyCycle.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u',
      completed: true,
      completedAt: { gte: goal.startDate, lte: goal.endDate },
    });
  });

  it('findAll devolve todas as metas com progresso', async () => {
    const list = await withCycles([30]).findAll('u');

    expect(list).toHaveLength(1);
    expect(list[0].progressPercent).toBe(30);
  });

  it('findOne e remove devolvem erro para meta que não é do aluno', async () => {
    await expect(withCycles([], null).findOne('u', 99)).rejects.toThrow('Meta não encontrada.');

    const del = jest.fn();
    const service = build({ goal: { findFirst: jest.fn().mockResolvedValue(null), delete: del } });

    await expect(service.remove('u', 99)).rejects.toBeInstanceOf(BadRequestException);
    expect(del).not.toHaveBeenCalled();
  });

  it('remove exclui a meta do aluno', async () => {
    const del = jest.fn().mockResolvedValue({});
    const service = build({ goal: { findFirst: jest.fn().mockResolvedValue(goal), delete: del } });

    await expect(service.remove('u', 3)).resolves.toEqual({ message: 'Meta excluída com sucesso.' });
    expect(del).toHaveBeenCalledWith({ where: { id: 3 } });
  });
});
