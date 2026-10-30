import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChatFileDocument = HydratedDocument<ChatFile>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ChatFile {
  @Prop({ type: Types.ObjectId, ref: 'Chat', required: true, index: true })
  chatId!: Types.ObjectId;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  size!: number;

  @Prop({ required: true })
  charCount!: number;

  // Caminho do original no disco (relativo à pasta de uploads); ausente em arquivos antigos
  @Prop()
  storedAs?: string;

  // Texto extraído uma única vez e dividido em trechos
  @Prop({ type: [String], default: [] })
  chunks!: string[];

  // Vetor de cada trecho para a busca semântica (mesma ordem de `chunks`); preenchido em segundo plano
  @Prop({ type: [[Number]], default: [] })
  embeddings!: number[][];

  // Página de cada trecho (0 quando o formato não tem páginas, como DOCX); mesma ordem de `chunks`
  @Prop({ type: [Number], default: [] })
  chunkPages!: number[];
}

export const ChatFileSchema = SchemaFactory.createForClass(ChatFile);
