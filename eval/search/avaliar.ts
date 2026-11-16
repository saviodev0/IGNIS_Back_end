/**
 * Avalia a qualidade da busca nos materiais (sem chave da Groq, só a busca).
 *
 *   npm run eval:search                    relatório (palavras-chave, semântica e híbrida)
 *   npm run eval:search -- --detalhes      lista também as perguntas que acertaram
 *   npm run eval:search -- --sem-embeddings  só palavras-chave (não baixa o modelo)
 *
 * Os documentos de eval/search/docs viram os trechos de UM chat e cada pergunta de perguntas.json é buscada com o mesmo código que o chat usa (src/chat/search.ts).
 * Uma pergunta "relacionada" acerta quando o trecho que traz a resposta (campo `esperado`) está entre os escolhidos.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { splitIntoChunks } from '../../src/chat/chunker';
import { cosine } from '../../src/chat/chunk-ranker';
import { EmbeddingService } from '../../src/chat/embedding.service';
import {
  CONTEXT_CHARS,
  CONTEXT_CHUNKS,
  KEYWORD_MIN_COVERAGE,
  MAX_CONTEXT_CHUNKS,
  SEMANTIC_MIN,
  keywordSearch,
  rankedSearch,
  searchChunks,
  semanticSearch,
  type SearchableChunk,
} from '../../src/chat/search';

interface Pergunta {
  conjunto?: 'ajuste' | 'prova';
  tipo: 'literal' | 'parafraseada' | 'sem-relacao' | 'sem-relacao-parecida' | 'generica';
  doc: string | null;
  pergunta: string;
  esperado: string | null;
}

interface Trecho extends SearchableChunk {
  doc: string;
  indice: number;
}

const pasta = __dirname;
const args = process.argv.slice(2);
const detalhes = args.includes('--detalhes');
const semEmbeddings = args.includes('--sem-embeddings');

const pct = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)}%` : '–').padStart(4);
const frac = (parte: number, total: number) => `${String(parte).padStart(2)}/${String(total).padEnd(2)} ${pct(parte, total)}`;

async function main() {
  const perguntas: Pergunta[] = JSON.parse(readFileSync(join(pasta, 'perguntas.json'), 'utf8'));
  const docs = ['biologia-celula', 'historia-era-vargas', 'fisica-mecanica', 'quimica-geral'];

  const trechos: Trecho[] = docs.flatMap((doc) =>
    splitIntoChunks(readFileSync(join(pasta, 'docs', `${doc}.txt`), 'utf8')).chunks.map((text, indice) => ({ doc, indice, text })),
  );

  // Confere o gabarito: cada resposta esperada precisa existir em algum trecho
  const semGabarito = perguntas.filter((p) => p.esperado && !trechos.some((t) => t.text.includes(p.esperado!)));
  if (semGabarito.length) {
    console.error('Gabarito inválido (texto esperado não está em nenhum trecho):');
    semGabarito.forEach((p) => console.error(`  - ${p.pergunta} -> "${p.esperado}"`));
    process.exit(2);
  }

  let embeddings: EmbeddingService | null = null;
  let consulta: (pergunta: string) => number[] | null = () => null;

  if (!semEmbeddings) {
    embeddings = new EmbeddingService({ get: (chave: string) => process.env[chave] } as never);
    const inicio = Date.now();
    const vetores = await embeddings.embed(
      trechos.map((t) => t.text),
      'passage',
    );

    if (!vetores) {
      console.error('Não foi possível carregar o modelo de embeddings (sem internet na primeira vez?). Use --sem-embeddings para medir só palavras-chave.');
      process.exit(2);
    }

    trechos.forEach((t, i) => (t.vector = vetores[i]));
    const consultas = await embeddings.embed(
      perguntas.map((p) => p.pergunta),
      'query',
    );
    consulta = (pergunta) => consultas![perguntas.findIndex((p) => p.pergunta === pergunta)];
    console.log(`Modelo carregado e ${trechos.length + perguntas.length} textos vetorizados em ${((Date.now() - inicio) / 1000).toFixed(1)}s\n`);
  }

  const contem = (lista: Trecho[], esperado: string) => lista.some((t) => t.text.includes(esperado));
  const relacionadas = perguntas.filter((p) => p.esperado);
  const semRelacao = perguntas.filter((p) => p.tipo === 'sem-relacao' || p.tipo === 'sem-relacao-parecida');
  const genericas = perguntas.filter((p) => p.tipo === 'generica');

  console.log('QUALIDADE DA BUSCA NOS MATERIAIS');
  console.log('='.repeat(72));
  console.log(`Materiais: ${docs.length} documentos, ${trechos.length} trechos | Perguntas: ${perguntas.length}`);
  console.log(
    `  ${relacionadas.length} relacionadas (${relacionadas.filter((p) => p.tipo === 'literal').length} literais + ${relacionadas.filter((p) => p.tipo === 'parafraseada').length} parafraseadas), ` +
      `${semRelacao.length} sem relação, ${genericas.length} genéricas`,
  );
  console.log(`Chat envia de ${CONTEXT_CHUNKS} a ${MAX_CONTEXT_CHUNKS} trechos por pergunta (mais quando são curtos, até ${CONTEXT_CHARS} caracteres) | limiar semântico atual: ${SEMANTIC_MIN} | cobertura mínima das palavras: ${KEYWORD_MIN_COVERAGE}`);
  console.log(semEmbeddings ? 'Modo: só palavras-chave (--sem-embeddings)\n' : 'Modelo: Xenova/multilingual-e5-small\n');

  const metodos: { nome: string; ranque: (p: Pergunta) => Trecho[]; enviados: (p: Pergunta) => Trecho[] }[] = [
    {
      nome: 'Palavras-chave (BM25, sem filtro)',
      ranque: (p) => keywordSearch(trechos, p.pergunta),
      enviados: (p) => keywordSearch(trechos, p.pergunta).slice(0, CONTEXT_CHUNKS),
    },
  ];

  if (!semEmbeddings) {
    metodos.push({
      nome: 'Semântica (embeddings)',
      ranque: (p) => semanticSearch(trechos, consulta(p.pergunta)),
      enviados: (p) => semanticSearch(trechos, consulta(p.pergunta)).slice(0, CONTEXT_CHUNKS),
    });
  }

  metodos.push({
    nome: 'Híbrida (a usada no chat)',
    ranque: (p) => rankedSearch(trechos, p.pergunta, consulta(p.pergunta)),
    enviados: (p) => searchChunks(trechos, p.pergunta, consulta(p.pergunta)),
  });

  const grupos: [string, Pergunta[]][] = [
    ['todas as relacionadas', relacionadas],
    ['  só literais', relacionadas.filter((p) => p.tipo === 'literal')],
    ['  só parafraseadas', relacionadas.filter((p) => p.tipo === 'parafraseada')],
  ];

  console.log('ACERTO (a resposta está nos trechos escolhidos)');
  console.log(`${''.padEnd(26)}${'no 1º lugar'.padEnd(14)}${'entre os enviados'.padEnd(20)}`);
  for (const metodo of metodos) {
    console.log(metodo.nome);
    for (const [rotulo, lista] of grupos) {
      const topo = lista.filter((p) => contem(metodo.ranque(p).slice(0, 1), p.esperado!)).length;
      const top4 = lista.filter((p) => contem(metodo.enviados(p), p.esperado!)).length;
      console.log(`  ${rotulo.padEnd(24)}${frac(topo, lista.length).padEnd(14)}${frac(top4, lista.length)}`);
    }
  }

  console.log('\nFALSOS POSITIVOS (pergunta sem relação que mesmo assim recebe trechos; quanto menos, melhor)');
  for (const metodo of metodos) {
    const todos = semRelacao.filter((p) => metodo.enviados(p).length > 0).length;
    const parecidas = semRelacao.filter((p) => p.tipo === 'sem-relacao-parecida' && metodo.enviados(p).length > 0).length;
    const totalParecidas = semRelacao.filter((p) => p.tipo === 'sem-relacao-parecida').length;
    console.log(`  ${metodo.nome.padEnd(26)}${frac(todos, semRelacao.length)}   (das parecidas com o material: ${parecidas}/${totalParecidas})`);
  }

  const hibrida = metodos[metodos.length - 1];
  const tamanho = relacionadas.map((p) => hibrida.enviados(p));
  const mediaTrechos = tamanho.reduce((total, lista) => total + lista.length, 0) / tamanho.length;
  const mediaCaracteres = tamanho.reduce((total, lista) => total + lista.reduce((soma, t) => soma + t.text.length, 0), 0) / tamanho.length;
  console.log(`\nCONTEXTO ENVIADO À IA (busca híbrida, perguntas relacionadas): ${mediaTrechos.toFixed(1)} trechos, ${Math.round(mediaCaracteres)} caracteres em média`);

  const genericasOk = genericas.filter((p) => hibrida.enviados(p).length > 0).length;
  console.log(`\nPERGUNTAS GENÉRICAS ("resuma o arquivo") recebem o começo do material: ${genericasOk}/${genericas.length}`);

  if (!semEmbeddings) {
    console.log('\nLIMIAR DA BUSCA SEMÂNTICA (busca híbrida; o limiar atual está marcado com *)');
    console.log(`  ${'limiar'.padEnd(9)}${'acerto (enviados)'.padEnd(20)}falsos positivos`);
    const limiares = [...new Set([0.78, 0.79, 0.795, 0.8, 0.805, 0.81, 0.815, 0.82, SEMANTIC_MIN, 0.84, 0.85])].sort((a, b) => a - b);
    for (const limiar of limiares) {
      const acertos = relacionadas.filter((p) => contem(searchChunks(trechos, p.pergunta, consulta(p.pergunta), limiar), p.esperado!)).length;
      const falsos = semRelacao.filter((p) => searchChunks(trechos, p.pergunta, consulta(p.pergunta), limiar).length > 0).length;
      const marca = limiar === SEMANTIC_MIN ? '*' : ' ';
      console.log(`  ${marca}${String(limiar).padEnd(8)}${frac(acertos, relacionadas.length).padEnd(20)}${frac(falsos, semRelacao.length)}`);
    }

    const sim = (a: Pergunta[]) => a.map((p) => Math.max(...trechos.map((t) => cosine(consulta(p.pergunta)!, t.vector!))));
    const faixa = (v: number[]) => `${Math.min(...v).toFixed(3)} a ${Math.max(...v).toFixed(3)}`;
    console.log(`\nSIMILARIDADE DO MELHOR TRECHO: relacionadas ${faixa(sim(relacionadas))} | sem relação ${faixa(sim(semRelacao))}`);
  }

  // As perguntas "prova" não foram usadas para escolher nenhum ajuste: servem de conferência independente
  console.log('\nPOR CONJUNTO (busca híbrida; "prova" = perguntas que não participaram dos ajustes)');
  for (const conjunto of ['ajuste', 'prova'] as const) {
    const rel = relacionadas.filter((p) => p.conjunto === conjunto);
    const sem = semRelacao.filter((p) => p.conjunto === conjunto);
    if (!rel.length && !sem.length) continue;
    const acertos = rel.filter((p) => contem(hibrida.enviados(p), p.esperado!)).length;
    const falsos = sem.filter((p) => hibrida.enviados(p).length > 0).length;
    console.log(`  ${conjunto.padEnd(8)}acerto ${frac(acertos, rel.length)}   falsos positivos ${frac(falsos, sem.length)}`);
  }

  const erros: string[] = [];
  const hibridaMetodo = metodos[metodos.length - 1];
  for (const p of relacionadas) {
    const enviados = hibridaMetodo.enviados(p);
    const ok = contem(enviados, p.esperado!);
    if (!ok || detalhes) {
      const onde = trechos.find((t) => t.text.includes(p.esperado!))!;
      erros.push(`  ${ok ? 'ok    ' : 'ERROU '}[${p.tipo}] ${p.pergunta}\n         esperado em ${onde.doc} #${onde.indice}; veio: ${enviados.map((t) => `${t.doc} #${t.indice}`).join(', ') || 'nada'}`);
    }
  }
  for (const p of semRelacao) {
    const enviados = hibridaMetodo.enviados(p);
    if (enviados.length || detalhes) {
      erros.push(`  ${enviados.length ? 'FALSO+ ' : 'ok    '}[${p.tipo}] ${p.pergunta}\n         veio: ${enviados.map((t) => `${t.doc} #${t.indice}`).join(', ') || 'nada'}`);
    }
  }

  console.log(`\n${detalhes ? 'DETALHES' : 'ERROS DA BUSCA HÍBRIDA'} ${erros.length ? '' : '(nenhum)'}`);
  erros.forEach((linha) => console.log(linha));
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
