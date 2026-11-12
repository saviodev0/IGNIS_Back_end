// O Prisma gerado é ESM e não carrega no Jest; a classe só precisa existir para o Nest ler o tipo
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService injeção de dependência', () => {
  it('declara o PrismaService como valor (import type faz o Nest não achar o provider)', () => {
    const types = Reflect.getMetadata('design:paramtypes', UsersService);

    expect(types[0]).toBe(PrismaService);
  });
});

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

  it('calculates the current user position outside the page when points are tied', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'user-1', name: 'Ana', ignisPoints: 300 },
      { id: 'user-a', name: 'Bia', ignisPoints: 250 },
    ]);
    const count = jest
      .fn()
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2);
    const findUnique = jest.fn().mockResolvedValue({
      id: 'user-z',
      name: 'Caio',
      ignisPoints: 250,
    });

    const service = new UsersService({
      user: { findMany, count, findUnique },
    } as any);

    await expect(
      service.ranking('user-z', { page: 1, limit: 2 }),
    ).resolves.toMatchObject({
      currentUser: {
        id: 'user-z',
        name: 'Caio',
        ignisPoints: 250,
        position: 3,
      },
      pagination: {
        page: 1,
        limit: 2,
        total: 6,
        totalPages: 3,
      },
    });

    expect(count).toHaveBeenLastCalledWith({
      where: {
        OR: [
          { ignisPoints: { gt: 250 } },
          { ignisPoints: 250, id: { lt: 'user-z' } },
        ],
      },
    });
  });
});
