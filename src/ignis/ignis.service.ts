import { Injectable } from '@nestjs/common';

export type IgnisIntent =
  | 'study_cycle'
  | 'study_history'
  | 'progress'
  | 'goals'
  | 'achievements'
  | 'greeting'
  | 'help'
  | 'unknown';

type IntentRule = {
  intent: IgnisIntent;
  route: string | null;
  patterns: RegExp[];
};

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'study_history',
    route: '/study-cycles/history',
    patterns: [
      /\bhistorico\b/,
      /\bsessoes anteriores\b/,
      /\bciclos anteriores\b/,
      /\bultimos ciclos\b/,
    ],
  },
  {
    intent: 'progress',
    route: '/users/me/stats',
    patterns: [
      /\bprogresso\b/,
      /\bestatisticas?\b/,
      /\bquanto(?:s)? minutos\b/,
      /\bquanto(?:s)? estudei\b/,
      /\bdesempenho\b/,
    ],
  },
  {
    intent: 'goals',
    route: '/goals',
    patterns: [/\bmetas?\b/, /\bobjetivos?\b/],
  },
  {
    intent: 'achievements',
    route: '/achievements',
    patterns: [/\bconquistas?\b/, /\brecompensas?\b/],
  },
  {
    intent: 'study_cycle',
    route: '/study-cycles/start',
    patterns: [
      /\bciclo(?:s)? de estudo\b/,
      /\bpomodoro\b/,
      /\bcome(?:c|ç)ar a estudar\b/,
      /\biniciar (?:um )?ciclo\b/,
      /\bestudar\b/,
    ],
  },
  {
    intent: 'greeting',
    route: null,
    patterns: [
      /\b(?:oi|ola|bom dia|boa tarde|boa noite|e ai)\b/,
      /\btudo bem\b/,
    ],
  },
  {
    intent: 'help',
    route: null,
    patterns: [/\bajuda\b/, /\bcomo funciona\b/, /\bo que voce faz\b/],
  },
];

@Injectable()
export class IgnisService {
  getInfo() {
    return {
      name: 'IGNIS',
      message: 'Seu ciclo de estudos começa aqui.',
    };
  }

  routeIntent(message: string): { intent: IgnisIntent; route: string | null } {
    const normalizedMessage = message
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const match = INTENT_RULES.find((rule) =>
      rule.patterns.some((pattern) => pattern.test(normalizedMessage)),
    );

    return match
      ? { intent: match.intent, route: match.route }
      : { intent: 'unknown', route: null };
  }
}
