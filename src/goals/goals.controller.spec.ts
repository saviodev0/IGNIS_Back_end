jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../auth/guards/auth.guard';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

describe('POST /goals (validação do corpo)', () => {
  let app: INestApplication;
  const create = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GoalsController],
      providers: [{ provide: GoalsService, useValue: { create } }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = { sub: 'aluno-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    // Mesma configuração do main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => create.mockReset().mockResolvedValue({ id: 1 }));

  const post = (body: object) =>
    request(app.getHttpServer()).post('/goals').send(body);

  it.each(['DAILY', 'WEEKLY', 'MONTHLY'])(
    'aceita o tipo %s com minutos inteiros positivos',
    async (type) => {
      await post({ type, targetMinutes: 120 }).expect(201);
      expect(create).toHaveBeenCalledWith('aluno-1', type, 120);
    },
  );

  it.each([
    [
      'tipo fora da lista',
      { type: 'YEARLY', targetMinutes: 60 },
      'Tipo de meta inválido',
    ],
    [
      'tipo em minúsculas',
      { type: 'daily', targetMinutes: 60 },
      'Tipo de meta inválido',
    ],
    ['sem tipo', { targetMinutes: 60 }, 'Tipo de meta inválido'],
    [
      'tipo que não é texto',
      { type: 5, targetMinutes: 60 },
      'Tipo de meta inválido',
    ],
    ['sem minutos', { type: 'DAILY' }, 'targetMinutes'],
    ['minutos zero', { type: 'DAILY', targetMinutes: 0 }, 'maior que zero'],
    [
      'minutos negativos',
      { type: 'DAILY', targetMinutes: -30 },
      'maior que zero',
    ],
    ['minutos decimais', { type: 'DAILY', targetMinutes: 30.5 }, 'inteiro'],
    ['minutos como texto', { type: 'DAILY', targetMinutes: '60' }, 'inteiro'],
    [
      'minutos maiores que o inteiro do banco',
      { type: 'DAILY', targetMinutes: 3_000_000_000 },
      'grande demais',
    ],
    [
      'campo extra',
      { type: 'DAILY', targetMinutes: 60, completed: true },
      'should not exist',
    ],
  ])('recusa com 400: %s', async (_nome, body, trecho) => {
    const response = await post(body).expect(400);

    expect(JSON.stringify(response.body.message)).toContain(trecho);
    expect(create).not.toHaveBeenCalled();
  });
});
