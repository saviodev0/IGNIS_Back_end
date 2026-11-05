const getText = jest.fn();
const destroy = jest.fn().mockResolvedValue(undefined);

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn().mockImplementation(() => ({ getText, destroy })) }));
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }));

import { BadRequestException } from '@nestjs/common';

import { FileTextService } from './file-text.service';
import { OcrLimitError } from './ocr';

const pdfFile = (name = 'a.pdf') =>
  ({ originalname: name, buffer: Buffer.from('%PDF-1.4 conteudo') }) as unknown as Express.Multer.File;

const withText = { total: 2, text: '-- 1 of 2 --\n\n-- 2 of 2 --', pages: [{ num: 1, text: 'A mitocôndria é a organela responsável pela respiração celular.' }, { num: 2, text: '' }] };
const scanned = { total: 3, text: '-- 1 of 3 --\n\n-- 2 of 3 --\n\n-- 3 of 3 --', pages: [{ num: 1, text: '' }, { num: 2, text: ' ' }, { num: 3, text: '' }] };

const build = (ocr: Partial<{ isEnabled: boolean; recognizePdf: jest.Mock }> = {}) => {
  const recognizePdf = ocr.recognizePdf ?? jest.fn();
  const service = new FileTextService({ isEnabled: ocr.isEnabled ?? true, recognizePdf } as any);

  return { service, recognizePdf };
};

describe('FileTextService (PDF)', () => {
  beforeEach(() => getText.mockReset());

  it('PDF com texto não usa OCR e não carrega os marcadores de página', async () => {
    getText.mockResolvedValue(withText);
    const { service, recognizePdf } = build();

    const doc = await service.extract(pdfFile());

    expect(recognizePdf).not.toHaveBeenCalled();
    expect(doc.text).toBe('A mitocôndria é a organela responsável pela respiração celular.');
    expect(doc.text).not.toContain('of 2');
    expect(doc.pages).toEqual([{ page: 1, text: 'A mitocôndria é a organela responsável pela respiração celular.' }]);
  });

  it('PDF escaneado passa por OCR e mantém a página de cada trecho', async () => {
    getText.mockResolvedValue(scanned);
    const recognizePdf = jest.fn().mockResolvedValue([
      { page: 1, text: 'Capítulo 1 Célula\nA mitocôndria produz ATP.' },
      { page: 2, text: '  ' },
      { page: 3, text: 'Capítulo 3 Ecologia\nOs decompositores reciclam a matéria orgânica no ecossistema.' },
    ]);
    const { service } = build({ recognizePdf });

    const doc = await service.extract(pdfFile('scan.pdf'));

    expect(recognizePdf).toHaveBeenCalledWith(expect.anything(), 3);
    expect(doc.pages?.map((p) => p.page)).toEqual([1, 3]);
    expect(service.chunk(doc).map((c) => c.page)).toEqual([1, 3]);
  });

  it('limite do OCR vira 400 com a mensagem para o aluno', async () => {
    getText.mockResolvedValue({ ...scanned, total: 40 });
    const { service } = build({ recognizePdf: jest.fn().mockRejectedValue(new OcrLimitError('Este PDF parece escaneado e tem 40 páginas.')) });

    await expect(service.extract(pdfFile())).rejects.toThrow('tem 40 páginas');
  });

  it('falha do OCR cai na mensagem de PDF sem texto, sem derrubar nada', async () => {
    getText.mockResolvedValue(scanned);
    const { service } = build({ recognizePdf: jest.fn().mockRejectedValue(new Error('worker caiu')) });

    await expect(service.extract(pdfFile())).rejects.toThrow(/parece um PDF escaneado/);
  });

  it('com OCR desligado, PDF escaneado recebe a mensagem de sem texto', async () => {
    getText.mockResolvedValue(scanned);
    const { service, recognizePdf } = build({ isEnabled: false });

    await expect(service.extract(pdfFile())).rejects.toBeInstanceOf(BadRequestException);
    expect(recognizePdf).not.toHaveBeenCalled();
  });
});
