import { NotFoundException, UnauthorizedException } from '@nestjs/common';

import { MetricsGuard } from './metrics.guard';

const run = (env: Record<string, string>, headers: Record<string, unknown>) =>
  new MetricsGuard({ get: (key: string) => env[key] } as never).canActivate({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as never);

describe('MetricsGuard', () => {
  it('sem METRICS_TOKEN o endpoint fica desligado (404), mesmo com cabeçalho', () => {
    expect(() => run({}, { 'x-metrics-token': 'qualquer' })).toThrow(NotFoundException);
  });

  it('token certo passa', () => {
    expect(run({ METRICS_TOKEN: 'segredo-da-equipe' }, { 'x-metrics-token': 'segredo-da-equipe' })).toBe(true);
  });

  it('sem cabeçalho, token errado ou de tamanho diferente: 401', () => {
    const env = { METRICS_TOKEN: 'segredo-da-equipe' };
    expect(() => run(env, {})).toThrow(UnauthorizedException);
    expect(() => run(env, { 'x-metrics-token': 'errado' })).toThrow(UnauthorizedException);
    expect(() => run(env, { 'x-metrics-token': 'segredo-da-equipe-mais-longo' })).toThrow(UnauthorizedException);
    expect(() => run(env, { 'x-metrics-token': ['segredo-da-equipe'] })).toThrow(UnauthorizedException);
  });
});
