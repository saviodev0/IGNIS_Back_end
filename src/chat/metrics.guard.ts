import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Protege as métricas da equipe com um token do `.env` (`METRICS_TOKEN`), enviado no cabeçalho `x-metrics-token`.
 * Sem `METRICS_TOKEN` o endpoint fica desligado (404). Os alunos não têm acesso.
 */
@Injectable()
export class MetricsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('METRICS_TOKEN');

    if (!expected) throw new NotFoundException();

    const sent = context.switchToHttp().getRequest().headers?.['x-metrics-token'];

    if (typeof sent !== 'string' || !timingSafeEqual(digest(sent), digest(expected))) {
      throw new UnauthorizedException('Token de métricas inválido.');
    }

    return true;
  }
}
