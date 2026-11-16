import { buildTextSearch, fold, makeSnippet, searchTerms, toTextQuery, variants } from './chat-search';

describe('fold', () => {
  it('tira acentos e maiúsculas sem mudar o tamanho do texto', () => {
    const texto = 'Mitocôndria é AÇÃO de Célula';
    expect(fold(texto)).toBe('mitocondria e acao de celula');
    expect(fold(texto)).toHaveLength(texto.length);
  });
});

describe('toTextQuery', () => {
  it('tira aspas e o "-" de exclusão, que têm sentido especial no Mongo', () => {
    expect(toTextQuery('"célula" -vegetal')).toBe('célula vegetal');
    expect(toTextQuery('  a   b  ')).toBe('a b');
    expect(toTextQuery('--')).toBe('');
  });

  it('mantém hífen dentro da palavra', () => {
    expect(toTextQuery('guarda-chuva')).toBe('guarda-chuva');
  });
});

describe('searchTerms', () => {
  it('palavras sem acento, minúsculas e sem repetição', () => {
    expect(searchTerms('Mitocôndria mitocondria ÁTOMO')).toEqual(['mitocondria', 'atomo']);
  });
});

describe('makeSnippet', () => {
  const longo = `${'texto antes '.repeat(20)}A mitocôndria produz ATP na célula${' texto depois'.repeat(20)}`;

  it('acha a palavra ignorando acento e maiúscula, e corta em volta com reticências', () => {
    const trecho = makeSnippet(longo, ['mitocondria']);
    expect(trecho).toContain('mitocôndria produz ATP');
    expect(trecho.startsWith('…')).toBe(true);
    expect(trecho.endsWith('…')).toBe(true);
    expect(trecho.length).toBeLessThan(160);
  });

  it('acha variação da palavra pelo começo dela ("celulas" → "célula")', () => {
    expect(makeSnippet('A célula é a unidade básica.', ['celulas'])).toContain('célula');
  });

  it('texto curto volta inteiro, sem reticências', () => {
    expect(makeSnippet('Mitocôndria: usina de energia', ['mitocondria'])).toBe('Mitocôndria: usina de energia');
  });

  it('sem a palavra no texto, mostra o começo', () => {
    expect(makeSnippet('Resposta sobre outra coisa', ['zzz'])).toBe('Resposta sobre outra coisa');
    expect(makeSnippet('x'.repeat(500), ['zzz'])).toHaveLength(121);
  });

  it('junta quebras de linha em espaços', () => {
    expect(makeSnippet('linha um\n\nlinha dois', ['dois'])).toBe('linha um linha dois');
  });
});

describe('variants / buildTextSearch', () => {
  it('plural com "s" e de volta', () => {
    expect(variants('mitocondria')).toEqual(['mitocondria', 'mitocondrias']);
    expect(variants('mitocondrias')).toEqual(['mitocondrias', 'mitocondria']);
  });

  it('ão ↔ ões/ães (já sem acento)', () => {
    expect(variants('proclamacao')).toEqual(['proclamacao', 'proclamacoes', 'proclamacaes']);
    expect(variants('proclamacoes')).toEqual(['proclamacoes', 'proclamacao']);
  });

  it('palavra curta terminada em s não perde o s', () => {
    expect(variants('mas')).toEqual(['mas']);
  });

  it('monta a busca sem acento, sem repetir, ignorando aspas e hífens', () => {
    expect(buildTextSearch('"Proclamação" -República')).toBe('proclamacao proclamacoes proclamacaes republica republicas');
    expect(buildTextSearch('--')).toBe('');
  });
});
