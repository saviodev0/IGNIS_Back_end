import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AiMetricsService } from './ai-metrics.service';
import { MetricsGuard } from './metrics.guard';

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 90;

export function parseDays(raw?: string): number {
  if (raw === undefined || raw === '') return DEFAULT_DAYS;

  const days = Number(raw);

  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new BadRequestException(`days deve ser um número inteiro de 1 a ${MAX_DAYS}.`);
  }

  return days;
}

@Controller('metrics')
@UseGuards(MetricsGuard)
export class AiMetricsController {
  constructor(private readonly metrics: AiMetricsService) {}

  // Resumo para a equipe: tempos, taxa de erro e respostas sem fonte (padrão: últimos 7 dias)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('ai')
  summary(@Query('days') days?: string) {
    return this.metrics.summary(parseDays(days));
  }
}
