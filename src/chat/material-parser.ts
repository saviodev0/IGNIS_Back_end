export type MaterialType = 'summary' | 'flashcards' | 'quiz';

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export const MIN_COUNT = 3;
export const MAX_COUNT = 20;
export const DEFAULT_COUNT = 8;

export function clampCount(count?: number): number {
  const value = Number.isFinite(count) ? Math.round(count as number) : DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, value));
}

/** Tira cercas de código e texto em volta e devolve o JSON da resposta da IA. */
export function extractJson(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));

  if (start === -1 || end <= start) {
    throw new Error('A resposta da IA não trouxe JSON.');
  }

  return JSON.parse(text.slice(start, end + 1));
}

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function asArray(data: unknown, key: string): unknown[] {
  const list = Array.isArray(data) ? data : (data as Record<string, unknown>)?.[key];

  if (!Array.isArray(list)) throw new Error('Formato inesperado.');

  return list;
}

export function parseFlashcards(raw: string, count: number): Flashcard[] {
  const cards = asArray(extractJson(raw), 'flashcards')
    .map((item: any) => ({ front: clean(item?.front, 240), back: clean(item?.back, 500) }))
    .filter((card) => card.front && card.back)
    .slice(0, count);

  if (cards.length === 0) throw new Error('Nenhum flashcard válido.');

  return cards;
}

export function parseQuiz(raw: string, count: number): QuizQuestion[] {
  const questions = asArray(extractJson(raw), 'questions')
    .map((item: any) => {
      const options = Array.isArray(item?.options) ? item.options.map((o: unknown) => clean(o, 200)) : [];

      return {
        question: clean(item?.question, 400),
        options,
        answerIndex: Number(item?.answerIndex),
        explanation: clean(item?.explanation, 500),
      };
    })
    .filter(
      (q) =>
        q.question &&
        q.options.length === 4 &&
        q.options.every(Boolean) &&
        new Set(q.options).size === 4 &&
        Number.isInteger(q.answerIndex) &&
        q.answerIndex >= 0 &&
        q.answerIndex < 4,
    )
    .slice(0, count);

  if (questions.length === 0) throw new Error('Nenhuma questão válida.');

  return questions;
}

/**
 * Junta os trechos do material sem passar de `maxChars`. Se não couber, escolhe trechos
 * espaçados ao longo do documento (começo, meio e fim) e mantém a ordem original.
 */
export function sampleChunks(chunks: string[], maxChars: number): string {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

  if (total <= maxChars) return chunks.join('\n\n');

  const average = total / chunks.length;
  const wanted = Math.max(1, Math.floor(maxChars / average));
  const picked: string[] = [];
  let used = 0;

  for (let i = 0; i < wanted; i++) {
    const index = wanted === 1 ? 0 : Math.round((i * (chunks.length - 1)) / (wanted - 1));
    const chunk = chunks[index];

    if (picked.includes(chunk) || used + chunk.length > maxChars) continue;

    picked.push(chunk);
    used += chunk.length;
  }

  return chunks.filter((chunk) => picked.includes(chunk)).join('\n\n');
}
