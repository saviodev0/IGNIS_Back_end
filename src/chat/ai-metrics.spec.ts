import { HttpException, ServiceUnavailableException } from '@nestjs/common';

import { AiMetricRow, errorLabel, MetricTimer, percentile, summarizeMetrics } from './ai-metrics';

const row = (over: Partial<AiMetricRow> = {}): AiMetricRow => ({
  model: 'modelo-a',
  fallback: false,
  firstTokenMs: 400,
  totalMs: 2000,
  error: null,
  cancelled: false,
  usedSources: true,
  sourceCount: 2,
  hasFiles: true,
  promptTokens: 900,
  completionTokens: 100,
  ...over,
});

const NOW = new Date('2026-11-16T12:00:00Z');

describe('summarizeMetrics', () => {
  it('sem respostas: tudo vazio e sem dividir por zero', () => {
    const summary = summarizeMetrics([], 7, NOW);

    expect(summary.answers).toBe(0);
    expect(summary.errorRatePercent).toBeNull();
    expect(summary.firstTokenMs).toEqual({ media: null, p95: null });
    expect(summary.totalMs).toEqual({ media: null, p95: null });
    expect(summary.withoutSourcePercent).toBeNull();
    expect(summary.byModel).toEqual([]);
  });

  it('informa o período', () => {
    const summary = summarizeMetrics([], 7, NOW);

    expect(summary.periodDays).toBe(7);
    expect(summary.to).toBe('2026-11-16T12:00:00.000Z');
    expect(summary.from).toBe('2026-11-09T12:00:00.000Z');
  });

  it('calcula médias e p95 dos tempos só das respostas bem-sucedidas', () => {
    const rows = [
      row({ firstTokenMs: 200, totalMs: 1000 }),
      row({ firstTokenMs: 400, totalMs: 2000 }),
      row({ firstTokenMs: 600, totalMs: 3000 }),
      row({ firstTokenMs: 10, totalMs: 10, error: 'http_503' }), // falha rápida não pode melhorar a média
    ];
    const summary = summarizeMetrics(rows, 7, NOW);

    expect(summary.firstTokenMs).toEqual({ media: 400, p95: 600 });
    expect(summary.totalMs).toEqual({ media: 2000, p95: 3000 });
  });

  it('taxa de erro e erros por tipo, sem contar as canceladas', () => {
    const rows = [
      row(),
      row(),
      row({ error: 'http_503' }),
      row({ error: 'http_503' }),
      row({ error: 'rede' }),
      row({ cancelled: true, error: 'http_500' }),
      row({ cancelled: true }),
    ];
    const summary = summarizeMetrics(rows, 7, NOW);

    expect(summary.answers).toBe(5);
    expect(summary.cancelled).toBe(2);
    expect(summary.errors).toBe(3);
    expect(summary.errorRatePercent).toBe(60);
    expect(summary.errorsByType).toEqual({ http_503: 2, rede: 1 });
  });

  it('% sem fonte, geral e só nos chats com arquivos', () => {
    const rows = [
      row({ usedSources: true, hasFiles: true }),
      row({ usedSources: false, hasFiles: true }), // tinha arquivo e a busca não achou nada
      row({ usedSources: false, hasFiles: false, sourceCount: 0 }), // chat sem arquivo: sem fonte é esperado
      row({ usedSources: false, hasFiles: false, sourceCount: 0 }),
    ];
    const summary = summarizeMetrics(rows, 7, NOW);

    expect(summary.withoutSourcePercent).toBe(75);
    expect(summary.answersInChatsWithFiles).toBe(2);
    expect(summary.withoutSourceInChatsWithFilesPercent).toBe(50);
  });

  it('chats sem nenhum arquivo: o % sem fonte com arquivos fica nulo', () => {
    const summary = summarizeMetrics([row({ hasFiles: false, usedSources: false })], 7, NOW);
    expect(summary.withoutSourceInChatsWithFilesPercent).toBeNull();
  });

  it('% de respostas que vieram do provedor reserva', () => {
    const summary = summarizeMetrics([row({ fallback: true }), row(), row(), row()], 7, NOW);
    expect(summary.fallbackPercent).toBe(25);
  });

  it('separa por modelo', () => {
    const rows = [
      row({ model: 'a', totalMs: 1000, firstTokenMs: 100 }),
      row({ model: 'a', totalMs: 3000, firstTokenMs: 300 }),
      row({ model: 'a', error: 'http_503' }),
      row({ model: 'b', totalMs: 500, firstTokenMs: 50 }),
      row({ model: '', error: 'rede' }), // falhou antes de saber o modelo
    ];
    const summary = summarizeMetrics(rows, 7, NOW);

    expect(summary.byModel).toEqual([
      { model: 'a', answers: 3, errors: 1, errorRatePercent: 33.3, firstTokenMs: 200, totalMs: 2000 },
      { model: 'b', answers: 1, errors: 0, errorRatePercent: 0, firstTokenMs: 50, totalMs: 500 },
      { model: 'desconhecido', answers: 1, errors: 1, errorRatePercent: 100, firstTokenMs: null, totalMs: null },
    ]);
  });

  it('média de tokens por resposta', () => {
    const summary = summarizeMetrics([row({ promptTokens: 1000, completionTokens: 200 }), row({ promptTokens: 400, completionTokens: 200 })], 7, NOW);
    expect(summary.avgTokensPerAnswer).toBe(900);
  });

  it('resposta que falhou antes do primeiro texto não entra no tempo até o primeiro texto', () => {
    const summary = summarizeMetrics([row({ firstTokenMs: null, error: null }), row({ firstTokenMs: 300 })], 7, NOW);
    expect(summary.firstTokenMs.media).toBe(300);
  });
});

describe('percentile', () => {
  it('posto mais próximo', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    expect(percentile(values, 95)).toBe(1900);
    expect(percentile(values, 50)).toBe(1000);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([], 95)).toBeNull();
  });
});

describe('MetricTimer', () => {
  it('mede o primeiro texto só na primeira chamada e o total até agora', () => {
    let clock = 1000;
    const timer = new MetricTimer(() => clock);

    expect(timer.firstTokenMs).toBeNull();
    clock = 1450;
    timer.firstToken();
    clock = 1800;
    timer.firstToken();
    clock = 3000;

    expect(timer.firstTokenMs).toBe(450);
    expect(timer.totalMs).toBe(2000);
  });
});

describe('errorLabel', () => {
  it('usa só rótulos curtos, nunca a mensagem do erro', () => {
    expect(errorLabel(new ServiceUnavailableException('texto da pergunta do aluno'))).toBe('http_503');
    expect(errorLabel(new HttpException('x', 429))).toBe('http_429');
    expect(errorLabel(new TypeError('fetch failed: segredo'))).toBe('rede');
    expect(errorLabel(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe('tempo_esgotado');
    expect(errorLabel(new Error('qualquer coisa com conteúdo'))).toBe('erro_interno');
    expect(errorLabel('texto solto')).toBe('erro_interno');
  });
});
