import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuggestCycleTitleDto {
  // Conversa usada como base; sem ela vale a mais recente do aluno
  @IsOptional()
  @IsString()
  @MaxLength(40)
  chatId?: string;
}
