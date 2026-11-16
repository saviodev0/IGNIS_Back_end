jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => () => undefined,
  SchemaFactory: { createForClass: () => ({ index: () => undefined }) },
}));
jest.mock('./file-text.service', () => ({ FileTextService: class {} }));
jest.mock('./embedding.service', () => ({ EmbeddingService: class {} }));
jest.mock('./groq.service', () => ({ GroqService: class {} }));
jest.mock('./student-context.service', () => ({ StudentContextService: class {}, formatMinutes: (m: number) => `${m}min` }));
jest.mock('./direct-answer.service', () => ({ DirectAnswerService: class {} }));
jest.mock('../goals/goals.service', () => ({ GoalsService: class {} }));

import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

type Row = { _id: Types.ObjectId; chatId: Types.ObjectId; role: 'user' | 'assistant'; content: string; direct?: boolean; feedback?: string };

const CHAT = new Types.ObjectId();

/** Coleção de mensagens em memória, com o mínimo do Mongoose que o `sendMessage` usa. */
function fakeMessages(rows: Row[]) {
  let seq = 0;
  const create = jest.fn(async (doc: any) => {
    const row = { _id: new Types.ObjectId(), ...doc, order: ++seq + 1000 };
    rows.push(row);
    return { ...row, deleteOne: async () => void rows.splice(rows.indexOf(row), 1) };
  });
  const find = jest.fn((filter: any) => {
    let result = rows.filter((r) => String(r.chatId) === String(filter.chatId) && !(filter._id?.$nin ?? []).some((id: any) => String(id) === String(r._id)));
    const chain: any = {
      sort: () => ((result = [...result].reverse()), chain),
      limit: (n: number) => ((result = result.slice(0, n)), chain),
      select: () => chain,
      lean: async () => result,
    };
    return chain;
  });
  const deleteMany = jest.fn(async (filter: any) => {
    const ids = (filter._id.$in as Types.ObjectId[]).map(String);
    for (let i = rows.length - 1; i >= 0; i--) if (ids.includes(String(rows[i]._id))) rows.splice(i, 1);
  });

  return { create, find, deleteMany, countDocuments: jest.fn(async () => 0) };
}

function setup(rows: Row[], answerPieces: string[] | Error = ['Nova ', 'resposta']) {
  const messages = fakeMessages(rows);
  const sent: any[] = [];
  const goalsCreate = jest.fn();
  const chat = { _id: CHAT, title: 'Chat', summary: '', studyMinutes: 0, save: jest.fn() };

  const self: any = {
    messages,
    goals: { create: goalsCreate },
    logger: { warn: jest.fn() },
    getOwned: jest.fn(async () => chat),
    intentRouter: {
      detectStudyLog: (c: string) => (/estudei/i.test(c) ? 90 : null),
      detect: (c: string) => (/quantas horas/i.test(c) ? { week: true } : null),
      wantsStudyPlan: () => false,
    },
    directAnswer: { answer: jest.fn(async () => 'dados do banco') },
    usage: { assertWithinLimit: jest.fn() },
    studentContext: { build: jest.fn(async () => '') },
    relevantChunks: jest.fn(async () => []),
    files: { exists: jest.fn(async () => null) },
    aiMetrics: { record: jest.fn() },
    trackUsage: () => () => undefined,
    summarizeIfNeeded: jest.fn(async () => undefined),
    otherChatsMemory: jest.fn(async () => null),
    createGoalFromChat: jest.fn(),
    groq: {
      stream: jest.fn(async function* (llm: any[]) {
        sent.push(llm);
        if (answerPieces instanceof Error) throw answerPieces;
        for (const piece of answerPieces) yield piece;
      }),
    },
  };
  self.lastAiExchange = (ChatService.prototype as any).lastAiExchange.bind(self);

  const run = async (content: string, options?: { replaceLast?: boolean }) => {
    const events: any[] = [];
    for await (const event of (ChatService.prototype as any).sendMessage.call(self, 'aluno-1', CHAT.toString(), content, undefined, options)) events.push(event);
    return events;
  };

  return { run, rows, sent, messages, self };
}

const row = (role: 'user' | 'assistant', content: string, extra: Partial<Row> = {}): Row => ({ _id: new Types.ObjectId(), chatId: CHAT, role, content, ...extra });

const history = () => [row('user', 'pergunta 1'), row('assistant', 'resposta 1'), row('user', 'pergunta 2'), row('assistant', 'resposta 2', { feedback: 'down' })];

