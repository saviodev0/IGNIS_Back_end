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
