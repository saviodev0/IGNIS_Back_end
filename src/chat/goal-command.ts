export type GoalType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type GoalCommand =
  | { kind: 'create'; type: GoalType; minutes: number }
  | { kind: 'invalid'; reason: string };

const MAX_LENGTH = 120;

// Maior valor que cabe no período (24 h por dia)
const MAX_MINUTES: Record<GoalType, number> = {
  DAILY: 24 * 60,
  WEEKLY: 7 * 24 * 60,
  MONTHLY: 31 * 24 * 60,
};

const NAMES: Record<GoalType, { label: string; per: string }> = {
  DAILY: { label: 'diária', per: 'por dia' },
  WEEKLY: { label: 'semanal', per: 'por semana' },
  MONTHLY: { label: 'mensal', per: 'por mês' },
};

const CREATE_VERB =
  /\b(cri\w*|faca|fazer|defin\w*|configur\w*|adicion\w*|quero|queria|gostaria|estabele\w*|coloque|colocar|ponha|bote|nova)\b/;
const QUESTION = /\b(como|quanto|quantas|quantos|qual|quais|quando|onde|por que|porque|o que)\b/;
const DURATION =
  /(?:(\d+(?:\.\d+)?)\s*(?:h|hs|hora|horas)(?![a-z])(?:\s*e?\s*(\d+)\s*(?:min|minutos?)?\b)?|(\d+)\s*(?:min|minutos?)\b|\b(meia hora)\b)/;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s.,]/g, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();

/** Minutos de uma duração escrita ("2h", "1h30", "45 min", "meia hora"), ou null. */
export function parseMinutes(normalizedText: string): number | null {
  const match = DURATION.exec(normalizedText.replace(/(\d),(\d)/g, '$1.$2'));
  if (!match) return null;

  if (match[4]) return 30;
  if (match[3]) return Number(match[3]);

  return Math.round(Number(match[1]) * 60) + (match[2] ? Number(match[2]) : 0);
}

function detectType(text: string): GoalType | null {
  if (/\b(diaria|diario|por dia|ao dia|todo dia|todos os dias)\b/.test(text)) return 'DAILY';
  if (/\b(semanal|por semana|na semana|a semana)\b/.test(text)) return 'WEEKLY';
  if (/\b(mensal|por mes|no mes|ao mes|o mes)\b/.test(text)) return 'MONTHLY';

  return null;
}

/**
 * Pedido para criar uma meta: "crie uma meta semanal de 10h", "quero uma meta diária de 1h30".
 * Perguntas sobre metas ("como estão minhas metas?") e frases sem valor não são comandos (null).
 */
export function parseGoalCommand(message: string): GoalCommand | null {
  const text = normalize(message);

  if (!text || text.length > MAX_LENGTH || text.includes('?')) return null;
  if (!/\bmeta\b/.test(text) || !CREATE_VERB.test(text) || QUESTION.test(text)) return null;

  const minutes = parseMinutes(text);
  if (minutes === null) return null;

  const type = detectType(text);

  if (!type) {
    return { kind: 'invalid', reason: 'Qual o tipo da meta? Diga se é diária, semanal ou mensal, por exemplo: "criar meta semanal de 10h".' };
  }

  if (minutes <= 0) {
    return { kind: 'invalid', reason: 'O valor da meta precisa ser maior que zero.' };
  }

  if (minutes > MAX_MINUTES[type]) {
    return {
      kind: 'invalid',
      reason: `Esse valor é maior do que cabe em uma meta ${NAMES[type].label} (máximo ${MAX_MINUTES[type] / 60} horas). Tente um valor menor.`,
    };
  }

  return { kind: 'create', type, minutes };
}

export function goalLabel(type: GoalType) {
  return NAMES[type];
}
