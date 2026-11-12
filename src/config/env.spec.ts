import { authCookieOptions, checkProductionEnv, isProduction, parseOrigins } from './env';

const strongSecret = 'x'.repeat(40);
const prod = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/ignis',
  MONGODB_URL: 'mongodb://u:p@mongo:27017/ignis',
  CORS_ORIGINS: 'https://app.ignis.com',
  JWT_SECRET: strongSecret,
  GROQ_API_KEY: 'gsk_x',
  TRUST_PROXY: '1',
};

describe('parseOrigins', () => {
  it('sem valor usa o front local', () => {
    expect(parseOrigins(undefined)).toEqual(['http://localhost:8081']);
    expect(parseOrigins('  , ')).toEqual(['http://localhost:8081']);
  });

  it('aceita várias origens, sem espaços nem barra final', () => {
    expect(parseOrigins('https://app.ignis.com/, https://ignis.com')).toEqual([
      'https://app.ignis.com',
      'https://ignis.com',
    ]);
  });
});

describe('authCookieOptions', () => {
  it('em desenvolvimento não exige HTTPS', () => {
    expect(authCookieOptions({})).toEqual({ httpOnly: true, secure: false, sameSite: 'lax' });
  });

  it('em produção é secure por padrão', () => {
    expect(authCookieOptions({ NODE_ENV: 'production' }).secure).toBe(true);
  });

  it('COOKIE_SECURE manda mais que o ambiente', () => {
    expect(authCookieOptions({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }).secure).toBe(false);
    expect(authCookieOptions({ COOKIE_SECURE: 'true' }).secure).toBe(true);
  });

  it('aceita domínio e SameSite válidos, e ignora valor inválido', () => {
    expect(authCookieOptions({ COOKIE_DOMAIN: '.ignis.com', COOKIE_SAMESITE: 'None' })).toMatchObject({
      domain: '.ignis.com',
      sameSite: 'none',
    });
    expect(authCookieOptions({ COOKIE_SAMESITE: 'qualquer' }).sameSite).toBe('lax');
  });
});

describe('checkProductionEnv', () => {
  it('fora de produção não exige nada', () => {
    expect(isProduction({})).toBe(false);
    expect(checkProductionEnv({})).toEqual({ errors: [], warnings: [] });
  });

  it('configuração completa passa sem erros nem avisos', () => {
    expect(checkProductionEnv(prod)).toEqual({ errors: [], warnings: [] });
  });

  it('lista tudo o que falta', () => {
    const { errors } = checkProductionEnv({ NODE_ENV: 'production' });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DATABASE_URL'),
        expect.stringContaining('MONGODB_URL'),
        expect.stringContaining('CORS_ORIGINS'),
        expect.stringContaining('JWT_SECRET'),
      ]),
    );
  });

  it('recusa a chave JWT de desenvolvimento e chaves curtas', () => {
    expect(checkProductionEnv({ ...prod, JWT_SECRET: 'ignis_super_secret_dev_2026' }).errors).toHaveLength(1);
    expect(checkProductionEnv({ ...prod, JWT_SECRET: 'curta' }).errors).toHaveLength(1);
  });

  it('avisa (sem bloquear) sobre IA, proxy, localhost e cookie', () => {
    const { errors, warnings } = checkProductionEnv({
      ...prod,
      GROQ_API_KEY: undefined,
      TRUST_PROXY: undefined,
      CORS_ORIGINS: 'http://localhost:8081',
      COOKIE_SECURE: 'false',
    });

    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(4);
  });
});
