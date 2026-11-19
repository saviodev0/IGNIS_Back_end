jest.mock('./prisma/prisma.service', () => ({ PrismaService: class {} }));
// Os controllers só precisam do nome das classes; os serviços de chat puxam o Mongo/IA e são trocados por falsos abaixo.
jest.mock('./chat/chat.service', () => ({ ChatService: class {} }));
jest.mock('./chat/material.service', () => ({ MaterialService: class {} }));
jest.mock('./chat/cycle-title.service', () => ({
  CycleTitleService: class {},
}));
jest.mock('./chat/usage.service', () => ({ UsageService: class {} }));
jest.mock('./chat/privacy.service', () => ({ PrivacyService: class {} }));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { CycleTitleService } from './chat/cycle-title.service';
import { MaterialService } from './chat/material.service';
import { PrivacyService } from './chat/privacy.service';
import { UsageService } from './chat/usage.service';
import { StudyCyclesController } from './study-cycles/study-cycles.controller';
import { StudyCyclesService } from './study-cycles/study-cycles.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

/**
 * Rotas que recebem dados inválidos ou chamadas sem login devem responder erro 4xx claro
 * (nunca 500) e sem chegar ao serviço, ou seja, sem mexer no banco.
 * Sobe os controllers de verdade, com o AuthGuard real e o mesmo ValidationPipe do main.ts.
 */
