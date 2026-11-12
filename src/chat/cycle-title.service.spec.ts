jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => () => undefined,
  SchemaFactory: { createForClass: () => ({ index: () => undefined }) },
}));

import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { CycleTitleService } from './cycle-title.service';

const chatId = new Types.ObjectId();

const build = (opts: { chat?: any; files?: any[]; questions?: any[]; llm?: string } = {}) => {
  const chat = 'chat' in opts ? opts.chat : { _id: chatId, title: 'Biologia celular', summary: '' };
  const findOne = jest.fn().mockImplementation(() => {
    const result: any = Promise.resolve(chat);
    result.sort = () => Promise.resolve(chat);
    return result;
  });
  const files = { find: () => ({ sort: () => ({ select: () => ({ lean: () => Promise.resolve(opts.files ?? [{ name: 'Bio.pdf' }]) }) }) }) };
  const messages = {
    find: () => ({
      sort: () => ({ limit: () => ({ select: () => ({ lean: () => Promise.resolve(opts.questions ?? [{ content: 'O que é mitocôndria?' }]) }) }) }),
    }),
  };
  const complete = jest.fn().mockResolvedValue(opts.llm ?? 'Revisar mitocôndria');
  const usage = { assertWithinLimit: jest.fn().mockResolvedValue(undefined), record: jest.fn().mockResolvedValue(undefined) };
  const service = new CycleTitleService({ findOne } as any, files as any, messages as any, { complete } as any, usage as any);

  return { service, complete, findOne, usage };
};

describe('CycleTitleService.suggest', () => {
  it('sugere um título limpo a partir da conversa informada', async () => {
    const { service, complete, findOne } = build({ llm: '"Revisar mitocôndria."' });

    await expect(service.suggest('u', chatId.toString())).resolves.toEqual({
      title: 'Revisar mitocôndria',
      chatId: chatId.toString(),
    });
    expect(findOne).toHaveBeenCalledWith({ _id: chatId.toString(), userId: 'u' });

    const [messages] = complete.mock.calls[0];
    expect(messages[1].content).toContain('Conversa: Biologia celular');
    expect(messages[1].content).toContain('Arquivos: Bio.pdf');
    expect(messages[1].content).toContain('O que é mitocôndria?');
  });

  it('sem chatId usa a conversa mais recente do aluno', async () => {
    const { service, findOne } = build();

    await service.suggest('u');

    expect(findOne).toHaveBeenCalledWith({ userId: 'u' });
  });

  it('chat de outro aluno, id inválido ou aluno sem conversas devolvem 404', async () => {
    await expect(build({ chat: null }).service.suggest('u', chatId.toString())).rejects.toBeInstanceOf(NotFoundException);
    await expect(build().service.suggest('u', 'invalido')).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ chat: null }).service.suggest('u')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('conversa vazia (sem arquivo nem pergunta) devolve 400 e não chama a IA', async () => {
    const { service, complete } = build({
      chat: { _id: chatId, title: 'Novo chat', summary: '' },
      files: [],
      questions: [],
    });

    await expect(service.suggest('u', chatId.toString())).rejects.toBeInstanceOf(BadRequestException);
    expect(complete).not.toHaveBeenCalled();
  });

  it('resposta vazia da IA vira 502', async () => {
    const { service } = build({ llm: '   ' });

    await expect(service.suggest('u', chatId.toString())).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('respeita a cota diária antes de chamar a IA e registra os tokens gastos', async () => {
    const limited = build();
    limited.usage.assertWithinLimit.mockRejectedValue(new Error('cota'));

    await expect(limited.service.suggest('u', chatId.toString())).rejects.toThrow('cota');
    expect(limited.complete).not.toHaveBeenCalled();

    const ok = build();
    await ok.service.suggest('u', chatId.toString());
    ok.complete.mock.calls[0][2]({ promptTokens: 10, completionTokens: 5 });
    expect(ok.usage.record).toHaveBeenCalledWith('u', { promptTokens: 10, completionTokens: 5 });
  });
});
