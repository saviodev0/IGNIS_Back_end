import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

import { splitIntoChunks } from './chunker';
import { needsOcr, OcrLimitError } from './ocr';
import { OcrService } from './ocr.service';

const MAX_CHARS = 500_000;

export interface ExtractedDocument {
  text: string;
  // PDFs têm texto por página; DOCX não
  pages?: { page: number; text: string }[];
}

export interface TextChunk {
  text: string;
  page: number; // 0 quando não há página
}

const clean = (text: string) =>
  text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

@Injectable()
export class FileTextService {
  private readonly logger = new Logger(FileTextService.name);

  constructor(private readonly ocr: OcrService) {}

  async extract(file: Express.Multer.File): Promise<ExtractedDocument> {
    if (!file.buffer?.length) {
      throw new BadRequestException('O arquivo está vazio. Selecione um PDF ou DOCX com conteúdo.');
    }

    const name = file.originalname.toLowerCase();
    const buffer = file.buffer;

    let text: string;
    let pages: ExtractedDocument['pages'];

    if (name.endsWith('.pdf') && buffer.subarray(0, 4).toString() === '%PDF') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        pages = result.pages.map((p) => ({ page: p.num, text: clean(p.text) })).filter((p) => p.text);

        // PDF escaneado (só imagens): lê o texto das páginas por OCR
        if (needsOcr(pages) && this.ocr.isEnabled) {
          pages = await this.readScanned(parser, result.total);
        }

        // Só o texto das páginas: o `text` do parser traz marcadores "-- 1 of 3 --"
        text = pages.map((p) => p.text).join('\n\n');
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('Não foi possível ler este PDF.');
      } finally {
        await parser.destroy();
      }
    } else if (name.endsWith('.docx') && buffer.subarray(0, 2).toString() === 'PK') {
      try {
        text = (await mammoth.extractRawText({ buffer })).value;
      } catch {
        throw new BadRequestException('Não foi possível ler este documento.');
      }
    } else {
      throw new BadRequestException('Tipo de arquivo inválido. Envie apenas arquivos PDF ou DOCX.');
    }

    text = clean(text);

    if (!text) {
      throw new BadRequestException(
        'Não encontramos texto neste arquivo (parece um PDF escaneado ou só com imagens). Envie um PDF ou Word com texto selecionável.',
      );
    }

    // Limita o total guardado, cortando as últimas páginas se passar
    if (pages) {
      let used = 0;
      pages = pages.filter((p) => (used += p.text.length) <= MAX_CHARS);
    }

    return { text: text.slice(0, MAX_CHARS), pages };
  }

  private async readScanned(parser: PDFParse, total: number) {
    try {
      const recognized = await this.ocr.recognizePdf(parser, total);

      return recognized.map((p) => ({ page: p.page, text: clean(p.text) })).filter((p) => p.text.length >= 10);
    } catch (error: any) {
      if (error instanceof OcrLimitError) throw new BadRequestException(error.message);

      this.logger.warn(`OCR falhou: ${error.message}`);

      return []; // cai na mensagem padrão de "PDF sem texto"
    }
  }

  /** Divide o documento em trechos; em PDFs cada trecho fica dentro de uma página. */
  chunk(document: ExtractedDocument): TextChunk[] {
    if (document.pages?.length) {
      // O título da seção continua valendo nas páginas seguintes
      let heading = '';

      return document.pages.flatMap((page) => {
        const result = splitIntoChunks(page.text, heading);
        heading = result.heading;
        return result.chunks.map((text) => ({ text, page: page.page }));
      });
    }

    return this.split(document.text).map((text) => ({ text, page: 0 }));
  }

  split(text: string): string[] {
    return splitIntoChunks(text).chunks;
  }
}
