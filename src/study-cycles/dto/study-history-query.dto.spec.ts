import 'reflect-metadata';

import { validate } from 'class-validator';

import { StudyHistoryQueryDto } from './study-history-query.dto';

describe('StudyHistoryQueryDto', () => {
  const validateDates = (startDate?: string, endDate?: string) =>
    validate(
      Object.assign(new StudyHistoryQueryDto(), {
        startDate,
        endDate,
      }),
    );

  it('rejects a start date later than the end date', async () => {
    const errors = await validateDates('2026-03-02', '2026-03-01');

    expect(errors.map(({ property }) => property)).toContain('endDate');
  });

  it('accepts equal or ordered dates', async () => {
    await expect(
      validateDates('2026-03-01', '2026-03-01'),
    ).resolves.toHaveLength(0);
    await expect(
      validateDates('2026-03-01', '2026-03-02'),
    ).resolves.toHaveLength(0);
  });

  it('allows either date to be omitted', async () => {
    await expect(validateDates(undefined, '2026-03-02')).resolves.toHaveLength(
      0,
    );
    await expect(validateDates('2026-03-01')).resolves.toHaveLength(0);
  });
});
