import { mentionsMaterial, rankChunks, stem } from './chunk-ranker';

const chunks = [
  { text: 'A mitocôndria é a organela responsável pela respiração celular e produção de energia.' },
  { text: 'A Revolução Francesa começou em 1789 com a queda da Bastilha.' },
  { text: 'O ciclo de Krebs ocorre dentro das mitocôndrias e gera ATP.' },
  { text: 'Os estudos de cálculo tratam de limites, derivadas e integrais.' },
];

describe('rankChunks', () => {
  it('acha o trecho certo ignorando acento e plural', () => {
    const [first] = rankChunks(chunks, 'o que fazem as mitocondrias?', 2);
    expect(first.text).toContain('organela');
  });

  it('traz os dois trechos relacionados, do mais ao menos relevante', () => {
    const result = rankChunks(chunks, 'mitocondria energia', 2);
    expect(result).toHaveLength(2);
    expect(result[0].text).toContain('organela');
  });

  it('agrupa variações da mesma palavra', () => {
    expect(stem('estudos')).toBe(stem('estudo'));
    expect(rankChunks(chunks, 'estudando derivada', 1)[0].text).toContain('cálculo');
  });

  it('devolve vazio quando nada combina', () => {
    expect(rankChunks(chunks, 'receita de bolo', 3)).toEqual([]);
  });
});

describe('mentionsMaterial', () => {
  it.each([
    ['resuma o arquivo', true],
    ['o que diz o PDF que enviei?', true],
    ['faça um resumo do capítulo 2', true],
    ['oi, tudo bem?', false],
    ['explique a fotossíntese', false],
  ])('%s', (question, expected) => {
    expect(mentionsMaterial(question)).toBe(expected);
  });
});
