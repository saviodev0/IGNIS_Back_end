import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';

@ValidatorConstraint({ name: 'endDateNotBeforeStartDate', async: false })
class EndDateNotBeforeStartDateConstraint implements ValidatorConstraintInterface {
  validate(endDate: unknown, args: ValidationArguments): boolean {
    const { startDate } = args.object as { startDate?: string };
    if (!startDate || typeof endDate !== 'string') {
      return true;
    }

    const startTimestamp = Date.parse(startDate);
    const endTimestamp = Date.parse(endDate);
    if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) {
      return true;
    }

    return startTimestamp <= endTimestamp;
  }

  defaultMessage(): string {
    return 'endDate deve ser igual ou posterior a startDate';
  }
}

export class StudyHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  @Validate(EndDateNotBeforeStartDateConstraint)
  endDate?: string;
}
