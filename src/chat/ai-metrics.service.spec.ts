jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => () => undefined,
  SchemaFactory: { createForClass: () => ({ index: () => undefined }) },
}));

import { BadRequestException } from '@nestjs/common';

import { AiMetricsController, parseDays } from './ai-metrics.controller';
import { AiMetricsService } from './ai-metrics.service';

const record = {
  model: 'm',
  fallback: false,
  firstTokenMs: 300,
  totalMs: 1500,
  error: null,
  cancelled: false,
  usedSources: true,
  sourceCount: 1,
  hasFiles: true,
  promptTokens: 10,
  completionTokens: 5,
};

describe('AiMetricsService', () => {
  it('record grava exatamente os números e rótulos recebidos', async () => {
    const create = jest.fn().mockResolvedValue({});
    await new AiMetricsService({ create } as never).record(record);
    expect(create).toHaveBeenCalledWith(record);
  });

  it('record nunca lança: se o banco falhar, o chat segue', async () => {
    const create = jest.fn().mockRejectedValue(new Error('mongo caiu'));
    await expect(new AiMetricsService({ create } as never).record(record)).resolves.toBeUndefined();
  });

  it('summary busca só o período pedido e calcula o resumo', async () => {
    const lean = jest.fn().mockResolvedValue([{ ...record }, { ...record, error: 'http_503' }]);
    const query: any = { select: jest.fn(() => query), limit: jest.fn(() => query), lean };
    const find = jest.fn(() => query);

    const before = Date.now();
    const summary = await new AiMetricsService({ find } as never).summary(7);

    const after = Date.now();

    // O limite do período é "agora - 7 dias", com "agora" lido entre `before` e `after`
    const { createdAt } = (find.mock.calls as any)[0][0];
    expect(createdAt.$gte.getTime()).toBeGreaterThanOrEqual(before - 7 * 86_400_000);
    expect(createdAt.$gte.getTime()).toBeLessThanOrEqual(after - 7 * 86_400_000);
    expect(summary.answers).toBe(2);
    expect(summary.errorRatePercent).toBe(50);
  });
});

describe('parseDays e controller', () => {
  it('padrão de 7 dias; aceita 1 a 90', () => {
    expect(parseDays()).toBe(7);
    expect(parseDays('')).toBe(7);
    expect(parseDays('1')).toBe(1);
    expect(parseDays('30')).toBe(30);
    expect(parseDays('90')).toBe(90);
  });

  it.each(['0', '91', '-3', 'abc', '2.5', '7; drop'])('rejeita "%s"', (value) => {
    expect(() => parseDays(value)).toThrow(BadRequestException);
  });

  it('o endpoint devolve o resumo dos últimos 7 dias por padrão', async () => {
    const summary = jest.fn().mockResolvedValue({ answers: 0 });
    const controller = new AiMetricsController({ summary } as never);

    await controller.summary();
    await controller.summary('30');

    expect(summary).toHaveBeenNthCalledWith(1, 7);
    expect(summary).toHaveBeenNthCalledWith(2, 30);
  });
});
