import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AiUsage } from './schemas/ai-usage.schema';
import { dayKey, nextMidnight, parseLimit, TokenUsage } from './usage';

@Injectable()
export class UsageService {
  constructor(
    @InjectModel(AiUsage.name) private readonly usage: Model<AiUsage>,
    private readonly config: ConfigService,
  ) {}

  /** Tokens por aluno por dia; 0 desliga o limite. */
  get limit(): number {
    return parseLimit(this.config.get('AI_DAILY_TOKEN_LIMIT'));
  }

  /** Soma o consumo de uma resposta ao dia de hoje do aluno. */
  async record(userId: string, tokens: TokenUsage) {
    await this.usage.updateOne(
      { userId, day: dayKey() },
      {
        $inc: {
          promptTokens: Math.max(0, Math.round(tokens.promptTokens)),
          completionTokens: Math.max(0, Math.round(tokens.completionTokens)),
          requests: 1,
        },
      },
      { upsert: true },
    );
  }

  async today(userId: string) {
    const row = await this.usage.findOne({ userId, day: dayKey() }).lean();
    const promptTokens = row?.promptTokens ?? 0;
    const completionTokens = row?.completionTokens ?? 0;
    const used = promptTokens + completionTokens;
    const limit = this.limit;

    return {
      day: dayKey(),
      promptTokens,
      completionTokens,
      requests: row?.requests ?? 0,
      used,
      limit: limit || null,
      remaining: limit ? Math.max(0, limit - used) : null,
      resetsAt: nextMidnight().toISOString(),
    };
  }

  /** Bloqueia com 429 quando o aluno já passou da cota de hoje. */
  async assertWithinLimit(userId: string) {
    if (!this.limit) return;

    const today = await this.today(userId);

    if (today.used >= this.limit) {
      const time = nextMidnight().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Você atingiu o limite diário de uso da IA. A cota renova à meia-noite (${time}).`,
          error: 'Too Many Requests',
          resetsAt: today.resetsAt,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
