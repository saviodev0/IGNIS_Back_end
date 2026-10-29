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
 */
export function rankChunks<T extends RankableChunk>(chunks: T[], question: string, limit: number): T[] {
  const terms = [...new Set(tokenize(question))];
  if (terms.length === 0 || chunks.length === 0) return [];

  const docs = chunks.map((chunk) => tokenize(chunk.text));
  const avgLength = docs.reduce((total, doc) => total + doc.length, 0) / docs.length || 1;

  const idf = new Map<string, number>();
  for (const term of terms) {
    const containing = docs.filter((doc) => doc.includes(term)).length;
    idf.set(term, Math.log(1 + (docs.length - containing + 0.5) / (containing + 0.5)));
  }

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

      return { chunk: chunks[index], score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}