describe('Respostas de erro da API', () => {
  let app: INestApplication;
  const chamadas = jest.fn();

  // Serviço falso: qualquer método registra a chamada em `chamadas` e devolve um objeto vazio.
  const servico = () =>
    new Proxy(
      {},
      {
        get: (_alvo, nome) =>
          typeof nome === 'string' && nome !== 'then'
            ? (...args: unknown[]) => {
                chamadas(nome, ...args);
                return Promise.resolve({});
              }
            : undefined,
      },
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AuthController,
        UsersController,
        StudyCyclesController,
        ChatController,
      ],
      providers: [
        { provide: AuthService, useValue: servico() },
        { provide: UsersService, useValue: servico() },
        { provide: StudyCyclesService, useValue: servico() },
        { provide: ChatService, useValue: servico() },
        { provide: MaterialService, useValue: servico() },
        { provide: CycleTitleService, useValue: servico() },
        { provide: UsageService, useValue: servico() },
        { provide: PrivacyService, useValue: servico() },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: (token: string) =>
              token === 'token-valido'
                ? Promise.resolve({ sub: 'aluno-1', email: 'a@b.com' })
                : Promise.reject(new Error('jwt malformed')),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
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
  beforeEach(() => chamadas.mockClear());

  const logado = (metodo: 'get' | 'post' | 'patch' | 'delete', rota: string) =>
    request(app.getHttpServer())
      [metodo](rota)
      .set('Cookie', 'ignis_token=token-valido');

  type Caso = [
    descricao: string,
    metodo: 'get' | 'post' | 'patch' | 'delete',
    rota: string,
    corpo: object | undefined,
    trecho: string,
  ];

  const cadastroValido = {
    name: 'Ana',
    age: 20,
    email: 'ana@exemplo.com',
    phone: '11999999999',
    password: 'senha1234',
  };

  describe('dados inválidos respondem 400 com a mensagem do campo', () => {
    const casos: Caso[] = [
      // cadastro
      [
        'cadastro sem nenhum campo',
        'post',
        '/auth/register',
        {},
        'name should not be empty',
      ],
      [
        'cadastro com e-mail inválido',
        'post',
        '/auth/register',
        { ...cadastroValido, email: 'naoemail' },
        'email must be an email',
      ],
      [
        'cadastro com senha curta',
        'post',
        '/auth/register',
        { ...cadastroValido, password: '123' },
        'password must be longer',
      ],
      [
        'cadastro com idade negativa',
        'post',
        '/auth/register',
        { ...cadastroValido, age: -1 },
        'age must not be less than 1',
      ],
      [
        'cadastro com campo desconhecido',
        'post',
        '/auth/register',
        { ...cadastroValido, admin: true },
        'property admin should not exist',
      ],
      [
        'criar usuário sem campos',
        'post',
        '/users',
        {},
        'name should not be empty',
      ],
      // perfil e ranking
      [
        'perfil com idade negativa',
        'patch',
        '/users/me',
        { age: -5 },
        'age must not be less than 1',
      ],
      [
        'perfil com campo desconhecido',
        'patch',
        '/users/me',
        { foo: 'bar' },
        'property foo should not exist',
      ],
      [
        'ranking com página zero',
        'get',
        '/users/ranking?page=0',
        undefined,
        'page must not be less than 1',
      ],
      [
        'ranking com limite acima de 100',
        'get',
        '/users/ranking?limit=1000',
        undefined,
        'limit must not be greater than 100',
      ],
      [
        'ranking com página que não é número',
        'get',
        '/users/ranking?page=abc',
        undefined,
        'page must be an integer number',
      ],
      // ciclos de estudo
      [
        'histórico com página zero',
        'get',
        '/study-cycles/history?page=0',
        undefined,
        'page must not be less than 1',
      ],
      [
        'histórico com data inválida',
        'get',
        '/study-cycles/history?startDate=lixo',
        undefined,
        'startDate must be a valid ISO 8601 date string',
      ],
      [
        'pausar ciclo com id que não é número',
        'post',
        '/study-cycles/abc/pause',
        {},
        'numeric string is expected',
      ],
      // chats
      [
        'criar chat com campo desconhecido',
        'post',
        '/chats',
        { foo: 1 },
        'property foo should not exist',
      ],
      [
        'criar chat com título longo demais',
        'post',
        '/chats',
        { title: 'x'.repeat(81) },
        'title must be shorter',
      ],
      [
        'renomear chat com título vazio',
        'patch',
        '/chats/abc',
        { title: '' },
        'title must be longer',
      ],
      [
        'buscar com 1 letra',
        'get',
        '/chats/search?q=a',
        undefined,
        'Digite pelo menos 2 caracteres',
      ],
      [
        'buscar sem texto',
        'get',
        '/chats/search',
        undefined,
        'Digite pelo menos 2 caracteres',
      ],
      [
        'enviar mensagem vazia',
        'post',
        '/chats/abc/messages',
        { content: '' },
        'content should not be empty',
      ],
      [
        'enviar mensagem longa demais',
        'post',
        '/chats/abc/messages',
        { content: 'x'.repeat(4001) },
        'content must be shorter',
      ],
      [
        'enviar mensagem com replaceLast que não é booleano',
        'post',
        '/chats/abc/messages',
        { content: 'oi', replaceLast: 'sim' },
        'replaceLast must be a boolean',
      ],
      [
        'avaliar resposta com valor desconhecido',
        'patch',
        '/chats/abc/messages/m1/feedback',
        { feedback: 'meh' },
        'feedback deve ser',
      ],
      [
        'avaliar resposta sem o campo',
        'patch',
        '/chats/abc/messages/m1/feedback',
        {},
        'feedback deve ser',
      ],
      [
        'tempo de estudo negativo',
        'patch',
        '/chats/abc/study-time',
        { minutes: -1 },
        'minutes must not be less than 1',
      ],
      [
        'tempo de estudo acima de um dia',
        'patch',
        '/chats/abc/study-time',
        { minutes: 1441 },
        'minutes must not be greater than 1440',
      ],
      [
        'material de tipo desconhecido',
        'post',
        '/chats/abc/material',
        { type: 'resumao' },
        'type must be one of',
      ],
      [
        'material com arquivo que não é id',
        'post',
        '/chats/abc/material',
        { type: 'summary', fileId: '123' },
        'fileId must be a mongodb id',
      ],
      [
        'título de ciclo com chatId que não é texto',
        'post',
        '/chats/cycle-title',
        { chatId: 123 },
        'chatId must be a string',
      ],
    ];

    it.each(casos)('%s', async (_descricao, metodo, rota, corpo, trecho) => {
      const resposta = await logado(metodo, rota).send(corpo);

      expect(resposta.status).toBe(400);
      expect(JSON.stringify(resposta.body.message)).toContain(trecho);
      expect(resposta.body.statusCode).toBe(400);
      expect(chamadas).not.toHaveBeenCalled();
    });
  });

  describe('sem login ou com token inválido respondem 401', () => {
    const rotas: [string, 'get' | 'post' | 'patch' | 'delete', string][] = [
      ['quem sou eu', 'get', '/auth/me'],
      ['estatísticas', 'get', '/users/me/stats'],
      ['editar perfil', 'patch', '/users/me'],
      ['ciclo ativo', 'get', '/study-cycles/active'],
      ['iniciar ciclo', 'post', '/study-cycles/start'],
      ['listar chats', 'get', '/chats'],
      ['apagar todos os dados de IA', 'delete', '/chats'],
      ['buscar nas conversas', 'get', '/chats/search?q=celula'],
      ['enviar mensagem', 'post', '/chats/abc/messages'],
    ];

    it.each(rotas)('%s sem cookie', async (_nome, metodo, rota) => {
      const resposta = await request(app.getHttpServer())
        [metodo](rota)
        .send({});

      expect(resposta.status).toBe(401);
      expect(resposta.body.message).toBe('Token não informado');
      expect(chamadas).not.toHaveBeenCalled();
    });

    it.each(rotas)('%s com token inválido', async (_nome, metodo, rota) => {
      const resposta = await request(app.getHttpServer())
        [metodo](rota)
        .set('Cookie', 'ignis_token=falso')
        .send({});

      expect(resposta.status).toBe(401);
      expect(resposta.body.message).toBe('Token inválido ou expirado');
      expect(chamadas).not.toHaveBeenCalled();
    });
  });

  it('a validação vem antes do serviço mesmo com login válido, e uma rota válida chega ao serviço', async () => {
    await logado('patch', '/users/me').send({ age: -5 }).expect(400);
    expect(chamadas).not.toHaveBeenCalled();

    await logado('patch', '/users/me').send({ age: 21 }).expect(200);
    expect(chamadas).toHaveBeenCalledWith('update', 'aluno-1', { age: 21 });
  });

  it('rota que não existe responde 404', async () => {
    const resposta = await logado('get', '/nao-existe');

    expect(resposta.status).toBe(404);
    expect(chamadas).not.toHaveBeenCalled();
  });
});
