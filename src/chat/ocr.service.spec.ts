const recognize = jest.fn();
const terminate = jest.fn().mockResolvedValue(undefined);
const createWorker = jest.fn().mockResolvedValue({ recognize, terminate });

jest.mock('tesseract.js', () => ({ createWorker }));

import { MAX_OCR_PAGES, OCR_TIMEOUT_MS, OcrLimitError } from './ocr';
import { OcrService } from './ocr.service';

const config = (values: Record<string, string> = {}) => ({ get: (key: string) => values[key] });

const pdfWith = (pages: number) => ({
  getScreenshot: jest.fn().mockImplementation(({ partial }: { partial: number[] }) =>
    Promise.resolve({ pages: partial.map((n) => ({ pageNumber: n, data: new Uint8Array([n]) })) }),
  ),
});

beforeEach(() => {
  recognize.mockReset().mockImplementation((image: Buffer) => Promise.resolve({ data: { text: `texto da página ${image[0]}` } }));
  createWorker.mockClear();
});

describe('OcrService', () => {
  it('lê todas as páginas em ordem, em lotes, com um único worker em português', async () => {
    const service = new OcrService(config() as any);
    const pdf = pdfWith(6);

    const pages = await service.recognizePdf(pdf, 6);

    expect(pages).toEqual([1, 2, 3, 4, 5, 6].map((n) => ({ page: n, text: `texto da página ${n}` })));
    expect(pdf.getScreenshot).toHaveBeenCalledTimes(2); // lotes de 4 e 2
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(createWorker.mock.calls[0][0]).toBe('por');
  });

  it('reaproveita o worker entre arquivos', async () => {
    const service = new OcrService(config() as any);

    await service.recognizePdf(pdfWith(1), 1);
    await service.recognizePdf(pdfWith(1), 1);

    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it(`recusa PDFs com mais de ${MAX_OCR_PAGES} páginas sem renderizar nada`, async () => {
    const service = new OcrService(config() as any);
    const pdf = pdfWith(0);

    await expect(service.recognizePdf(pdf, MAX_OCR_PAGES + 1)).rejects.toBeInstanceOf(OcrLimitError);
    expect(pdf.getScreenshot).not.toHaveBeenCalled();
  });

  it('para quando passa do tempo limite', async () => {
    const service = new OcrService(config() as any);
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValueOnce(1_000); // início
    now.mockReturnValue(1_000 + OCR_TIMEOUT_MS + 1); // já passou do prazo na primeira página

    await expect(service.recognizePdf(pdfWith(3), 3)).rejects.toThrow(/segundos/);
    now.mockRestore();
  });

  it('OCR=off desliga o recurso', () => {
    expect(new OcrService(config({ OCR: 'off' }) as any).isEnabled).toBe(false);
    expect(new OcrService(config() as any).isEnabled).toBe(true);
  });

  it('falha ao criar o worker permite tentar de novo depois', async () => {
    const service = new OcrService(config() as any);
    createWorker.mockRejectedValueOnce(new Error('sem rede'));

    await expect(service.recognizePdf(pdfWith(1), 1)).rejects.toThrow('sem rede');
    await expect(service.recognizePdf(pdfWith(1), 1)).resolves.toHaveLength(1);
  });
});
