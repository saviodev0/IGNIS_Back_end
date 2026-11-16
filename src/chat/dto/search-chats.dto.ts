import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { SEARCH_MAX_CHARS, SEARCH_MIN_CHARS } from '../chat-search';

export class SearchChatsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(SEARCH_MIN_CHARS, { message: `Digite pelo menos ${SEARCH_MIN_CHARS} caracteres para buscar.` })
  @MaxLength(SEARCH_MAX_CHARS)
  q!: string;
}
