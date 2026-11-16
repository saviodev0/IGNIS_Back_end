import { CONTEXT_CHUNKS, KEYWORD_MIN_COVERAGE, SEMANTIC_MIN, keywordSearch, rankedSearch, searchChunks, semanticSearch } from './search';

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

  it('uma palavra genérica sozinha não traz trecho quando o resto da pergunta não aparece no material', () => {
    const material = [
      chunk('Em 3 segundos o carro acelera até a velocidade máxima na pista.'),
      chunk('A mitocôndria produz ATP durante a respiração celular aeróbica.'),
      chunk('O planeta gira em torno do Sol numa órbita elíptica.'),
    ];
    const pergunta = 'Quem foi Dom Pedro durante o Segundo Reinado em segundos';
    expect(keywordSearch(material, pergunta, KEYWORD_MIN_COVERAGE)).toEqual([]);
    expect(keywordSearch(material, 'carro acelera em segundos', KEYWORD_MIN_COVERAGE)).toEqual([material[0]]);
  });

  it('o filtro de cobertura só vale com busca semântica; sem vetor da pergunta mantém todas as palavras-chave', () => {
    const material = [chunk('Em 3 segundos o carro acelera.', [1, 0]), chunk('A mitocôndria produz ATP.', [0, 1])];
    const pergunta = 'Quem foi Dom Pedro durante o Segundo Reinado em segundos';
    expect(rankedSearch(material, pergunta, null)).toEqual([material[0]]);
    expect(rankedSearch(material, pergunta, [0, 0])).toEqual([]);
  });

  it('os limiares padrão são os medidos pelo eval', () => {
    expect(SEMANTIC_MIN).toBe(0.83);
    expect(KEYWORD_MIN_COVERAGE).toBe(0.3);
  });
});
