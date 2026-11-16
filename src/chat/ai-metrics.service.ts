import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AiMetricRecord, summarizeMetrics } from './ai-metrics';
import { AiMetric } from './schemas/ai-metric.schema';

const MAX_ROWS = 50_000;

@Injectable()
export class AiMetricsService {
  private readonly logger = new Logger(AiMetricsService.name);

  constructor(@InjectModel(AiMetric.name) private readonly metrics: Model<AiMetric>) {}

  /** Guarda a métrica de uma resposta. Nunca lança: medir não pode atrapalhar o chat. */
  async record(record: AiMetricRecord): Promise<void> {
    try {
      await this.metrics.create(record);
    } catch (error: any) {
      this.logger.warn(`Falha ao registrar métrica da IA: ${error.message}`);
    }
  }

  async summary(days: number) {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const rows = await this.metrics
      .find({ createdAt: { $gte: since } })
      .select('-_id -__v -updatedAt')
      .limit(MAX_ROWS)
      .lean();

    return summarizeMetrics(rows as unknown as AiMetricRecord[], days, now);
  }
}
