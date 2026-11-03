import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, resolve } from 'path';
import { createWorker } from 'tesseract.js';

import {
  MAX_OCR_PAGES,
  OCR_TIMEOUT_MS,
  OcrLimitError,
  PageText,
  pageLimitMessage,
  TIMEOUT_MESSAGE,
} from './ocr';

const BATCH = 4; // páginas renderizadas por vez (limita a memória)

interface OcrWorker {
  recognize(image: Buffer): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}

interface PdfRenderer {
  getScreenshot(
    params: object,
  ): Promise<{ pages: { pageNumber: number; data: Uint8Array }[] }>;
}

/**
 * OCR em português para PDFs escaneados (só imagens). Roda dentro do back com tesseract.js:
 * as páginas são renderizadas pelo pdf-parse e lidas uma a uma. Os dados do idioma ficam em cache local.
 */
@Injectable()
export class OcrService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private readonly enabled: boolean;
  private readonly cacheDir: string;
  private worker: Promise<OcrWorker> | null = null;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('OCR') !== 'off';
    this.cacheDir = join(
      resolve(config.get<string>('MODELS_DIR') ?? 'modelos'),
      'ocr',
    );
  }

  get isEnabled() {
    return this.enabled;
  }

  private getWorker(): Promise<OcrWorker> {
    if (!this.worker) {
      this.worker = (async () => {
        return (await createWorker('por', 1, {
          cachePath: this.cacheDir,
          logger: () => undefined,
        })) as unknown as OcrWorker;
      })();

      this.worker.catch(() => {
        this.worker = null; // tenta de novo na próxima vez
      });
    }

    return this.worker;
  }

  /**
   * Lê o texto de cada página do PDF. Lança OcrLimitError (com mensagem para o aluno) quando passa de
   * 30 páginas ou de 60 s; qualquer outra falha propaga o erro original.
   */
  async recognizePdf(
    pdf: PdfRenderer,
    totalPages: number,
  ): Promise<PageText[]> {
    if (totalPages > MAX_OCR_PAGES)
      throw new OcrLimitError(pageLimitMessage(totalPages));

    const deadline = Date.now() + OCR_TIMEOUT_MS;
    const worker = await this.getWorker();
    const result: PageText[] = [];

    for (let start = 1; start <= totalPages; start += BATCH) {
      const numbers = Array.from(
        { length: Math.min(BATCH, totalPages - start + 1) },
        (_, i) => start + i,
      );
      const shots = await pdf.getScreenshot({
        partial: numbers,
        scale: 2,
        imageBuffer: true,
        imageDataUrl: false,
      });

      for (const shot of shots.pages) {
        if (Date.now() > deadline) throw new OcrLimitError(TIMEOUT_MESSAGE);

        const { data } = await worker.recognize(Buffer.from(shot.data));
        result.push({ page: shot.pageNumber, text: data.text });
      }
    }

    this.logger.log(`OCR de ${totalPages} página(s) concluído`);

    return result;
  }

  async onModuleDestroy() {
    if (this.worker)
      await (await this.worker).terminate().catch(() => undefined);
  }
}
