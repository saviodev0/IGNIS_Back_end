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

  // Texto extraído uma única vez e dividido em trechos
  @Prop({ type: [String], default: [] })
  chunks!: string[];
}

export const ChatFileSchema = SchemaFactory.createForClass(ChatFile);
