import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

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
  endDate?: string;
}
