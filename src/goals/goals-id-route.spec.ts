jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../auth/guards/auth.guard';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

describe('GET e DELETE /goals/:id (validação do id)', () => {
  let app: INestApplication;
  const findOne = jest.fn();
  const remove = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GoalsController],
      providers: [{ provide: GoalsService, useValue: { findOne, remove } }],
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
  beforeEach(() => {
    findOne.mockReset().mockResolvedValue({ id: 7 });
    remove.mockReset().mockResolvedValue({ message: 'ok' });
  });

  const server = () => request(app.getHttpServer());

  it('GET converte o id para número e busca a meta do aluno', async () => {
    await server().get('/goals/7').expect(200);
    expect(findOne).toHaveBeenCalledWith('aluno-1', 7);
  });

  it('DELETE converte o id para número e apaga a meta do aluno', async () => {
    await server().delete('/goals/7').expect(200);
    expect(remove).toHaveBeenCalledWith('aluno-1', 7);
  });

  it.each(['abc', '7abc', '1.5', 'null'])(
    'recusa com 400 o id "%s" sem chamar o serviço',
    async (id) => {
      for (const response of [
        await server().get(`/goals/${id}`).expect(400),
        await server().delete(`/goals/${id}`).expect(400),
      ]) {
        expect(JSON.stringify(response.body.message)).toContain(
          'numeric string',
        );
      }

      expect(findOne).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );
});
