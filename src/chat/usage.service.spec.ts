jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => () => undefined,
  SchemaFactory: { createForClass: () => ({ index: () => undefined }) },
}));

import { HttpException } from '@nestjs/common';

import { UsageService } from './usage.service';
import { dayKey } from './usage';

const build = (limit: string | undefined, row: any = null) => {
  const updateOne = jest.fn().mockResolvedValue({});
  const findOne = jest.fn().mockReturnValue({ lean: () => Promise.resolve(row) });
  const config = { get: jest.fn().mockReturnValue(limit) };

  return { service: new UsageService({ updateOne, findOne } as any, config as any), updateOne, findOne };
};

describe('UsageService', () => {
  it('record soma ao dia de hoje do aluno, com upsert', async () => {
    const { service, updateOne } = build('1000');

    await service.record('u1', { promptTokens: 100.4, completionTokens: 20 });

    const [filter, update, options] = updateOne.mock.calls[0];
    expect(filter).toEqual({ userId: 'u1', day: dayKey() });
    expect(update.$inc).toEqual({ promptTokens: 100, completionTokens: 20, requests: 1 });
    expect(options).toEqual({ upsert: true });
  });

  it('today informa consumo, limite e restante', async () => {
    const { service } = build('1000', { promptTokens: 300, completionTokens: 100, requests: 4 });

    await expect(service.today('u1')).resolves.toMatchObject({
      used: 400,
      limit: 1000,
      remaining: 600,
      requests: 4,
    });
  });

  it('today sem registros zera tudo', async () => {
    const { service } = build('1000');

    await expect(service.today('u1')).resolves.toMatchObject({ used: 0, remaining: 1000, requests: 0 });
  });

  it('assertWithinLimit deixa passar abaixo do limite', async () => {
    const { service } = build('1000', { promptTokens: 500, completionTokens: 100 });

    await expect(service.assertWithinLimit('u1')).resolves.toBeUndefined();
  });

  it('assertWithinLimit responde 429 com o horário de renovação ao exceder', async () => {
    const { service } = build('1000', { promptTokens: 900, completionTokens: 100 });

    const error: HttpException = await service.assertWithinLimit('u1').then(
      () => {
        throw new Error('deveria falhar');
      },
      (e) => e,
    );

    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ message: expect.stringContaining('meia-noite'), resetsAt: expect.any(String) });
  });

  it('limite 0 desliga a cota e nem consulta o banco', async () => {
    const { service, findOne } = build('0', { promptTokens: 9e9, completionTokens: 0 });

    await expect(service.assertWithinLimit('u1')).resolves.toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
    await expect(service.today('u1')).resolves.toMatchObject({ limit: null, remaining: null });
  });
});
