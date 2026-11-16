import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;

  // Troca a última pergunta e a última resposta da IA pelas novas (regenerar ou editar a pergunta)
  @IsOptional()
  @IsBoolean()
  replaceLast?: boolean;
}
