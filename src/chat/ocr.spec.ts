import { MAX_OCR_PAGES, needsOcr, pageLimitMessage } from './ocr';

describe('needsOcr', () => {
  it('PDF só com imagens (sem texto nas páginas) precisa de OCR', () => {
    expect(needsOcr([])).toBe(true);
    expect(needsOcr([{ text: '' }, { text: '  \n ' }])).toBe(true);
    expect(needsOcr([{ text: '12' }])).toBe(true);
  });

  it('PDF com texto de verdade não precisa', () => {
    expect(needsOcr([{ text: 'A mitocôndria é a organela responsável pela respiração celular.' }])).toBe(false);
    expect(needsOcr([{ text: '' }, { text: 'Capítulo 2 — Genética e hereditariedade mendeliana' }])).toBe(false);
  });
});

describe('pageLimitMessage', () => {
  it('diz quantas páginas tem e o limite', () => {
    const message = pageLimitMessage(120);

    expect(message).toContain('120 páginas');
    expect(message).toContain(`${MAX_OCR_PAGES} páginas`);
    expect(message).toContain('divida o PDF');
  });
});
