import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';

const MODEL = 'Xenova/multilingual-e5-small'; // multilíngue (português), 384 dimensões
const BATCH = 16;
const MAX_CHARS = 1800;
const RETRY_AFTER_MS = 60_000;

type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * Embeddings locais para a busca semântica nos materiais. Roda dentro do próprio back
 * (modelo pequeno, sem custo por chamada). Se o modelo não carregar, devolve null e a
 * busca continua só por palavras-chave.
 */
@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly enabled: boolean;
  private readonly cacheDir: string;
  private extractor: Promise<Extractor> | null = null;
  private failedAt = 0;
  private ready = false;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('EMBEDDINGS') !== 'off';
    this.cacheDir = resolve(config.get<string>('MODELS_DIR') ?? 'modelos');
  }

  onModuleInit() {
    // Carrega em segundo plano para o primeiro upload não esperar o modelo
    if (this.enabled) this.load().catch(() => undefined);
  }

  get isEnabled() {
    return this.enabled;
  }

  private load(): Promise<Extractor> {
    if (this.extractor) return this.extractor;

    this.extractor = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = this.cacheDir;

      const started = Date.now();
      const extractor = (await pipeline('feature-extraction', MODEL, { dtype: 'q8' })) as unknown as Extractor;
      this.logger.log(`Modelo de embeddings carregado em ${Math.round((Date.now() - started) / 1000)}s`);

      this.ready = true;
      return extractor;
    })();

    this.extractor.catch((error) => {
      this.logger.warn(`Embeddings indisponíveis, a busca segue só por palavras-chave: ${error.message}`);
      this.extractor = null;
      this.failedAt = Date.now();
    });

    return this.extractor;
  }

  /**
   * Vetores normalizados (kind "passage" para trechos, "query" para perguntas) ou null se indisponível.
   * Com `wait: false` não espera o modelo carregar (a pergunta do aluno não pode travar na primeira vez).
   */
  async embed(texts: string[], kind: 'query' | 'passage', wait = true): Promise<number[][] | null> {
    if (!this.enabled || texts.length === 0) return null;
    if (!wait && !this.ready) return null;
    if (this.failedAt && Date.now() - this.failedAt < RETRY_AFTER_MS) return null;

    try {
      const extractor = await this.load();
      const vectors: number[][] = [];

      for (let i = 0; i < texts.length; i += BATCH) {
        const batch = texts.slice(i, i + BATCH).map((text) => `${kind}: ${text.slice(0, MAX_CHARS)}`);
        const output = await extractor(batch, { pooling: 'mean', normalize: true });
        // 4 casas bastam para a similaridade e reduzem o tamanho no banco
        vectors.push(...output.tolist().map((vector) => vector.map((n) => Math.round(n * 1e4) / 1e4)));
      }

      return vectors;
    } catch (error: any) {
      this.logger.warn(`Falha ao gerar embeddings: ${error.message}`);
      return null;
    }
  }
}
