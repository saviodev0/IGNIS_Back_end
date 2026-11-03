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

import { ChatService } from './chat.service';

describe('ChatService.createGoalFromChat', () => {
  const run = (goals: unknown, command: any) =>
    (ChatService.prototype as any).createGoalFromChat.call({ goals, logger: { warn: jest.fn() } }, 'user-1', command);

  it('cria a meta e confirma tipo, valor e validade', async () => {
    const create = jest.fn().mockResolvedValue({ endDate: new Date(2026, 10, 8, 23, 59) });

    const answer: string = await run({ create }, { kind: 'create', type: 'WEEKLY', minutes: 600 });

    expect(create).toHaveBeenCalledWith('user-1', 'WEEKLY', 600);
    expect(answer).toContain('Meta semanal criada');
    expect(answer).toContain('por semana');
    expect(answer).toContain('08/11');
  });

  it('meta já existente: explica o motivo em português e não diz que criou', async () => {
    const create = jest.fn().mockRejectedValue(new BadRequestException('Você já possui uma meta daily ativa.'));

    const answer: string = await run({ create }, { kind: 'create', type: 'DAILY', minutes: 120 });

    expect(answer).toBe('Não criei a meta. Você já possui uma meta diária ativa.');
  });

  it('comando inválido nem chama o serviço', async () => {
    const create = jest.fn();

    const answer: string = await run({ create }, { kind: 'invalid', reason: 'O valor da meta precisa ser maior que zero.' });

    expect(create).not.toHaveBeenCalled();
    expect(answer).toBe('Não criei a meta. O valor da meta precisa ser maior que zero.');
  });

  it('erro inesperado vira mensagem genérica', async () => {
    const create = jest.fn().mockRejectedValue(new Error('banco caiu'));

    expect(await run({ create }, { kind: 'create', type: 'DAILY', minutes: 60 })).toContain('Tente de novo');
  });
});
