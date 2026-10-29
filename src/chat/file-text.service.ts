import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

const MAX_CHARS = 500_000;
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

@Injectable()
export class FileTextService {
  async extract(file: Express.Multer.File): Promise<string> {
    const name = file.originalname.toLowerCase();
    const buffer = file.buffer;

    let text: string;

    if (name.endsWith('.pdf') && buffer.subarray(0, 4).toString() === '%PDF') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        text = (await parser.getText()).text;
      } catch {
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
      throw new BadRequestException('Envie apenas arquivos PDF ou DOCX.');
    }

    text = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    if (!text) {
      throw new BadRequestException(
        'Não encontramos texto neste arquivo (parece um PDF escaneado ou só com imagens). Envie um PDF ou Word com texto selecionável.',
      );
    }

    return text.slice(0, MAX_CHARS);
  }

  split(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + CHUNK_SIZE, text.length);

      if (end < text.length) {
        const breakAt = text.lastIndexOf('\n', end);
        if (breakAt > start + CHUNK_SIZE / 2) end = breakAt;
      }

      chunks.push(text.slice(start, end).trim());
      if (end >= text.length) break;
      start = end - CHUNK_OVERLAP;
    }

    return chunks.filter(Boolean);
  }
}
