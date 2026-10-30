import { isHeading, splitIntoChunks } from './chunker';

const paragraph = (word: string, sentences: number) =>
  Array.from({ length: sentences }, (_, i) => `A ${word} é importante no ponto ${i + 1} do estudo celular.`).join(' ');

describe('isHeading', () => {
  it.each([
    ['Capítulo 2 - Genética', true],
    ['1.3 Método experimental', true],
    ['2. Resultados', true],
    ['INTRODUÇÃO', true],
    ['Resumo', true],
    ['A mitocôndria produz ATP.', false],
    ['25 min de foco', false],
    ['Isso é uma frase longa que não deveria ser considerada título porque passa de noventa caracteres facilmente', false],
    ['', false],
  ])('%s', (line, expected) => {
    expect(isHeading(line)).toBe(expected);
  });
});

describe('splitIntoChunks', () => {
  it('texto curto vira um trecho só', () => {
    expect(splitIntoChunks('Uma frase curta sobre mitose.').chunks).toEqual(['Uma frase curta sobre mitose.']);
  });

  it('respeita o tamanho máximo e não perde conteúdo', () => {
    const text = Array.from({ length: 12 }, (_, i) => paragraph(`organela${i}`, 6)).join('\n\n');
    const { chunks } = splitIntoChunks(text);

    expect(chunks.length).toBeGreaterThan(2);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(1500 + 200);
    for (let i = 0; i < 12; i++) expect(chunks.some((c) => c.includes(`organela${i}`))).toBe(true);
  });

  it('começa trecho novo em cada título e repete o título nos trechos da seção', () => {
    const text = [
      'Capítulo 1 - Célula',
      paragraph('mitocôndria', 14),
      'Capítulo 2 - Genética',
      paragraph('alelo', 30),
    ].join('\n\n');

    const { chunks, heading } = splitIntoChunks(text);

    expect(heading).toBe('Capítulo 2 - Genética');
    expect(chunks.some((c) => c.startsWith('Capítulo 1 - Célula'))).toBe(true);
    // nenhum trecho mistura o corpo dos dois capítulos
    expect(chunks.some((c) => c.includes('mitocôndria') && c.includes('alelo'))).toBe(false);
    // trechos de continuação da seção repetem o título
    const genetica = chunks.filter((c) => c.includes('alelo'));
    expect(genetica.length).toBeGreaterThan(1);
    expect(genetica.every((c) => c.startsWith('Capítulo 2 - Genética'))).toBe(true);
  });

  it('repete o fim do trecho anterior dentro da mesma seção', () => {
    const { chunks } = splitIntoChunks(paragraph('sinapse', 40));
    const first = chunks[0];
    const lastSentence = first.split(/(?<=\.)\s+/).pop()!;

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]).toContain(lastSentence);
  });

  it('continua o título da página anterior', () => {
    const page1 = splitIntoChunks(`Capítulo 3 - Ecologia\n\n${paragraph('cadeia', 3)}`);
    const page2 = splitIntoChunks(paragraph('nicho', 3), page1.heading);

    expect(page2.chunks[0].startsWith('Capítulo 3 - Ecologia')).toBe(true);
  });

  it('frase gigante sem pontuação é cortada no limite', () => {
    const { chunks } = splitIntoChunks('palavra '.repeat(600));
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(1700);
    expect(chunks.length).toBeGreaterThan(2);
  });
});
