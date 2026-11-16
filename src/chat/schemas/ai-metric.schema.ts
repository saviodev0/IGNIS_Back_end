import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Métricas por resposta da IA. Só números e rótulos: sem texto de mensagens ou arquivos e sem identificar o aluno.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AiMetric {
  @Prop({ default: '' })
  model!: string;

  @Prop({ default: false })
  fallback!: boolean;

  @Prop({ type: Number, default: null })
  firstTokenMs!: number | null;

  @Prop({ default: 0 })
  totalMs!: number;

  @Prop({ type: String, default: null })
  error!: string | null;

  @Prop({ default: false })
  cancelled!: boolean;

  @Prop({ default: false })
  usedSources!: boolean;

  @Prop({ default: 0 })
  sourceCount!: number;

  @Prop({ default: false })
  hasFiles!: boolean;

  @Prop({ default: 0 })
  promptTokens!: number;

  @Prop({ default: 0 })
  completionTokens!: number;

  createdAt!: Date;
}

export const AiMetricSchema = SchemaFactory.createForClass(AiMetric);
// As métricas servem para acompanhar a semana; 90 dias bastam e evitam crescer sem limite
AiMetricSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
