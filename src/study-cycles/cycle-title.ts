import { BadRequestException } from '@nestjs/common';

export const CYCLE_TITLE_MAX = 80;

/**
 * Título opcional de um ciclo. Espaços sobrando são removidos e vazio vira `null`
 * (sem título). Tipo errado ou texto acima de 80 caracteres é recusado.
 */
export function normalizeCycleTitle(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  if (typeof value !== 'string') {
    throw new BadRequestException('O título do ciclo deve ser um texto.');
  }

  const title = value.replace(/\s+/g, ' ').trim();

  if (title.length > CYCLE_TITLE_MAX) {
    throw new BadRequestException(`O título do ciclo pode ter no máximo ${CYCLE_TITLE_MAX} caracteres.`);
  }

  return title || null;
}
