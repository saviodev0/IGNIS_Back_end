jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../auth/guards/auth.guard';
import { StudyCyclesController } from './study-cycles.controller';
import { StudyCyclesService } from './study-cycles.service';

describe('POST /study-cycles/:id/complete (validação do id)', () => {
  let app: INestApplication;
  const complete = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StudyCyclesController],
      providers: [{ provide: StudyCyclesService, useValue: { complete } }],
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
  beforeEach(() => complete.mockReset().mockResolvedValue({ id: 7 }));

  const post = (id: string) =>
    request(app.getHttpServer()).post(`/study-cycles/${id}/complete`);

  it('converte o id para número e conclui o ciclo do aluno', async () => {
    await post('7').expect(201);
    expect(complete).toHaveBeenCalledWith(7, 'aluno-1');
  });

  it.each(['abc', '7abc', '1.5', 'null'])(
    'recusa com 400 o id "%s" sem chamar o serviço',
    async (id) => {
      const response = await post(id).expect(400);

      expect(JSON.stringify(response.body.message)).toContain('numeric string');
      expect(complete).not.toHaveBeenCalled();
    },
  );
});
