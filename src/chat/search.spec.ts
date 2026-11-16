import { CONTEXT_CHUNKS, SEMANTIC_MIN, keywordSearch, rankedSearch, searchChunks, semanticSearch } from './search';

const chunk = (text: string, vector?: number[]) => ({ text, vector });

const mitocondria = chunk('A mitocôndria produz ATP na respiração celular aeróbica.', [1, 0]);
const cloroplasto = chunk('O cloroplasto realiza a fotossíntese e libera oxigênio.', [0, 1]);
const guerra = chunk('A Era Vargas começou com a Revolução de 1930 no Brasil.', [0.6, 0.8]);
const all = [mitocondria, cloroplasto, guerra];

describe('search', () => {
  it('keywordSearch acha o trecho pelas palavras da pergunta', () => {
    expect(keywordSearch(all, 'Onde ocorre a fotossíntese?')[0]).toBe(cloroplasto);
  });

  it('keywordSearch não devolve nada sem palavras em comum', () => {
    expect(keywordSearch(all, 'receita de bolo de cenoura')).toEqual([]);
  });

  it('semanticSearch respeita o limiar e ordena do mais parecido para o menos', () => {
    const resultado = semanticSearch(all, [0.8, 0.6], 0.5);
    expect(resultado[0]).toBe(guerra);
    expect(semanticSearch(all, [0.8, 0.6], 0.99)).toEqual([]);
    expect(semanticSearch(all, null)).toEqual([]);
  });

  it('semanticSearch ignora trechos sem vetor', () => {
    expect(semanticSearch([chunk('sem vetor')], [1, 0], 0)).toEqual([]);
  });

  it('rankedSearch junta palavras-chave e semântica (quem aparece nas duas sobe)', () => {
    const resultado = rankedSearch(all, 'fotossíntese', [0, 1]);
    expect(resultado[0]).toBe(cloroplasto);
  });

  it('searchChunks devolve na ordem original do material', () => {
    const resultado = searchChunks(all, 'Vargas e a fotossíntese', null);
    expect(resultado).toEqual([cloroplasto, guerra]);
  });

  it('searchChunks não manda trechos para pergunta sem relação', () => {
    expect(searchChunks(all, 'receita de bolo de cenoura', [0.5, -0.5])).toEqual([]);
  });

  it('searchChunks usa o começo do material em pergunta genérica', () => {
    const muitos = Array.from({ length: 10 }, (_, i) => chunk(`parágrafo ${i} sobre assuntos variados`));
    expect(searchChunks(muitos, 'resuma o arquivo', null)).toEqual(muitos.slice(0, CONTEXT_CHUNKS));
  });

  it('searchChunks sem trechos devolve vazio', () => {
    expect(searchChunks([], 'qualquer coisa', null)).toEqual([]);
  });

  it('o limiar padrão é o usado em produção', () => {
    expect(SEMANTIC_MIN).toBe(0.805);
  });
});
