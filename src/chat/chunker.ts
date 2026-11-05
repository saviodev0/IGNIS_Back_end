// Divide o texto de um material em trechos que respeitam a estrutura (títulos e parágrafos).

const TARGET = 1100; // tamanho desejado de um trecho
const MAX = 1500; // nenhum trecho passa disso (além do título repetido)
const MIN = 350; // abaixo disso, a seção continua no mesmo trecho
const OVERLAP = 180; // final do trecho anterior repetido no próximo, dentro da mesma seção

const HEADING_WORD = /^(cap[ií]tulo|se[cç][aã]o|unidade|aula|m[oó]dulo|parte|t[oó]pico|resumo|introdu[cç][aã]o|conclus[aã]o)\b/i;

/** Linha curta que parece título: "Capítulo 2", "1.3 Método", "INTRODUÇÃO". */
export function isHeading(line: string): boolean {
  const text = line.trim();

  if (!text || text.length > 90) return false;
  if (/[.!?;,:]$/.test(text)) return false;
  if (HEADING_WORD.test(text) && text.split(/\s+/).length <= 10) return true;
  if (/^\d+(\.\d+)+\s+\S/.test(text) && text.split(/\s+/).length <= 12) return true;
  if (/^\d+[.)]\s+[A-ZÀ-Ú]/.test(text) && text.split(/\s+/).length <= 10) return true;

  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return letters.length >= 4 && letters === letters.toUpperCase() && text.split(/\s+/).length <= 10;
}

interface Unit {
  text: string;
  heading: boolean;
}

function toUnits(text: string): Unit[] {
  const units: Unit[] = [];

  for (const paragraph of text.split(/\n{2,}/)) {
    let body: string[] = [];

    const flushBody = () => {
      if (body.length) units.push({ text: body.join('\n').trim(), heading: false });
      body = [];
    };

    for (const line of paragraph.split('\n')) {
      if (isHeading(line)) {
        flushBody();
        units.push({ text: line.trim(), heading: true });
      } else if (line.trim()) {
        body.push(line.trim());
      }
    }

    flushBody();
  }

  return units.filter((unit) => unit.text);
}

/** Quebra um parágrafo grande em pedaços de até `target`, preferindo o fim das frases. */
function splitLong(text: string, target: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú0-9])/);
  const pieces: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > target) {
      pieces.push(current);
      current = '';
    }

    if (sentence.length > MAX) {
      // Frase gigante (sem pontuação): corta no último espaço antes do limite
      let rest = sentence;
      while (rest.length > MAX) {
        const cut = rest.lastIndexOf(' ', MAX);
        const at = cut > MAX / 2 ? cut : MAX;
        if (current) {
          pieces.push(current);
          current = '';
        }
        pieces.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      current = rest;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current) pieces.push(current);

  return pieces;
}

/** Final do trecho (frases inteiras, até OVERLAP caracteres) para dar continuidade ao próximo. */
function tail(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let result = '';

  for (let i = sentences.length - 1; i >= 0; i--) {
    const next = result ? `${sentences[i]} ${result}` : sentences[i];
    if (next.length > OVERLAP) break;
    result = next;
  }

  return result;
}

export interface ChunkResult {
  chunks: string[];
  /** Último título visto, para continuar na página seguinte. */
  heading: string;
}

export function splitIntoChunks(text: string, initialHeading = ''): ChunkResult {
  const chunks: string[] = [];
  let heading = initialHeading;
  let current = '';
  let hasBody = false;

  const startWith = (prefix: string) => {
    current = prefix;
    hasBody = false;
  };

  const flush = (withOverlap: boolean) => {
    if (!hasBody) return;
    const finished = current.trim();
    chunks.push(finished);

    const carry = withOverlap ? tail(finished) : '';
    // Trechos seguintes da mesma seção repetem o título, para a busca saber de que assunto se trata
    const prefix = [heading, carry].filter(Boolean).join('\n');
    startWith(prefix);
  };

  startWith(heading);

  for (const unit of toUnits(text)) {
    if (unit.heading) {
      if (current.length >= MIN) flush(false);
      heading = unit.text;
      current = hasBody ? `${current}\n${unit.text}` : unit.text;
      continue;
    }

    for (const piece of unit.text.length > MAX ? splitLong(unit.text, TARGET) : [unit.text]) {
      if (hasBody && current.length + piece.length + 1 > TARGET && current.length >= MIN) flush(true);

      current = current ? `${current}\n${piece}` : piece;
      hasBody = true;
    }
  }

  if (hasBody) {
    const last = current.trim();
    const previous = chunks[chunks.length - 1];

    // Sobra muito pequena: junta ao trecho anterior em vez de virar um trecho solto
    if (previous && last.length < MIN / 2 && previous.length + last.length < MAX) {
      chunks[chunks.length - 1] = `${previous}\n${last}`;
    } else {
      chunks.push(last);
    }
  }

  return { chunks, heading };
}
