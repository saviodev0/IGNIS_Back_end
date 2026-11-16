export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;
export const SEARCH_MAX_CHATS = 20;
export const SEARCH_MAX_SNIPPETS_PER_CHAT = 3;
const SNIPPET_RADIUS = 60;

/** Minúsculas e sem acento, letra por letra, para as posições continuarem iguais às do texto original. */
export function fold(text: string): string {
  return Array.from(text, (char) => char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()[0] ?? char).join('');
}

/**
 * Texto que vai para o `$text` do Mongo. Aspas e "-" têm sentido especial lá (frase exata e exclusão),
 * então saem: o aluno digita palavras, não uma consulta.
 */
export function toTextQuery(q: string): string {
  return q
    .replace(/["\\]/g, ' ')
    .replace(/(^|\s)-+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palavras da busca, sem acento e em minúsculas. */
export function searchTerms(q: string): string[] {
  return [...new Set(fold(toTextQuery(q)).split(/\s+/).filter((term) => term.length >= 2))];
}

/**
 * Variações simples de uma palavra (já sem acento): plural com "s" e "ão"↔"ões"/"ães". O índice não faz stemming
 * (o do Mongo roda antes de tirar o acento, e "proclamacao" não achava "proclamação"), então as variações vão na busca.
 */
export function variants(term: string): string[] {
  const out = new Set([term]);

  if (term.endsWith('ao')) {
    out.add(`${term.slice(0, -2)}oes`);
    out.add(`${term.slice(0, -2)}aes`);
  } else if (term.endsWith('oes') || term.endsWith('aes')) {
    out.add(`${term.slice(0, -3)}ao`);
  } else if (term.endsWith('s') && term.length > 3) {
    out.add(term.slice(0, -1));
  } else if (!term.endsWith('s')) {
    out.add(`${term}s`);
  }

  return [...out];
}

/** O que vai no `$search`: as palavras com suas variações (o Mongo combina por "ou" e ordena pela relevância). */
export function buildTextSearch(q: string): string {
  return [...new Set(searchTerms(q).flatMap(variants))].join(' ');
}

/**
 * Trecho do texto em volta da primeira palavra da busca. O Mongo também acha variações ("mitocôndria" para
 * "mitocôndrias"), então, se a palavra inteira não aparece, tenta o começo dela.
 */
export function makeSnippet(content: string, terms: string[], radius = SNIPPET_RADIUS): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  const folded = fold(flat);

  let at = -1;
  let length = 0;

  for (const term of terms) {
    for (const candidate of [term, term.slice(0, Math.max(3, term.length - 2))]) {
      const index = folded.indexOf(candidate);
      if (index >= 0 && (at < 0 || index < at)) {
        at = index;
        length = candidate.length;
      }
      if (index >= 0) break;
    }
  }

  if (at < 0) return flat.length > radius * 2 ? `${flat.slice(0, radius * 2).trimEnd()}…` : flat;

  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + length + radius);

  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}
