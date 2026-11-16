import { cosine, fuseRankings, mentionsMaterial, rankChunks } from './chunk-ranker';

export const CONTEXT_CHUNKS = 4; // mínimo de trechos de arquivo enviados por pergunta
// Slides têm trechos de ~200 caracteres: com só 4, a IA recebe quase nada. Por isso continuamos juntando trechos
// (até MAX_CONTEXT_CHUNKS) enquanto o contexto tiver menos que CONTEXT_CHARS. Em texto corrido, 4 trechos já passam disso.
export const MAX_CONTEXT_CHUNKS = 12;
export const CONTEXT_CHARS = 2500;
export const SEARCH_POOL = 8; // candidatos de cada busca (palavras-chave e semântica) antes de juntar
// Similaridade mínima (modelo e5-small). Medida com `npm run eval:search`: perguntas relacionadas ficam em 0,84–0,92
// e sem relação em 0,77–0,85; em 0,83 não se perde nenhum acerto e caem os falsos positivos (acima de 0,84 já perde).
export const SEMANTIC_MIN = 0.83;
// Fração do peso das palavras da pergunta que o trecho precisa conter para entrar pela busca por palavras-chave
// (0,25 a 0,40 deram o mesmo resultado no eval; 0,30 fica no meio dessa faixa). Só vale quando a busca semântica está
// disponível para cobrir as perguntas com outras palavras: sem ela (modelo ainda carregando ou desligado), o filtro
// derrubaria o acerto das perguntas parafraseadas de 92% para 60% no eval.
export const KEYWORD_MIN_COVERAGE = 0.3;

export interface SearchableChunk {
  text: string;
  vector?: number[];
}

/** Busca por palavras-chave (BM25): só devolve trechos com alguma palavra em comum (e, se pedido, com cobertura mínima). */
export function keywordSearch<T extends SearchableChunk>(all: T[], question: string, minCoverage = 0): T[] {
  return rankChunks(all, question, SEARCH_POOL, minCoverage);
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

const MIN_REPEAT_LENGTH = 30;

const squash = (text: string) => text.replace(/\s+/g, ' ').trim().replace(/\s*\d+$/, ''); // sem o número do slide no fim

/** Um trecho repete o outro quando está inteiro dentro dele (slides com animação repetem a página anterior e acrescentam uma linha). */
export function repeats(a: string, b: string): boolean {
  const x = squash(a);
  const y = squash(b);
  if (Math.min(x.length, y.length) < MIN_REPEAT_LENGTH) return false;
  return x.includes(y) || y.includes(x);
}

/**
 * Do ranking, escolhe o contexto: no mínimo `minChunks` trechos e, enquanto o texto somado tiver menos que `chars`,
 * mais trechos (sem repetir slides: fica a versão mais completa).
 */
export function pickContext<T extends SearchableChunk>(ranked: T[], minChunks = CONTEXT_CHUNKS, chars = CONTEXT_CHARS): T[] {
  const picked: T[] = [];
  let total = 0;

  for (const chunk of ranked) {
    if (picked.length >= minChunks && total >= chars) break;

    const same = picked.findIndex((other) => repeats(chunk.text, other.text));

    if (same >= 0) {
      if (squash(chunk.text).length > squash(picked[same].text).length) {
        total += chunk.text.length - picked[same].text.length;
        picked[same] = chunk;
      }
      continue;
    }

    picked.push(chunk);
    total += chunk.text.length;
  }

  return picked;
}

/** Junta as duas buscas e devolve os melhores trechos em ordem de relevância. */
export function rankedSearch<T extends SearchableChunk>(
  all: T[],
  question: string,
  queryVector?: number[] | null,
  minSimilarity = SEMANTIC_MIN,
): T[] {
  return fuseRankings(
    [keywordSearch(all, question, queryVector ? KEYWORD_MIN_COVERAGE : 0), semanticSearch(all, queryVector, minSimilarity)],
    MAX_CONTEXT_CHUNKS,
  );
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

  const found = pickContext(rankedSearch(all, question, queryVector, minSimilarity)).sort(
    (x, y) => all.indexOf(x) - all.indexOf(y),
  );

  if (found.length > 0) return found;

  // Pergunta genérica sobre o material ("resuma o arquivo"): usa o começo dele.
  // Pergunta sem relação com o material: não manda trechos (economiza tokens e não mostra fonte falsa).
  return mentionsMaterial(question) ? pickContext(all.slice(0, MAX_CONTEXT_CHUNKS)) : [];
}
