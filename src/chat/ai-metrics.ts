import { HttpException } from '@nestjs/common';

/**
 * O que é guardado por resposta da IA. Só números e rótulos: nunca o texto da pergunta, da resposta
 * nem de arquivos, e nenhum dado que identifique o aluno.
 */
export interface AiMetricRecord {
  model: string;
  /** Respondeu o provedor reserva (o principal falhou). */
  fallback: boolean;
  /** Milissegundos até o primeiro texto; null se nada chegou. */
  firstTokenMs: number | null;
  totalMs: number;
  /** Rótulo curto do erro (ex.: `http_503`, `rede`), sem a mensagem. */
  error: string | null;
  /** O aluno cancelou a resposta: não conta como erro nem entra nas médias de tempo. */
  cancelled: boolean;
  usedSources: boolean;
  sourceCount: number;
  /** O chat tinha arquivos enviados (sem isso, "sem fonte" é esperado). */
  hasFiles: boolean;
  promptTokens: number;
  completionTokens: number;
}

/** Mede os tempos de uma resposta em streaming. */
export class MetricTimer {
  private readonly startedAt: number;
  private firstAt: number | null = null;

  constructor(private readonly now: () => number = Date.now) {
    this.startedAt = now();
  }

  /** Chame a cada pedaço de texto; só o primeiro conta. */
  firstToken() {
    if (this.firstAt === null) this.firstAt = this.now();
  }

  get firstTokenMs(): number | null {
    return this.firstAt === null ? null : this.firstAt - this.startedAt;
  }

  get totalMs(): number {
    return this.now() - this.startedAt;
  }
}

/** Rótulo curto e sem conteúdo para um erro da IA. */
export function errorLabel(error: unknown): string {
  if (error instanceof HttpException) return `http_${error.getStatus()}`;
  if (error instanceof TypeError) return 'rede';
  if ((error as { name?: string })?.name === 'AbortError') return 'tempo_esgotado';
  return 'erro_interno';
}

export interface AiMetricRow extends AiMetricRecord {
  createdAt?: Date;
}

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const percent = (part: number, total: number) => (total ? round((part / total) * 100, 1) : null);

const mean = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

/** Percentil pelo método do posto mais próximo (p95 = o valor que 95% das respostas não passaram). */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

const timing = (values: number[]) => ({ media: mean(values), p95: percentile(values, 95) });

/**
 * Resumo para a equipe. Respostas canceladas pelo aluno ficam de fora das taxas e dos tempos.
 * Os tempos consideram só respostas bem-sucedidas, para uma falha rápida não "melhorar" a média.
 */
export function summarizeMetrics(rows: AiMetricRow[], days: number, now: Date = new Date()) {
  const cancelled = rows.filter((row) => row.cancelled).length;
  const answered = rows.filter((row) => !row.cancelled);
  const failed = answered.filter((row) => row.error);
  const ok = answered.filter((row) => !row.error);
  const okWithFiles = ok.filter((row) => row.hasFiles);

  const errorsByType: Record<string, number> = {};
  for (const row of failed) errorsByType[row.error!] = (errorsByType[row.error!] ?? 0) + 1;

  const models = [...new Set(answered.map((row) => row.model || 'desconhecido'))].sort();

  return {
    periodDays: days,
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
    answers: answered.length,
    cancelled,
    errors: failed.length,
    errorRatePercent: percent(failed.length, answered.length),
    errorsByType,
    firstTokenMs: timing(ok.flatMap((row) => (row.firstTokenMs === null ? [] : [row.firstTokenMs]))),
    totalMs: timing(ok.map((row) => row.totalMs)),
    withoutSourcePercent: percent(ok.filter((row) => !row.usedSources).length, ok.length),
    answersInChatsWithFiles: okWithFiles.length,
    withoutSourceInChatsWithFilesPercent: percent(okWithFiles.filter((row) => !row.usedSources).length, okWithFiles.length),
    fallbackPercent: percent(answered.filter((row) => row.fallback).length, answered.length),
    avgTokensPerAnswer: mean(ok.map((row) => row.promptTokens + row.completionTokens)),
    byModel: models.map((model) => {
      const mine = answered.filter((row) => (row.model || 'desconhecido') === model);
      const mineOk = mine.filter((row) => !row.error);

      return {
        model,
        answers: mine.length,
        errors: mine.length - mineOk.length,
        errorRatePercent: percent(mine.length - mineOk.length, mine.length),
        firstTokenMs: mean(mineOk.flatMap((row) => (row.firstTokenMs === null ? [] : [row.firstTokenMs]))),
        totalMs: mean(mineOk.map((row) => row.totalMs)),
      };
    }),
  };
}

/** 👍/👎 do período: quantas respostas da IA existem e quantas o aluno avaliou. */
export function summarizeFeedback({ answers, up, down }: { answers: number; up: number; down: number }) {
  const rated = up + down;

  return {
    answers,
    rated,
    up,
    down,
    ratedPercent: percent(rated, answers),
    downPercentOfRated: percent(down, rated),
  };
}
