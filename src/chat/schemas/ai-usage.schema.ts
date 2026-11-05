import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Consumo de tokens da IA por aluno e por dia
@Schema({ timestamps: { createdAt: false, updatedAt: true } })
export class AiUsage {
  @Prop({ required: true })
  userId!: string;

  // Dia local do servidor, no formato YYYY-MM-DD
  @Prop({ required: true })
  day!: string;

  @Prop({ default: 0 })
  promptTokens!: number;

  @Prop({ default: 0 })
  completionTokens!: number;

  @Prop({ default: 0 })
  requests!: number;
}

export const AiUsageSchema = SchemaFactory.createForClass(AiUsage);
AiUsageSchema.index({ userId: 1, day: 1 }, { unique: true });
