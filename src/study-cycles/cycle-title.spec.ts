import { BadRequestException } from '@nestjs/common';

import { CYCLE_TITLE_MAX, normalizeCycleTitle } from './cycle-title';

describe('normalizeCycleTitle', () => {
  it('sem título vira null', () => {
    expect(normalizeCycleTitle(undefined)).toBeNull();
    expect(normalizeCycleTitle(null)).toBeNull();
    expect(normalizeCycleTitle('')).toBeNull();
    expect(normalizeCycleTitle('   \n ')).toBeNull();
  });

  it('remove espaços nas pontas e junta os repetidos', () => {
    expect(normalizeCycleTitle('  Revisar   mitocôndria \n')).toBe('Revisar mitocôndria');
  });

  it('aceita exatamente 80 caracteres e recusa 81', () => {
    expect(normalizeCycleTitle('a'.repeat(CYCLE_TITLE_MAX))).toHaveLength(CYCLE_TITLE_MAX);
    expect(() => normalizeCycleTitle('a'.repeat(CYCLE_TITLE_MAX + 1))).toThrow(BadRequestException);
  });

  it('recusa quando não é texto', () => {
    expect(() => normalizeCycleTitle(123)).toThrow(BadRequestException);
    expect(() => normalizeCycleTitle({ a: 1 })).toThrow(BadRequestException);
  });
});
