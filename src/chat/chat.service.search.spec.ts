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

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ChatService } from './chat.service';
import { SearchChatsDto } from './dto/search-chats.dto';

const query = (rows: unknown[]) => {
  const chain: any = { sort: jest.fn(() => chain), limit: jest.fn(() => chain), select: jest.fn(() => chain), lean: jest.fn().mockResolvedValue(rows) };
  return chain;
};

function setup({ titles = [], messages = [], info = [] }: { titles?: any[]; messages?: any[]; info?: any[] }) {
  const titleQuery = query(titles);
  const infoQuery = query(info);
  const chatsFind = jest.fn((filter: any) => (filter.$text ? titleQuery : infoQuery));
  const messageQuery = query(messages);
  const messagesFind = jest.fn(() => messageQuery);
  const search = (userId: string, q: string) =>
    (ChatService.prototype as any).search.call({ chats: { find: chatsFind }, messages: { find: messagesFind } }, userId, q);

  return { search, chatsFind, messagesFind, messageQuery, titleQuery };
}

describe('ChatService.search', () => {
  it('isolamento: as duas buscas filtram pelo dono e usam o índice de texto', async () => {
    const { search, chatsFind, messagesFind } = setup({});

    await search('aluno-1', 'mitocôndria');

    expect((chatsFind.mock.calls as any)[0][0]).toEqual({ userId: 'aluno-1', $text: { $search: 'mitocondria mitocondrias' } });
    expect((messagesFind.mock.calls as any)[0][0]).toEqual({ userId: 'aluno-1', $text: { $search: 'mitocondria mitocondrias' } });
  });

  it('só aspas e hífens não vira busca (nada é consultado)', async () => {
    const { search, chatsFind, messagesFind } = setup({});

    expect(await search('aluno-1', '"-"')).toEqual([]);
    expect(chatsFind).not.toHaveBeenCalled();
    expect(messagesFind).not.toHaveBeenCalled();
  });

  it('agrupa por chat, com trecho, título e no máximo 3 trechos por chat', async () => {
    const messages = [1, 2, 3, 4, 5].map((n) => ({ _id: `m${n}`, chatId: 'c1', role: 'assistant', content: `A mitocôndria número ${n}` }));
    const { search } = setup({ messages, info: [{ _id: 'c1', title: 'Biologia', updatedAt: new Date('2026-01-01') }] });

    const result = await search('aluno-1', 'Mitocondria');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ chatId: 'c1', title: 'Biologia', titleMatch: false });
    expect(result[0].matches).toHaveLength(3);
    expect(result[0].matches[0]).toEqual({ messageId: 'm1', role: 'assistant', snippet: 'A mitocôndria número 1' });
  });

  it('chat achado pelo título vem marcado e junta os trechos das mensagens dele', async () => {
    const { search } = setup({
      titles: [{ _id: 'c1', title: 'Mitocôndrias', updatedAt: new Date() }],
      messages: [{ _id: 'm1', chatId: 'c1', role: 'user', content: 'o que é mitocôndria?' }],
    });

    const [first] = await search('aluno-1', 'mitocondria');

    expect(first).toMatchObject({ chatId: 'c1', title: 'Mitocôndrias', titleMatch: true });
    expect(first.matches).toHaveLength(1);
  });

  it('limita a 20 chats', async () => {
    const messages = Array.from({ length: 50 }, (_, n) => ({ _id: `m${n}`, chatId: `c${n}`, role: 'user', content: 'célula' }));
    const info = Array.from({ length: 50 }, (_, n) => ({ _id: `c${n}`, title: `Chat ${n}`, updatedAt: new Date() }));
    const { search, titleQuery } = setup({ messages, info });

    const result = await search('aluno-1', 'celula');

    expect(result).toHaveLength(20);
    expect(titleQuery.limit).toHaveBeenCalledWith(20);
    expect(new Set(result.map((r: any) => r.chatId)).size).toBe(20);
  });

  it('ordena pela relevância do Mongo (textScore)', async () => {
    const { search, messageQuery } = setup({});

    await search('aluno-1', 'celula');

    expect(messageQuery.sort).toHaveBeenCalledWith({ score: { $meta: 'textScore' } });
  });
});

describe('SearchChatsDto', () => {
  const erros = async (body: object) => validate(plainToInstance(SearchChatsDto, body));

  it('aceita 2 caracteres ou mais (espaços nas pontas não contam)', async () => {
    expect(await erros({ q: 'ab' })).toHaveLength(0);
    expect((await erros({ q: ' a ' })).length).toBeGreaterThan(0);
    expect((await erros({ q: '   ' })).length).toBeGreaterThan(0);
  });

  it('rejeita ausente, vazio e longo demais', async () => {
    expect((await erros({})).length).toBeGreaterThan(0);
    expect((await erros({ q: '' })).length).toBeGreaterThan(0);
    expect((await erros({ q: 'a'.repeat(101) })).length).toBeGreaterThan(0);
  });
});
