import { IsInt, Max, Min } from 'class-validator';

export class AddStudyTimeDto {
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;
}
