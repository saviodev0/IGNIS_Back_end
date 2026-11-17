import {
  IsIn,
  Validate,
  ValidatorConstraint,
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';

export const GOAL_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

/** Maior valor que cabe no `Int` do Postgres; acima disso o banco recusaria com erro 500. */
export const MAX_TARGET_MINUTES = 2_147_483_647;

/** Minutos da meta: inteiro de 1 até o limite do banco, com uma única mensagem para cada erro. */
@ValidatorConstraint({ name: 'targetMinutes', async: false })
class TargetMinutesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      Number.isInteger(value) &&
      (value as number) >= 1 &&
      (value as number) <= MAX_TARGET_MINUTES
    );
  }

  defaultMessage(args?: ValidationArguments): string {
    const value = args?.value;

    if (!Number.isInteger(value)) {
      return 'targetMinutes deve ser um número inteiro.';
    }

    return (value as number) < 1
      ? 'targetMinutes deve ser maior que zero.'
      : 'targetMinutes é grande demais.';
  }
}

export class CreateGoalDto {
  @IsIn(GOAL_TYPES, {
    message: 'Tipo de meta inválido. Use DAILY, WEEKLY ou MONTHLY.',
  })
  type!: (typeof GOAL_TYPES)[number];

  @Validate(TargetMinutesConstraint)
  targetMinutes!: number;
}