describe('sendMessage com replaceLast (regenerar / editar a última pergunta)', () => {
  it('troca a última pergunta e a última resposta pelas novas, sem duplicar, e preserva o resto', async () => {
    const { run, rows } = setup(history());

    await run('pergunta 2 corrigida', { replaceLast: true });

    expect(rows.map((r) => [r.role, r.content])).toEqual([
      ['user', 'pergunta 1'],
      ['assistant', 'resposta 1'],
      ['user', 'pergunta 2 corrigida'],
      ['assistant', 'Nova resposta'],
    ]);
  });

  it('regenerar (mesma pergunta) também troca só a última resposta, e a avaliação antiga some junto', async () => {
    const { run, rows } = setup(history());

    await run('pergunta 2', { replaceLast: true });

    expect(rows).toHaveLength(4);
    expect(rows.at(-1)).toMatchObject({ role: 'assistant', content: 'Nova resposta' });
    expect(rows.some((r) => r.feedback)).toBe(false);
  });

  it('a IA não recebe a pergunta e a resposta antigas como contexto', async () => {
    const { run, sent } = setup(history());

    await run('pergunta 2 corrigida', { replaceLast: true });

    const texts = sent[0].map((m: any) => m.content);
    expect(texts).toContain('pergunta 1');
    expect(texts).toContain('resposta 1');
    expect(texts).not.toContain('pergunta 2');
    expect(texts).not.toContain('resposta 2');
    expect(texts.filter((t: string) => t === 'pergunta 2 corrigida')).toHaveLength(1);
  });

  it('sem replaceLast o comportamento é o de sempre: acrescenta e a IA vê o histórico inteiro', async () => {
    const { run, rows, sent } = setup(history());

    await run('pergunta 3');

    expect(rows).toHaveLength(6);
    expect(sent[0].map((m: any) => m.content)).toContain('resposta 2');
  });

  it('se a IA falhar, o par antigo continua no histórico e nada novo fica', async () => {
    const { run, rows } = setup(history(), new Error('IA fora do ar'));

    await expect(run('pergunta 2 corrigida', { replaceLast: true })).rejects.toThrow('IA fora do ar');

    expect(rows.map((r) => r.content)).toEqual(['pergunta 1', 'resposta 1', 'pergunta 2', 'resposta 2']);
    expect(rows.find((r) => r.content === 'resposta 2')?.feedback).toBe('down');
  });

  it('se não chegar nenhum texto, o par antigo também continua', async () => {
    const { run, rows } = setup(history(), []);

    await run('pergunta 2 corrigida', { replaceLast: true });

    expect(rows.map((r) => r.content)).toEqual(['pergunta 1', 'resposta 1', 'pergunta 2', 'resposta 2']);
  });

  it('recusa (400) e não apaga nada quando a última resposta é direta (criar meta, registrar estudo)', async () => {
    const rows = [row('user', 'estudei 2h', { direct: true }), row('assistant', 'Registrei 2h', { direct: true })];
    const { run, messages } = setup(rows);

    await expect(run('outra coisa', { replaceLast: true })).rejects.toBeInstanceOf(BadRequestException);

    expect(rows).toHaveLength(2);
    expect(messages.deleteMany).not.toHaveBeenCalled();
  });

  it('recusa (400) quando não há resposta da IA para refazer (chat vazio ou só pergunta)', async () => {
    await expect(setup([]).run('oi', { replaceLast: true })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup([row('user', 'só pergunta')]).run('oi', { replaceLast: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no modo de troca, "criar meta" / "estudei 2h" vão para a IA e não executam o atalho', async () => {
    const { run, rows, self } = setup(history());

    await run('Criar meta semanal de 10h', { replaceLast: true });

    expect(self.createGoalFromChat).not.toHaveBeenCalled();
    expect(self.directAnswer.answer).not.toHaveBeenCalled();
    expect(rows.at(-1)).toMatchObject({ role: 'assistant', content: 'Nova resposta' });
    expect(rows.at(-1)?.direct).toBeUndefined();
  });

  it('sem replaceLast esses mesmos textos continuam usando os atalhos (efeito próprio, sem IA)', async () => {
    const { run, self, rows } = setup(history());

    await run('Estudei 2h');

    expect(self.groq.stream).not.toHaveBeenCalled();
    expect(rows.at(-1)).toMatchObject({ role: 'assistant', direct: true });
  });

  it('"estudei 2h" no modo de troca vai para a IA e não soma tempo de estudo', async () => {
    const { run, self } = setup(history());

    await run('Estudei 2h', { replaceLast: true });

    expect(self.groq.stream).toHaveBeenCalledTimes(1);
    expect(self.getOwned.mock.results[0]).toBeDefined();
    expect((await self.getOwned()).studyMinutes).toBe(0);
  });

  it('só olha o próprio chat: o `getOwned` (dono) roda antes de qualquer leitura', async () => {
    const { run, self } = setup(history());
    self.getOwned.mockRejectedValueOnce(new Error('404'));

    await expect(run('x', { replaceLast: true })).rejects.toThrow('404');
    expect(self.messages.find).not.toHaveBeenCalled();
  });
});

describe('SendMessageDto.replaceLast', () => {
  const erros = async (body: object) => validate(plainToInstance(SendMessageDto, body));

  it('é opcional e booleano', async () => {
    expect(await erros({ content: 'oi' })).toHaveLength(0);
    expect(await erros({ content: 'oi', replaceLast: true })).toHaveLength(0);
    expect(await erros({ content: 'oi', replaceLast: false })).toHaveLength(0);
    expect((await erros({ content: 'oi', replaceLast: 'sim' })).length).toBeGreaterThan(0);
  });
});
