const STOPWORDS = new Set([
  'para', 'como', 'qual', 'quais', 'sobre', 'isso', 'esse', 'essa', 'esses', 'essas', 'este',
  'esta', 'estes', 'estas', 'mais', 'muito', 'pode', 'poderia', 'quero', 'fazer', 'seria',
  'onde', 'quando', 'porque', 'entre', 'tambem', 'ainda', 'preciso', 'dele', 'dela', 'deles',
  'delas', 'pelo', 'pela', 'pelos', 'pelas', 'numa', 'num', 'uma', 'uns', 'umas', 'com', 'que',
  'por', 'dos', 'das', 'nos', 'nas', 'seu', 'sua', 'seus', 'suas', 'tem', 'foi', 'ser', 'sao',
  'aqui', 'ali', 'tudo', 'todo', 'toda', 'todos', 'todas', 'arquivo', 'documento', 'texto',
]);

// Sufixos removidos de forma simples para "estudo/estudos/estudando" caírem na mesma raiz
const SUFFIXES = [
  'coes', 'oes', 'mente', 'ando', 'endo', 'indo', 'ados', 'idos', 'adas', 'idas', 'ado', 'ido',
  'ada', 'ida', 'as', 'os', 'es', 'a', 'o', 'e', 's',
];

export function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .match(/[a-z0-9]{3,}/g) ?? []
  )
    .filter((word) => !STOPWORDS.has(word))
    .map(stem);
}

export interface RankableChunk {
  text: string;
}

/**
 * Ranking BM25 por palavra-chave (sem embeddings): palavras raras no material
 * pesam mais que palavras comuns, e trechos longos não ganham só por serem longos.
 * Devolve só os trechos com alguma palavra em comum, do mais ao menos relevante.
 *
 * `minCoverage` (0 a 1) exige que o trecho contenha palavras que somem pelo menos essa fração do "peso" (IDF)
 * das palavras da pergunta. Evita que uma palavra genérica ("segundo", "teoria") sozinha traga um trecho
 * quando o resto da pergunta não aparece no material.
 */
export function rankChunks<T extends RankableChunk>(
  chunks: T[],
  question: string,
  limit: number,
  minCoverage = 0,
): T[] {
  const terms = [...new Set(tokenize(question))];
  if (terms.length === 0 || chunks.length === 0) return [];

  const docs = chunks.map((chunk) => tokenize(chunk.text));
  const avgLength = docs.reduce((total, doc) => total + doc.length, 0) / docs.length || 1;

  const idf = new Map<string, number>();
  for (const term of terms) {
    const containing = docs.filter((doc) => doc.includes(term)).length;
    idf.set(term, Math.log(1 + (docs.length - containing + 0.5) / (containing + 0.5)));
  }

  const totalWeight = terms.reduce((total, term) => total + idf.get(term)!, 0);

  const k1 = 1.4;
  const b = 0.75;

  return docs
    .map((doc, index) => {
      const frequency = new Map<string, number>();
      for (const word of doc) frequency.set(word, (frequency.get(word) ?? 0) + 1);

      const score = terms.reduce((total, term) => {
        const tf = frequency.get(term) ?? 0;
        if (!tf) return total;
        return total + idf.get(term)! * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * doc.length) / avgLength)));
      }, 0);

      const matchedWeight = terms.reduce((total, term) => total + (frequency.has(term) ? idf.get(term)! : 0), 0);

      return { chunk: chunks[index], score, coverage: totalWeight > 0 ? matchedWeight / totalWeight : 0 };
    })
    .filter((item) => item.score > 0 && item.coverage >= minCoverage)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}

/** A pergunta fala do material em geral ("resuma o arquivo", "o que diz o pdf")? */
export function mentionsMaterial(question: string): boolean {
  const text = question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  return /\b(arquivo|pdf|docx?|word|documento|material|texto|apostila|resum\w*|capitulo|slides?|anexo|enviei|mandei|conteudo)\b/.test(text);
}

/** Similaridade entre vetores já normalizados. */
export function cosine(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

/**
 * Junta duas listas ordenadas (palavras-chave e semântica) com Reciprocal Rank Fusion:
 * quem aparece bem nas duas sobe; quem aparece só numa ainda entra.
 */
export function fuseRankings<T>(lists: T[][], limit: number, k = 60): T[] {
  const scores = new Map<T, number>();

  for (const list of lists) {
    list.forEach((item, rank) => scores.set(item, (scores.get(item) ?? 0) + 1 / (k + rank + 1)));
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}
