import { cosine, fuseRankings, mentionsMaterial, rankChunks } from './chunk-ranker';

export const CONTEXT_CHUNKS = 4; // trechos de arquivo enviados por pergunta
export const SEARCH_POOL = 8; // candidatos de cada busca (palavras-chave e semântica) antes de juntar
// Similaridade mínima (modelo e5-small, medida em testes): perguntas relacionadas ficam em 0,81–0,88 e sem relação em 0,77–0,81
export const SEMANTIC_MIN = 0.805;

export interface SearchableChunk {
  text: string;
  vector?: number[];
}

/** Busca por palavras-chave (BM25): só devolve trechos com alguma palavra em comum. */
export function keywordSearch<T extends SearchableChunk>(all: T[], question: string): T[] {
  return rankChunks(all, question, SEARCH_POOL);
}

/** Busca semântica: trechos cuja similaridade com a pergunta passa do limiar, do mais ao menos parecido. */
export function semanticSearch<T extends SearchableChunk>(
  all: T[],
  queryVector: number[] | null | undefined,
  minSimilarity = SEMANTIC_MIN,
): T[] {
  if (!queryVector) return [];

  return all
    .filter((chunk) => chunk.vector)
    .map((chunk) => ({ chunk, similarity: cosine(queryVector, chunk.vector!) }))
    .filter((item) => item.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, SEARCH_POOL)
    .map((item) => item.chunk);
}

/** Junta as duas buscas e devolve os melhores trechos em ordem de relevância. */
export function rankedSearch<T extends SearchableChunk>(
  all: T[],
  question: string,
  queryVector?: number[] | null,
  minSimilarity = SEMANTIC_MIN,
): T[] {
  return fuseRankings([keywordSearch(all, question), semanticSearch(all, queryVector, minSimilarity)], CONTEXT_CHUNKS);
}

/**
 * Escolhe os trechos que vão para a IA, na ordem original do material.
 * É a mesma função usada pelo chat e pelo comando `npm run eval:search`.
 */
export function searchChunks<T extends SearchableChunk>(
  all: T[],
  question: string,
  queryVector?: number[] | null,
  minSimilarity = SEMANTIC_MIN,
): T[] {
  if (all.length === 0) return [];

  const found = rankedSearch(all, question, queryVector, minSimilarity).sort((x, y) => all.indexOf(x) - all.indexOf(y));

  if (found.length > 0) return found;

  // Pergunta genérica sobre o material ("resuma o arquivo"): usa o começo dele.
  // Pergunta sem relação com o material: não manda trechos (economiza tokens e não mostra fonte falsa).
  return mentionsMaterial(question) ? all.slice(0, CONTEXT_CHUNKS) : [];
}
