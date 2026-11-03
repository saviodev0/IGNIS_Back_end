import { parseGoalCommand, parseMinutes } from './goal-command';

describe('parseMinutes', () => {
  it.each([
    ['2h', 120],
    ['1h30', 90],
    ['1 hora e 15 min', 75],
    ['45 minutos', 45],
    ['1,5 horas', 90],
    ['meia hora', 30],
  ])('%s -> %i', (text, minutes) => {
    expect(parseMinutes(text)).toBe(minutes);
  });

  it('sem duração devolve null', () => {
    expect(parseMinutes('uma meta bonita')).toBeNull();
  });
});

describe('parseGoalCommand', () => {
  it.each([
    ['crie uma meta diária de 2h', 'DAILY', 120],
    ['Criar meta semanal de 10h', 'WEEKLY', 600],
    ['quero uma meta mensal de 40 horas', 'MONTHLY', 2400],
    ['criar meta semanal de 600 minutos', 'WEEKLY', 600],
    ['defina uma meta diária de 1h30', 'DAILY', 90],
    ['quero uma meta de 3h por dia', 'DAILY', 180],
    ['adicione uma meta semanal de 5h', 'WEEKLY', 300],
    ['nova meta mensal de 20h', 'MONTHLY', 1200],
  ])('"%s" cria meta %s de %i min', (message, type, minutes) => {
    expect(parseGoalCommand(message)).toEqual({ kind: 'create', type, minutes });
  });

  it.each([
    'como estão minhas metas?',
    'quais são as minhas metas',
    'minhas metas semanais',
    'qual é a meta diária de 2h ideal?',
    'estudei 2h hoje',
    'criar um plano de estudo semanal de 10h',
    'a meta da empresa é 10h',
    'meta de vida',
    'criar meta semanal',
  ])('"%s" não é comando', (message) => {
    expect(parseGoalCommand(message)).toBeNull();
  });

  it('sem o tipo da meta, pergunta qual é', () => {
    const result = parseGoalCommand('criar meta de 10h');

    expect(result).toMatchObject({ kind: 'invalid' });
    expect((result as any).reason).toContain('diária, semanal ou mensal');
  });

  it('valor zero ou acima do período é recusado com o motivo', () => {
    expect(parseGoalCommand('criar meta diária de 0h')).toMatchObject({ kind: 'invalid', reason: expect.stringContaining('maior que zero') });
    expect(parseGoalCommand('criar meta diária de 30h')).toMatchObject({ kind: 'invalid', reason: expect.stringContaining('24 horas') });
    expect(parseGoalCommand('criar meta semanal de 200h')).toMatchObject({ kind: 'invalid' });
  });

  it('mensagem longa demais é ignorada', () => {
    expect(parseGoalCommand(`criar meta diária de 2h ${'x'.repeat(200)}`)).toBeNull();
  });
});
