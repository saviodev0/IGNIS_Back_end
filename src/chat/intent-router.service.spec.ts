import { IntentRouterService, Intent } from './intent-router.service';

describe('IntentRouterService', () => {
  const router = new IntentRouterService();

  const cases: [string, Intent[] | null][] = [
    ['Quantas horas eu estudei essa semana?', ['STUDY_WEEK']],
    ['quanto tempo estudei hoje', ['STUDY_TODAY']],
    ['Quantas horas estudei?', ['STUDY_SUMMARY']],
    ['quanto eu já estudei no total?', ['STUDY_TOTAL']],
    ['Qual é a minha sequência?', ['STREAK']],
    ['quantos pontos eu tenho?', ['POINTS']],
    ['Como estão minhas metas?', ['GOALS']],
    ['qual minha posição no ranking', ['RANKING']],
    ['quantos ciclos eu fiz?', ['CYCLES']],
    ['quanto estudei hoje e qual minha sequência?', ['STUDY_TODAY', 'STREAK']],
    // Vão para a IA
    ['Quantas horas devo estudar por semana?', null],
    ['Como posso melhorar minha sequência?', null],
    ['Explique o ciclo de Krebs', null],
    ['resuma o pdf que enviei', null],
    ['Quantas horas tem um dia?', null],
    ['me dê dicas para aumentar meus pontos', null],
    ['', null],
  ];

  it.each(cases)('%s', (question, expected) => {
    expect(router.detect(question)).toEqual(expected);
  });
});

describe('IntentRouterService.detectStudyLog', () => {
  const router = new IntentRouterService();

  const cases: [string, number | null][] = [
    ['estudei 2h de cálculo', 120],
    ['Estudei 1h30 hoje', 90],
    ['estudei 1 hora e 15 minutos', 75],
    ['estudei 45 minutos', 45],
    ['estudei 2,5 horas', 150],
    ['estudei meia hora', 30],
    ['registre 20 min de estudo', 20],
    ['quantas horas estudei?', null],
    ['estudei bastante hoje', null],
    ['quanto devo estudar 2h por dia', null],
    ['explique o ciclo de Krebs em 2 horas', null],
    ['estudei 30 horas', null],
    ['adicione uma meta diária de 2h', null],
    ['registre uma meta semanal de 10h', null],
    ['some 2h', 120],
  ];

  it.each(cases)('%s', (message, expected) => {
    expect(router.detectStudyLog(message)).toBe(expected);
  });
});

describe('IntentRouterService.wantsStudyPlan', () => {
  const router = new IntentRouterService();

  const cases: [string, boolean][] = [
    ['Monte um plano de estudo para minha prova de cálculo', true],
    ['me ajuda a planejar meus estudos da semana', true],
    ['cria um cronograma de revisão até sexta', true],
    ['quanto devo estudar por dia para passar?', true],
    ['como organizar meus estudos?', true],
    ['Explique o ciclo de Krebs', false],
    ['resuma o pdf que enviei', false],
    ['o que é um plano cartesiano?', false],
    ['quantas horas estudei essa semana?', false],
  ];

  it.each(cases)('%s', (message, expected) => {
    expect(router.wantsStudyPlan(message)).toBe(expected);
  });
});
