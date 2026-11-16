import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<ChatMessage>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ChatMessage {
  @Prop({ type: Types.ObjectId, ref: 'Chat', required: true })
  chatId!: Types.ObjectId;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';

  @Prop({ required: true })
  content!: string;

  // Arquivos e páginas usados na resposta da IA
  @Prop({ type: [{ file: String, page: Number, _id: false }], default: [] })
  sources!: { file: string; page?: number }[];

  // Avaliação do aluno sobre a resposta da IA (👍 = up, 👎 = down); ausente = sem avaliação
  @Prop({ type: String, enum: ['up', 'down'], default: undefined })
  feedback?: 'up' | 'down';

  // Respondida direto do banco, sem chamar a IA (não conta no limite diário)
  @Prop({ default: false })
  direct!: boolean;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
ChatMessageSchema.index({ chatId: 1, createdAt: 1 });
ChatMessageSchema.index({ userId: 1, role: 1, createdAt: 1 });
// Busca de texto nas conversas (`GET /chats/search`): `userId` na frente garante que cada aluno só varre as suas
ChatMessageSchema.index({ userId: 1, content: 'text' }, { default_language: 'none', name: 'busca_mensagens' });
