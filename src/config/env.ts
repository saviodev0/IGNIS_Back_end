import type { CookieOptions } from 'express';

type Env = Record<string, string | undefined>;

const DEV_ORIGIN = 'http://localhost:8081';
const DEV_JWT_SECRET = 'ignis_super_secret_dev_2026';
const MIN_JWT_SECRET = 32;

export const isProduction = (env: Env = process.env) => env.NODE_ENV === 'production';

/** Origens do front aceitas pelo CORS (`CORS_ORIGINS`, separadas por vírgula). Padrão: o front local. */
export function parseOrigins(value: string | undefined): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return origins.length ? origins : [DEV_ORIGIN];
}

/**
 * Cookie de login. Em produção é `secure` (só HTTPS) por padrão; `COOKIE_SECURE=false` desliga
 * (útil só para testar produção em http). `COOKIE_DOMAIN` permite compartilhar entre subdomínios.
 */
export function authCookieOptions(env: Env = process.env): CookieOptions {
  const secure = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProduction(env);
  const sameSite = (env.COOKIE_SAMESITE ?? 'lax').toLowerCase();

  return {
    httpOnly: true,
    secure,
    sameSite: sameSite === 'strict' || sameSite === 'none' ? sameSite : 'lax',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

/** O que falta ou está inseguro para rodar em produção. Fora de produção não exige nada. */
export function checkProductionEnv(env: Env = process.env): EnvReport {
  const report: EnvReport = { errors: [], warnings: [] };

  if (!isProduction(env)) return report;

  for (const name of ['DATABASE_URL', 'MONGODB_URL', 'CORS_ORIGINS']) {
    if (!env[name]?.trim()) report.errors.push(`${name} é obrigatória em produção.`);
  }

  const secret = env.JWT_SECRET ?? '';
  if (!secret) {
    report.errors.push('JWT_SECRET é obrigatória em produção.');
  } else if (secret === DEV_JWT_SECRET || secret.length < MIN_JWT_SECRET) {
    report.errors.push(`JWT_SECRET precisa ter ao menos ${MIN_JWT_SECRET} caracteres e não pode ser a de desenvolvimento.`);
  }

  if (env.CORS_ORIGINS && parseOrigins(env.CORS_ORIGINS).some((origin) => origin.includes('localhost'))) {
    report.warnings.push('CORS_ORIGINS ainda aponta para localhost.');
  }

  if (!env.GROQ_API_KEY?.trim()) {
    report.warnings.push('GROQ_API_KEY ausente: o chat com IA ficará indisponível.');
  }

  if (!env.TRUST_PROXY) {
    report.warnings.push('TRUST_PROXY ausente: atrás de um proxy, todos os alunos parecerão ter o mesmo IP (limites por IP).');
  }

  if (authCookieOptions(env).secure === false) {
    report.warnings.push('Cookie de login sem `secure`: use HTTPS e deixe COOKIE_SECURE ligado.');
  }

  return report;
}
