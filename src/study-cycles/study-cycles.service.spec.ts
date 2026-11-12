jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { StudyCyclesService } from './study-cycles.service';

describe('StudyCyclesService.history', () => {
  it('returns filtered, paginated history with a summary', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 12,
        durationMinutes: 45,
        startedAt: new Date('2026-09-10T09:00:00.000Z'),
        completedAt: new Date('2026-09-10T09:45:00.000Z'),
        ignisEarned: 45,
      },
    ]);
    const count = jest.fn().mockResolvedValue(3);
    const aggregate = jest.fn().mockResolvedValue({
      _sum: {
        durationMinutes: 120,
        ignisEarned: 120,
      },
      _avg: {
        durationMinutes: 40,
      },
    });

    const service = new StudyCyclesService({
      studyCycle: { findMany, count, aggregate },
    } as any);

    await expect(
      service.history('user-1', {
        page: 2,
        limit: 1,
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-30T23:59:59.999Z',
      }),
    ).resolves.toEqual({
      data: [
        {
          id: 12,
          durationMinutes: 45,
          startedAt: new Date('2026-09-10T09:00:00.000Z'),
          completedAt: new Date('2026-09-10T09:45:00.000Z'),
          ignisEarned: 45,
        },
      ],
      pagination: {
        page: 2,
        limit: 1,
        total: 3,
        totalPages: 3,
      },
      summary: {
        totalStudyMinutes: 120,
        totalIgnisEarned: 120,
        averageStudyMinutes: 40,
      },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 1,
        take: 1,
        where: {
          userId: 'user-1',
          completed: true,
          completedAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lte: new Date('2026-09-30T23:59:59.999Z'),
          },
        },
      }),
    );
    expect(count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.any(Object),
    }));
    expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.any(Object),
    }));
  });
});

describe('StudyCyclesService.stats streaks', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts the current and longest streak from completed study days', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 24, 12));

    const findMany = jest.fn().mockResolvedValue([
      { durationMinutes: 30, ignisEarned: 30, completedAt: new Date(2026, 8, 24, 10) },
      { durationMinutes: 30, ignisEarned: 30, completedAt: new Date(2026, 8, 23, 10) },
      { durationMinutes: 30, ignisEarned: 30, completedAt: new Date(2026, 8, 22, 10) },
      { durationMinutes: 30, ignisEarned: 30, completedAt: new Date(2026, 8, 20, 10) },
      { durationMinutes: 30, ignisEarned: 30, completedAt: null },
    ]);
    const service = new StudyCyclesService({
      studyCycle: { findMany },
    } as any);

    await expect(service.stats('user-1')).resolves.toEqual(
      expect.objectContaining({
        currentStreak: 3,
        longestStreak: 3,
      }),
    );
  });

  it('resets the current streak when the last study was more than one day ago', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 24, 12));

    const findMany = jest.fn().mockResolvedValue([
      { durationMinutes: 30, ignisEarned: 30, completedAt: new Date(2026, 8, 22, 10) },
      { durationMinutes: 30, ignisEarned: 30, completedAt: new Date(2026, 8, 21, 10) },
    ]);
    const service = new StudyCyclesService({
      studyCycle: { findMany },
    } as any);

    await expect(service.stats('user-1')).resolves.toEqual(
      expect.objectContaining({
        currentStreak: 0,
        longestStreak: 2,
      }),
    );
  });
});


