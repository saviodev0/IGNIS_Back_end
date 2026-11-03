import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

import { MAX_COUNT, MIN_COUNT } from '../material-parser';

export class GenerateMaterialDto {
  @IsIn(['summary', 'flashcards', 'quiz'])
  type!: 'summary' | 'flashcards' | 'quiz';

  @IsOptional()
  @IsMongoId()
  fileId?: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_COUNT)
  @Max(MAX_COUNT)
  count?: number;
}
