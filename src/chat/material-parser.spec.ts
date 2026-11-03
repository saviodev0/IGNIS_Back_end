import { clampCount, extractJson, parseFlashcards, parseQuiz, sampleChunks } from './material-parser';

describe('clampCount', () => {
  it('usa 8 por padrão e limita entre 3 e 20', () => {
    expect(clampCount()).toBe(8);
    expect(clampCount(1)).toBe(3);
    expect(clampCount(99)).toBe(20);
    expect(clampCount(10)).toBe(10);
  });
});

describe('extractJson', () => {
  it('aceita cercas de código e texto em volta', () => {
    const raw = 'Claro! ```json\n{"a":1}\n``` espero ter ajudado';
    expect(extractJson(raw)).toEqual({ a: 1 });
  });

  it('falha quando não há JSON', () => {
    expect(() => extractJson('sem json aqui')).toThrow();
  });
});

describe('parseFlashcards', () => {
  it('lê o objeto, limpa espaços e respeita o limite', () => {
    const raw = JSON.stringify({
      flashcards: [
        { front: '  O que  é ATP? ', back: 'Moeda de energia' },
        { front: 'sem resposta', back: '' },
        { front: 'Onde ocorre Krebs?', back: 'Matriz mitocondrial' },
      ],
    });

    expect(parseFlashcards(raw, 5)).toEqual([
      { front: 'O que é ATP?', back: 'Moeda de energia' },
      { front: 'Onde ocorre Krebs?', back: 'Matriz mitocondrial' },
    ]);
    expect(parseFlashcards(raw, 1)).toHaveLength(1);
  });

  it('aceita uma lista direta e rejeita quando nada é válido', () => {
    expect(parseFlashcards('[{"front":"a","back":"b"}]', 3)).toHaveLength(1);
    expect(() => parseFlashcards('{"flashcards":[{"front":"","back":""}]}', 3)).toThrow();
    expect(() => parseFlashcards('{"outra":1}', 3)).toThrow();
  });
});

describe('parseQuiz', () => {
  const valid = {
    question: 'Qual organela produz ATP?',
    options: ['Núcleo', 'Mitocôndria', 'Ribossomo', 'Lisossomo'],
    answerIndex: 1,
    explanation: 'A respiração celular ocorre nela.',
  };

  it('mantém as questões válidas', () => {
    expect(parseQuiz(JSON.stringify({ questions: [valid] }), 5)).toEqual([valid]);
  });

  it.each([
    ['menos de 4 alternativas', { ...valid, options: ['a', 'b', 'c'] }],
    ['alternativas repetidas', { ...valid, options: ['a', 'a', 'b', 'c'] }],
    ['índice fora do intervalo', { ...valid, answerIndex: 4 }],
    ['índice não numérico', { ...valid, answerIndex: 'B' }],
    ['sem pergunta', { ...valid, question: '' }],
  ])('descarta questão com %s', (_nome, item) => {
    expect(() => parseQuiz(JSON.stringify({ questions: [item] }), 5)).toThrow();
    expect(parseQuiz(JSON.stringify({ questions: [item, valid] }), 5)).toEqual([valid]);
  });
});

describe('sampleChunks', () => {
  const chunks = Array.from({ length: 40 }, (_, i) => `trecho-${i} ${'x'.repeat(90)}`);

  it('junta tudo quando cabe', () => {
    expect(sampleChunks(chunks.slice(0, 3), 10_000)).toBe(chunks.slice(0, 3).join('\n\n'));
  });

  it('respeita o limite e cobre começo e fim em ordem', () => {
    const sample = sampleChunks(chunks, 1000);

    expect(sample.length).toBeLessThanOrEqual(1000 + 2 * 10);
    expect(sample).toContain('trecho-0 ');
    expect(sample).toContain('trecho-39 ');
    expect(sample.indexOf('trecho-0 ')).toBeLessThan(sample.indexOf('trecho-39 '));
  });
});
