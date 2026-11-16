import { IsIn, ValidateIf } from 'class-validator';

export type Feedback = 'up' | 'down';

export class SetFeedbackDto {
  // `up`, `down` ou `null` (remove a avaliação). Não enviar o campo é erro, para um engano não apagar a avaliação.
  @ValidateIf((dto: SetFeedbackDto) => dto.feedback !== null)
  @IsIn(['up', 'down'], { message: 'feedback deve ser "up", "down" ou null.' })
  feedback!: Feedback | null;
}
