import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StudyMaterialDocument = HydratedDocument<StudyMaterial>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class StudyMaterial {
  @Prop({ type: Types.ObjectId, ref: 'Chat', required: true, index: true })
  chatId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: ['summary', 'flashcards', 'quiz'] })
  type!: string;

  // Arquivo de origem (ausente quando o material usa todos os arquivos do chat)
  @Prop()
  fileName?: string;

  // Resumo: texto em markdown; flashcards e quiz: lista de itens
  @Prop({ type: Object, required: true })
  content!: unknown;
}

export const StudyMaterialSchema = SchemaFactory.createForClass(StudyMaterial);