describe('StudyCyclesService ciclo ativo', () => {
  const startedAt = new Date(Date.now() - 5 * 60_000);
  const open = {
    id: 7,
    userId: 'user-1',
    durationMinutes: 25,
    startedAt,
    completed: false,
    completedAt: null,
    pausedAt: null,
    pausedSeconds: 0,
  };

  const build = (studyCycle: Record<string, jest.Mock>) =>
    new StudyCyclesService({ studyCycle } as any);

  it('start recusa quando já existe um ciclo aberto', async () => {
    const create = jest.fn();
    const service = build({ findFirst: jest.fn().mockResolvedValue({ id: 7 }), create });

    await expect(service.start('user-1', 25)).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('start cria o ciclo e devolve o estado', async () => {
    const create = jest.fn().mockResolvedValue(open);
    const service = build({ findFirst: jest.fn().mockResolvedValue(null), create });

    const result = await service.start('user-1', 25);

    expect(result.status).toBe('running');
    expect(result.remainingSeconds).toBeGreaterThan(19 * 60);
  });

  it('active devolve null quando não há ciclo aberto', async () => {
    const service = build({ findFirst: jest.fn().mockResolvedValue(null) });

    await expect(service.active('user-1')).resolves.toBeNull();
  });

  it('pause grava o início da pausa', async () => {
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...open, ...data }));
    const service = build({ findFirst: jest.fn().mockResolvedValue(open), update });

    const result = await service.pause(7, 'user-1');

    expect(update.mock.calls[0][0].data.pausedAt).toBeInstanceOf(Date);
    expect(result.status).toBe('paused');
  });

  it('pause em ciclo já pausado não muda nada', async () => {
    const update = jest.fn();
    const paused = { ...open, pausedAt: new Date() };
    const service = build({ findFirst: jest.fn().mockResolvedValue(paused), update });

    expect((await service.pause(7, 'user-1')).status).toBe('paused');
    expect(update).not.toHaveBeenCalled();
  });

  it('resume soma o tempo parado e limpa a pausa', async () => {
    const pausedAt = new Date(Date.now() - 120_000);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ ...open, pausedAt: null, pausedSeconds: 120 });
    const service = build({
      findFirst: jest.fn().mockResolvedValue({ ...open, pausedAt }),
      updateMany,
      findUniqueOrThrow,
    });

    const result = await service.resume(7, 'user-1');
    const call = updateMany.mock.calls[0][0];

    expect(call.where).toEqual({ id: 7, pausedAt });
    expect(call.data.pausedAt).toBeNull();
    expect(call.data.pausedSeconds.increment).toBeGreaterThanOrEqual(119);
    expect(result.status).toBe('running');
  });

  it('resume em ciclo que não está pausado não muda nada', async () => {
    const updateMany = jest.fn();
    const service = build({ findFirst: jest.fn().mockResolvedValue(open), updateMany });

    expect((await service.resume(7, 'user-1')).status).toBe('running');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('pause e resume validam dono e conclusão', async () => {
    const missing = build({ findFirst: jest.fn().mockResolvedValue(null) });
    await expect(missing.pause(7, 'outro')).rejects.toBeInstanceOf(NotFoundException);

    const done = build({ findFirst: jest.fn().mockResolvedValue({ ...open, completed: true }) });
    await expect(done.resume(7, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('StudyCyclesService título do ciclo', () => {
  const row = {
    id: 9,
    userId: 'user-1',
    durationMinutes: 25,
    startedAt: new Date(),
    completed: false,
    completedAt: null,
    pausedAt: null,
    pausedSeconds: 0,
  };

  it('start grava o título já limpo', async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...row, ...data }));
    const service = new StudyCyclesService({
      studyCycle: { findFirst: jest.fn().mockResolvedValue(null), create },
    } as any);

    const cycle: any = await service.start('user-1', 25, '  Revisar   mitocôndria ');

    expect(create.mock.calls[0][0].data.title).toBe('Revisar mitocôndria');
    expect(cycle.title).toBe('Revisar mitocôndria');
  });

  it('start sem título grava null', async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...row, ...data }));
    const service = new StudyCyclesService({
      studyCycle: { findFirst: jest.fn().mockResolvedValue(null), create },
    } as any);

    await service.start('user-1', 25);
    await service.start('user-1', 25, '   ');

    expect(create.mock.calls[0][0].data.title).toBeNull();
    expect(create.mock.calls[1][0].data.title).toBeNull();
  });

  it('start recusa título grande demais sem criar o ciclo', async () => {
    const create = jest.fn();
    const service = new StudyCyclesService({
      studyCycle: { findFirst: jest.fn().mockResolvedValue(null), create },
    } as any);

    await expect(service.start('user-1', 25, 'a'.repeat(81))).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rename troca o título de um ciclo do aluno, inclusive concluído', async () => {
    const update = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ ...row, completed: true, completedAt: new Date(), ...data }),
    );
    const findFirst = jest.fn().mockResolvedValue({ id: 9 });
    const service = new StudyCyclesService({ studyCycle: { findFirst, update } } as any);

    const cycle: any = await service.rename(9, 'user-1', ' Prova de bio ');

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9, userId: 'user-1' } }));
    expect(update).toHaveBeenCalledWith({ where: { id: 9 }, data: { title: 'Prova de bio' } });
    expect(cycle.title).toBe('Prova de bio');
  });

  it('rename com título vazio remove o nome', async () => {
    const update = jest.fn().mockResolvedValue(row);
    const service = new StudyCyclesService({
      studyCycle: { findFirst: jest.fn().mockResolvedValue({ id: 9 }), update },
    } as any);

    await service.rename(9, 'user-1', '');

    expect(update).toHaveBeenCalledWith({ where: { id: 9 }, data: { title: null } });
  });

  it('rename de ciclo de outro aluno devolve 404 e não altera nada', async () => {
    const update = jest.fn();
    const service = new StudyCyclesService({
      studyCycle: { findFirst: jest.fn().mockResolvedValue(null), update },
    } as any);

    await expect(service.rename(9, 'outro', 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rename recusa título inválido antes de consultar o banco', async () => {
    const findFirst = jest.fn();
    const service = new StudyCyclesService({ studyCycle: { findFirst } } as any);

    await expect(service.rename(9, 'user-1', 42)).rejects.toBeInstanceOf(BadRequestException);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('o histórico traz título e tempo pausado de cada ciclo', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new StudyCyclesService({
      studyCycle: {
        findMany,
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: {}, _avg: {} }),
      },
    } as any);

    await service.history('user-1');

    expect(findMany.mock.calls[0][0].select).toMatchObject({ title: true, pausedSeconds: true });
  });
});
