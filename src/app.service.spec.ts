jest.mock('./prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma/prisma.service';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;
  let isHealthy: jest.Mock;

  beforeEach(async () => {
    isHealthy = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: { isHealthy },
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('returns a healthy status when the database is available', async () => {
    isHealthy.mockResolvedValue(true);

    await expect(service.getHealth()).resolves.toMatchObject({
      status: 'ok',
      service: 'Ignis API',
      database: 'connected',
    });
  });

  it('throws a service unavailable error when the database is unavailable', async () => {
    isHealthy.mockRejectedValue(new Error('Database connection failed'));

    await expect(service.getHealth()).rejects.toMatchObject({
      status: 503,
    });
  });
});
