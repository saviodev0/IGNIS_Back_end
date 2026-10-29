import { IgnisService } from './ignis.service';

describe('IgnisService', () => {
  let service: IgnisService;

  beforeEach(() => {
    service = new IgnisService();
  });

  it.each([
    ['Quero iniciar um ciclo de estudo', 'study_cycle', '/study-cycles/start'],
    ['Como está meu histórico?', 'study_history', '/study-cycles/history'],
    ['Quanto estudei hoje?', 'progress', '/users/me/stats'],
    ['Quero ver minhas metas', 'goals', '/goals'],
    ['Quais são minhas conquistas?', 'achievements', '/achievements'],
    ['Olá, tudo bem?', 'greeting', null],
    ['Preciso de ajuda', 'help', null],
    ['Conte uma curiosidade', 'unknown', null],
  ])('routes "%s"', (message, intent, route) => {
    expect(service.routeIntent(message)).toEqual({ intent, route });
  });

  it('matches intents without accents and regardless of case', () => {
    expect(service.routeIntent('HISTORICO DE SESSOES')).toEqual({
      intent: 'study_history',
      route: '/study-cycles/history',
    });
  });
});
