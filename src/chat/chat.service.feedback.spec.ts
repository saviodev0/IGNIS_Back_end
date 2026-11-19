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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';

import { ChatService } from './chat.service';
import { SetFeedbackDto } from './dto/set-feedback.dto';

const CHAT_ID = new Types.ObjectId();
const MESSAGE_ID = new Types.ObjectId().toString();

function setup(message: unknown = { role: 'assistant', direct: false }, owned: 'dono' | 'outro' = 'dono') {
  const updateOne = jest.fn().mockResolvedValue({});
  const query: any = { select: jest.fn(() => query), lean: jest.fn().mockResolvedValue(message) };
  const findOne = jest.fn(() => query);
  const getOwned = jest.fn(async () => {
    if (owned === 'outro') throw new NotFoundException('Chat não encontrado');
    return { _id: CHAT_ID };
  });

  const run = (feedback: 'up' | 'down' | null, messageId = MESSAGE_ID) =>
    (ChatService.prototype as any).setFeedback.call({ getOwned, messages: { findOne, updateOne } }, 'user-1', CHAT_ID.toString(), messageId, feedback);

  return { run, updateOne, findOne, getOwned };
}

describe('ChatService.setFeedback', () => {
  it('👍 e 👎 numa resposta da IA são gravados', async () => {
    const { run, updateOne } = setup();

    expect(await run('up')).toEqual({ id: MESSAGE_ID, feedback: 'up' });
    expect(updateOne).toHaveBeenLastCalledWith({ _id: MESSAGE_ID }, { $set: { feedback: 'up' } });

    expect(await run('down')).toEqual({ id: MESSAGE_ID, feedback: 'down' });
    expect(updateOne).toHaveBeenLastCalledWith({ _id: MESSAGE_ID }, { $set: { feedback: 'down' } });
  });

  it('null remove a avaliação', async () => {
    const { run, updateOne } = setup();

    expect(await run(null)).toEqual({ id: MESSAGE_ID, feedback: null });
    expect(updateOne).toHaveBeenCalledWith({ _id: MESSAGE_ID }, { $unset: { feedback: '' } });
  });

  it('só o dono do chat avalia: chat de outro aluno dá 404 e nada é gravado', async () => {
    const { run, updateOne, findOne } = setup(undefined, 'outro');

    await expect(run('up')).rejects.toBeInstanceOf(NotFoundException);
    expect(findOne).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('a mensagem precisa ser do próprio chat (busca por _id E chatId)', async () => {
    const { run, findOne, updateOne } = setup(null);

    await expect(run('up')).rejects.toBeInstanceOf(NotFoundException);
    expect(findOne).toHaveBeenCalledWith({ _id: MESSAGE_ID, chatId: CHAT_ID });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('id de mensagem inválido dá 404', async () => {
    const { run, findOne } = setup();

    await expect(run('up', 'nao-e-um-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('pergunta do aluno não pode ser avaliada', async () => {
    const { run, updateOne } = setup({ role: 'user', direct: false });

    await expect(run('up')).rejects.toBeInstanceOf(BadRequestException);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('resposta montada direto do banco (não é da IA) não pode ser avaliada', async () => {
    const { run, updateOne } = setup({ role: 'assistant', direct: true });

    await expect(run('down')).rejects.toBeInstanceOf(BadRequestException);
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe('ChatService.get (histórico)', () => {
  it('mostra a avaliação nas respostas da IA e null quando não há', async () => {
    const lean = jest.fn().mockResolvedValue([
      { _id: 'a', role: 'user', content: 'oi' },
      { _id: 'b', role: 'assistant', content: 'resposta', feedback: 'up' },
      { _id: 'c', role: 'assistant', content: 'outra' },
    ]);
    const chain: any = { sort: () => chain, select: () => chain, lean };
    const files: any = { find: () => ({ select: () => ({ lean: async () => [] }) }) };

    const history = await (ChatService.prototype as any).get.call(
      { getOwned: async () => ({ _id: CHAT_ID, title: 't', studyMinutes: 0 }), messages: { find: () => chain }, files },
      'user-1',
      CHAT_ID.toString(),
    );

    expect(history.messages.map((m: any) => m.feedback)).toEqual([undefined, 'up', null]);
  });
});

describe('SetFeedbackDto', () => {
  const erros = async (body: object) => validate(plainToInstance(SetFeedbackDto, body));

  it.each([['up'], ['down'], [null]])('aceita %s', async (valor) => {
    expect(await erros({ feedback: valor })).toHaveLength(0);
  });

  it.each([[{}], [{ feedback: 'UP' }], [{ feedback: 'sim' }], [{ feedback: 1 }], [{ feedback: true }], [{ feedback: '' }]])(
    'rejeita %j (inclusive campo ausente, para um engano não apagar a avaliação)',
    async (body) => {
      expect((await erros(body)).length).toBeGreaterThan(0);
    },
  );
});
