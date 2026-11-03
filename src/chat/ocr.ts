export const MAX_OCR_PAGES = 30;
export const OCR_TIMEOUT_MS = 60_000;

// Menos que isso no PDF inteiro (fora os marcadores de página) é tratado como "sem texto"
const MIN_TEXT_CHARS = 30;

export interface PageText {
  page: number;
  text: string;
}

/** O PDF só tem imagens? Considera o texto das páginas, não os marcadores "-- 1 of 3 --". */
export function needsOcr(pages: { text: string }[]): boolean {
  const total = pages.reduce(
    (sum, page) => sum + page.text.replace(/\s+/g, '').length,
    0,
  );

  return total < MIN_TEXT_CHARS;
}

export class OcrLimitError extends Error {}

export function pageLimitMessage(total: number): string {
  return `Este PDF parece escaneado e tem ${total} páginas. O reconhecimento de texto aceita até ${MAX_OCR_PAGES} páginas por arquivo; divida o PDF em partes menores e envie de novo.`;
}

export const TIMEOUT_MESSAGE = `O reconhecimento de texto deste PDF escaneado passou de ${OCR_TIMEOUT_MS / 1000} segundos. Envie um arquivo menor ou com menos páginas.`;
