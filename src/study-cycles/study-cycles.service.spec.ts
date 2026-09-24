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
