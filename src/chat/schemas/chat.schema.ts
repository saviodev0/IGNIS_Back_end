import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatDocument = HydratedDocument<Chat>;

@Schema({ timestamps: true })
export class Chat {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ default: 'Novo chat' })
  title!: string;

  // Resumo das mensagens antigas, para não reenviar o histórico inteiro à IA
  @Prop({ default: '' })
  summary!: string;

  // Quantas mensagens (da mais antiga) já estão cobertas pelo resumo
  @Prop({ default: 0 })
  summarizedCount!: number;

  // Minutos que o aluno declarou ter estudado este conteúdo
  @Prop({ default: 0 })
  studyMinutes!: number;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);
ChatSchema.index({ userId: 1, updatedAt: -1 });
ChatSchema.index({ userId: 1, title: 'text' }, { default_language: 'none', name: 'busca_titulos' });
