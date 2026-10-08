import { UsersService } from './users.service';

describe('UsersService.ranking', () => {
  it('returns a paginated ranking and the current user position', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'user-2', name: 'Ana', ignisPoints: 300 },
      { id: 'user-1', name: 'Bruno', ignisPoints: 250 },
    ]);
    const count = jest
      .fn()
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1);
    const findUnique = jest.fn().mockResolvedValue({
      id: 'user-1',
      name: 'Bruno',
      ignisPoints: 250,
    });

    const service = new UsersService({
      user: { findMany, count, findUnique },
    } as any);

    await expect(
      service.ranking('user-1', { page: 1, limit: 2 }),
    ).resolves.toEqual({
      data: [
        { position: 1, id: 'user-2', name: 'Ana', ignisPoints: 300 },
        { position: 2, id: 'user-1', name: 'Bruno', ignisPoints: 250 },
      ],
      currentUser: {
        id: 'user-1',
        name: 'Bruno',
        ignisPoints: 250,
        position: 2,
      },
      pagination: {
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
      },
    });

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ ignisPoints: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 2,
      select: { id: true, name: true, ignisPoints: true },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, name: true, ignisPoints: true },
    });
  });
});
