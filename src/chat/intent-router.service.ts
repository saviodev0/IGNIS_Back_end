import { Injectable } from '@nestjs/common';

export type Intent =
  | 'STUDY_TODAY'
  | 'STUDY_WEEK'
  | 'STUDY_TOTAL'
  | 'STUDY_SUMMARY'
  | 'STREAK'
  | 'POINTS'
  | 'GOALS'
  | 'RANKING'
  | 'CYCLES';

const MAX_LENGTH = 120;

// Pedidos de explicação/conselho: quem responde é a IA, mesmo que citem "horas" ou "semana"
const BLOCKERS = [
  'como fa', 'como pos', 'como dev', 'como melh', 'como org', 'como func', 'como ter', 'como ser',
  'devo', 'deveria', 'posso', 'melhor', 'dica', 'explic', 'resum', 'por que', 'porque', 'ajud',
  'sugir', 'sugest', 'plano', 'organiz', 'aument', 'estudar', 'material', 'arquivo', 'pdf',
  'documento',
];

// A pergunta precisa ser sobre os dados do próprio aluno
const PERSONAL = /\b(eu|meu|minha|meus|minhas|estudei|tenho|fiz|ganhei|cheguei|estou|sou)\b/;

const STUDY_WORDS = /(estud|hora|minut|tempo)/;

/**
 * Decide, sem chamar nenhuma IA, se a pergunta é sobre números do próprio aluno
 * (horas estudadas, sequência, pontos...). Na dúvida devolve null e a IA responde.
 */
@Injectable()
export class IntentRouterService {
  detect(question: string): Intent[] | null {
    const text = question
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text || text.length > MAX_LENGTH) return null;
    if (BLOCKERS.some((word) => text.includes(word))) return null;
    if (!PERSONAL.test(text)) return null;

    const intents: Intent[] = [];
    const studies = STUDY_WORDS.test(text);

    if (studies && /\bhoje\b/.test(text)) intents.push('STUDY_TODAY');
    if (studies && /\bsemana\b/.test(text)) intents.push('STUDY_WEEK');

    if (studies && /(no total|ao todo|total|no geral|desde o inicio|ja estudei)/.test(text)) {
      intents.push('STUDY_TOTAL');
    }

    // "quantas horas estudei?" sem período: mostra hoje, semana e total
    if (
      !intents.length &&
      studies &&
      /quant/.test(text) &&
      /(estudei|horas|minutos|tempo)/.test(text)
    ) {
      intents.push('STUDY_SUMMARY');
    }

    if (/(sequencia|streak|dias seguidos|dias consecutivos|ofensiva)/.test(text)) {
      intents.push('STREAK');
    }
    if (/(pontos|pontuacao)/.test(text)) intents.push('POINTS');
    if (/\b(meta|metas)\b/.test(text)) intents.push('GOALS');
    if (/(ranking|colocacao|classificacao)/.test(text)) intents.push('RANKING');
    if (/\b(ciclos?|pomodoros?)\b/.test(text) && /quant/.test(text)) intents.push('CYCLES');

    return intents.length > 0 && intents.length <= 3 ? intents : null;
  }
}
