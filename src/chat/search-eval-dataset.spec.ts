import { readFileSync } from 'fs';
import { join } from 'path';
import { splitIntoChunks } from './chunker';

// Garante que o conjunto do `npm run eval:search` continua válido: se alguém editar um documento
// e a resposta esperada sumir, o eval mediria errado sem ninguém perceber.
const pasta = join(__dirname, '..', '..', 'eval', 'search');
const perguntas: { tipo: string; pergunta: string; esperado: string | null }[] = JSON.parse(
  readFileSync(join(pasta, 'perguntas.json'), 'utf8'),
);
const docs = ['biologia-celula', 'historia-era-vargas', 'fisica-mecanica'];
const trechos = docs.flatMap((doc) => splitIntoChunks(readFileSync(join(pasta, 'docs', `${doc}.txt`), 'utf8')).chunks);

describe('conjunto de avaliação da busca', () => {
  it('tem pelo menos 30 perguntas de todos os tipos', () => {
    expect(perguntas.length).toBeGreaterThanOrEqual(30);
    for (const tipo of ['literal', 'parafraseada', 'sem-relacao', 'sem-relacao-parecida', 'generica']) {
      expect(perguntas.some((p) => p.tipo === tipo)).toBe(true);
    }
  });

  it('usa 3 documentos com vários trechos', () => {
    expect(docs).toHaveLength(3);
    expect(trechos.length).toBeGreaterThanOrEqual(15);
  });

  it('toda resposta esperada existe em algum trecho', () => {
    const sumidas = perguntas.filter((p) => p.esperado && !trechos.some((t) => t.includes(p.esperado!))).map((p) => p.pergunta);
    expect(sumidas).toEqual([]);
  });

  it('perguntas sem relação e genéricas não têm resposta esperada; as demais têm', () => {
    for (const p of perguntas) {
      const semResposta = p.tipo.startsWith('sem-relacao') || p.tipo === 'generica';
      expect(p.esperado === null).toBe(semResposta);
    }
  });
});
