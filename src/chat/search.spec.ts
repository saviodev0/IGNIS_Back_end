import {
  CONTEXT_CHARS,
  CONTEXT_CHUNKS,
  KEYWORD_MIN_COVERAGE,
  MAX_CONTEXT_CHUNKS,
  SEMANTIC_MIN,
  keywordSearch,
  pickContext,
  rankedSearch,
  repeats,
  searchChunks,
  semanticSearch,
} from './search';

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
    const muitos = Array.from({ length: 10 }, (_, i) => chunk(`parágrafo ${i} sobre assuntos variados `.repeat(30)));
    expect(searchChunks(muitos, 'resuma o arquivo', null)).toEqual(muitos.slice(0, CONTEXT_CHUNKS));
  });

  it('searchChunks usa mais trechos quando eles são curtos (slides)', () => {
    const slides = Array.from({ length: 20 }, (_, i) => chunk(`slide ${i} fala de um assunto diferente número ${i * 7}`));
    const resultado = searchChunks(slides, 'resuma o arquivo', null);
    expect(resultado.length).toBeGreaterThan(CONTEXT_CHUNKS);
    expect(resultado.length).toBeLessThanOrEqual(MAX_CONTEXT_CHUNKS);
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

  describe('repeats', () => {
    it('slide que a página seguinte repete por inteiro conta como repetido, ignorando o número do slide', () => {
      expect(repeats('A pilha guarda onde parou\nA recursão usa a pilha 5', 'A pilha guarda onde parou\nA recursão usa a pilha 5\nIsso explica a pilha 6')).toBe(true);
    });

    it('textos diferentes não são repetição, e textos curtíssimos nunca são', () => {
      expect(repeats('A mitocôndria produz energia para a célula viva.', 'O cloroplasto faz a fotossíntese nas plantas verdes.')).toBe(false);
      expect(repeats('1', 'qualquer coisa com 1 dentro')).toBe(false);
    });
  });

  describe('pickContext', () => {
    const slide = (text: string) => chunk(text);
    const a = slide('Passo um do slide com uma explicação longa o bastante para contar');
    const b = slide('Passo um do slide com uma explicação longa o bastante para contar\nPasso dois acrescentado depois');
    const c = slide('Outro assunto totalmente diferente sobre pilhas e autômatos de pilha');

    it('fica com a versão mais completa do slide e descarta a repetida', () => {
      expect(pickContext([a, b, c], 2, 0)).toEqual([b, c]);
      expect(pickContext([b, a, c], 2, 0)).toEqual([b, c]);
    });

    it('sempre devolve o mínimo de trechos pedido', () => {
      const textos = ['alfa beta gama delta épsilon zeta eta teta', 'iota capa lambda mi ni csi ômicron pi', 'rô sigma tau ípsilon fi qui psi ômega', 'um dois três quatro cinco seis sete oito', 'nove dez onze doze treze catorze quinze'];
      expect(pickContext(textos.map(slide), 4, 0)).toHaveLength(4);
    });

    it('para quando o mínimo foi atingido e o contexto já passou do limite de caracteres', () => {
      const grandes = Array.from({ length: 8 }, (_, i) => slide(`trecho grande ${i} `.repeat(100)));
      expect(pickContext(grandes)).toHaveLength(CONTEXT_CHUNKS);
    });

    it('junta mais trechos curtos até chegar ao limite de caracteres', () => {
      const curtos = Array.from({ length: 12 }, (_, i) => slide(`slide curto ${i} com um assunto bem diferente ${'x'.repeat(i)} fim`));
      const total = pickContext(curtos).reduce((soma, t) => soma + t.text.length, 0);
      expect(pickContext(curtos).length).toBeGreaterThan(CONTEXT_CHUNKS);
      expect(total).toBeLessThan(CONTEXT_CHARS);
    });
  });
});
