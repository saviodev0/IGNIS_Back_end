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

const MAX_LOG_MINUTES = 12 * 60;

/**
 * Registro de estudo: "estudei 2h", "estudei 1h30", "estudei 45 minutos", "estudei meia hora".
 * Só afirmações com número; perguntas ("quantas horas estudei?") seguem para as outras rotas.
 */
const LOG_VERB = /\b(estudei|estudamos|estudando|registre|registra|registrar|anote|anota|adicione|soma|some)\b/;
const LOG_DURATION =
  /(?:(\d+(?:[.,]\d+)?)\s*(?:h|hs|hora|horas)(?![a-z])(?:\s*e?\s*(\d+)\s*(?:min|minutos?)?\b)?|(\d+)\s*(?:min|minutos?)\b|\b(meia hora)\b)/;

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

  /** O aluno pediu um plano/cronograma de estudo? Só nesse caso a IA recebe o histórico detalhado. */
  wantsStudyPlan(message: string): boolean {
    const text = this.normalize(message);

    return /(plano|planejamento|cronograma|rotina|agenda|roteiro)\b.*\b(estud|revis|prova|materia|conteudo|semana|dias)|\b(monte|montar|crie|criar|faca|fazer|gere|gerar|planeje|planejar|organize|organizar|me ajude a (organizar|planejar))\b.*\b(plano|cronograma|rotina|estudos|revisao)|quanto (devo|preciso) estudar|como (devo )?(me )?organizar (os |meus )?estudos/.test(
      text,
    );
  }

  /** Minutos informados pelo aluno ao dizer que estudou ("estudei 2h"), ou null. */
  detectStudyLog(message: string): number | null {
    const text = this.normalize(message);

    if (!text || text.length > MAX_LENGTH || text.includes('?')) return null;
    if (/\b(quant|quanto|quantas|quantos|devo|deveria|posso|como|quero saber)\b/.test(text)) return null;
    if (!LOG_VERB.test(text)) return null;

    const match = LOG_DURATION.exec(text.replace(/(\d),(\d)/g, '$1.$2'));
    if (!match) return null;

    let minutes: number;

    if (match[4]) minutes = 30;
    else if (match[3]) minutes = Number(match[3]);
    else minutes = Math.round(Number(match[1]) * 60) + (match[2] ? Number(match[2]) : 0);

    return minutes > 0 && minutes <= MAX_LOG_MINUTES ? minutes : null;
  }

  private normalize(question: string) {
    return question
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s.,?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
