jest.mock('../src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = {
    isHealthy: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET) returns the database status', () => {
    prisma.isHealthy.mockResolvedValue(true);

    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'ok',
          service: 'Ignis API',
          database: 'connected',
        });
        expect(body).toHaveProperty('timestamp');
      });
  });

  it('/health (GET) returns 503 when the database is unavailable', () => {
    prisma.isHealthy.mockRejectedValue(new Error('Database connection failed'));

    return request(app.getHttpServer())
      .get('/health')
      .expect(503)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'error',
          service: 'Ignis API',
          database: 'disconnected',
        });
      });
  });
});
